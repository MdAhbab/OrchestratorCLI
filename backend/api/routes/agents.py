"""Agent registry and A2A messaging API."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
import aiosqlite

from backend.api.dependencies import get_db, get_current_user_id
from backend.services.agents.a2a import A2AEnvelope, get_a2a_bus
from backend.services.agents.registry import AgentDescriptor, AgentStatus, get_agent_registry
from backend.services.orchestrator.core import OrchestratorEngine
from backend.services.pty_service import pty_manager

ORCHESTRATOR_LLM_NAMES = OrchestratorEngine.ORCHESTRATOR_LLM_NAMES
INFRA_LLM_NAMES = OrchestratorEngine.INFRA_LLM_NAMES

router = APIRouter(prefix="/agents", tags=["agents"])


class A2ASendRequest(BaseModel):
    from_agent: str = Field(..., min_length=1)
    to_agent: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    message_type: str = "request"
    session_id: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


class AgentSummary(BaseModel):
    agent_id: str
    display_name: str
    agent_type: str
    status: str
    provider_id: Optional[int] = None
    runtime_id: Optional[int] = None
    ws_url: Optional[str] = None


@router.get("", response_model=List[AgentSummary])
async def list_agents(
    limit: int = 50,
    offset: int = 0,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> List[AgentSummary]:
    """Discover registered CLI agents and live PTY runtimes."""
    registry = get_agent_registry()
    exclude = list(ORCHESTRATOR_LLM_NAMES) + list(INFRA_LLM_NAMES)
    placeholders = ",".join("?" for _ in exclude)
    cur = await db.execute(
        f"""
        SELECT id, name, display_name FROM providers
        WHERE is_enabled = 1 AND name NOT IN ({placeholders})
        ORDER BY id
        LIMIT ? OFFSET ?
        """,
        exclude + [limit, offset],
    )
    rows = await cur.fetchall()
    out: List[AgentSummary] = []
    live = {s.provider_id: s for s in pty_manager.list_active() if s.provider_id}

    for row in rows:
        pid = int(row["id"])
        name = str(row["name"])
        live_session = live.get(pid)
        runtime_id = live_session.runtime_id if live_session else None
        ws_url = f"/ws/terminals/{runtime_id}?token={pty_manager.generate_ws_token(runtime_id)}" if runtime_id else None
        status = AgentStatus.BUSY if live_session else AgentStatus.IDLE
        desc = AgentDescriptor.from_provider_row(
            name=name,
            display_name=str(row["display_name"] or name),
            provider_id=pid,
            runtime_id=runtime_id,
            ws_url=ws_url,
        )
        desc.status = status
        registry.register(desc)
        out.append(
            AgentSummary(
                agent_id=name,
                display_name=desc.display_name,
                agent_type=desc.agent_type,
                status=desc.status.value,
                provider_id=pid,
                runtime_id=runtime_id,
                ws_url=ws_url,
            )
        )
    return out


@router.post("/a2a/send")
async def send_a2a_message(body: A2ASendRequest) -> Dict[str, Any]:
    bus = get_a2a_bus()
    envelope = A2AEnvelope.create(
        from_agent=body.from_agent,
        to_agent=body.to_agent,
        content=body.content,
        message_type=body.message_type,
        session_id=body.session_id,
        metadata=body.metadata or {},
    )
    await bus.send(envelope)
    return {"id": envelope.id, "status": "queued"}


@router.get("/a2a/inbox/{agent_id}")
async def agent_inbox(agent_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    bus = get_a2a_bus()
    messages = await bus.receive(agent_id, limit=limit)
    return [
        {
            "id": m.id,
            "from": m.from_agent,
            "to": m.to_agent,
            "content": m.content,
            "type": m.message_type,
            "session_id": m.session_id,
            "created_at": m.created_at,
        }
        for m in messages
    ]


@router.get("/a2a/history")
async def a2a_history(
    session_id: Optional[int] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    bus = get_a2a_bus()
    messages = await bus.history(session_id=session_id, limit=limit)
    return [
        {
            "id": m.id,
            "from": m.from_agent,
            "to": m.to_agent,
            "content": m.content,
            "type": m.message_type,
            "session_id": m.session_id,
            "created_at": m.created_at,
        }
        for m in messages
    ]
