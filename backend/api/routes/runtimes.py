"""
CLI Runtime management API routes.
Handles CLI process execution, monitoring, and approval.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone
from pydantic import BaseModel
import aiosqlite
import json


from backend.utils import utc_now

from backend.database.models import (
    CLIRuntime, CLIRuntimeCreate, CLIRuntimeUpdate,
    RuntimeStatus, CLILog, LogType
)
from backend.api.dependencies import (
    get_db, get_current_user_id, verify_runtime_exists,
    fetch_active_workspace_path,
)
from backend.services.pty_service import pty_manager, PTY_AVAILABLE
from backend.config import settings as app_settings
from backend.utils.paths import normalize_workspace_path

router = APIRouter(prefix="/runtimes", tags=["runtimes"])


class SpawnRequest(BaseModel):
    """Request body to spawn a real PTY for an agent card."""
    provider_id: Optional[int] = None
    provider_name: Optional[str] = None
    workspace_path: Optional[str] = None
    session_id: Optional[int] = None
    cols: Optional[int] = 120
    rows: Optional[int] = 30


class SpawnResponse(BaseModel):
    """Response with everything the frontend needs to attach."""
    runtime_id: int
    provider_id: Optional[int]
    provider_name: Optional[str]
    ws_url: str
    cwd: str
    pid: Optional[int]
    status: str
    shell_label: str = "Terminal"


class WsUrlResponse(BaseModel):
    """Fresh WebSocket URL for an existing PTY (reconnect / fullscreen)."""
    ws_url: str


class ActiveRuntime(BaseModel):
    """Lightweight active-runtime snapshot for the UI's grid."""
    runtime_id: int
    provider_id: Optional[int]
    provider_name: Optional[str]
    cwd: str
    pid: Optional[int]
    status: str
    shell_label: str = "Terminal"
    ws_url: Optional[str] = None
    started_at: Optional[datetime] = None


class ActiveRuntimesResponse(BaseModel):
    runtimes: List[ActiveRuntime]
    total: int


class RuntimeListResponse(BaseModel):
    """Response model for runtime list."""
    runtimes: List[CLIRuntime]
    total: int


class RuntimeDetailResponse(CLIRuntime):
    """Extended runtime response with logs."""
    logs: List[CLILog] = []


class ApprovalRequest(BaseModel):
    """Request model for command approval."""
    approved: bool
    reason: Optional[str] = None


@router.get("", response_model=RuntimeListResponse)
async def get_all_runtimes(
    status_filter: Optional[RuntimeStatus] = None,
    session_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> RuntimeListResponse:
    """
    Get all CLI runtimes with optional filtering.
    
    Args:
        status_filter: Filter by runtime status
        session_id: Filter by session ID
        limit: Limit count
        offset: Offset count
        db: Database connection
        user_id: Current user ID
        
    Returns:
        List of CLI runtimes
    """
    # Build query with filters. PTY-backed runtimes may have session_id NULL,
    # so we LEFT JOIN sessions and accept rows where session_id is unset.
    # Single-user mode: unscoped PTY rows only visible to default user (HIGH-003)
    where_clauses = ["(s.user_id = ? OR (r.session_id IS NULL AND ? = 1))"]
    params: List = [user_id, user_id]

    if status_filter:
        where_clauses.append("r.status = ?")
        params.append(status_filter.value)

    if session_id:
        where_clauses.append("r.session_id = ?")
        params.append(session_id)

    # Get total count
    count_query = (
        "SELECT COUNT(*) as count FROM cli_runtimes r "
        "LEFT JOIN sessions s ON r.session_id = s.id "
        "WHERE " + " AND ".join(where_clauses)
    )
    count_cursor = await db.execute(count_query, params)
    total = (await count_cursor.fetchone())["count"]

    query = (
        "SELECT r.* FROM cli_runtimes r "
        "LEFT JOIN sessions s ON r.session_id = s.id "
        "WHERE " + " AND ".join(where_clauses) + " "
        "ORDER BY r.started_at DESC "
        "LIMIT ? OFFSET ?"
    )

    cursor = await db.execute(query, params + [limit, offset])
    rows = await cursor.fetchall()
    
    runtimes = []
    for row in rows:
        runtimes.append(CLIRuntime(
            id=row["id"],
            session_id=row["session_id"],
            provider_id=row["provider_id"] if "provider_id" in row.keys() else None,
            process_id=row["process_id"],
            command=row["command"],
            working_directory=row["working_directory"],
            status=RuntimeStatus(row["status"]),
            exit_code=row["exit_code"],
            started_at=datetime.fromisoformat(row["started_at"]),
            completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None
        ))
    
    return RuntimeListResponse(
        runtimes=runtimes,
        total=total
    )


async def _resolve_pty_cwd(
    db: aiosqlite.Connection,
    user_id: int,
    requested: Optional[str],
) -> str:
    """Prefer explicit workspace_path, then active workspace from DB, then project root."""
    from pathlib import Path

    if requested:
        try:
            p = Path(normalize_workspace_path(requested))
            if p.is_dir():
                return str(p)
        except Exception:
            pass
    raw = await fetch_active_workspace_path(db, user_id)
    if raw:
        try:
            p = Path(normalize_workspace_path(raw))
            if p.is_dir():
                return str(p)
        except Exception:
            pass
    return str(Path(app_settings.upload_dir).resolve().parent)


def _active_runtime_snapshots(limit: int = 50, offset: int = 0) -> ActiveRuntimesResponse:
    """Return only live PTY sessions in memory (cheap snapshot for the UI)."""
    all_active = pty_manager.list_active()
    total = len(all_active)
    sliced = all_active[offset : offset + limit]
    items: List[ActiveRuntime] = []
    for s in sliced:
        items.append(
            ActiveRuntime(
                runtime_id=s.runtime_id,
                provider_id=s.provider_id,
                provider_name=s.provider_name,
                cwd=s.cwd,
                pid=s.pid,
                status=s.status,
                shell_label=s.shell_label,
                ws_url=f"/ws/terminals/{s.runtime_id}?token={pty_manager.generate_ws_token(s.runtime_id)}",
            )
        )
    return ActiveRuntimesResponse(runtimes=items, total=total)


@router.get("/active", response_model=ActiveRuntimesResponse)
async def list_active_runtimes(
    limit: int = 50,
    offset: int = 0,
    user_id: int = Depends(get_current_user_id),
) -> ActiveRuntimesResponse:
    return _active_runtime_snapshots(limit, offset)


@router.get("/live", response_model=ActiveRuntimesResponse)
async def list_live_runtimes(
    limit: int = 50,
    offset: int = 0,
    user_id: int = Depends(get_current_user_id),
) -> ActiveRuntimesResponse:
    """Alias for /active — avoids Starlette matching `active` as a path param."""
    return _active_runtime_snapshots(limit, offset)


@router.post("/spawn", response_model=SpawnResponse, status_code=status.HTTP_201_CREATED)
async def spawn_runtime(
    spawn: SpawnRequest,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> SpawnResponse:
    """
    Spawn a real Windows PTY (PowerShell) tied to a provider/agent card.
    Returns a runtime_id + ws_url the frontend should attach to.
    """
    if not PTY_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Native PTY unavailable on this platform.",
        )

    if spawn.provider_id is not None:
        existing = pty_manager.active_for_provider(spawn.provider_id, user_id)
        if existing is not None:
            return SpawnResponse(
                runtime_id=existing.runtime_id,
                provider_id=existing.provider_id,
                provider_name=existing.provider_name,
                ws_url=f"/ws/terminals/{existing.runtime_id}?token={pty_manager.generate_ws_token(existing.runtime_id)}",
                cwd=existing.cwd,
                pid=existing.pid,
                status=existing.status,
            )

    cwd = await _resolve_pty_cwd(db, user_id, spawn.workspace_path)
    provider_name = spawn.provider_name or ""

    if spawn.provider_id is not None and not provider_name:
        cur = await db.execute(
            "SELECT display_name FROM providers WHERE id = ?",
            (spawn.provider_id,),
        )
        row = await cur.fetchone()
        if row:
            provider_name = row["display_name"]

    now = utc_now()
    # Determine actual shell label before inserting the DB record
    from backend.services.pty_service import _shell_label as _get_shell_label
    shell_lbl = _get_shell_label()
    cursor = await db.execute(
        """
        INSERT INTO cli_runtimes (
            session_id, provider_id, process_id, command,
            working_directory, status, started_at
        ) VALUES (?, ?, NULL, ?, ?, 'running', ?)
        """,
        (
            spawn.session_id,
            spawn.provider_id,
            shell_lbl,
            cwd,
            now.isoformat(),
        ),
    )
    await db.commit()
    runtime_id = cursor.lastrowid
    if runtime_id is None:
        raise HTTPException(500, "Failed to allocate runtime id")

    try:
        session = pty_manager.create(
            runtime_id=int(runtime_id),
            provider_id=spawn.provider_id,
            provider_name=provider_name or "Terminal",
            cwd=cwd,
            user_id=user_id,
        )
        if spawn.cols and spawn.rows:
            session.resize(spawn.cols, spawn.rows)
    except Exception as e:
        await db.execute(
            "UPDATE cli_runtimes SET status='failed', completed_at=? WHERE id=?",
            (utc_now().isoformat(), runtime_id),
        )
        await db.commit()
        raise HTTPException(500, f"Failed to spawn PTY: {e}") from e

    if session.pid is not None:
        await db.execute(
            "UPDATE cli_runtimes SET process_id = ? WHERE id = ?",
            (session.pid, runtime_id),
        )
        await db.commit()

    return SpawnResponse(
        runtime_id=int(runtime_id),
        provider_id=session.provider_id,
        provider_name=session.provider_name,
        ws_url=f"/ws/terminals/{runtime_id}?token={pty_manager.generate_ws_token(int(runtime_id))}",
        cwd=session.cwd,
        pid=session.pid,
        status=session.status,
        shell_label=session.shell_label,
    )


@router.post("/{runtime_id:int}/ws-token", response_model=WsUrlResponse)
async def refresh_ws_token(
    runtime_id: int = Depends(verify_runtime_exists),
    user_id: int = Depends(get_current_user_id),
) -> WsUrlResponse:
    """Issue a new single-use WebSocket token for an active PTY session."""
    session = pty_manager.get(runtime_id)
    if session is None or not session.is_alive():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active PTY for runtime {runtime_id} not found",
        )
    if session.user_id not in (None, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Runtime belongs to another user",
        )
    token = pty_manager.generate_ws_token(runtime_id)
    return WsUrlResponse(ws_url=f"/ws/terminals/{runtime_id}?token={token}")


@router.get("/{runtime_id:int}", response_model=RuntimeDetailResponse)
async def get_runtime(
    runtime_id: int = Depends(verify_runtime_exists),
    include_logs: bool = True,
    log_limit: int = 100,
    log_offset: int = 0,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> RuntimeDetailResponse:
    """
    Get specific CLI runtime details with logs.
    
    Args:
        runtime_id: Runtime ID
        include_logs: Whether to include logs
        log_limit: Max number of log entries to retrieve
        log_offset: Pagination offset
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Runtime details with logs
        
    Raises:
        HTTPException: If runtime not found or access denied
    """
    # Get runtime; LEFT JOIN since PTY-backed rows may have session_id NULL.
    cursor = await db.execute(
        """
        SELECT r.* FROM cli_runtimes r
        LEFT JOIN sessions s ON r.session_id = s.id
        WHERE r.id = ? AND (s.user_id = ? OR (r.session_id IS NULL AND ? = 1))
        """,
        (runtime_id, user_id, user_id)
    )
    row = await cursor.fetchone()
    
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Runtime with id {runtime_id} not found"
        )
    
    runtime = CLIRuntime(
        id=row["id"],
        session_id=row["session_id"],
        provider_id=row["provider_id"] if "provider_id" in row.keys() else None,
        process_id=row["process_id"],
        command=row["command"],
        working_directory=row["working_directory"],
        status=RuntimeStatus(row["status"]),
        exit_code=row["exit_code"],
        started_at=datetime.fromisoformat(row["started_at"]),
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None
    )
    
    logs = []
    if include_logs:
        # Get logs for this runtime, defaulting to the latest log_limit entries sorted ASC chronologically (API-06)
        cursor = await db.execute(
            """
            SELECT * FROM (
                SELECT * FROM cli_logs
                WHERE runtime_id = ?
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?
            ) ORDER BY timestamp ASC
            """,
            (runtime_id, log_limit, log_offset)
        )
        log_rows = await cursor.fetchall()
        
        for log_row in log_rows:
            logs.append(CLILog(
                id=log_row["id"],
                runtime_id=log_row["runtime_id"],
                log_type=LogType(log_row["log_type"]),
                content=log_row["content"],
                line_number=log_row["line_number"],
                timestamp=datetime.fromisoformat(log_row["timestamp"])
            ))
    
    return RuntimeDetailResponse(
        **runtime.model_dump(),
        logs=logs
    )


@router.post("/{runtime_id:int}/approve", response_model=CLIRuntime)
async def approve_pending_command(
    approval: ApprovalRequest,
    runtime_id: int = Depends(verify_runtime_exists),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> CLIRuntime:
    """
    Approve or reject a pending CLI command.
    
    Args:
        runtime_id: Runtime ID
        approval: Approval decision
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Updated runtime
        
    Raises:
        HTTPException: If runtime not found, not pending, or access denied
    """
    # Get runtime; PTY-backed rows may have session_id NULL.
    cursor = await db.execute(
        """
        SELECT r.* FROM cli_runtimes r
        LEFT JOIN sessions s ON r.session_id = s.id
        WHERE r.id = ? AND (s.user_id = ? OR (r.session_id IS NULL AND ? = 1))
        """,
        (runtime_id, user_id, user_id)
    )
    row = await cursor.fetchone()
    
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Runtime with id {runtime_id} not found"
        )
    
    # Check if runtime is in a state that can be approved (BIZ-04)
    current_status = RuntimeStatus(row["status"])
    if current_status != RuntimeStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Runtime is not in pending state (current: {current_status.value})"
        )
    
    # Update runtime based on approval
    now = utc_now()
    
    if approval.approved:
        # BIZ-05: Signal PTY session to resume by writing newline
        session = pty_manager.get(runtime_id)
        if session:
            session.write("\n")

        # Update DB status back to RUNNING
        await db.execute(
            """
            UPDATE cli_runtimes
            SET status = ?
            WHERE id = ?
            """,
            (RuntimeStatus.RUNNING.value, runtime_id)
        )

        # Log approval
        await db.execute(
            """
            INSERT INTO cli_logs (runtime_id, log_type, content, timestamp)
            VALUES (?, ?, ?, ?)
            """,
            (
                runtime_id,
                LogType.SYSTEM.value,
                f"Command approved: {approval.reason or 'No reason provided'}",
                now.isoformat()
            )
        )
    else:
        # Reject and kill the process
        await db.execute(
            """
            UPDATE cli_runtimes
            SET status = ?, exit_code = ?, completed_at = ?
            WHERE id = ?
            """,
            (
                RuntimeStatus.KILLED.value,
                -1,
                now.isoformat(),
                runtime_id
            )
        )
        
        # Kill and remove PTY session (BIZ-06)
        pty_manager.remove(runtime_id)

        # Log rejection
        await db.execute(
            """
            INSERT INTO cli_logs (runtime_id, log_type, content, timestamp)
            VALUES (?, ?, ?, ?)
            """,
            (
                runtime_id,
                LogType.SYSTEM.value,
                f"Command rejected: {approval.reason or 'No reason provided'}",
                now.isoformat()
            )
        )
    
    await db.commit()
    
    # Return updated runtime
    return await get_runtime(runtime_id, False, db, user_id)


@router.post("", response_model=CLIRuntime, status_code=status.HTTP_201_CREATED)
async def create_runtime(
    runtime_data: CLIRuntimeCreate,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> CLIRuntime:
    """
    Create a new CLI runtime entry.
    
    Args:
        runtime_data: Runtime creation data
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Created runtime
        
    Raises:
        HTTPException: If session not found or access denied
    """
    # Optional: verify session belongs to user when provided.
    if runtime_data.session_id is not None:
        cursor = await db.execute(
            "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
            (runtime_data.session_id, user_id)
        )
        if await cursor.fetchone() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session {runtime_data.session_id} not found"
            )
    
    now = utc_now()
    
    cursor = await db.execute(
        """
        INSERT INTO cli_runtimes (
            session_id, provider_id, process_id, command, working_directory,
            status, exit_code, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            runtime_data.session_id,
            runtime_data.provider_id,
            runtime_data.process_id,
            runtime_data.command,
            runtime_data.working_directory,
            runtime_data.status.value,
            runtime_data.exit_code,
            now.isoformat()
        )
    )
    await db.commit()
    
    runtime_id = cursor.lastrowid
    if runtime_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create runtime"
        )
    
    # Fetch and return the created runtime
    cursor = await db.execute(
        "SELECT * FROM cli_runtimes WHERE id = ?",
        (runtime_id,)
    )
    row = await cursor.fetchone()
    
    return CLIRuntime(
        id=row["id"],
        session_id=row["session_id"],
        provider_id=row["provider_id"] if "provider_id" in row.keys() else None,
        process_id=row["process_id"],
        command=row["command"],
        working_directory=row["working_directory"],
        status=RuntimeStatus(row["status"]),
        exit_code=row["exit_code"],
        started_at=datetime.fromisoformat(row["started_at"]),
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None
    )


@router.put("/{runtime_id:int}", response_model=CLIRuntime)
async def update_runtime(
    runtime_update: CLIRuntimeUpdate,
    runtime_id: int = Depends(verify_runtime_exists),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> CLIRuntime:
    """
    Update CLI runtime status.
    
    Args:
        runtime_id: Runtime ID
        runtime_update: Runtime update data
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Updated runtime
    """
    # Verify access; PTY-backed rows may have session_id NULL.
    cursor = await db.execute(
        """
        SELECT r.id FROM cli_runtimes r
        LEFT JOIN sessions s ON r.session_id = s.id
        WHERE r.id = ? AND (s.user_id = ? OR (r.session_id IS NULL AND ? = 1))
        """,
        (runtime_id, user_id, user_id)
    )
    if await cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Runtime with id {runtime_id} not found"
        )
    
    # Build update query
    update_fields = []
    params = []
    
    if runtime_update.status is not None:
        update_fields.append("status = ?")
        params.append(runtime_update.status.value)
        
        # Set completed_at if status is terminal
        if runtime_update.status in [RuntimeStatus.COMPLETED, RuntimeStatus.FAILED, RuntimeStatus.KILLED]:
            update_fields.append("completed_at = ?")
            params.append(utc_now().isoformat())
    
    if runtime_update.exit_code is not None:
        update_fields.append("exit_code = ?")
        params.append(runtime_update.exit_code)
    
    if not update_fields:
        return await get_runtime(runtime_id, False, db, user_id)
    
    params.append(runtime_id)
    
    await db.execute(
        f"UPDATE cli_runtimes SET {', '.join(update_fields)} WHERE id = ?",
        params
    )
    await db.commit()
    
    return await get_runtime(runtime_id, False, db, user_id)


@router.delete("/{runtime_id:int}", status_code=status.HTTP_204_NO_CONTENT)
async def kill_runtime(
    runtime_id: int = Depends(verify_runtime_exists),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> None:
    """Kill a live PTY and mark its DB row as killed."""
    pty_manager.remove(runtime_id)
    await db.execute(
        "UPDATE cli_runtimes SET status='killed', completed_at=? WHERE id=?",
        (utc_now().isoformat(), runtime_id),
    )
    await db.commit()
    return None


@router.post("/{runtime_id:int}/pause", response_model=CLIRuntime)
async def pause_runtime(
    runtime_id: int = Depends(verify_runtime_exists),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> CLIRuntime:
    """Mark a runtime as paused (best-effort on Windows; UI hint only)."""
    session = pty_manager.get(runtime_id)
    if session:
        session.pause()
    await db.execute(
        "UPDATE cli_runtimes SET status='paused' WHERE id=?",
        (runtime_id,),
    )
    await db.commit()
    return await get_runtime(runtime_id, False, db, user_id)


@router.post("/{runtime_id:int}/resume", response_model=CLIRuntime)
async def resume_runtime(
    runtime_id: int = Depends(verify_runtime_exists),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> CLIRuntime:
    """Resume a previously paused PTY."""
    session = pty_manager.get(runtime_id)
    if session:
        session.resume()
    await db.execute(
        "UPDATE cli_runtimes SET status='running' WHERE id=?",
        (runtime_id,),
    )
    await db.commit()
    return await get_runtime(runtime_id, False, db, user_id)

