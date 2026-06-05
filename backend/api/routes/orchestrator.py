"""
Orchestrator management API routes.
Handles task dispatching and orchestrator configuration.
"""

from typing import Dict, Any, List, Optional, AsyncIterator
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
from pydantic import BaseModel
import aiosqlite
import asyncio
import json
import re
from pathlib import Path
from backend.services import quota_service
from backend.services import artifact_lock as _alock
from backend.services.quota_service import QUOTA_PREEMPT_PCT


from backend.utils import utc_now

import logging
from backend.database.models import (
    OrchestratorConfig, OrchestratorConfigUpdate,
    RoutingStrategy, RoutingHistory, RoutingHistoryCreate,
    ChatRequest, ChatResponse, MessageRole, ContentType
)
from backend.api.dependencies import (
    fetch_active_workspace_path,
    get_db,
    get_current_user_id,
    verify_session_owned_by_user,
)
from backend.services.orchestrator.core import get_orchestrator_engine
from backend.services.orchestrator.context import SharedContext
from backend.services.orchestrator.aggregator import aggregate_agent_results

router = APIRouter(prefix="/orchestrator", tags=["orchestrator"])
logger = logging.getLogger(__name__)

MAX_CHAT_MESSAGE_LEN = 32_000


class DispatchRequest(BaseModel):
    """Request model for task dispatch."""
    task: str
    session_id: Optional[int] = None
    provider_id: Optional[int] = None
    routing_strategy: Optional[RoutingStrategy] = None
    metadata: Optional[Dict[str, Any]] = None


class DispatchResponse(BaseModel):
    """Response model for task dispatch."""
    routing_id: int
    selected_provider_id: int
    provider_name: str
    routing_strategy: str
    routing_reason: Optional[str] = None
    estimated_cost: Optional[float] = None


async def _load_session_history(
    db: aiosqlite.Connection,
    session_id: int,
    limit: Optional[int] = None,
) -> List[Dict[str, str]]:
    """Load recent messages for LLM context (MED-001)."""
    from backend.config import settings
    actual_limit = limit if limit is not None else settings.context_window_limit
    cur = await db.execute(
        """
        SELECT role, content FROM messages
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (session_id, actual_limit),
    )
    rows = await cur.fetchall()
    return [{"role": str(r["role"]), "content": str(r["content"])} for r in reversed(rows)]


async def _resolve_context_files(
    db: aiosqlite.Connection,
    user_id: int,
    file_ids: Optional[List[str]],
) -> List[str]:
    """Resolve context file ids/paths for SharedContext (HIGH-041)."""
    if not file_ids:
        return []
    workspace = await fetch_active_workspace_path(db, user_id)
    if not workspace:
        return []
    shared = Path(workspace) / "shared"
    resolved: List[str] = []
    for fid in file_ids:
        candidate = shared / fid
        if candidate.is_file():
            try:
                resolved.append(candidate.read_text(encoding="utf-8")[:8000])
            except Exception:
                pass
    return resolved


async def _fetch_orchestrator_config_row(
    db: aiosqlite.Connection,
    user_id: int,
) -> aiosqlite.Row:
    cursor = await db.execute(
        """
        SELECT * FROM orchestrator_config
        WHERE user_id = ? AND is_active = 1
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user_id,),
    )
    config_row = await cursor.fetchone()
    if config_row is None:
        await reset_orchestrator_config(db, user_id)
        cursor = await db.execute(
            """
            SELECT * FROM orchestrator_config
            WHERE user_id = ? AND is_active = 1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user_id,),
        )
        config_row = await cursor.fetchone()
    if config_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active orchestrator configuration found",
        )
    return config_row


async def _record_routing_history(
    db: aiosqlite.Connection,
    *,
    session_id: int,
    config_id: int,
    selected_provider_id: int,
    routing_strategy: str,
    routing_reason: str,
    tokens_used: Optional[int] = None,
    cost_estimate: Optional[float] = None,
) -> int:
    now = utc_now()
    cursor = await db.execute(
        """
        INSERT INTO routing_history (
            session_id, orchestrator_config_id, selected_provider_id,
            routing_strategy, routing_reason, tokens_used, cost_estimate, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            config_id,
            selected_provider_id,
            routing_strategy,
            routing_reason,
            tokens_used,
            cost_estimate,
            now.isoformat(),
        ),
    )
    await db.commit()
    routing_id = cursor.lastrowid
    if routing_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create routing history",
        )
    return int(routing_id)


async def _resolve_provider_id_from_plan(
    db: aiosqlite.Connection,
    plan_provider_name: Optional[str],
    config_row: aiosqlite.Row,
) -> tuple[int, str]:
    """Resolve SQLite provider id + display name from engine plan."""
    if plan_provider_name:
        cursor = await db.execute(
            "SELECT id, display_name FROM providers WHERE name = ? LIMIT 1",
            (plan_provider_name,),
        )
        row = await cursor.fetchone()
        if row:
            return int(row["id"]), str(row["display_name"] or plan_provider_name)

    fallback_id = config_row["fallback_provider_id"] or config_row["default_provider_id"]
    if fallback_id:
        cursor = await db.execute(
            "SELECT id, display_name FROM providers WHERE id = ?",
            (fallback_id,),
        )
        row = await cursor.fetchone()
        if row:
            return int(row["id"]), str(row["display_name"])

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="No suitable provider available for routing history",
    )


async def _delegate_divisions_to_agents(
    db: aiosqlite.Connection,
    user_id: int,
    session_id: int,
    divisions: List[Dict[str, Any]],
) -> List[str]:
    """Assign tasks to CLI agents via A2A bus (HIGH-006).

    A-CRIT-01: Providers with exhausted quota are skipped; 'warn' providers are
    still used but the reroute is annotated in the division metadata.
    """
    from backend.services.agents.cli_agent import CLIAgentAdapter
    from backend.services.agents.registry import AgentDescriptor, get_agent_registry

    registry = get_agent_registry()
    cur = await db.execute(
        """
        SELECT id, name, display_name FROM providers
        WHERE is_enabled = 1 AND name NOT IN ('grok', 'gemini-api', 'deepseek-api',
            'openai', 'anthropic', 'google', 'ollama', 'bob')
        """
    )
    all_agents = {str(r["name"]): r for r in await cur.fetchall()}

    # Load quota states for all agent providers in one bulk query (A-CRIT-01).
    quota_states = await quota_service.get_quota_states_bulk(db, user_id)

    delegated: List[str] = []
    for div in divisions:
        slug = str(div.get("short") or div.get("agent") or "").lower()
        task = str(div.get("task") or "")
        if not slug or not task:
            continue

        # Exact slug match only (A-MED-02: exact slug required, fuzzy matching removed to prevent misrouting).
        row = all_agents.get(slug)
        if not row:
            msg = f"No enabled agent provider matches exact slug: {slug!r} (available: {list(all_agents.keys())})"
            logger.error("_delegate_divisions_to_agents: %s", msg)
            raise ValueError(msg)

        provider_db_id = int(row["id"])
        qstate = quota_states.get(provider_db_id, {"status": "unlimited"})

        # Q-2: treat pct >= QUOTA_PREEMPT_PCT (90%) as ineligible, not only exhausted (100%).
        # This covers both the pre-empt threshold and the hard-exhausted case.
        agent_pct = float(qstate.get("pct", 0.0))
        agent_status = str(qstate.get("status", "unlimited"))
        is_ineligible = (agent_pct >= QUOTA_PREEMPT_PCT) or (agent_status == "exhausted")

        if is_ineligible:
            # Determine reroute reason for annotation.
            if agent_status == "exhausted":
                reroute_reason = "quota_exhausted"
            else:
                reroute_reason = "quota_preempt"

            # Q-3 / Q-2: pick the best alternate via handoff.pick_alternate.
            from backend.services.orchestrator import handoff as _handoff
            fallback_agent = _handoff.pick_alternate(slug, all_agents, quota_states)

            if fallback_agent:
                old_slug = slug
                slug = fallback_agent
                row = all_agents[slug]
                provider_db_id = int(row["id"])
                qstate = quota_states.get(provider_db_id, {"status": "unlimited"})
                logger.warning(
                    "Agent %s ineligible (pct=%.0f%%, status=%s, reason=%s). "
                    "Rerouting to %s.",
                    old_slug, agent_pct * 100, agent_status, reroute_reason, fallback_agent,
                )
                div["rerouted_from"] = old_slug
                div["reroute_reason"] = reroute_reason

                # Q-3: enqueue the task on the alternate agent's queue.
                try:
                    division_id = str(div.get("short") or div.get("agent") or old_slug)
                    payload = {
                        "task": task,
                        "owns_files": div.get("owns_files"),
                        "reads_files": div.get("reads_files"),
                        "depends_on": div.get("depends_on"),
                    }
                    await _handoff.enqueue(
                        db,
                        session_id=session_id,
                        division_id=division_id,
                        agent_slug=fallback_agent,
                        payload=payload,
                        rerouted_from=old_slug,
                    )
                except Exception as enq_err:
                    logger.warning(
                        "Failed to enqueue rerouted task: %s", enq_err, exc_info=True
                    )

                # Emit a quota.reroute WS event (reuse existing emit pattern).
                try:
                    from backend.api.websockets.manager import connection_manager
                    await connection_manager.broadcast({
                        "type": "quota.reroute",
                        "from": old_slug,
                        "to": fallback_agent,
                        "session_id": session_id,
                        "reason": reroute_reason,
                        "pct": round(agent_pct, 4),
                    })
                except Exception as ws_err:
                    logger.warning("Failed to emit quota.reroute event: %s", ws_err, exc_info=True)
            else:
                logger.error(
                    "Agent %s ineligible (pct=%.0f%%, status=%s) and no alternate available "
                    "— skipping division (used=%s / limit=%s).",
                    slug, agent_pct * 100, agent_status,
                    qstate.get("used"), qstate.get("limit"),
                )
                div["rerouted_from"] = slug
                div["reroute_reason"] = reroute_reason
                continue

        if qstate.get("status") == "warn" and not is_ineligible:
            logger.info(
                "Quota warn for agent %s (%.0f%% used) — proceeding but flagging.",
                slug, (qstate.get("pct", 0) * 100),
            )

        desc = AgentDescriptor.from_provider_row(
            name=str(row["name"]),
            display_name=str(row["display_name"] or row["name"]),
            provider_id=provider_db_id,
        )
        registry.register(desc)
        adapter = CLIAgentAdapter(desc)
        await adapter.assign_task(task, session_id=session_id)
        delegated.append(str(row["name"]))
    return delegated


@router.post("/dispatch", response_model=DispatchResponse)
async def dispatch_task(
    request: DispatchRequest,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> DispatchResponse:
    """
    Dispatch a task to an appropriate provider based on routing strategy.
    Runs the orchestrator engine and delegates divisions to CLI agents.
    """
    session_id = request.session_id
    if session_id is None:
        now = utc_now().isoformat()
        cursor = await db.execute(
            """
            INSERT INTO sessions (
                user_id, title, status, session_type, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, request.task[:100], "active", "dispatch", now, now),
        )
        await db.commit()
        session_id = cursor.lastrowid
    else:
        await verify_session_owned_by_user(int(session_id), user_id, db)

    workspace = await fetch_active_workspace_path(db, user_id)
    ctx = SharedContext(
        session_id=int(session_id),
        workspace_path=workspace,
        user_message=request.task,
    )
    history = await _load_session_history(db, int(session_id))
    for msg in history:
        ctx.append_history(msg["role"], msg["content"])

    config_row = await _fetch_orchestrator_config_row(db, user_id)
    routing_strategy = request.routing_strategy or RoutingStrategy(config_row["routing_strategy"])

    engine = get_orchestrator_engine()
    plan = await engine.run(
        db,
        user_id,
        ctx,
        model=None,
        routing_strategy=routing_strategy.value,
        preferred_provider_db_id=request.provider_id,
    )
    metadata = plan.to_metadata_dict()
    if request.metadata:
        metadata.update(request.metadata)
    divisions = metadata.get("divisions") or []
    delegated: List[str] = []
    if divisions:
        delegated = await _delegate_divisions_to_agents(
            db, user_id, int(session_id), divisions
        )
        metadata["delegated_agents"] = delegated
        aggregate_agent_results(plan, {a: "task assigned" for a in delegated})

    try:
        await _write_divisions_artifact(db, user_id, request.task, metadata, session_id=int(session_id))
    except Exception:
        logger.exception("failed to write divisions.md on dispatch")

    routing_meta = metadata.get("routing") or {}
    routing_reason = str(routing_meta.get("reason") or "Orchestrator engine")
    selected_provider_id, provider_display = await _resolve_provider_id_from_plan(
        db, plan.provider_id, config_row
    )

    routing_id = await _record_routing_history(
        db,
        session_id=int(session_id),
        config_id=int(config_row["id"]),
        selected_provider_id=selected_provider_id,
        routing_strategy=routing_strategy.value,
        routing_reason=routing_reason,
        tokens_used=plan.tokens_used,
        cost_estimate=plan.cost_estimate,
    )

    return DispatchResponse(
        routing_id=routing_id,
        selected_provider_id=selected_provider_id,
        provider_name=provider_display,
        routing_strategy=routing_strategy.value,
        routing_reason=routing_reason,
        estimated_cost=plan.cost_estimate,
    )


@router.get("/config", response_model=OrchestratorConfig)
async def get_orchestrator_config(
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> OrchestratorConfig:
    """
    Get the active orchestrator configuration for the current user.
    
    Args:
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Orchestrator configuration
        
    Raises:
        HTTPException: If no configuration found
    """
    cursor = await db.execute(
        """
        SELECT * FROM orchestrator_config
        WHERE user_id = ? AND is_active = 1
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user_id,)
    )
    row = await cursor.fetchone()
    
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active orchestrator configuration found"
        )
    
    return OrchestratorConfig(
        id=row["id"],
        user_id=row["user_id"],
        config_name=row["config_name"],
        routing_strategy=RoutingStrategy(row["routing_strategy"]),
        default_provider_id=row["default_provider_id"],
        fallback_provider_id=row["fallback_provider_id"],
        max_retries=row["max_retries"],
        timeout_seconds=row["timeout_seconds"],
        enable_caching=bool(row["enable_caching"]),
        enable_streaming=bool(row["enable_streaming"]),
        config_data=json.loads(row["config_data"]) if row["config_data"] else None,
        is_active=bool(row["is_active"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"])
    )


@router.put("/config", response_model=OrchestratorConfig)
async def update_orchestrator_config(
    config_update: OrchestratorConfigUpdate,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> OrchestratorConfig:
    """
    Update the orchestrator configuration for the current user.
    
    Args:
        config_update: Configuration update data
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Updated orchestrator configuration
        
    Raises:
        HTTPException: If no configuration found
    """
    # Get current config
    cursor = await db.execute(
        """
        SELECT id FROM orchestrator_config
        WHERE user_id = ? AND is_active = 1
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user_id,)
    )
    config_row = await cursor.fetchone()
    
    if config_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active orchestrator configuration found"
        )
    
    config_id = config_row["id"]
    
    # Build update query dynamically
    update_fields = []
    params = []
    
    if config_update.routing_strategy is not None:
        update_fields.append("routing_strategy = ?")
        params.append(config_update.routing_strategy.value)
    
    if config_update.default_provider_id is not None:
        update_fields.append("default_provider_id = ?")
        params.append(config_update.default_provider_id)
    
    if config_update.fallback_provider_id is not None:
        update_fields.append("fallback_provider_id = ?")
        params.append(config_update.fallback_provider_id)
    
    if config_update.max_retries is not None:
        update_fields.append("max_retries = ?")
        params.append(config_update.max_retries)
    
    if config_update.timeout_seconds is not None:
        update_fields.append("timeout_seconds = ?")
        params.append(config_update.timeout_seconds)
    
    if config_update.enable_caching is not None:
        update_fields.append("enable_caching = ?")
        params.append(int(config_update.enable_caching))
    
    if config_update.enable_streaming is not None:
        update_fields.append("enable_streaming = ?")
        params.append(int(config_update.enable_streaming))
    
    if config_update.config_data is not None:
        update_fields.append("config_data = ?")
        params.append(json.dumps(config_update.config_data))
    
    if config_update.is_active is not None:
        update_fields.append("is_active = ?")
        params.append(int(config_update.is_active))
    
    if not update_fields:
        # No fields to update, just return current config
        return await get_orchestrator_config(db, user_id)
    
    # Add updated_at
    update_fields.append("updated_at = ?")
    params.append(utc_now().isoformat())
    
    # Add config_id for WHERE clause
    params.append(config_id)
    
    await db.execute(
        f"UPDATE orchestrator_config SET {', '.join(update_fields)} WHERE id = ?",
        params
    )
    await db.commit()
    
    # Return updated config
    return await get_orchestrator_config(db, user_id)


@router.post("/config/reset", response_model=OrchestratorConfig)
async def reset_orchestrator_config(
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> OrchestratorConfig:
    """
    Reset orchestrator configuration to defaults.
    
    Args:
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Reset orchestrator configuration
    """
    # Delete old default config if it exists to avoid UNIQUE constraint violation
    await db.execute(
        "DELETE FROM orchestrator_config WHERE user_id = ? AND config_name = ?",
        (user_id, "Default Configuration")
    )
    
    # Deactivate current config
    await db.execute(
        "UPDATE orchestrator_config SET is_active = 0 WHERE user_id = ?",
        (user_id,)
    )
    
    # Create new default config
    now = utc_now()
    await db.execute(
        """
        INSERT INTO orchestrator_config (
            user_id, config_name, routing_strategy, max_retries,
            timeout_seconds, enable_caching, enable_streaming,
            is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            "Default Configuration",
            RoutingStrategy.AUTO.value,
            3,
            30,
            1,
            1,
            1,
            now.isoformat(),
            now.isoformat()
        )
    )
    await db.commit()
    
    # Return new config
    return await get_orchestrator_config(db, user_id)


async def _write_divisions_artifact(
    db: aiosqlite.Connection,
    user_id: int,
    message: str,
    plan_metadata: Dict[str, Any],
    session_id: Optional[int] = None,
) -> None:
    """Persist task divisions to workspace/shared/divisions.md."""
    divisions = plan_metadata.get("divisions") or []
    if not divisions:
        return
    workspace = await fetch_active_workspace_path(db, user_id)
    if not workspace:
        return

    workspace_path = Path(workspace).resolve()
    shared_dir = (workspace_path / "shared").resolve()
    target_file = (shared_dir / "divisions.md").resolve()

    # Ensure target_file resides within workspace_path to prevent path traversal (SEC-09)

    # Build markdown content including new conflict-prevention fields
    lines = [
        "# Task Divisions",
        "",
        f"Task: {message.strip()}",
        "",
        f"Artifact base: {plan_metadata.get('artifact_base', str(shared_dir))}",
        "",
    ]
    for div in divisions:
        agent = div.get("agent") or div.get("short", "Agent")
        lines.extend([
            f"## {agent}",
            "",
            f"- **Agent ID**: `{div.get('short', '')}`",
            f"- **Status**: {div.get('status', 'queued')}",
            f"- **Parallel group**: {div.get('parallel_group', 0)}",
            f"- **Assignment**: {div.get('task', '')}",
        ])
        if div.get("depends_on"):
            lines.append(f"- **Depends on**: {', '.join(div['depends_on'])}")
        if div.get("owns_files"):
            lines.append(f"- **Owns files**: {', '.join('`' + f + '`' for f in div['owns_files'])}")
        if div.get("reads_files"):
            lines.append(f"- **Reads files**: {', '.join('`' + f + '`' for f in div['reads_files'])}")
        lines.append("")

    text = "\n".join(lines).rstrip() + "\n"

    # A-HIGH-01: use locked atomic write to prevent concurrent write races.
    async def _write_with_lock(target: Path) -> None:
        try:
            target.relative_to(workspace_path)
        except ValueError:
            logger.error("Security: path traversal prevented for %s", target)
            return
        await _alock.locked_write(target, text)

    shared_dir.mkdir(parents=True, exist_ok=True)
    await _write_with_lock(shared_dir / "divisions.md")

    if session_id is not None:
        session_art_dir = (shared_dir / "artifacts" / str(session_id)).resolve()
        try:
            session_art_dir.relative_to(workspace_path)
            session_art_dir.mkdir(parents=True, exist_ok=True)
            await _write_with_lock(session_art_dir / "divisions.md")
        except ValueError:
            logger.error("Security: path traversal prevented for session artifact dir")


async def update_division_status_for_provider(
    db: aiosqlite.Connection,
    user_id: int,
    provider_slug: str,
    status: str = "done",
) -> None:
    """Mark a division done in workspace/shared/divisions.md (HIGH-044)."""
    workspace = await fetch_active_workspace_path(db, user_id)
    if not workspace or not provider_slug:
        return
    workspace_path = Path(workspace).resolve()
    target_file = (workspace_path / "shared" / "divisions.md").resolve()
    try:
        target_file.relative_to(workspace_path)
    except ValueError:
        return
    if not target_file.is_file():
        return

    slug = provider_slug.lower().strip()

    # A-HIGH-01: locked read-modify-write prevents concurrent status-update races.
    def _modifier(text: str) -> str:
        pattern = re.compile(
            rf"(##[^\n]+\n(?:.*?\n)*?- Short id: {re.escape(slug)}\s*\n- Status: )\w+",
            re.IGNORECASE,
        )
        return pattern.sub(rf"\1{status}", text, count=1)

    await _alock.locked_read_modify_write(target_file, _modifier)


async def _persist_assistant_message(
    db: aiosqlite.Connection,
    *,
    user_id: int,
    session_id: int,
    plan,
    metadata: Dict[str, Any],
    request_message: str,
) -> tuple[int, int, Optional[int]]:
    """Insert assistant message + analytics; returns (message_id, tokens_used, orch_provider_id)."""
    orch_provider_id = None
    if plan.provider_id:
        cur = await db.execute(
            "SELECT id FROM providers WHERE name = ? LIMIT 1",
            (plan.provider_id,),
        )
        prow = await cur.fetchone()
        if prow:
            orch_provider_id = int(prow["id"])

    tokens_used = max(
        1, plan.tokens_used or (len(request_message) + len(plan.content)) // 4
    )
    now = utc_now().isoformat()

    cursor = await db.execute(
        """
        INSERT INTO messages (
            session_id, role, content, content_type, metadata,
            agent_name, model_name, provider_id, tokens_used, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            "assistant",
            plan.content,
            "text",
            json.dumps(metadata),
            "Orchestrator",
            plan.model,
            orch_provider_id,
            tokens_used,
            now,
            now,
        ),
    )
    await db.commit()
    ai_msg_id = cursor.lastrowid or 0

    if orch_provider_id is not None:
        await db.execute(
            """
            INSERT INTO usage_analytics (
                user_id, session_id, provider_id, event_type,
                event_category, tokens_used, cost_estimate, metadata, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                session_id,
                orch_provider_id,
                "message_received",
                "chat",
                tokens_used,
                plan.cost_estimate,
                json.dumps({"model": plan.model, "source": "orchestrator_chat"}),
                utc_now().isoformat(),
            ),
        )
        await db.commit()

        # A-CRIT-01: increment quota_used for the provider that served this request.
        await quota_service.record_usage(
            db,
            provider_db_id=orch_provider_id,
            user_id=user_id,
            tokens=tokens_used,
            requests=1,
        )

    return int(ai_msg_id), tokens_used, orch_provider_id


async def _prepare_chat_context(
    request: ChatRequest,
    db: aiosqlite.Connection,
    user_id: int,
) -> tuple[int, SharedContext, RoutingStrategy]:
    """Create/load session, persist user message, build SharedContext."""
    session_id = request.session_id

    if session_id is not None:
        await verify_session_owned_by_user(int(session_id), user_id, db)

    if session_id is None:
        now = utc_now().isoformat()
        cursor = await db.execute(
            """
            INSERT INTO sessions (
                user_id, title, status, session_type, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                request.message[:100] if len(request.message) > 100 else request.message,
                "active",
                "chat",
                now,
                now,
            ),
        )
        await db.commit()
        session_id = cursor.lastrowid

    now = utc_now().isoformat()
    await db.execute(
        """
        INSERT INTO messages (
            session_id, role, content, content_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (session_id, "user", request.message, "text", now, now),
    )
    await db.commit()

    workspace = await fetch_active_workspace_path(db, user_id)
    ctx = SharedContext(
        session_id=int(session_id),
        workspace_path=workspace,
        user_message=request.message,
    )
    if session_id:
        history = await _load_session_history(db, int(session_id), limit=30)
        for msg in history[:-1]:
            ctx.append_history(msg["role"], msg["content"])
    ctx_files = await _resolve_context_files(db, user_id, request.context_files)
    if ctx_files:
        ctx.append_history(
            "system",
            "Attached context files:\n" + "\n---\n".join(ctx_files),
        )
    ctx.append_history("user", request.message)

    config_row = await _fetch_orchestrator_config_row(db, user_id)
    routing_strategy = RoutingStrategy(config_row["routing_strategy"])
    return int(session_id), ctx, routing_strategy


async def _stream_chat_events(
    request: ChatRequest,
    db: aiosqlite.Connection,
    user_id: int,
) -> AsyncIterator[str]:
    """SSE stream for chat when stream=true."""
    session_id: Any = None
    try:
        session_id, ctx, routing_strategy = await _prepare_chat_context(request, db, user_id)
        yield f"data: {json.dumps({'type': 'start', 'session_id': session_id})}\n\n"

        engine = get_orchestrator_engine()
        plan = await engine.run(
            db,
            user_id,
            ctx,
            model=request.model_name,
            routing_strategy=routing_strategy.value,
            preferred_provider_db_id=request.provider_id,
        )

        metadata = plan.to_metadata_dict()
        if request.metadata:
            metadata.update(request.metadata)
        divisions = metadata.get("divisions") or []
        if divisions:
            delegated = await _delegate_divisions_to_agents(
                db, user_id, int(session_id), divisions
            )
            metadata["delegated_agents"] = delegated
            aggregate_agent_results(plan, {a: "task assigned" for a in delegated})
            metadata = plan.to_metadata_dict()

        try:
            await _write_divisions_artifact(db, user_id, request.message, metadata)
        except Exception:
            logger.exception("failed to write divisions.md")
            metadata.setdefault("thinking", []).append(
                "Warning: could not write divisions.md to workspace shared folder."
            )

        content = plan.content or ""
        for i in range(0, len(content), 80):
            chunk = content[i : i + 80]
            yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"

        ai_msg_id, tokens_used, _ = await _persist_assistant_message(
            db,
            user_id=user_id,
            session_id=int(session_id),
            plan=plan,
            metadata=metadata,
            request_message=request.message,
        )

        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id, 'message_id': ai_msg_id, 'tokens_used': tokens_used, 'metadata': metadata})}\n\n"

    except Exception as exc:
        logger.exception("stream_chat_events error: %s", exc)
        err_payload = json.dumps({
            "type": "error",
            "message": str(exc),
            "session_id": session_id,
        })
        yield f"data: {err_payload}\n\n"
        # Always close with a done event so the client can unblock chatSending.
        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id, 'message_id': None, 'tokens_used': 0, 'metadata': {}})}\n\n"


@router.get("/providers/health")
async def orchestrator_provider_health(
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> List[Dict[str, Any]]:
    """Health check all configured orchestrator LLM providers."""
    engine = get_orchestrator_engine()
    configs = await engine.load_llm_configs(db, user_id)
    health = await engine.router.health_check_all(configs)
    return [
        {
            "provider_id": h.provider_id,
            "status": h.status.value,
            "latency_ms": h.latency_ms,
            "message": h.message,
        }
        for h in health
    ]


@router.get("/quota")
async def get_quota_states(
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> List[Dict[str, Any]]:
    """Return live quota state for every provider credential of the current user (A-CRIT-01)."""
    states = await quota_service.get_quota_states_bulk(db, user_id)
    # Enrich with provider display name.
    result: List[Dict[str, Any]] = []
    for provider_db_id, state in states.items():
        cur = await db.execute(
            "SELECT name, display_name FROM providers WHERE id = ? LIMIT 1",
            (provider_db_id,),
        )
        row = await cur.fetchone()
        result.append({
            "provider_id": provider_db_id,
            "provider_name": row["name"] if row else str(provider_db_id),
            "display_name": row["display_name"] if row else str(provider_db_id),
            **state,
        })
    return result


@router.post("/chat", response_model=ChatResponse)
async def chat_inference(
    request: ChatRequest,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> ChatResponse:
    """
    Chat with the central orchestrator. Uses Grok / DeepSeek / Gemini with
    automatic fallback, then delegates work to enabled CLI agents.
    """
    if len(request.message) > MAX_CHAT_MESSAGE_LEN:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Message exceeds {MAX_CHAT_MESSAGE_LEN} characters",
        )

    if request.stream:
        return StreamingResponse(
            _stream_chat_events(request, db, user_id),
            media_type="text/event-stream",
        )

    session_id, ctx, routing_strategy = await _prepare_chat_context(request, db, user_id)

    engine = get_orchestrator_engine()
    plan = await engine.run(
        db,
        user_id,
        ctx,
        model=request.model_name,
        routing_strategy=routing_strategy.value,
        preferred_provider_db_id=request.provider_id,
    )

    metadata = plan.to_metadata_dict()
    if request.metadata:
        metadata.update(request.metadata)
    divisions = metadata.get("divisions") or []
    if divisions:
        delegated = await _delegate_divisions_to_agents(
            db, user_id, int(session_id), divisions
        )
        metadata["delegated_agents"] = delegated
        aggregate_agent_results(plan, {a: "task assigned" for a in delegated})
        metadata = plan.to_metadata_dict()
    try:
        await _write_divisions_artifact(db, user_id, request.message, metadata)
    except Exception:
        logger.exception("failed to write divisions.md")
        metadata.setdefault("thinking", []).append(
            "Warning: could not write divisions.md to workspace shared folder."
        )

    ai_msg_id, tokens_used, _ = await _persist_assistant_message(
        db,
        user_id=user_id,
        session_id=int(session_id),
        plan=plan,
        metadata=metadata,
        request_message=request.message,
    )

    return ChatResponse(
        session_id=session_id,
        message_id=ai_msg_id,
        content=plan.content,
        role=MessageRole.ASSISTANT,
        agent_name="Orchestrator",
        tokens_used=tokens_used,
        metadata=metadata,
    )
