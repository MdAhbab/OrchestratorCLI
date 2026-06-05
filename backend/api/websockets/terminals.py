"""
WebSocket endpoint for real-time PTY terminal streaming.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Optional, Set

import aiosqlite
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from backend.api.dependencies import get_db, verify_runtime_owned_by_user, get_current_user_id
from backend.config import settings
from backend.services.pty_service import pty_manager

router = APIRouter()
logger = logging.getLogger(__name__)

# Track pending WS send tasks per connection (MED-019)
_pending_sends: Dict[int, Set[asyncio.Task]] = {}


def _safe_json(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


async def _verify_ws_runtime(
    websocket: WebSocket,
    runtime_id: int,
    db: aiosqlite.Connection,
) -> bool:
    """Authenticate WebSocket and verify runtime ownership (HIGH-001)."""
    token = websocket.query_params.get("token")
    user_id = await get_current_user_id()
    if not pty_manager.verify_ws_token(runtime_id, token):
        await websocket.accept()
        await websocket.send_text(
            _safe_json({"type": "error", "error": "Invalid, expired, or missing WebSocket token"})
        )
        await websocket.close(code=4403)
        return False
    try:
        await verify_runtime_owned_by_user(runtime_id, user_id, db)
    except Exception:
        await websocket.accept()
        await websocket.send_text(
            _safe_json({"type": "error", "error": "Runtime access denied"})
        )
        await websocket.close(code=4403)
        return False
    return True


@router.websocket("/ws/terminals/{runtime_id}")
async def terminal_socket(
    websocket: WebSocket,
    runtime_id: int,
    db: aiosqlite.Connection = Depends(get_db),
) -> None:
    """Bi-directional bridge between an xterm.js client and a backend PtySession."""

    if not await _verify_ws_runtime(websocket, runtime_id, db):
        return

    await websocket.accept()

    session = pty_manager.get(runtime_id)
    if session is None:
        await websocket.send_text(
            _safe_json({"type": "error", "error": f"Runtime {runtime_id} not found"})
        )
        await websocket.close(code=4404)
        return

    loop = asyncio.get_running_loop()
    pty_manager.bind_loop(loop)
    conn_key = id(websocket)
    _pending_sends[conn_key] = set()

    await websocket.send_text(
        _safe_json(
            {
                "type": "hello",
                "runtime_id": runtime_id,
                "status": session.status,
                "pid": session.pid,
                "provider_name": session.provider_name,
            }
        )
    )
    history = session.buffer_snapshot()
    if history:
        await websocket.send_text(_safe_json({"type": "output", "data": history}))

    async def safe_send(payload: Dict[str, Any]) -> None:
        try:
            await websocket.send_text(_safe_json(payload))
        except Exception:
            pass

    def on_chunk(chunk: str) -> None:
        if not chunk:
            return
        try:
            task = asyncio.run_coroutine_threadsafe(
                safe_send({"type": "output", "data": chunk}),
                loop
            )
            pending = _pending_sends.get(conn_key)
            if pending is not None:
                pending.add(task)
                task.add_done_callback(lambda t: pending.discard(t))
        except RuntimeError:
            pass

    session.attach(on_chunk)

    async def handle_ask(prompt: str, model: Optional[str]) -> None:
        """Stream LLM answer using DB credentials from Settings (HIGH-018)."""
        try:
            from backend.services.orchestrator.core import get_orchestrator_engine
            from backend.services.providers.base import ChatMessage, CompletionRequest
            from backend.services.providers.registry import get_provider_registry

            user_id = await get_current_user_id()
            engine = get_orchestrator_engine()
            configs = await engine.load_llm_configs(db, user_id)
            registry = get_provider_registry()
            messages = [ChatMessage(role="user", content=prompt)]
            last_err: Optional[str] = None
            for cfg in configs:
                impl = registry.get(cfg.provider_id)
                if not impl or not impl.is_configured(cfg):
                    continue
                try:
                    async for token in impl.stream(
                        cfg,
                        CompletionRequest(
                            messages=messages,
                            model=model or cfg.default_model,
                            stream=True,
                        ),
                    ):
                        if token:
                            await safe_send({"type": "ask.token", "text": token})
                    await safe_send({"type": "ask.done"})
                    return
                except Exception as e:
                    last_err = str(e)
                    continue
            await safe_send(
                {
                    "type": "ask.error",
                    "error": last_err or "No orchestrator LLM keys configured",
                }
            )
        except Exception as e:
            logger.exception("ask failed")
            await safe_send({"type": "ask.error", "error": str(e)})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            t = msg.get("type")
            if t == "input":
                data = msg.get("data", "")
                if isinstance(data, str) and data:
                    session.write(data)
            elif t == "resize":
                cols = int(msg.get("cols", session.cols))
                rows = int(msg.get("rows", session.rows))
                session.resize(cols, rows)
            elif t == "ask":
                prompt = str(msg.get("prompt", "")).strip()
                model = msg.get("model")
                if prompt:
                    asyncio.create_task(handle_ask(prompt, model))
            elif t == "kill":
                session.kill()
                await safe_send({"type": "status", "state": "killed"})
            elif t == "ping":
                await safe_send({"type": "pong"})
            else:
                await safe_send({"type": "error", "error": f"unknown type: {t}"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"terminal ws closed: {e}")
    finally:
        session.detach(on_chunk)
        if session.status == "exited" and session.provider_id is not None:
            try:
                from backend.api.routes.orchestrator import update_division_status_for_provider

                ws_user_id = await get_current_user_id()
                cur = await db.execute(
                    "SELECT name FROM providers WHERE id = ?",
                    (session.provider_id,),
                )
                row = await cur.fetchone()
                if row:
                    slug = str(row["name"])
                    await update_division_status_for_provider(
                        db, ws_user_id, slug, "done"
                    )
                    await safe_send(
                        {
                            "type": "division.status",
                            "short": slug,
                            "status": "done",
                        }
                    )
            except Exception:
                logger.debug("division status update skipped", exc_info=True)

            # Q-1: parse usage signal from the terminal buffer and record it.
            try:
                from backend.services import cli_usage as _cli_usage
                from backend.services import quota_service as _quota_service

                snapshot = session.buffer_snapshot()
                parsed = _cli_usage.parse_usage_from_text(snapshot)
                if parsed is not None:
                    exit_user_id = await get_current_user_id()
                    await _quota_service.record_cli_usage(
                        db,
                        provider_db_id=session.provider_id,
                        user_id=exit_user_id,
                        parsed=parsed,
                    )
                    logger.debug(
                        "PTY exit: recorded CLI usage for provider_id=%s pct=%s exhausted=%s",
                        session.provider_id,
                        parsed.get("pct"),
                        parsed.get("exhausted"),
                    )
            except Exception:
                # Never break terminal teardown due to usage recording.
                logger.debug("CLI usage recording skipped on PTY exit", exc_info=True)
        pending = _pending_sends.pop(conn_key, set())
        for task in pending:
            task.cancel()
