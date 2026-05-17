"""
Orchestrator management API routes.
Handles task dispatching and orchestrator configuration.
"""

from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone
from pydantic import BaseModel
import aiosqlite
import asyncio
import json
from pathlib import Path


def utc_now() -> datetime:
    """Return current UTC datetime with timezone info."""
    return datetime.now(timezone.utc)

import logging
from backend.database.models import (
    OrchestratorConfig, OrchestratorConfigUpdate,
    RoutingStrategy, RoutingHistory, RoutingHistoryCreate,
    ChatRequest, ChatResponse, MessageRole, ContentType
)
from backend.api.dependencies import (
    fetch_active_workspace_path, get_db, get_current_user_id
)

router = APIRouter(prefix="/orchestrator", tags=["orchestrator"])


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


@router.post("/dispatch", response_model=DispatchResponse)
async def dispatch_task(
    request: DispatchRequest,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> DispatchResponse:
    """
    Dispatch a task to an appropriate provider based on routing strategy.
    
    Args:
        request: Dispatch request with task details
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Dispatch response with selected provider and routing info
        
    Raises:
        HTTPException: If no suitable provider found
    """
    # Get user's orchestrator config
    cursor = await db.execute(
        """
        SELECT * FROM orchestrator_config
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
    
    # Determine routing strategy
    routing_strategy = request.routing_strategy or RoutingStrategy(config_row["routing_strategy"])
    
    # Select provider based on strategy
    selected_provider_id = None
    routing_reason = None
    
    if request.provider_id:
        # Manual provider selection
        selected_provider_id = request.provider_id
        routing_reason = "Manual provider selection"
    elif routing_strategy == RoutingStrategy.AUTO:
        # Use default provider from config
        selected_provider_id = config_row["default_provider_id"]
        routing_reason = "Auto-routing to default provider"
    elif routing_strategy == RoutingStrategy.LEAST_COST:
        # Select cheapest provider (simplified logic)
        cursor = await db.execute(
            """
            SELECT p.id FROM providers p
            JOIN provider_credentials pc ON p.id = pc.provider_id
            WHERE pc.user_id = ? AND p.is_enabled = 1 AND pc.is_active = 1
            ORDER BY p.id
            LIMIT 1
            """,
            (user_id,)
        )
        provider_row = await cursor.fetchone()
        if provider_row:
            selected_provider_id = provider_row["id"]
            routing_reason = "Least cost routing"
    elif routing_strategy == RoutingStrategy.FASTEST:
        # Select fastest provider (simplified logic)
        selected_provider_id = config_row["default_provider_id"]
        routing_reason = "Fastest provider routing"
    elif routing_strategy == RoutingStrategy.ROUND_ROBIN:
        # Round-robin selection (simplified)
        cursor = await db.execute(
            """
            SELECT p.id FROM providers p
            JOIN provider_credentials pc ON p.id = pc.provider_id
            WHERE pc.user_id = ? AND p.is_enabled = 1 AND pc.is_active = 1
            ORDER BY p.id
            LIMIT 1
            """,
            (user_id,)
        )
        provider_row = await cursor.fetchone()
        if provider_row:
            selected_provider_id = provider_row["id"]
            routing_reason = "Round-robin routing"
    
    if selected_provider_id is None:
        # Fallback to default or raise error
        if config_row["fallback_provider_id"]:
            selected_provider_id = config_row["fallback_provider_id"]
            routing_reason = "Fallback provider"
        else:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="No suitable provider available"
            )
    
    # Get provider details
    cursor = await db.execute(
        "SELECT name, display_name FROM providers WHERE id = ?",
        (selected_provider_id,)
    )
    provider_row = await cursor.fetchone()
    
    if provider_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provider {selected_provider_id} not found"
        )
    
    # Create routing history entry
    now = utc_now()
    cursor = await db.execute(
        """
        INSERT INTO routing_history (
            session_id, orchestrator_config_id, selected_provider_id,
            routing_strategy, routing_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            request.session_id,
            config_row["id"],
            selected_provider_id,
            routing_strategy.value,
            routing_reason,
            now.isoformat()
        )
    )
    await db.commit()
    
    routing_id = cursor.lastrowid
    if routing_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create routing history"
        )
    
    return DispatchResponse(
        routing_id=routing_id,
        selected_provider_id=selected_provider_id,
        provider_name=provider_row["display_name"],
        routing_strategy=routing_strategy.value,
        routing_reason=routing_reason,
        estimated_cost=None  # TODO: Implement cost estimation
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
    # Deactivate current config
    await db.execute(
        "UPDATE orchestrator_config SET is_active = 0 WHERE user_id = ?",
        (user_id,)
    )
    
    # Create new default config
    now = utc_now()
    cursor = await db.execute(
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


ORCHESTRATOR_SYSTEM_PROMPT = """You are BOB, an enterprise development orchestrator powered by IBM Granite on Watsonx.ai.
You coordinate a fleet of coding CLI agents (Claude Code, Gemini CLI, Codex CLI, Copilot CLI, DeepSeek, Kimi, Cline, and BOB itself) that the user has enabled.

For every user request you MUST respond with a SINGLE JSON object - and nothing else - matching this shape exactly:
{
  "content": "<short, friendly assistant reply (1-3 sentences). plain text only.>",
  "thinking": ["<step 1>", "<step 2>", "..."],
  "divisions": [
    {"agent": "<provider display name>", "short": "<provider id>", "color": "#hex", "task": "<one-line task>", "status": "running|queued|done"}
  ],
  "artifacts": [
    {"name": "<filename>", "kind": "md|ts|py|json|txt"}
  ]
}

Rules:
- Do NOT wrap the JSON in markdown fences.
- Keep "thinking" to 3-5 short lines.
- Use "divisions" only when the task should be split across agents; otherwise return [].
- Use "artifacts" only when a file would actually be produced; otherwise return [].
- Agents you may delegate to (use their `short` id): claude, gemini, codex, copilot, deepseek, kimi, cline, bob.
"""


AGENT_COLORS = {
    "claude": "#f59e0b",
    "gemini": "#6366f1",
    "codex": "#10b981",
    "copilot": "#71717a",
    "deepseek": "#a855f7",
    "kimi": "#f43f5e",
    "cline": "#06b6d4",
    "bob": "#3b82f6",
}


async def _enabled_provider_rows(
    db: aiosqlite.Connection, user_id: int
) -> List[Dict[str, str]]:
    """Return enabled providers in the compact shape used by planners."""
    try:
        cur = await db.execute(
            """
            SELECT p.name, p.display_name, p.default_model
            FROM providers p
            WHERE p.is_enabled = 1
            ORDER BY p.id
            """
        )
        rows = await cur.fetchall()
        return [
            {
                "name": str(r["name"]),
                "display_name": str(r["display_name"] or r["name"]),
                "default_model": str(r["default_model"] or ""),
            }
            for r in rows
        ]
    except Exception:
        return []


async def _enabled_providers_summary(db: aiosqlite.Connection, user_id: int) -> str:
    """Build a short string listing the user's currently enabled providers."""
    rows = await _enabled_provider_rows(db, user_id)
    if not rows:
        return "(no providers enabled)"
    return ", ".join(
        f"{r['display_name']} [{r['name']}] ({r['default_model']})" for r in rows
    )


def _strip_code_fences(text: str) -> str:
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.endswith("```"):
            s = s[: -len("```")]
    return s.strip()


def _plan_from_nlu_analysis(
    message: str,
    analysis: Dict[str, Any],
    providers_summary: str,
) -> Dict[str, Any]:
    """Turn Watson NLU JSON into an orchestrator-style chat payload."""
    sentiment = analysis.get("sentiment") or {}
    doc_sent = sentiment.get("document") or {}
    label = doc_sent.get("label") or "unknown"
    score = doc_sent.get("score")
    score_txt = f" ({score:.2f})" if isinstance(score, (int, float)) else ""

    entities = analysis.get("entities") or []
    keywords = analysis.get("keywords") or []
    concepts = analysis.get("concepts") or []

    ent_bits = [
        f"{e.get('text', '')} ({e.get('type', 'entity')})"
        for e in entities[:6]
        if e.get("text")
    ]
    kw_bits = [k.get("text", "") for k in keywords[:6] if k.get("text")]
    concept_bits = [c.get("text", "") for c in concepts[:5] if c.get("text")]

    summary_parts = [
        f"I analyzed your message with Watson NLU (sentiment: {label}{score_txt})."
    ]
    if ent_bits:
        summary_parts.append(f"Entities: {', '.join(ent_bits)}.")
    if kw_bits:
        summary_parts.append(f"Keywords: {', '.join(kw_bits)}.")
    if concept_bits:
        summary_parts.append(f"Concepts: {', '.join(concept_bits)}.")
    summary_parts.append(
        "NLU understands language structure — for full task planning, enable Watsonx Granite "
        "or describe the next concrete step you want agents to run."
    )

    thinking = [
        "Watson NLU analyze() completed.",
        f"Sentiment: {label}{score_txt}",
        f"Enabled agents: {providers_summary}",
    ]
    if ent_bits:
        thinking.append(f"Entities: {', '.join(ent_bits[:4])}")
    if kw_bits:
        thinking.append(f"Keywords: {', '.join(kw_bits[:4])}")

    return {
        "content": " ".join(summary_parts),
        "thinking": thinking,
        "divisions": [],
        "artifacts": [{"name": "nlu-analysis.json", "kind": "json"}],
        "model": "watson-nlu",
        "nlu": {
            "sentiment": doc_sent,
            "entities": entities[:12],
            "keywords": keywords[:12],
            "concepts": concepts[:8],
        },
    }


def _legacy_offline_chat_plan(message: str, providers_summary: str) -> Dict[str, Any]:
    """Deterministic fallback when Watsonx is not configured (still useful for local dev)."""
    preview = message.strip()[:240]
    return {
        "content": (
            "I'm running in offline orchestrator mode (Watsonx not configured). "
            "Add WATSONX_API_KEY and WATSONX_PROJECT_ID to backend/.env, then restart "
            "`python run.py` for full Granite responses."
        ),
        "thinking": [
            "Parsed the user request locally.",
            f"Enabled agents: {providers_summary}",
            "Watsonx call skipped — credentials or SDK missing.",
        ],
        "divisions": [],
        "artifacts": [{"name": "task-notes.md", "kind": "md"}],
    }


def _task_for_provider(provider_name: str, message: str) -> str:
    """Create an actionable, provider-specific one-line assignment."""
    short = provider_name.lower()
    preview = " ".join(message.strip().split())[:180] or "the requested change"
    lower = preview.lower()

    if "landing page" in lower:
        landing = {
            "gemini": "Design the landing page structure, visual hierarchy, responsive sections, and token usage.",
            "codex": "Implement the landing page components/styles using existing design tokens and verify the build.",
            "claude": "Define the page architecture, content order, and acceptance criteria for the landing page.",
            "copilot": "Add supporting UI glue, small component refinements, and smoke checks for the landing page.",
            "deepseek": "Review edge cases, accessibility, responsive behavior, and performance for the landing page.",
            "kimi": "Tighten landing page copy, section labels, and product messaging.",
            "cline": "Run the repo commands needed to apply and validate the landing page changes.",
            "bob": "Coordinate the landing page work and keep divisions.md current.",
        }
        if short in landing:
            return landing[short]

    generic = {
        "gemini": f"Analyze UX/product requirements and propose the frontend approach for: {preview}",
        "codex": f"Make the code changes and run focused verification for: {preview}",
        "claude": f"Break down architecture, risks, and implementation order for: {preview}",
        "copilot": f"Handle small implementation glue, tests, and docs for: {preview}",
        "deepseek": f"Check edge cases, performance, and failure modes for: {preview}",
        "kimi": f"Refine copy, naming, and user-facing details for: {preview}",
        "cline": f"Execute repo automation and validation commands for: {preview}",
        "bob": f"Coordinate the plan and reconcile agent outputs for: {preview}",
    }
    return generic.get(short, f"Work on your assigned slice of: {preview}")


def _local_divisions(message: str, providers: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Split a user request across the enabled agents without requiring Watsonx."""
    divisions: List[Dict[str, str]] = []
    for provider in providers[:6]:
        short = provider["name"]
        divisions.append(
            {
                "agent": provider["display_name"],
                "short": short,
                "color": AGENT_COLORS.get(short, "#6366f1"),
                "task": _task_for_provider(short, message),
                "status": "running",
            }
        )
    return divisions


def _offline_chat_plan(
    message: str,
    providers_summary: str,
    providers: Optional[List[Dict[str, str]]] = None,
    reason: str = "Watsonx call skipped - credentials or SDK missing.",
) -> Dict[str, Any]:
    """Deterministic fallback that still routes work to enabled local agents."""
    providers = providers or []
    divisions = _local_divisions(message, providers)
    if divisions:
        content = (
            f"I split this into {len(divisions)} agent assignment"
            f"{'' if len(divisions) == 1 else 's'} and queued the work locally. "
            "Watsonx is unavailable, so I used the built-in router."
        )
    else:
        content = (
            "No enabled agents are available to receive work yet. Enable at least one CLI "
            "provider in Settings, then dispatch the task again."
        )
    return {
        "content": content,
        "thinking": [
            "Parsed the user request locally.",
            f"Enabled agents: {providers_summary}",
            reason,
            f"Created {len(divisions)} runnable agent assignment(s).",
        ],
        "divisions": divisions,
        "artifacts": [{"name": "divisions.md", "kind": "md"}],
        "model": "local-router",
    }


async def _write_divisions_artifact(
    db: aiosqlite.Connection,
    user_id: int,
    message: str,
    plan: Dict[str, Any],
) -> None:
    """Persist the generated split to workspace/shared/divisions.md when possible."""
    divisions = plan.get("divisions") or []
    if not divisions:
        return
    workspace = await fetch_active_workspace_path(db, user_id)
    if not workspace:
        return

    shared_dir = Path(workspace) / "shared"
    lines = [
        "# Task Divisions",
        "",
        f"Task: {message.strip()}",
        "",
    ]
    for div in divisions:
        lines.extend(
            [
                f"## {div.get('agent', div.get('short', 'Agent'))}",
                "",
                f"- Status: {div.get('status', 'queued')}",
                f"- Short id: {div.get('short', '')}",
                f"- Assignment: {div.get('task', '')}",
                "",
            ]
        )
    text = "\n".join(lines).rstrip() + "\n"

    def write_file() -> None:
        shared_dir.mkdir(parents=True, exist_ok=True)
        (shared_dir / "divisions.md").write_text(text, encoding="utf-8")

    await asyncio.to_thread(write_file)


def _parse_watsonx_plan(raw: str, fallback_message: str) -> Dict[str, Any]:
    """Coerce the Watsonx response into our chat metadata schema."""
    cleaned = _strip_code_fences(raw)
    try:
        # Find the first { ... } block in the response.
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            obj = json.loads(cleaned[start : end + 1])
            if isinstance(obj, dict):
                content = str(obj.get("content") or cleaned).strip()
                return {
                    "content": content or fallback_message,
                    "thinking": [str(x) for x in (obj.get("thinking") or [])][:8],
                    "divisions": list(obj.get("divisions") or []),
                    "artifacts": list(obj.get("artifacts") or []),
                }
    except Exception:
        pass
    return {
        "content": cleaned or fallback_message,
        "thinking": [],
        "divisions": [],
        "artifacts": [],
    }


@router.post("/chat", response_model=ChatResponse)
async def chat_inference(
    request: ChatRequest,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> ChatResponse:
    """
    Chat with IBM Watsonx Granite. Persists user + assistant messages.
    Returns a structured plan in `metadata` (thinking / divisions / artifacts).
    """
    logger = logging.getLogger(__name__)
    session_id = request.session_id

    # Lazy import so a missing SDK only affects this endpoint, not the whole app.
    try:
        from backend.services.ibm_watson_service import (
            IBM_WATSON_AVAILABLE,
            WatsonxService,
            get_nlu_service,
        )
    except Exception as e:  # pragma: no cover
        IBM_WATSON_AVAILABLE = False
        WatsonxService = None  # type: ignore
        get_nlu_service = None  # type: ignore
        logger.warning(f"Watson service unavailable: {e}")

    from backend.config import settings as _settings
    watsonx_ready = (
        IBM_WATSON_AVAILABLE
        and bool(_settings.watsonx_api_key)
        and bool(_settings.watsonx_project_id)
    )
    nlu_ready = (
        IBM_WATSON_AVAILABLE
        and bool(_settings.nlu_api_key)
        and bool(_settings.nlu_url)
        and get_nlu_service is not None
    )
    ai_mode = (_settings.orchestrator_ai or "auto").strip().lower()

    # Ensure active session exists
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

    # Save user message
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

    provider_rows = await _enabled_provider_rows(db, user_id)
    providers_summary = (
        ", ".join(
            f"{r['display_name']} [{r['name']}] ({r['default_model']})"
            for r in provider_rows
        )
        if provider_rows
        else "(no providers enabled)"
    )

    model_id = request.model_name or "ibm/granite-13b-chat-v2"
    fallback_text = "I'm here. What would you like to build?"
    full_prompt = ""
    plan: Dict[str, Any]

    async def _run_nlu() -> Dict[str, Any]:
        nlu = get_nlu_service()
        analysis = await asyncio.to_thread(nlu.analyze, request.message)
        return _plan_from_nlu_analysis(request.message, analysis, providers_summary)

    use_watsonx = ai_mode in ("auto", "watsonx") and watsonx_ready
    use_nlu = ai_mode in ("auto", "nlu") and nlu_ready

    if use_watsonx and ai_mode != "nlu":
        full_prompt = (
            ORCHESTRATOR_SYSTEM_PROMPT
            + f"\n\nEnabled agents: {providers_summary}\n\n"
            + f"User: {request.message}\n\n"
            + "Respond now with the JSON object only:\n"
        )
        try:
            watsonx = WatsonxService()
            raw = await asyncio.to_thread(
                watsonx.generate_text,
                prompt=full_prompt,
                model_id=model_id,
                parameters={"max_new_tokens": 600, "decoding_method": "greedy"},
            )
            plan = _parse_watsonx_plan(str(raw), fallback_text)
            plan["model"] = model_id
        except Exception as e:
            logger.exception("watsonx call failed")
            err = str(e)
            if use_nlu:
                logger.info("Falling back to Watson NLU after Watsonx failure")
                try:
                    plan = await _run_nlu()
                except Exception as nlu_err:
                    logger.exception("NLU fallback failed")
                    plan = _offline_chat_plan(
                        request.message,
                        providers_summary,
                        provider_rows,
                        reason=f"Watsonx failed ({err[:120]}). NLU also failed ({nlu_err}).",
                    )
            else:
                plan = _offline_chat_plan(
                    request.message,
                    providers_summary,
                    provider_rows,
                    reason=f"Watsonx failed ({err[:160]}).",
                )
                if "403" in err or "Forbidden" in err or "not a member of the project" in err:
                    plan["thinking"].insert(
                        0,
                        "Watsonx rejected the project ID (403); local router used instead.",
                    )
                else:
                    plan["content"] = (
                        f"Watsonx call failed ({err[:200]}). Showing a local fallback."
                    )
    elif use_nlu:
        try:
            plan = await _run_nlu()
        except Exception as e:
            logger.exception("NLU chat failed")
            plan = _offline_chat_plan(
                request.message,
                providers_summary,
                provider_rows,
                reason=f"Watson NLU failed: {e}",
            )
    else:
        if not IBM_WATSON_AVAILABLE:
            logger.warning("IBM Watson SDK unavailable — offline chat fallback")
        plan = _offline_chat_plan(request.message, providers_summary, provider_rows)
        if nlu_ready and ai_mode == "watsonx":
            plan["content"] += " (NLU is configured; set ORCHESTRATOR_AI=auto or nlu to use it.)"

    if provider_rows and not plan.get("divisions"):
        divisions = _local_divisions(request.message, provider_rows)
        plan["divisions"] = divisions
        plan["artifacts"] = [{"name": "divisions.md", "kind": "md"}]
        plan["thinking"] = [
            *(plan.get("thinking") or []),
            f"Local router added {len(divisions)} runnable agent assignment(s).",
        ]

    try:
        await _write_divisions_artifact(db, user_id, request.message, plan)
    except Exception:
        logger.exception("failed to write divisions.md")

    cursor = await db.execute("SELECT id FROM providers WHERE name = 'bob' LIMIT 1")
    bob_row = await cursor.fetchone()
    bob_provider_id = int(bob_row["id"]) if bob_row else None

    response_model = plan.get("model", model_id)
    tokens_used = max(
        1,
        (len(full_prompt or request.message) + len(plan.get("content", ""))) // 4,
    )

    now = utc_now().isoformat()
    metadata = {
        "thinking": plan.get("thinking", []),
        "divisions": plan.get("divisions", []),
        "artifacts": plan.get("artifacts", []),
        "model": response_model,
    }
    if plan.get("nlu"):
        metadata["nlu"] = plan["nlu"]
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
            plan["content"],
            "text",
            json.dumps(metadata),
            "Orchestrator",
            response_model,
            bob_provider_id,
            tokens_used,
            now,
            now,
        ),
    )
    await db.commit()
    ai_msg_id = cursor.lastrowid

    if bob_provider_id is not None:
        cost_guess = round(tokens_used * 0.0000025, 6)
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
                bob_provider_id,
                "message_received",
                "chat",
                tokens_used,
                cost_guess,
                json.dumps({"model": model_id, "source": "orchestrator_chat"}),
                utc_now().isoformat(),
            ),
        )
        await db.commit()

    return ChatResponse(
        session_id=session_id,
        message_id=ai_msg_id,
        content=plan["content"],
        role=MessageRole.ASSISTANT,
        agent_name="Orchestrator",
        tokens_used=tokens_used,
        metadata=metadata,
    )

# Made with Bob
