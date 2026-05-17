"""
Analytics API routes.
Handles usage statistics and routing history.
"""

from typing import Dict, List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field
import aiosqlite
import json


def utc_now() -> datetime:
    """Return current UTC datetime with timezone info."""
    return datetime.now(timezone.utc)

from backend.database.models import (
    UsageAnalytics, EventType, RoutingHistory, AnalyticsResponse
)
from backend.api.dependencies import (
    get_db, get_current_user_id
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


class UsageStatsResponse(BaseModel):
    """Response model for usage statistics."""
    total_sessions: int
    total_messages: int
    total_tokens: int
    total_cost: float
    active_sessions: int
    providers_used: Dict[str, int]
    events_by_type: Dict[str, int]
    time_period: str
    start_date: datetime
    end_date: datetime
    providers: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Per provider display_name: cost, tokens, events",
    )


class RoutingHistoryResponse(BaseModel):
    """Response model for routing history."""
    id: int
    session_id: int
    selected_provider_id: int
    provider_name: str
    routing_strategy: str
    routing_reason: Optional[str]
    latency_ms: Optional[int]
    tokens_used: Optional[int]
    cost_estimate: Optional[float]
    was_fallback: bool
    created_at: datetime


class RoutingHistoryListResponse(BaseModel):
    """Response model for routing history list."""
    routes: List[RoutingHistoryResponse]
    total: int


@router.get("/usage", response_model=UsageStatsResponse)
async def get_usage_statistics(
    days: int = Query(default=7, ge=1, le=365),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> UsageStatsResponse:
    """
    Get usage statistics for the current user.
    
    Args:
        days: Number of days to include in statistics (default: 7)
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Usage statistics
    """
    end_date = utc_now()
    start_date = end_date - timedelta(days=days)
    
    # Get total sessions
    cursor = await db.execute(
        """
        SELECT COUNT(*) as count FROM sessions
        WHERE user_id = ? AND created_at >= ?
        """,
        (user_id, start_date.isoformat())
    )
    total_sessions = (await cursor.fetchone())["count"]
    
    # Get active sessions
    cursor = await db.execute(
        """
        SELECT COUNT(*) as count FROM sessions
        WHERE user_id = ? AND status = 'active'
        """,
        (user_id,)
    )
    active_sessions = (await cursor.fetchone())["count"]
    
    # Get total messages
    cursor = await db.execute(
        """
        SELECT COUNT(*) as count FROM messages m
        JOIN sessions s ON m.session_id = s.id
        WHERE s.user_id = ? AND m.created_at >= ?
        """,
        (user_id, start_date.isoformat())
    )
    total_messages = (await cursor.fetchone())["count"]
    
    # Get total tokens and cost from messages
    cursor = await db.execute(
        """
        SELECT 
            COALESCE(SUM(m.tokens_used), 0) as total_tokens
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        WHERE s.user_id = ? AND m.created_at >= ?
        """,
        (user_id, start_date.isoformat())
    )
    row = await cursor.fetchone()
    total_tokens = row["total_tokens"]
    
    # Get cost from usage analytics
    cursor = await db.execute(
        """
        SELECT COALESCE(SUM(cost_estimate), 0) as total_cost
        FROM usage_analytics
        WHERE user_id = ? AND created_at >= ?
        """,
        (user_id, start_date.isoformat())
    )
    total_cost = (await cursor.fetchone())["total_cost"]
    
    # Get providers used
    cursor = await db.execute(
        """
        SELECT p.display_name, COUNT(*) as count
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        JOIN providers p ON m.provider_id = p.id
        WHERE s.user_id = ? AND m.created_at >= ?
        GROUP BY p.id, p.display_name
        """,
        (user_id, start_date.isoformat())
    )
    providers_rows = await cursor.fetchall()
    providers_used = {row["display_name"]: row["count"] for row in providers_rows}
    
    # Get events by type
    cursor = await db.execute(
        """
        SELECT event_type, COUNT(*) as count
        FROM usage_analytics
        WHERE user_id = ? AND created_at >= ?
        GROUP BY event_type
        """,
        (user_id, start_date.isoformat())
    )
    events_rows = await cursor.fetchall()
    events_by_type = {row["event_type"]: row["count"] for row in events_rows}

    # Per-provider spend/tokens for terminal quota bars (join usage_analytics on provider).
    cursor = await db.execute(
        """
        SELECT
            p.display_name AS dname,
            COALESCE(SUM(ua.cost_estimate), 0) AS cost,
            COALESCE(SUM(ua.tokens_used), 0) AS tokens,
            COUNT(*) AS evts
        FROM usage_analytics ua
        JOIN providers p ON ua.provider_id = p.id
        WHERE ua.user_id = ? AND ua.created_at >= ? AND ua.provider_id IS NOT NULL
        GROUP BY p.id, p.display_name
        """,
        (user_id, start_date.isoformat()),
    )
    prov_rows = await cursor.fetchall()
    providers_map: Dict[str, Dict[str, Any]] = {}
    for row in prov_rows:
        name = row["dname"]
        providers_map[name] = {
            "cost": float(row["cost"] or 0),
            "tokens": int(row["tokens"] or 0),
            "events": int(row["evts"] or 0),
        }

    # Augment with message counts / tokens (orchestrator messages may lack analytics rows).
    cursor = await db.execute(
        """
        SELECT p.display_name AS dname,
               COUNT(*) AS msg_count,
               COALESCE(SUM(m.tokens_used), 0) AS tok
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        JOIN providers p ON m.provider_id = p.id
        WHERE s.user_id = ? AND m.created_at >= ? AND m.role = 'assistant'
        GROUP BY p.id, p.display_name
        """,
        (user_id, start_date.isoformat()),
    )
    for row in await cursor.fetchall():
        name = row["dname"]
        entry = providers_map.setdefault(name, {"cost": 0.0, "tokens": 0, "events": 0})
        entry["messages"] = int(row["msg_count"] or 0)
        if int(row["tok"] or 0) > int(entry.get("tokens") or 0):
            entry["tokens"] = int(row["tok"] or 0)

    return UsageStatsResponse(
        total_sessions=total_sessions,
        total_messages=total_messages,
        total_tokens=total_tokens,
        total_cost=total_cost,
        active_sessions=active_sessions,
        providers_used=providers_used,
        events_by_type=events_by_type,
        time_period=f"Last {days} days",
        start_date=start_date,
        end_date=end_date,
        providers=providers_map,
    )


@router.get("/routes", response_model=RoutingHistoryListResponse)
async def get_routing_history(
    session_id: Optional[int] = None,
    provider_id: Optional[int] = None,
    limit: int = Query(default=100, ge=1, le=1000),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> RoutingHistoryListResponse:
    """
    Get routing history with optional filtering.
    
    Args:
        session_id: Filter by session ID
        provider_id: Filter by provider ID
        limit: Maximum number of records to return
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Routing history list
    """
    # Build query with user verification through sessions
    where_clauses = []
    params = []
    
    query_base = """
        SELECT 
            rh.*,
            p.display_name as provider_name
        FROM routing_history rh
        JOIN sessions s ON rh.session_id = s.id
        JOIN providers p ON rh.selected_provider_id = p.id
        WHERE s.user_id = ?
    """
    params.append(user_id)
    
    if session_id:
        where_clauses.append("rh.session_id = ?")
        params.append(session_id)
    
    if provider_id:
        where_clauses.append("rh.selected_provider_id = ?")
        params.append(provider_id)
    
    if where_clauses:
        query_base += " AND " + " AND ".join(where_clauses)
    
    query_base += " ORDER BY rh.created_at DESC LIMIT ?"
    params.append(limit)
    
    cursor = await db.execute(query_base, params)
    rows = await cursor.fetchall()
    
    routes = []
    for row in rows:
        routes.append(RoutingHistoryResponse(
            id=row["id"],
            session_id=row["session_id"],
            selected_provider_id=row["selected_provider_id"],
            provider_name=row["provider_name"],
            routing_strategy=row["routing_strategy"],
            routing_reason=row["routing_reason"],
            latency_ms=row["latency_ms"],
            tokens_used=row["tokens_used"],
            cost_estimate=row["cost_estimate"],
            was_fallback=bool(row["was_fallback"]),
            created_at=datetime.fromisoformat(row["created_at"])
        ))
    
    return RoutingHistoryListResponse(
        routes=routes,
        total=len(routes)
    )


@router.get("/providers")
async def get_provider_analytics(
    days: int = Query(default=30, ge=1, le=365),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> Dict[str, Dict[str, Any]]:
    """
    Get analytics grouped by provider.
    
    Args:
        days: Number of days to include in statistics
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Provider analytics
    """
    start_date = utc_now() - timedelta(days=days)
    
    cursor = await db.execute(
        """
        SELECT 
            p.id,
            p.display_name,
            COUNT(DISTINCT m.session_id) as sessions_count,
            COUNT(m.id) as messages_count,
            COALESCE(SUM(m.tokens_used), 0) as total_tokens,
            COALESCE(AVG(m.tokens_used), 0) as avg_tokens_per_message
        FROM providers p
        LEFT JOIN messages m ON p.id = m.provider_id
        LEFT JOIN sessions s ON m.session_id = s.id
        WHERE s.user_id = ? AND m.created_at >= ?
        GROUP BY p.id, p.display_name
        ORDER BY messages_count DESC
        """,
        (user_id, start_date.isoformat())
    )
    rows = await cursor.fetchall()
    
    result = {}
    for row in rows:
        result[row["display_name"]] = {
            "provider_id": row["id"],
            "sessions_count": row["sessions_count"],
            "messages_count": row["messages_count"],
            "total_tokens": row["total_tokens"],
            "avg_tokens_per_message": round(row["avg_tokens_per_message"], 2)
        }
    
    return result


@router.get("/sessions/{session_id}")
async def get_session_analytics(
    session_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    Get detailed analytics for a specific session.
    
    Args:
        session_id: Session ID
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Session analytics
        
    Raises:
        HTTPException: If session not found or access denied
    """
    # Verify session belongs to user
    cursor = await db.execute(
        "SELECT id, title, created_at FROM sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id)
    )
    session_row = await cursor.fetchone()
    
    if session_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    # Get message count
    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM messages WHERE session_id = ?",
        (session_id,)
    )
    message_count = (await cursor.fetchone())["count"]
    
    # Get token usage
    cursor = await db.execute(
        """
        SELECT 
            COALESCE(SUM(tokens_used), 0) as total_tokens,
            COALESCE(AVG(tokens_used), 0) as avg_tokens
        FROM messages
        WHERE session_id = ?
        """,
        (session_id,)
    )
    tokens_row = await cursor.fetchone()
    
    # Get providers used
    cursor = await db.execute(
        """
        SELECT p.display_name, COUNT(*) as count
        FROM messages m
        JOIN providers p ON m.provider_id = p.id
        WHERE m.session_id = ?
        GROUP BY p.id, p.display_name
        """,
        (session_id,)
    )
    providers_rows = await cursor.fetchall()
    providers_used = {row["display_name"]: row["count"] for row in providers_rows}
    
    # Get artifacts count
    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM session_artifacts WHERE session_id = ?",
        (session_id,)
    )
    artifacts_count = (await cursor.fetchone())["count"]
    
    # Get CLI runtimes count
    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM cli_runtimes WHERE session_id = ?",
        (session_id,)
    )
    runtimes_count = (await cursor.fetchone())["count"]
    
    return {
        "session_id": session_id,
        "title": session_row["title"],
        "created_at": session_row["created_at"],
        "message_count": message_count,
        "total_tokens": tokens_row["total_tokens"],
        "avg_tokens_per_message": round(tokens_row["avg_tokens"], 2),
        "providers_used": providers_used,
        "artifacts_count": artifacts_count,
        "runtimes_count": runtimes_count
    }


@router.get("/events/recent")
async def list_recent_analytics_events(
    limit: int = Query(default=20, ge=1, le=100),
    event_type: Optional[str] = None,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> List[Dict[str, Any]]:
    """Recent analytics rows for the notifications popover."""
    clauses = ["user_id = ?"]
    params: List[Any] = [user_id]
    if event_type:
        clauses.append("event_type = ?")
        params.append(event_type)
    wh = " AND ".join(clauses)
    cursor = await db.execute(
        f"""
        SELECT id, session_id, provider_id, event_type, event_category,
               tokens_used, cost_estimate, metadata, created_at
        FROM usage_analytics
        WHERE {wh}
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (*params, limit),
    )
    rows = await cursor.fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                "id": row["id"],
                "session_id": row["session_id"],
                "provider_id": row["provider_id"],
                "event_type": row["event_type"],
                "event_category": row["event_category"],
                "tokens_used": row["tokens_used"],
                "cost_estimate": row["cost_estimate"],
                "metadata": json.loads(row["metadata"]) if row["metadata"] else None,
                "created_at": row["created_at"],
            }
        )
    return out


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def log_analytics_event(
    event_type: EventType,
    session_id: Optional[int] = None,
    provider_id: Optional[int] = None,
    tokens_used: int = 0,
    cost_estimate: float = 0.0,
    metadata: Optional[Dict[str, Any]] = None,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Log an analytics event.
    
    Args:
        event_type: Type of event
        session_id: Optional session ID
        provider_id: Optional provider ID
        tokens_used: Number of tokens used
        cost_estimate: Estimated cost
        metadata: Additional metadata
        db: Database connection
        user_id: Current user ID
    """
    now = utc_now()
    
    await db.execute(
        """
        INSERT INTO usage_analytics (
            user_id, session_id, provider_id, event_type,
            tokens_used, cost_estimate, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            session_id,
            provider_id,
            event_type.value,
            tokens_used,
            cost_estimate,
            json.dumps(metadata) if metadata else None,
            now.isoformat()
        )
    )
    await db.commit()
    
    return {"status": "success", "event_type": event_type.value}

# Made with Bob
