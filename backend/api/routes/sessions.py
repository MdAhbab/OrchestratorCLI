"""
Session management API routes.
Handles session creation, listing, retrieval, and deletion.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from datetime import datetime, timezone
import aiosqlite
import json


def utc_now() -> datetime:
    """Return current UTC datetime with timezone info."""
    return datetime.now(timezone.utc)

from backend.database.models import (
    Session, SessionCreate, SessionUpdate, SessionStatus,
    SessionType, SessionListResponse, Message, MessageListResponse,
    MessageRole, ContentType
)
from backend.api.dependencies import (
    get_db, CommonQueryParams, get_current_user_id
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=Session, status_code=status.HTTP_201_CREATED)
async def create_session(
    session_data: SessionCreate,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> Session:
    """
    Create a new session.
    
    Args:
        session_data: Session creation data
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Created session
    """
    now = utc_now()
    
    # Override user_id with authenticated user
    session_data.user_id = user_id
    
    cursor = await db.execute(
        """
        INSERT INTO sessions (
            user_id, workspace_id, title, description, status,
            session_type, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_data.user_id,
            session_data.workspace_id,
            session_data.title,
            session_data.description,
            session_data.status.value,
            session_data.session_type.value,
            json.dumps(session_data.metadata) if session_data.metadata else None,
            now.isoformat(),
            now.isoformat()
        )
    )
    await db.commit()
    
    session_id = cursor.lastrowid
    if session_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create session"
        )
    
    # Fetch and return the created session
    cursor = await db.execute(
        "SELECT * FROM sessions WHERE id = ?",
        (session_id,)
    )
    row = await cursor.fetchone()
    
    return Session(
        id=row["id"],
        user_id=row["user_id"],
        workspace_id=row["workspace_id"],
        title=row["title"],
        description=row["description"],
        status=SessionStatus(row["status"]),
        session_type=SessionType(row["session_type"]),
        metadata=json.loads(row["metadata"]) if row["metadata"] else None,
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None
    )


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    status_filter: Optional[SessionStatus] = Query(None, alias="status"),
    session_type: Optional[SessionType] = Query(None, alias="type"),
    workspace_id: Optional[int] = None,
    commons: CommonQueryParams = Depends(),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> SessionListResponse:
    """
    List sessions with optional filtering.
    
    Args:
        status_filter: Filter by session status
        session_type: Filter by session type
        workspace_id: Filter by workspace ID
        commons: Common query parameters (pagination, sorting)
        db: Database connection
        user_id: Current user ID
        
    Returns:
        List of sessions with pagination info
    """
    # Build query with filters
    where_clauses = ["user_id = ?"]
    params = [user_id]
    
    if status_filter:
        where_clauses.append("status = ?")
        params.append(status_filter.value)
    
    if session_type:
        where_clauses.append("session_type = ?")
        params.append(session_type.value)
    
    if workspace_id:
        where_clauses.append("workspace_id = ?")
        params.append(workspace_id)
    
    where_clause = " AND ".join(where_clauses)
    
    # Get total count
    count_query = f"SELECT COUNT(*) as count FROM sessions WHERE {where_clause}"
    count_cursor = await db.execute(count_query, params)
    total = (await count_cursor.fetchone())["count"]
    
    # Get sessions with pagination - validate sort column
    allowed_sort_columns = ["created_at", "updated_at", "title", "status", "session_type"]
    sort_column = commons.sort_by if commons.sort_by in allowed_sort_columns else "created_at"
    
    # Validate sort order
    sort_order = commons.sort_order.upper() if commons.sort_order.upper() in ["ASC", "DESC"] else "DESC"
    
    query = f"""
        SELECT * FROM sessions
        WHERE {where_clause}
        ORDER BY {sort_column} {sort_order}
        LIMIT ? OFFSET ?
    """
    
    cursor = await db.execute(
        query,
        params + [commons.limit, commons.skip]
    )
    rows = await cursor.fetchall()
    
    sessions = []
    for row in rows:
        sessions.append(Session(
            id=row["id"],
            user_id=row["user_id"],
            workspace_id=row["workspace_id"],
            title=row["title"],
            description=row["description"],
            status=SessionStatus(row["status"]),
            session_type=SessionType(row["session_type"]),
            metadata=json.loads(row["metadata"]) if row["metadata"] else None,
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None
        ))
    
    return SessionListResponse(
        sessions=sessions,
        total=total,
        page=commons.skip // commons.limit + 1,
        page_size=commons.limit
    )


@router.get("/{session_id}", response_model=Session)
async def get_session(
    session_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> Session:
    """
    Get session details by ID.
    
    Args:
        session_id: Session ID
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Session details
        
    Raises:
        HTTPException: If session not found or access denied
    """
    cursor = await db.execute(
        "SELECT * FROM sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id)
    )
    row = await cursor.fetchone()
    
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session with id {session_id} not found"
        )
    
    return Session(
        id=row["id"],
        user_id=row["user_id"],
        workspace_id=row["workspace_id"],
        title=row["title"],
        description=row["description"],
        status=SessionStatus(row["status"]),
        session_type=SessionType(row["session_type"]),
        metadata=json.loads(row["metadata"]) if row["metadata"] else None,
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None
    )


@router.get("/{session_id}/messages", response_model=MessageListResponse)
async def get_session_messages(
    session_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> MessageListResponse:
    """
    Get all messages for a session.
    """
    # Verify session exists and belongs to user
    cursor = await db.execute(
        "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id)
    )
    if await cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session with id {session_id} not found"
        )
    
    # Fetch messages
    cursor = await db.execute(
        """
        SELECT * FROM messages
        WHERE session_id = ?
        ORDER BY created_at ASC
        """,
        (session_id,)
    )
    rows = await cursor.fetchall()
    
    messages = []
    for row in rows:
        messages.append(Message(
            id=row["id"],
            session_id=row["session_id"],
            parent_message_id=row["parent_message_id"],
            role=MessageRole(row["role"]),
            content=row["content"],
            content_type=ContentType(row["content_type"]),
            agent_name=row["agent_name"],
            provider_id=row["provider_id"],
            model_name=row["model_name"],
            tokens_used=row["tokens_used"] or 0,
            metadata=json.loads(row["metadata"]) if row["metadata"] else None,
            is_edited=bool(row["is_edited"]),
            is_deleted=bool(row["is_deleted"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"])
        ))
        
    return MessageListResponse(
        messages=messages,
        total=len(messages),
        session_id=session_id
    )


@router.put("/{session_id}", response_model=Session)
async def update_session(
    session_id: int,
    session_update: SessionUpdate,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> Session:
    """
    Update session details.
    
    Args:
        session_id: Session ID
        session_update: Session update data
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Updated session
        
    Raises:
        HTTPException: If session not found or access denied
    """
    # Verify session exists and belongs to user
    cursor = await db.execute(
        "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id)
    )
    if await cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session with id {session_id} not found"
        )
    
    # Build update query dynamically
    update_fields = []
    params = []
    
    if session_update.title is not None:
        update_fields.append("title = ?")
        params.append(session_update.title)
    
    if session_update.description is not None:
        update_fields.append("description = ?")
        params.append(session_update.description)
    
    if session_update.status is not None:
        update_fields.append("status = ?")
        params.append(session_update.status.value)
        
        # Set completed_at if status is completed
        if session_update.status == SessionStatus.COMPLETED:
            update_fields.append("completed_at = ?")
            params.append(utc_now().isoformat())
    
    if session_update.metadata is not None:
        update_fields.append("metadata = ?")
        params.append(json.dumps(session_update.metadata))
    
    if not update_fields:
        # No fields to update, just return current session
        return await get_session(session_id, db, user_id)
    
    # Add updated_at
    update_fields.append("updated_at = ?")
    params.append(utc_now().isoformat())
    
    # Add session_id for WHERE clause
    params.append(session_id)
    
    await db.execute(
        f"UPDATE sessions SET {', '.join(update_fields)} WHERE id = ?",
        params
    )
    await db.commit()
    
    # Return updated session
    return await get_session(session_id, db, user_id)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def clear_all_sessions(
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Clear all sessions for the current user.
    This will cascade delete all related data (messages, artifacts, etc.).
    
    Args:
        db: Database connection
        user_id: Current user ID
    """
    await db.execute(
        "DELETE FROM sessions WHERE user_id = ?",
        (user_id,)
    )
    await db.commit()


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Delete a specific session.
    This will cascade delete all related data (messages, artifacts, etc.).
    
    Args:
        session_id: Session ID
        db: Database connection
        user_id: Current user ID
        
    Raises:
        HTTPException: If session not found or access denied
    """
    cursor = await db.execute(
        "DELETE FROM sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id)
    )
    await db.commit()
    
    if cursor.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session with id {session_id} not found"
        )

# Made with Bob
