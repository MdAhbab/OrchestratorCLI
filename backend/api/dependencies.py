"""
Common dependencies for API routes.
Provides database session management and other shared dependencies.
"""

from typing import AsyncGenerator, Optional
import aiosqlite
from fastapi import Depends, HTTPException, status
from pathlib import Path

from backend.config import settings


# Database connection pool (simple implementation for SQLite)
_db_connection: Optional[aiosqlite.Connection] = None


async def get_db_connection() -> aiosqlite.Connection:
    """Get or create database connection."""
    global _db_connection
    
    if _db_connection is None:
        _db_connection = await aiosqlite.connect(
            str(settings.database_path),
            check_same_thread=False
        )
        # Enable foreign keys
        await _db_connection.execute("PRAGMA foreign_keys = ON")
        # Set row factory to return dict-like rows
        _db_connection.row_factory = aiosqlite.Row
    
    return _db_connection


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    """
    Dependency for getting database connection.
    Provides a database connection for the request lifecycle.
    """
    conn = await get_db_connection()
    try:
        yield conn
    finally:
        # Connection is reused, so we don't close it here
        pass


async def close_db_connection():
    """Close the database connection. Called on application shutdown."""
    global _db_connection
    if _db_connection is not None:
        await _db_connection.close()
        _db_connection = None


class CommonQueryParams:
    """Common query parameters for list endpoints."""
    
    def __init__(
        self,
        skip: int = 0,
        limit: int = 100,
        sort_by: Optional[str] = None,
        sort_order: str = "desc"
    ):
        self.skip = max(0, skip)
        self.limit = min(limit, 1000)  # Max 1000 items per request
        self.sort_by = sort_by
        self.sort_order = sort_order.lower() if sort_order.lower() in ["asc", "desc"] else "desc"


async def get_current_user_id(
    user_id: Optional[int] = None
) -> int:
    """
    Get current user ID.
    For now, returns a default user ID (1) since authentication is not implemented.
    In production, this would extract user ID from JWT token.
    """
    # TODO: Implement proper authentication
    # For now, use default user ID or provided user_id
    return user_id if user_id is not None else 1


async def verify_session_exists(
    session_id: int,
    db: aiosqlite.Connection = Depends(get_db)
) -> int:
    """Verify that a session exists and return its ID."""
    cursor = await db.execute(
        "SELECT id FROM sessions WHERE id = ?",
        (session_id,)
    )
    row = await cursor.fetchone()
    
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session with id {session_id} not found"
        )
    
    return session_id


async def verify_provider_exists(
    provider_id: int,
    db: aiosqlite.Connection = Depends(get_db)
) -> int:
    """Verify that a provider exists and return its ID."""
    cursor = await db.execute(
        "SELECT id FROM providers WHERE id = ?",
        (provider_id,)
    )
    row = await cursor.fetchone()
    
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provider with id {provider_id} not found"
        )
    
    return provider_id


async def verify_runtime_exists(
    runtime_id: int,
    db: aiosqlite.Connection = Depends(get_db)
) -> int:
    """Verify that a CLI runtime exists and return its ID."""
    cursor = await db.execute(
        "SELECT id FROM cli_runtimes WHERE id = ?",
        (runtime_id,)
    )
    row = await cursor.fetchone()
    
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Runtime with id {runtime_id} not found"
        )
    
    return runtime_id


def validate_file_type(filename: str) -> bool:
    """Validate if file type is allowed."""
    file_ext = Path(filename).suffix.lower()
    return file_ext in settings.allowed_file_types


def validate_file_size(file_size: int) -> bool:
    """Validate if file size is within limits."""
    return file_size <= settings.max_upload_size


async def fetch_active_workspace_path(
    db: aiosqlite.Connection, user_id: int
) -> Optional[str]:
    """Return filesystem path of the user's active workspace, if any."""
    cur = await db.execute(
        "SELECT path FROM workspaces WHERE user_id = ? AND is_active = 1 "
        "ORDER BY updated_at DESC LIMIT 1",
        (user_id,),
    )
    row = await cur.fetchone()
    if row and row["path"]:
        return str(row["path"])
    return None

# Made with Bob
