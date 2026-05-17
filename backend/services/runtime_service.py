"""
Runtime service for IBM Bob Backend System.
Handles CLI runtime management, command execution, and log tracking.
"""

import logging
import sqlite3
from typing import Optional, List, Dict, Any
from datetime import datetime
from contextlib import contextmanager

from backend.database.models import (
    CLIRuntime,
    CLIRuntimeCreate,
    CLIRuntimeUpdate,
    RuntimeStatus,
    CLILog,
    CLILogCreate,
    LogType,
)
from backend.config import settings

logger = logging.getLogger(__name__)


class RuntimeService:
    """
    Service for managing CLI runtimes and command execution.
    Handles runtime lifecycle, status tracking, and log management.
    """
    
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize the runtime service.
        
        Args:
            db_path: Path to the SQLite database. Uses config default if None.
        """
        self.db_path = db_path or str(settings.database_path)
        logger.info("RuntimeService initialized")
    
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
            logger.error(f"Database error in RuntimeService: {e}")
            raise
        finally:
            if conn:
                conn.close()
    
    async def create_runtime(
        self,
        provider_id: int,
        user_id: int,
        session_id: int,
        command: str,
        working_directory: str,
        process_id: int
    ) -> CLIRuntime:
        """
        Create a new CLI runtime.
        
        Args:
            provider_id: Provider ID executing the command
            user_id: User ID
            session_id: Session ID
            command: Command being executed
            working_directory: Working directory for command
            process_id: OS process ID
            
        Returns:
            Created CLIRuntime object
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                now = datetime.utcnow().isoformat()
                
                cursor.execute("""
                    INSERT INTO cli_runtimes (
                        session_id, process_id, command, working_directory,
                        status, started_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    session_id,
                    process_id,
                    command,
                    working_directory,
                    RuntimeStatus.RUNNING.value,
                    now
                ))
                
                runtime_id = cursor.lastrowid
                if runtime_id is None:
                    raise ValueError("Failed to create runtime: no ID returned")
                
                logger.info(f"Created runtime {runtime_id} for session {session_id}")
                
                return CLIRuntime(
                    id=runtime_id,
                    session_id=session_id,
                    process_id=process_id,
                    command=command,
                    working_directory=working_directory,
                    status=RuntimeStatus.RUNNING,
                    started_at=datetime.utcnow()
                )
                
        except Exception as e:
            logger.error(f"Failed to create runtime: {e}")
            raise
    
    async def get_runtime(self, runtime_id: int) -> Optional[CLIRuntime]:
        """
        Get a runtime by ID.
        
        Args:
            runtime_id: Runtime ID
            
        Returns:
            CLIRuntime object or None if not found
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM cli_runtimes WHERE id = ?", (runtime_id,))
                row = cursor.fetchone()
                
                if not row:
                    return None
                
                return CLIRuntime(
                    id=row['id'],
                    session_id=row['session_id'],
                    process_id=row['process_id'],
                    command=row['command'],
                    working_directory=row['working_directory'],
                    status=RuntimeStatus(row['status']),
                    exit_code=row['exit_code'],
                    started_at=datetime.fromisoformat(row['started_at']),
                    completed_at=datetime.fromisoformat(row['completed_at']) if row['completed_at'] else None
                )
                
        except Exception as e:
            logger.error(f"Failed to get runtime {runtime_id}: {e}")
            raise
    
    async def get_session_runtimes(
        self,
        session_id: int,
        status: Optional[RuntimeStatus] = None
    ) -> List[CLIRuntime]:
        """
        Get all runtimes for a session.
        
        Args:
            session_id: Session ID
            status: Optional status filter
            
        Returns:
            List of CLIRuntime objects
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                query = "SELECT * FROM cli_runtimes WHERE session_id = ?"
                params: List[Any] = [session_id]
                
                if status:
                    query += " AND status = ?"
                    params.append(status.value)
                
                query += " ORDER BY started_at DESC"
                
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                runtimes = []
                for row in rows:
                    runtime = CLIRuntime(
                        id=row['id'],
                        session_id=row['session_id'],
                        process_id=row['process_id'],
                        command=row['command'],
                        working_directory=row['working_directory'],
                        status=RuntimeStatus(row['status']),
                        exit_code=row['exit_code'],
                        started_at=datetime.fromisoformat(row['started_at']),
                        completed_at=datetime.fromisoformat(row['completed_at']) if row['completed_at'] else None
                    )
                    runtimes.append(runtime)
                
                logger.debug(f"Retrieved {len(runtimes)} runtimes for session {session_id}")
                return runtimes
                
        except Exception as e:
            logger.error(f"Failed to get runtimes for session {session_id}: {e}")
            raise
    
    async def update_status(
        self,
        runtime_id: int,
        status: RuntimeStatus,
        exit_code: Optional[int] = None
    ) -> CLIRuntime:
        """
        Update runtime status.
        
        Args:
            runtime_id: Runtime ID
            status: New status
            exit_code: Optional exit code if completed
            
        Returns:
            Updated CLIRuntime object
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Build update query
                update_fields = ["status = ?"]
                params: List[Any] = [status.value]
                
                if exit_code is not None:
                    update_fields.append("exit_code = ?")
                    params.append(exit_code)
                
                # Set completed_at if status is terminal
                if status in [RuntimeStatus.COMPLETED, RuntimeStatus.FAILED, RuntimeStatus.KILLED]:
                    update_fields.append("completed_at = ?")
                    params.append(datetime.utcnow().isoformat())
                
                params.append(runtime_id)
                
                query = f"UPDATE cli_runtimes SET {', '.join(update_fields)} WHERE id = ?"
                cursor.execute(query, params)
                
                logger.info(f"Updated runtime {runtime_id} status to {status.value}")
                
                # Return updated runtime
                updated_runtime = await self.get_runtime(runtime_id)
                if not updated_runtime:
                    raise ValueError(f"Runtime {runtime_id} not found after update")
                
                return updated_runtime
                
        except Exception as e:
            logger.error(f"Failed to update runtime {runtime_id} status: {e}")
            raise
    
    async def add_log(
        self,
        runtime_id: int,
        log_type: LogType,
        content: str,
        line_number: Optional[int] = None
    ) -> CLILog:
        """
        Add a log entry for a runtime.
        
        Args:
            runtime_id: Runtime ID
            log_type: Type of log (stdout, stderr, system)
            content: Log content
            line_number: Optional line number
            
        Returns:
            Created CLILog object
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                now = datetime.utcnow().isoformat()
                
                cursor.execute("""
                    INSERT INTO cli_logs (
                        runtime_id, log_type, content, line_number, timestamp
                    ) VALUES (?, ?, ?, ?, ?)
                """, (
                    runtime_id,
                    log_type.value,
                    content,
                    line_number,
                    now
                ))
                
                log_id = cursor.lastrowid
                if log_id is None:
                    raise ValueError("Failed to create log: no ID returned")
                
                logger.debug(f"Added {log_type.value} log to runtime {runtime_id}")
                
                return CLILog(
                    id=log_id,
                    runtime_id=runtime_id,
                    log_type=log_type,
                    content=content,
                    line_number=line_number,
                    timestamp=datetime.utcnow()
                )
                
        except Exception as e:
            logger.error(f"Failed to add log to runtime {runtime_id}: {e}")
            raise
    
    async def get_logs(
        self,
        runtime_id: int,
        log_type: Optional[LogType] = None,
        limit: int = 1000
    ) -> List[CLILog]:
        """
        Get logs for a runtime.
        
        Args:
            runtime_id: Runtime ID
            log_type: Optional log type filter
            limit: Maximum number of logs to return
            
        Returns:
            List of CLILog objects
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                query = "SELECT * FROM cli_logs WHERE runtime_id = ?"
                params: List[Any] = [runtime_id]
                
                if log_type:
                    query += " AND log_type = ?"
                    params.append(log_type.value)
                
                query += " ORDER BY timestamp ASC LIMIT ?"
                params.append(limit)
                
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                logs = []
                for row in rows:
                    log = CLILog(
                        id=row['id'],
                        runtime_id=row['runtime_id'],
                        log_type=LogType(row['log_type']),
                        content=row['content'],
                        line_number=row['line_number'],
                        timestamp=datetime.fromisoformat(row['timestamp'])
                    )
                    logs.append(log)
                
                logger.debug(f"Retrieved {len(logs)} logs for runtime {runtime_id}")
                return logs
                
        except Exception as e:
            logger.error(f"Failed to get logs for runtime {runtime_id}: {e}")
            raise
    
    async def request_permission(
        self,
        runtime_id: int,
        command: str
    ) -> None:
        """
        Request permission to execute a command.
        Creates a system log entry for the permission request.
        
        Args:
            runtime_id: Runtime ID
            command: Command requiring permission
        """
        try:
            await self.add_log(
                runtime_id,
                LogType.SYSTEM,
                f"PERMISSION_REQUIRED: {command}",
                None
            )
            
            logger.info(f"Permission requested for runtime {runtime_id}: {command}")
            
        except Exception as e:
            logger.error(f"Failed to request permission for runtime {runtime_id}: {e}")
            raise
    
    async def approve_command(
        self,
        runtime_id: int,
        approved: bool,
        command: Optional[str] = None
    ) -> bool:
        """
        Approve or deny a command execution.
        Creates a system log entry for the approval decision.
        
        Args:
            runtime_id: Runtime ID
            approved: Whether command is approved
            command: Optional command being approved/denied
            
        Returns:
            The approval decision
        """
        try:
            decision = "APPROVED" if approved else "DENIED"
            log_content = f"PERMISSION_{decision}"
            if command:
                log_content += f": {command}"
            
            await self.add_log(
                runtime_id,
                LogType.SYSTEM,
                log_content,
                None
            )
            
            logger.info(f"Command {decision.lower()} for runtime {runtime_id}")
            
            return approved
            
        except Exception as e:
            logger.error(f"Failed to approve command for runtime {runtime_id}: {e}")
            raise
    
    async def get_runtime_stats(self, runtime_id: int) -> Dict[str, Any]:
        """
        Get statistics for a runtime.
        
        Args:
            runtime_id: Runtime ID
            
        Returns:
            Dictionary with runtime statistics
        """
        try:
            runtime = await self.get_runtime(runtime_id)
            if not runtime:
                raise ValueError(f"Runtime {runtime_id} not found")
            
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Get log counts by type
                cursor.execute("""
                    SELECT log_type, COUNT(*) as count
                    FROM cli_logs
                    WHERE runtime_id = ?
                    GROUP BY log_type
                """, (runtime_id,))
                
                log_counts = {}
                for row in cursor.fetchall():
                    log_counts[row['log_type']] = row['count']
                
                # Calculate duration
                duration_seconds = None
                if runtime.completed_at:
                    duration = runtime.completed_at - runtime.started_at
                    duration_seconds = int(duration.total_seconds())
                
                return {
                    'runtime_id': runtime_id,
                    'status': runtime.status.value,
                    'exit_code': runtime.exit_code,
                    'command': runtime.command,
                    'log_counts': log_counts,
                    'total_logs': sum(log_counts.values()),
                    'duration_seconds': duration_seconds,
                    'started_at': runtime.started_at.isoformat(),
                    'completed_at': runtime.completed_at.isoformat() if runtime.completed_at else None
                }
                
        except Exception as e:
            logger.error(f"Failed to get stats for runtime {runtime_id}: {e}")
            raise
    
    async def cleanup_old_runtimes(self, days: int = 7) -> int:
        """
        Clean up old completed runtimes and their logs.
        
        Args:
            days: Number of days to keep
            
        Returns:
            Number of runtimes cleaned up
        """
        try:
            from datetime import timedelta
            
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
                
                # Get runtime IDs to delete
                cursor.execute("""
                    SELECT id FROM cli_runtimes
                    WHERE status IN (?, ?, ?)
                    AND completed_at < ?
                """, (
                    RuntimeStatus.COMPLETED.value,
                    RuntimeStatus.FAILED.value,
                    RuntimeStatus.KILLED.value,
                    cutoff_date
                ))
                
                runtime_ids = [row['id'] for row in cursor.fetchall()]
                
                if runtime_ids:
                    # Delete logs
                    placeholders = ','.join('?' * len(runtime_ids))
                    cursor.execute(
                        f"DELETE FROM cli_logs WHERE runtime_id IN ({placeholders})",
                        runtime_ids
                    )
                    
                    # Delete runtimes
                    cursor.execute(
                        f"DELETE FROM cli_runtimes WHERE id IN ({placeholders})",
                        runtime_ids
                    )
                
                cleanup_count = len(runtime_ids)
                logger.info(f"Cleaned up {cleanup_count} old runtimes")
                
                return cleanup_count
                
        except Exception as e:
            logger.error(f"Failed to cleanup old runtimes: {e}")
            raise


# Global singleton instance
_runtime_service: Optional[RuntimeService] = None


def get_runtime_service(db_path: Optional[str] = None) -> RuntimeService:
    """
    Get the global runtime service instance.
    
    Args:
        db_path: Optional database path. Only used on first call.
        
    Returns:
        RuntimeService instance
    """
    global _runtime_service
    if _runtime_service is None:
        _runtime_service = RuntimeService(db_path)
    return _runtime_service


# Made with Bob