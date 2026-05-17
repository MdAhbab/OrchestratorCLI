"""
Workspace service for IBM Bob Backend System.
Handles workspace management, context files, and artifacts.
"""

import logging
import sqlite3
import hashlib
import shutil
from typing import Optional, List, Dict, Any, BinaryIO
from datetime import datetime
from contextlib import contextmanager
from pathlib import Path

from backend.database.models import (
    Workspace,
    WorkspaceCreate,
    WorkspaceUpdate,
    ContextFile,
    ContextFileCreate,
    SessionArtifact,
    SessionArtifactCreate,
    ArtifactType,
)
from backend.config import settings

logger = logging.getLogger(__name__)


class WorkspaceService:
    """
    Service for managing workspaces, context files, and artifacts.
    Handles file upload, storage, validation, and retrieval.
    """
    
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize the workspace service.
        
        Args:
            db_path: Path to the SQLite database. Uses config default if None.
        """
        self.db_path = db_path or str(settings.database_path)
        self.context_files_dir = settings.context_files_dir
        self.artifacts_dir = settings.artifacts_dir
        self.max_upload_size = settings.max_upload_size
        self.allowed_file_types = settings.allowed_file_types
        
        # Ensure directories exist
        self.context_files_dir.mkdir(parents=True, exist_ok=True)
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info("WorkspaceService initialized")
    
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
            logger.error(f"Database error in WorkspaceService: {e}")
            raise
        finally:
            if conn:
                conn.close()
    
    def _calculate_file_hash(self, file_path: Path) -> str:
        """
        Calculate SHA-256 hash of a file.
        
        Args:
            file_path: Path to file
            
        Returns:
            Hexadecimal hash string
        """
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def _validate_file(self, filename: str, file_size: int) -> None:
        """
        Validate file before upload.
        
        Args:
            filename: Name of file
            file_size: Size of file in bytes
            
        Raises:
            ValueError: If file is invalid
        """
        # Check file size
        if file_size > self.max_upload_size:
            raise ValueError(
                f"File size {file_size} exceeds maximum {self.max_upload_size} bytes"
            )
        
        # Check file extension
        file_ext = Path(filename).suffix.lower()
        if file_ext not in self.allowed_file_types:
            raise ValueError(
                f"File type {file_ext} not allowed. Allowed types: {', '.join(self.allowed_file_types)}"
            )
    
    async def upload_context_file(
        self,
        file_content: bytes,
        filename: str,
        session_id: int,
        user_id: int,
        original_path: Optional[str] = None,
        mime_type: Optional[str] = None
    ) -> ContextFile:
        """
        Upload a context file for a session.
        
        Args:
            file_content: File content as bytes
            filename: Original filename
            session_id: Session ID
            user_id: User ID
            original_path: Original file path
            mime_type: MIME type of file
            
        Returns:
            Created ContextFile object
        """
        stored_path = None
        try:
            file_size = len(file_content)
            
            # Validate file
            self._validate_file(filename, file_size)
            
            # Generate unique filename
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            safe_filename = f"{session_id}_{timestamp}_{filename}"
            stored_path = self.context_files_dir / safe_filename
            
            # Write file to disk
            with open(stored_path, 'wb') as f:
                f.write(file_content)
            
            # Calculate hash
            content_hash = self._calculate_file_hash(stored_path)
            
            # Determine file type
            file_type = Path(filename).suffix.lower().lstrip('.')
            
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                now = datetime.utcnow().isoformat()
                
                cursor.execute("""
                    INSERT INTO context_files (
                        session_id, user_id, filename, original_path, stored_path,
                        file_type, mime_type, size_bytes, content_hash, uploaded_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_id,
                    user_id,
                    filename,
                    original_path,
                    str(stored_path),
                    file_type,
                    mime_type,
                    file_size,
                    content_hash,
                    now
                ))
                
                file_id = cursor.lastrowid
                if file_id is None:
                    raise ValueError("Failed to create context file: no ID returned")
                
                logger.info(f"Uploaded context file {file_id}: {filename} ({file_size} bytes)")
                
                return ContextFile(
                    id=file_id,
                    session_id=session_id,
                    user_id=user_id,
                    filename=filename,
                    original_path=original_path,
                    stored_path=str(stored_path),
                    file_type=file_type,
                    mime_type=mime_type,
                    size_bytes=file_size,
                    content_hash=content_hash,
                    is_indexed=False,
                    uploaded_at=datetime.utcnow()
                )
                
        except Exception as e:
            logger.error(f"Failed to upload context file: {e}")
            # Clean up file if database insert failed
            if stored_path and stored_path.exists():
                stored_path.unlink()
            raise
    
    async def get_context_files(
        self,
        session_id: Optional[int] = None,
        user_id: Optional[int] = None,
        workspace_id: Optional[int] = None
    ) -> List[ContextFile]:
        """
        Get context files with optional filtering.
        
        Args:
            session_id: Optional session filter
            user_id: Optional user filter
            workspace_id: Optional workspace filter
            
        Returns:
            List of ContextFile objects
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                query = "SELECT * FROM context_files WHERE 1=1"
                params: List[Any] = []
                
                if session_id is not None:
                    query += " AND session_id = ?"
                    params.append(session_id)
                
                if user_id is not None:
                    query += " AND user_id = ?"
                    params.append(user_id)
                
                query += " ORDER BY uploaded_at DESC"
                
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                files = []
                for row in rows:
                    context_file = ContextFile(
                        id=row['id'],
                        session_id=row['session_id'],
                        user_id=row['user_id'],
                        filename=row['filename'],
                        original_path=row['original_path'],
                        stored_path=row['stored_path'],
                        file_type=row['file_type'],
                        mime_type=row['mime_type'],
                        size_bytes=row['size_bytes'],
                        content_hash=row['content_hash'],
                        is_indexed=bool(row['is_indexed']),
                        embedding_id=row['embedding_id'],
                        metadata=row['metadata'],
                        uploaded_at=datetime.fromisoformat(row['uploaded_at'])
                    )
                    files.append(context_file)
                
                logger.debug(f"Retrieved {len(files)} context files")
                return files
                
        except Exception as e:
            logger.error(f"Failed to get context files: {e}")
            raise
    
    async def get_context_file(self, file_id: int) -> Optional[ContextFile]:
        """
        Get a specific context file by ID.
        
        Args:
            file_id: File ID
            
        Returns:
            ContextFile object or None if not found
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM context_files WHERE id = ?", (file_id,))
                row = cursor.fetchone()
                
                if not row:
                    return None
                
                return ContextFile(
                    id=row['id'],
                    session_id=row['session_id'],
                    user_id=row['user_id'],
                    filename=row['filename'],
                    original_path=row['original_path'],
                    stored_path=row['stored_path'],
                    file_type=row['file_type'],
                    mime_type=row['mime_type'],
                    size_bytes=row['size_bytes'],
                    content_hash=row['content_hash'],
                    is_indexed=bool(row['is_indexed']),
                    embedding_id=row['embedding_id'],
                    metadata=row['metadata'],
                    uploaded_at=datetime.fromisoformat(row['uploaded_at'])
                )
                
        except Exception as e:
            logger.error(f"Failed to get context file {file_id}: {e}")
            raise
    
    async def delete_context_file(self, file_id: int) -> bool:
        """
        Delete a context file.
        
        Args:
            file_id: File ID
            
        Returns:
            True if deleted, False if not found
        """
        try:
            # Get file info first
            context_file = await self.get_context_file(file_id)
            if not context_file:
                return False
            
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM context_files WHERE id = ?", (file_id,))
            
            # Delete physical file
            file_path = Path(context_file.stored_path)
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Deleted context file {file_id}: {context_file.filename}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete context file {file_id}: {e}")
            raise
    
    async def create_artifact(
        self,
        session_id: int,
        name: str,
        artifact_type: ArtifactType,
        content: Optional[str] = None,
        path: Optional[str] = None,
        mime_type: Optional[str] = None,
        message_id: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> SessionArtifact:
        """
        Create a session artifact.
        
        Args:
            session_id: Session ID
            name: Artifact name
            artifact_type: Type of artifact
            content: Optional content (for code, text)
            path: Optional file path
            mime_type: Optional MIME type
            message_id: Optional message ID that generated this artifact
            metadata: Optional metadata
            
        Returns:
            Created SessionArtifact object
        """
        try:
            size_bytes = None
            
            # If content provided, save to file
            if content and not path:
                timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                safe_name = "".join(c for c in name if c.isalnum() or c in "._- ")
                filename = f"{session_id}_{timestamp}_{safe_name}"
                artifact_path = self.artifacts_dir / filename
                
                with open(artifact_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                path = str(artifact_path)
                size_bytes = len(content.encode('utf-8'))
            
            # If path provided, get size
            elif path:
                path_obj = Path(path)
                if path_obj.exists():
                    size_bytes = path_obj.stat().st_size
            
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                now = datetime.utcnow().isoformat()
                
                cursor.execute("""
                    INSERT INTO session_artifacts (
                        session_id, message_id, artifact_type, name, path,
                        content, mime_type, size_bytes, metadata, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_id,
                    message_id,
                    artifact_type.value,
                    name,
                    path,
                    content if not path else None,  # Store content only if no file
                    mime_type,
                    size_bytes,
                    str(metadata) if metadata else None,
                    now
                ))
                
                artifact_id = cursor.lastrowid
                if artifact_id is None:
                    raise ValueError("Failed to create artifact: no ID returned")
                
                logger.info(f"Created artifact {artifact_id}: {name}")
                
                return SessionArtifact(
                    id=artifact_id,
                    session_id=session_id,
                    message_id=message_id,
                    artifact_type=artifact_type,
                    name=name,
                    path=path,
                    content=content if not path else None,
                    mime_type=mime_type,
                    size_bytes=size_bytes,
                    metadata=metadata,
                    created_at=datetime.utcnow()
                )
                
        except Exception as e:
            logger.error(f"Failed to create artifact: {e}")
            raise
    
    async def get_artifacts(
        self,
        session_id: int,
        artifact_type: Optional[ArtifactType] = None
    ) -> List[SessionArtifact]:
        """
        Get artifacts for a session.
        
        Args:
            session_id: Session ID
            artifact_type: Optional type filter
            
        Returns:
            List of SessionArtifact objects
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                query = "SELECT * FROM session_artifacts WHERE session_id = ?"
                params: List[Any] = [session_id]
                
                if artifact_type:
                    query += " AND artifact_type = ?"
                    params.append(artifact_type.value)
                
                query += " ORDER BY created_at DESC"
                
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                artifacts = []
                for row in rows:
                    artifact = SessionArtifact(
                        id=row['id'],
                        session_id=row['session_id'],
                        message_id=row['message_id'],
                        artifact_type=ArtifactType(row['artifact_type']),
                        name=row['name'],
                        path=row['path'],
                        content=row['content'],
                        mime_type=row['mime_type'],
                        size_bytes=row['size_bytes'],
                        metadata=row['metadata'],
                        created_at=datetime.fromisoformat(row['created_at'])
                    )
                    artifacts.append(artifact)
                
                logger.debug(f"Retrieved {len(artifacts)} artifacts for session {session_id}")
                return artifacts
                
        except Exception as e:
            logger.error(f"Failed to get artifacts for session {session_id}: {e}")
            raise
    
    async def get_artifact_content(self, artifact_id: int) -> Optional[str]:
        """
        Get the content of an artifact.
        
        Args:
            artifact_id: Artifact ID
            
        Returns:
            Artifact content or None if not found
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT content, path FROM session_artifacts WHERE id = ?
                """, (artifact_id,))
                
                row = cursor.fetchone()
                if not row:
                    return None
                
                # Return stored content if available
                if row['content']:
                    return row['content']
                
                # Otherwise read from file
                if row['path']:
                    path = Path(row['path'])
                    if path.exists():
                        with open(path, 'r', encoding='utf-8') as f:
                            return f.read()
                
                return None
                
        except Exception as e:
            logger.error(f"Failed to get artifact content {artifact_id}: {e}")
            raise
    
    async def cleanup_session_files(self, session_id: int) -> Dict[str, int]:
        """
        Clean up all files associated with a session.
        
        Args:
            session_id: Session ID
            
        Returns:
            Dictionary with cleanup statistics
        """
        try:
            stats = {
                'context_files_deleted': 0,
                'artifacts_deleted': 0,
                'bytes_freed': 0
            }
            
            # Get and delete context files
            context_files = await self.get_context_files(session_id=session_id)
            for context_file in context_files:
                file_path = Path(context_file.stored_path)
                if file_path.exists():
                    stats['bytes_freed'] += file_path.stat().st_size
                    file_path.unlink()
                stats['context_files_deleted'] += 1
            
            # Get and delete artifacts
            artifacts = await self.get_artifacts(session_id)
            for artifact in artifacts:
                if artifact.path:
                    artifact_path = Path(artifact.path)
                    if artifact_path.exists():
                        stats['bytes_freed'] += artifact_path.stat().st_size
                        artifact_path.unlink()
                stats['artifacts_deleted'] += 1
            
            # Delete database records
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM context_files WHERE session_id = ?", (session_id,))
                cursor.execute("DELETE FROM session_artifacts WHERE session_id = ?", (session_id,))
            
            logger.info(f"Cleaned up files for session {session_id}: {stats}")
            return stats
            
        except Exception as e:
            logger.error(f"Failed to cleanup files for session {session_id}: {e}")
            raise


# Global singleton instance
_workspace_service: Optional[WorkspaceService] = None


def get_workspace_service(db_path: Optional[str] = None) -> WorkspaceService:
    """
    Get the global workspace service instance.
    
    Args:
        db_path: Optional database path. Only used on first call.
        
    Returns:
        WorkspaceService instance
    """
    global _workspace_service
    if _workspace_service is None:
        _workspace_service = WorkspaceService(db_path)
    return _workspace_service


# Made with Bob