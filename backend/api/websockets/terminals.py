"""
WebSocket endpoint for real-time PTY terminal streaming.

Wire protocol (JSON messages):

  Client -> Server:
    {type: "input", data: "ls\r"}
    {type: "resize", cols: 120, rows: 30}
    {type: "ask", prompt: "explain this file", model?: "ibm/granite-13b-chat-v2"}
    {type: "kill"}
    {type: "ping"}

  Server -> Client:
    {type: "hello", runtime_id, status, pid?, provider_name}
    {type: "output", data: "..."}
    {type: "status", state: "running"|"paused"|"exited"|"killed"|"failed", exit_code?}
    {type: "ask.token", text: "..."}
    {type: "ask.done"}
    {type: "ask.error", error: "..."}
    {type: "error", error: "..."}
    {type: "pong"}
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.pty_service import pty_manager

router = APIRouter()
logger = logging.getLogger(__name__)


def _safe_json(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


@router.websocket("/ws/terminals/{runtime_id}")
async def terminal_socket(websocket: WebSocket, runtime_id: int) -> None:
    """Bi-directional bridge between an xterm.js client and a backend PtySession."""

    await websocket.accept()

    session = pty_manager.get(runtime_id)
    if session is None:
        await websocket.send_text(
            _safe_json({"type": "error", "error": f"Runtime {runtime_id} not found"})
        )
        await websocket.close(code=4404)
        return

    loop = asyncio.get_event_loop()
    pty_manager.bind_loop(loop)

    # Send hello + replay buffered output so the user immediately sees state.
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

    # PTY output -> websocket. The reader thread invokes this from a worker
    # thread, so we schedule the send onto the FastAPI loop.
    def on_chunk(chunk: str) -> None:
        if not chunk:
            return
        try:
            loop.call_soon_threadsafe(
                lambda: asyncio.ensure_future(
                    websocket.send_text(_safe_json({"type": "output", "data": chunk}))
                )
            )
        except RuntimeError:
            # Loop closing or detached
            pass

    session.attach(on_chunk)

    # Watson is loaded lazily; surface a single error if keys missing.
    async def handle_ask(prompt: str, model: Optional[str]) -> None:
        try:
            from backend.services.ibm_watson_service import IBM_WATSON_AVAILABLE
            from backend.config import settings as wx_settings

            if not IBM_WATSON_AVAILABLE:
                await websocket.send_text(
                    _safe_json(
                        {"type": "ask.error", "error": "IBM Watsonx SDK not installed"}
                    )
                )
                return
            if not wx_settings.watsonx_api_key or not wx_settings.watsonx_project_id:
                await websocket.send_text(
                    _safe_json(
                        {
                            "type": "ask.error",
                            "error": "Watsonx credentials missing (WATSONX_API_KEY / WATSONX_PROJECT_ID)",
                        }
                    )
                )
                return
            from backend.services.ibm_watson_service import WatsonxService

            watsonx = WatsonxService()
            model_id = model or "ibm/granite-13b-chat-v2"

            def _next_chunk(gen):
                try:
                    return next(gen)
                except StopIteration:
                    return None

            stream_iter = iter(watsonx.generate_text_stream(prompt=prompt, model_id=model_id))
            while True:
                chunk = await asyncio.to_thread(_next_chunk, stream_iter)
                if chunk is None:
                    break
                text = chunk if isinstance(chunk, str) else str(chunk)
                if text:
                    await websocket.send_text(
                        _safe_json({"type": "ask.token", "text": text})
                    )
            await websocket.send_text(_safe_json({"type": "ask.done"}))
        except Exception as e:
            logger.exception("ask failed")
            await websocket.send_text(
                _safe_json({"type": "ask.error", "error": str(e)})
            )

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
                await websocket.send_text(
                    _safe_json({"type": "status", "state": "killed"})
                )
            elif t == "ping":
                await websocket.send_text(_safe_json({"type": "pong"}))
            else:
                await websocket.send_text(
                    _safe_json({"type": "error", "error": f"unknown type: {t}"})
                )
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"terminal ws closed: {e}")
    finally:
        session.detach(on_chunk)
