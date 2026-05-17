"""
Session service for IBM Bob Backend System.
Handles session management, lifecycle, and usage tracking.
"""

import logging
import sqlite3
from typing import Optional, List, Dict, Any
from datetime import datetime
from contextlib import contextmanager

from backend.database.models import (
    Session,
    SessionCreate,
    SessionUpdate,
    SessionStatus,
    SessionType,
    Message,
    MessageCreate,
)
from backend.config import settings

logger = logging.getLogger(__name__)


class SessionService:
    """
    Service for managing chat/task sessions.
    Handles CRUD operations, lifecycle management, and usage tracking.
    """
    
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize the session service.
        
        Args:
            db_path: Path to the SQLite database. Uses config default if None.
        """
        self.db_path = db_path or str(settings.database_path)
        logger.info("SessionService initialized")
    
    @contextmanager
    def _get_connection(self):
        """Get a database connection with proper error handling."""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error in SessionService: {e}")
            raise
        finally:
            if conn:
                conn.close()
    
    async def create_session(
        self,
        prompt: str,
        workspace_id: Optional[int],
        user_id: int,
        session_type: SessionType = SessionType.CHAT
    ) -> Session:
        """
        Create a new session.
        
        Args:
            prompt: Initial prompt/title for the session
            workspace_id: Optional workspace ID
            user_id: User ID
            session_type: Type of session (chat, task, workflow)
            
        Returns:
            Created Session object
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Generate title from prompt (first 100 chars)
                title = prompt[:100] if len(prompt) > 100 else prompt
                
                now = datetime.utcnow().isoformat()
                
                cursor.execute("""
                    INSERT INTO sessions (
                        user_id, workspace_id, title, status, session_type, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_id,
                    workspace_id,
                    title,
                    SessionStatus.ACTIVE.value,
                    session_type.value,
                    now,
                    now
                ))
                
                session_id = cursor.lastrowid
                if session_id is None:
                    raise ValueError("Failed to create session: no ID returned")
                
                logger.info(f"Created session {session_id} for user {user_id}")
                
                return Session(
                    id=session_id,
                    user_id=user_id,
                    workspace_id=workspace_id,
                    title=title,
                    status=SessionStatus.ACTIVE,
                    session_type=session_type,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                
        except Exception as e:
            logger.error(f"Failed to create session: {e}")
            raise
    
    async def get_session(self, session_id: int) -> Optional[Session]:
        """
        Get a session by ID.
        
        Args:
            session_id: Session ID
            
        Returns:
            Session object or None if not found
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
                row = cursor.fetchone()
                
                if not row:
                    return None
                
                return Session(
                    id=row['id'],
                    user_id=row['user_id'],
                    workspace_id=row['workspace_id'],
                    title=row['title'],
                    description=row['description'],
                    status=SessionStatus(row['status']),
                    session_type=SessionType(row['session_type']),
                    metadata=row['metadata'],
                    completed_at=datetime.fromisoformat(row['completed_at']) if row['completed_at'] else None,
                    created_at=datetime.fromisoformat(row['created_at']),
                    updated_at=datetime.fromisoformat(row['updated_at'])
                )
                
        except Exception as e:
            logger.error(f"Failed to get session {session_id}: {e}")
            raise
    
    async def list_sessions(
        self,
        user_id: int,
        workspace_id: Optional[int] = None,
        status: Optional[SessionStatus] = None,
        session_type: Optional[SessionType] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Session]:
        """
        List sessions with filtering and pagination.
        
        Args:
            user_id: User ID
            workspace_id: Optional workspace filter
            status: Optional status filter
            session_type: Optional type filter
            limit: Maximum number of results
            offset: Pagination offset
            
        Returns:
            List of Session objects
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                query = "SELECT * FROM sessions WHERE user_id = ?"
                params: List[Any] = [user_id]
                
                if workspace_id is not None:
                    query += " AND workspace_id = ?"
                    params.append(workspace_id)
                
                if status is not None:
                    query += " AND status = ?"
                    params.append(status.value)
                
                if session_type is not None:
                    query += " AND session_type = ?"
                    params.append(session_type.value)
                
                query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?"
                params.extend([limit, offset])
                
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                sessions = []
                for row in rows:
                    session = Session(
                        id=row['id'],
                        user_id=row['user_id'],
                        workspace_id=row['workspace_id'],
                        title=row['title'],
                        description=row['description'],
                        status=SessionStatus(row['status']),
                        session_type=SessionType(row['session_type']),
                        metadata=row['metadata'],
                        completed_at=datetime.fromisoformat(row['completed_at']) if row['completed_at'] else None,
                        created_at=datetime.fromisoformat(row['created_at']),
                        updated_at=datetime.fromisoformat(row['updated_at'])
                    )
                    sessions.append(session)
                
                logger.debug(f"Retrieved {len(sessions)} sessions for user {user_id}")
                return sessions
                
        except Exception as e:
            logger.error(f"Failed to list sessions: {e}")
            raise
    
    async def update_session(
        self,
        session_id: int,
        updates: SessionUpdate
    ) -> Session:
        """
        Update a session.
        
        Args:
            session_id: Session ID
            updates: Session update data
            
        Returns:
            Updated Session object
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Build update query dynamically
                update_fields = []
                params = []
                
                if updates.title is not None:
                    update_fields.append("title = ?")
                    params.append(updates.title)
                
                if updates.description is not None:
                    update_fields.append("description = ?")
                    params.append(updates.description)
                
                if updates.status is not None:
                    update_fields.append("status = ?")
                    params.append(updates.status.value)
                    
                    # Set completed_at if status is completed
                    if updates.status == SessionStatus.COMPLETED:
                        update_fields.append("completed_at = ?")
                        params.append(datetime.utcnow().isoformat())
                
                if updates.metadata is not None:
                    update_fields.append("metadata = ?")
                    params.append(str(updates.metadata))
                
                update_fields.append("updated_at = ?")
                params.append(datetime.utcnow().isoformat())
                
                params.append(session_id)
                
                query = f"UPDATE sessions SET {', '.join(update_fields)} WHERE id = ?"
                cursor.execute(query, params)
                
                logger.info(f"Updated session {session_id}")
                
                # Return updated session
                updated_session = await self.get_session(session_id)
                if not updated_session:
                    raise ValueError(f"Session {session_id} not found after update")
                
                return updated_session
                
        except Exception as e:
            logger.error(f"Failed to update session {session_id}: {e}")
            raise
    
    async def complete_session(
        self,
        session_id: int,
        summary: Optional[str] = None
    ) -> Session:
        """
        Mark a session as completed.
        
        Args:
            session_id: Session ID
            summary: Optional completion summary
            
        Returns:
            Updated Session object
        """
        try:
            updates = SessionUpdate(
                status=SessionStatus.COMPLETED,
                description=summary
            )
            
            session = await self.update_session(session_id, updates)
            logger.info(f"Completed session {session_id}")
            
            return session
            
        except Exception as e:
            logger.error(f"Failed to complete session {session_id}: {e}")
            raise
    
    async def track_usage(
        self,
        session_id: int,
        tokens: int,
        cost: float
    ) -> None:
        """
        Track token usage and cost for a session.
        
        Args:
            session_id: Session ID
            tokens: Number of tokens used
            cost: Estimated cost
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Update session metadata with usage info
                cursor.execute("""
                    SELECT metadata FROM sessions WHERE id = ?
                """, (session_id,))
                
                row = cursor.fetchone()
                if not row:
                    raise ValueError(f"Session {session_id} not found")
                
                # Parse existing metadata or create new
                metadata = {}
                if row['metadata']:
                    try:
                        import json
                        metadata = json.loads(row['metadata'])
                    except:
                        metadata = {}
                
                # Update usage tracking
                metadata['total_tokens'] = metadata.get('total_tokens', 0) + tokens
                metadata['total_cost'] = metadata.get('total_cost', 0.0) + cost
                metadata['last_usage_at'] = datetime.utcnow().isoformat()
                
                cursor.execute("""
                    UPDATE sessions
                    SET metadata = ?, updated_at = ?
                    WHERE id = ?
                """, (
                    str(metadata),
                    datetime.utcnow().isoformat(),
                    session_id
                ))
                
                logger.debug(f"Tracked usage for session {session_id}: {tokens} tokens, ${cost:.4f}")
                
        except Exception as e:
            logger.error(f"Failed to track usage for session {session_id}: {e}")
            raise
    
    async def get_session_stats(self, session_id: int) -> Dict[str, Any]:
        """
        Get statistics for a session.
        
        Args:
            session_id: Session ID
            
        Returns:
            Dictionary with session statistics
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Get message count
                cursor.execute("""
                    SELECT COUNT(*) as message_count,
                           SUM(tokens_used) as total_tokens
                    FROM messages
                    WHERE session_id = ?
                """, (session_id,))
                
                row = cursor.fetchone()
                message_count = row['message_count'] if row else 0
                total_tokens = row['total_tokens'] if row and row['total_tokens'] else 0
                
                # Get agent count
                cursor.execute("""
                    SELECT COUNT(*) as agent_count,
                           SUM(tokens_used) as agent_tokens,
                           SUM(cost_estimate) as total_cost
                    FROM session_agents
                    WHERE session_id = ?
                """, (session_id,))
                
                row = cursor.fetchone()
                agent_count = row['agent_count'] if row else 0
                agent_tokens = row['agent_tokens'] if row and row['agent_tokens'] else 0
                total_cost = row['total_cost'] if row and row['total_cost'] else 0.0
                
                # Get artifact count
                cursor.execute("""
                    SELECT COUNT(*) as artifact_count
                    FROM session_artifacts
                    WHERE session_id = ?
                """, (session_id,))
                
                row = cursor.fetchone()
                artifact_count = row['artifact_count'] if row else 0
                
                # Get session info
                session = await self.get_session(session_id)
                if not session:
                    raise ValueError(f"Session {session_id} not found")
                
                # Calculate duration
                duration_seconds = None
                if session.completed_at:
                    duration = session.completed_at - session.created_at
                    duration_seconds = int(duration.total_seconds())
                
                return {
                    'session_id': session_id,
                    'status': session.status.value,
                    'message_count': message_count,
                    'agent_count': agent_count,
                    'artifact_count': artifact_count,
                    'total_tokens': total_tokens + agent_tokens,
                    'total_cost': total_cost,
                    'duration_seconds': duration_seconds,
                    'created_at': session.created_at.isoformat(),
                    'completed_at': session.completed_at.isoformat() if session.completed_at else None
                }
                
        except Exception as e:
            logger.error(f"Failed to get stats for session {session_id}: {e}")
            raise
    
    async def delete_session(self, session_id: int) -> bool:
        """
        Delete a session and all related data.
        
        Args:
            session_id: Session ID
            
        Returns:
            True if deleted, False if not found
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Check if session exists
                cursor.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
                if not cursor.fetchone():
                    return False
                
                # Delete related data (cascade should handle this, but being explicit)
                cursor.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
                cursor.execute("DELETE FROM session_agents WHERE session_id = ?", (session_id,))
                cursor.execute("DELETE FROM session_artifacts WHERE session_id = ?", (session_id,))
                cursor.execute("DELETE FROM cli_runtimes WHERE session_id = ?", (session_id,))
                cursor.execute("DELETE FROM routing_history WHERE session_id = ?", (session_id,))
                
                # Delete session
                cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
                
                logger.info(f"Deleted session {session_id}")
                return True
                
        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}")
            raise
    
    async def archive_old_sessions(self, days: int = 30) -> int:
        """
        Archive sessions older than specified days.
        
        Args:
            days: Number of days to keep active
            
        Returns:
            Number of sessions archived
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                cutoff_date = datetime.utcnow() - timedelta(days=days)
                
                cursor.execute("""
                    UPDATE sessions
                    SET status = ?, updated_at = ?
                    WHERE status = ?
                    AND updated_at < ?
                """, (
                    SessionStatus.ARCHIVED.value,
                    datetime.utcnow().isoformat(),
                    SessionStatus.COMPLETED.value,
                    cutoff_date.isoformat()
                ))
                
                archived_count = cursor.rowcount
                logger.info(f"Archived {archived_count} old sessions")
                
                return archived_count
                
        except Exception as e:
            logger.error(f"Failed to archive old sessions: {e}")
            raise


# Import timedelta for archive function
from datetime import timedelta


# Global singleton instance
_session_service: Optional[SessionService] = None


def get_session_service(db_path: Optional[str] = None) -> SessionService:
    """
    Get the global session service instance.
    
    Args:
        db_path: Optional database path. Only used on first call.
        
    Returns:
        SessionService instance
    """
    global _session_service
    if _session_service is None:
        _session_service = SessionService(db_path)
    return _session_service


# Made with Bob