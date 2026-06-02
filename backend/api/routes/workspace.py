"""
Workspace management API routes.
Handles context files and artifacts management.
"""

from typing import List, Optional, Set
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, Response
from datetime import datetime, timezone
from pydantic import BaseModel
import aiosqlite
import json
import hashlib
import mimetypes
import aiofiles
import logging
from pathlib import Path


def utc_now() -> datetime:
    """Return current UTC datetime with timezone info."""
    return datetime.now(timezone.utc)

from backend.database.models import (
    ContextFile, ContextFileCreate, SessionArtifact,
    SessionArtifactCreate, ArtifactType
)
from backend.api.dependencies import (
    get_db, get_current_user_id, validate_file_type, validate_file_size,
    fetch_active_workspace_path,
)
from backend.config import settings
from backend.utils.paths import normalize_workspace_path


router = APIRouter(prefix="/workspace", tags=["workspace"])
logger = logging.getLogger(__name__)

# Files typically authored by the orchestrator inside workspace/shared/.
ORCHESTRATOR_SHARED_NAMES: Set[str] = {
    "divisions.md",
    "task-graph.md",
}


class ContextFileResponse(BaseModel):
    """Response model for context file."""
    id: int
    filename: str
    file_type: Optional[str]
    size_bytes: int
    uploaded_at: datetime
    is_indexed: bool


class ContextFilesResponse(BaseModel):
    """Response model for context files list."""
    files: List[ContextFileResponse]
    total: int


class SharedContextFileResponse(BaseModel):
    """A file on disk under the active workspace's shared/ directory."""
    name: str
    relative_path: str
    size_bytes: int
    modified_at: datetime
    source: str = "user"


class SharedContextFilesResponse(BaseModel):
    workspace_path: Optional[str] = None
    shared_dir: Optional[str] = None
    exists: bool = False
    files: List[SharedContextFileResponse]
    total: int


class ArtifactResponse(BaseModel):
    """Response model for artifact."""
    id: int
    artifact_type: ArtifactType
    name: str
    path: Optional[str]
    mime_type: Optional[str]
    size_bytes: Optional[int]
    created_at: datetime
    session_id: int


class ArtifactsResponse(BaseModel):
    """Response model for artifacts list."""
    artifacts: List[ArtifactResponse]
    total: int


def calculate_file_hash(content: bytes) -> str:
    """Calculate SHA256 hash of file content."""
    return hashlib.sha256(content).hexdigest()


class GitStatus(BaseModel):
    """Snapshot of git state for the user's active workspace."""
    workspace_path: Optional[str] = None
    branch: Optional[str] = None
    head_short: Optional[str] = None
    head_subject: Optional[str] = None
    ahead: int = 0
    behind: int = 0
    files_changed: int = 0
    is_repo: bool = False
    error: Optional[str] = None


class GitCommandRequest(BaseModel):
    """Body for /api/workspace/git/run."""
    command: str
    confirm: Optional[bool] = False


class GitCommandResponse(BaseModel):
    """Stdout/stderr from a sandboxed git command."""
    command: str
    stdout: str
    stderr: str
    exit_code: int
    cwd: str


def _list_shared_dir(shared_dir: Path) -> List[SharedContextFileResponse]:
    """List files under workspace/shared (recursive, skips hidden paths)."""
    if not shared_dir.is_dir():
        return []

    shared_resolved = shared_dir.resolve()
    entries: List[SharedContextFileResponse] = []

    for path in sorted(shared_resolved.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        rel = path.relative_to(shared_resolved)
        rel_posix = rel.as_posix()
        if rel_posix.startswith(".") or "/." in rel_posix:
            continue
        try:
            stat = path.stat()
        except OSError as exc:
            logger.debug("skip shared file %s: %s", path, exc)
            continue
        name = path.name
        entries.append(
            SharedContextFileResponse(
                name=name,
                relative_path=rel_posix,
                size_bytes=int(stat.st_size),
                modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                source="orchestrator"
                if name.lower() in ORCHESTRATOR_SHARED_NAMES
                else "user",
            )
        )
    return entries


async def _active_workspace_path(
    db: aiosqlite.Connection, user_id: int
) -> Optional[str]:
    raw = await fetch_active_workspace_path(db, user_id)
    if not raw:
        return None
    try:
        return normalize_workspace_path(raw)
    except Exception:
        return raw


@router.get("/validate-path")
async def validate_path_endpoint(path: str) -> dict:
    from pathlib import Path
    try:
        # Expand user (~) and resolve absolute path
        p = Path(path).expanduser().resolve()
        # It's valid if it exists as a directory, or if it doesn't exist but its parent exists and is a directory
        is_valid = False
        if p.exists():
            is_valid = p.is_dir()
        else:
            is_valid = p.parent.exists() and p.parent.is_dir()
        return {"valid": is_valid, "path": str(p)}
    except Exception as e:
        return {"valid": False, "error": str(e)}


@router.get("/git", response_model=GitStatus)
async def workspace_git_status(
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> GitStatus:
    """Run git status / branch / log in the active workspace and return a snapshot."""
    import asyncio as _asyncio
    import subprocess

    ws = await _active_workspace_path(db, user_id)
    if not ws or not Path(ws).is_dir():
        return GitStatus(error="No active workspace configured")

    def run(cmd: list[str]) -> tuple[int, str, str]:
        try:
            out = subprocess.run(
                cmd, cwd=ws, capture_output=True, text=True, timeout=8
            )
            return out.returncode, out.stdout, out.stderr
        except FileNotFoundError:
            return 127, "", "git not installed"
        except Exception as e:
            return 1, "", str(e)

    code, _, _ = await _asyncio.to_thread(run, ["git", "rev-parse", "--is-inside-work-tree"])
    if code != 0:
        return GitStatus(workspace_path=ws, is_repo=False)

    results = await _asyncio.gather(
        _asyncio.to_thread(run, ["git", "rev-parse", "--abbrev-ref", "HEAD"]),
        _asyncio.to_thread(run, ["git", "rev-parse", "--short", "HEAD"]),
        _asyncio.to_thread(run, ["git", "log", "-1", "--format=%s"]),
        _asyncio.to_thread(run, ["git", "status", "--porcelain"]),
        _asyncio.to_thread(run, ["git", "rev-list", "--left-right", "--count", "HEAD...@{upstream}"]),
    )

    _, branch, _ = results[0]
    _, sh, _ = results[1]
    _, subj, _ = results[2]
    _, porc, _ = results[3]
    code_ab, ab, _ = results[4]

    ahead = behind = 0
    if code_ab == 0 and ab.strip():
        parts = ab.split()
        if len(parts) == 2:
            try:
                ahead, behind = int(parts[0]), int(parts[1])
            except ValueError:
                pass

    return GitStatus(
        workspace_path=ws,
        branch=branch.strip() or None,
        head_short=sh.strip() or None,
        head_subject=subj.strip() or None,
        ahead=ahead,
        behind=behind,
        files_changed=len([line for line in porc.splitlines() if line.strip()]),
        is_repo=True,
    )


_GIT_READ = {
    "status", "log", "branch", "remote", "diff", "show", "rev-parse",
    "config", "fetch", "blame", "shortlog",
}
_GIT_WRITE = {
    "pull", "switch", "add", "stash", "push", "commit", "checkout",
    "merge", "rebase", "reset",
}


@router.post("/git/run", response_model=GitCommandResponse)
async def workspace_git_run(
    payload: GitCommandRequest,
    confirm: bool = False,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> GitCommandResponse:
    """Run a constrained `git <command>` in the active workspace."""
    import asyncio as _asyncio
    import shlex
    import subprocess

    cmd_text = payload.command.strip()
    if not cmd_text:
        raise HTTPException(400, "command is required")
    if cmd_text.startswith("git "):
        cmd_text = cmd_text[4:]
    try:
        parts = shlex.split(cmd_text, posix=False)
    except ValueError as e:
        raise HTTPException(400, f"invalid shell tokens: {e}")
    if not parts:
        raise HTTPException(400, "empty command")

    subcmd = parts[0]
    if subcmd not in _GIT_READ and subcmd not in _GIT_WRITE:
        raise HTTPException(
            400,
            f"git subcommand '{subcmd}' is not in the allowed list",
        )

    # Require confirmation for write operations (safety guard)
    confirm_action = confirm or getattr(payload, "confirm", False)
    if subcmd in _GIT_WRITE and not confirm_action:
        raise HTTPException(
            400,
            f"Confirmation required to run git write command '{subcmd}'",
        )

    ws = await _active_workspace_path(db, user_id)
    if not ws or not Path(ws).is_dir():
        raise HTTPException(404, "no active workspace")

    def run() -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", *parts], cwd=ws, capture_output=True, text=True, timeout=20
        )

    try:
        proc = await _asyncio.to_thread(run)
    except FileNotFoundError:
        raise HTTPException(500, "git is not installed on this system")
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "git command timed out")

    return GitCommandResponse(
        command="git " + " ".join(parts),
        stdout=proc.stdout,
        stderr=proc.stderr,
        exit_code=proc.returncode,
        cwd=ws,
    )


@router.post("/shared", response_model=SharedContextFileResponse, status_code=status.HTTP_201_CREATED)
async def upload_shared_context_file(
    file: UploadFile = File(...),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> SharedContextFileResponse:
    """Upload a file into workspace/shared (no session required)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    if not validate_file_type(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(settings.allowed_file_types)}",
        )
    ws = await fetch_active_workspace_path(db, user_id)
    if not ws:
        raise HTTPException(status_code=404, detail="No active workspace configured")
    shared_dir = Path(ws) / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name
    file_ext = Path(safe_name).suffix.lower()
    if file_ext not in settings.allowed_file_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension {file_ext} is not allowed.",
        )
    dangerous_exts = {
        ".exe",
        ".bat",
        ".cmd",
        ".com",
        ".pif",
        ".scr",
        ".vbs",
        ".js",
        ".jar",
        ".msi",
        ".dll",
        ".sh",
        ".py",
        ".ps1",
    }
    if file_ext in dangerous_exts:
        safe_name = safe_name + ".txt"
    dest = shared_dir / safe_name
    content = await file.read()
    if not validate_file_size(len(content)):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds maximum allowed size of {settings.max_upload_size} bytes",
        )
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)
    stat = dest.stat()
    return SharedContextFileResponse(
        name=safe_name,
        relative_path=safe_name,
        size_bytes=stat.st_size,
        modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
        source="user",
    )


@router.get("/shared", response_model=SharedContextFilesResponse)
async def list_shared_context_files(
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> SharedContextFilesResponse:
    """
    List context files from the active workspace's on-disk ``shared/`` folder.
    """
    ws = await _active_workspace_path(db, user_id)
    if not ws:
        return SharedContextFilesResponse(
            workspace_path=None,
            shared_dir=None,
            exists=False,
            files=[],
            total=0,
        )

    shared_dir = Path(ws) / "shared"
    files = _list_shared_dir(shared_dir)
    return SharedContextFilesResponse(
        workspace_path=ws,
        shared_dir=str(shared_dir),
        exists=shared_dir.is_dir(),
        files=files,
        total=len(files),
    )


@router.delete("/shared", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shared_context_file(
    path: str = Query(..., description="Relative path under shared/"),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Delete a file from workspace/shared by relative path."""
    ws = await _active_workspace_path(db, user_id)
    if not ws:
        raise HTTPException(status_code=404, detail="No active workspace configured")

    shared_dir = Path(ws) / "shared"
    shared_root = shared_dir.resolve()
    target = (shared_dir / path).resolve()
    if shared_root not in target.parents and target != shared_root:
        raise HTTPException(status_code=400, detail="Invalid shared file path")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Shared file not found")

    try:
        target.unlink()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {exc}") from exc


@router.get("/context", response_model=ContextFilesResponse)
async def get_context_files(
    session_id: Optional[int] = None,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> ContextFilesResponse:
    """
    Get all context files for the current user.
    
    Args:
        session_id: Optional filter by session ID
        db: Database connection
        user_id: Current user ID
        
    Returns:
        List of context files
    """
    where_clauses = ["cf.user_id = ?"]
    params = [user_id]
    
    if session_id is not None:
        where_clauses.append("cf.session_id = ?")
        params.append(session_id)
    
    where_clause = " AND ".join(where_clauses)
    
    cursor = await db.execute(
        f"""
        SELECT cf.id, cf.filename, cf.file_type, cf.size_bytes, cf.uploaded_at, cf.is_indexed
        FROM context_files cf
        JOIN sessions s ON cf.session_id = s.id
        WHERE {where_clause} -- s.deleted_at IS NULL can be added here if soft-delete is implemented
        ORDER BY cf.uploaded_at DESC
        """,
        params
    )
    rows = await cursor.fetchall()
    
    files = []
    for row in rows:
        files.append(ContextFileResponse(
            id=row["id"],
            filename=row["filename"],
            file_type=row["file_type"],
            size_bytes=row["size_bytes"],
            uploaded_at=datetime.fromisoformat(row["uploaded_at"]),
            is_indexed=bool(row["is_indexed"])
        ))
    
    return ContextFilesResponse(
        files=files,
        total=len(files)
    )


@router.post("/context", response_model=ContextFileResponse, status_code=status.HTTP_201_CREATED)
async def upload_context_file(
    file: UploadFile = File(...),
    session_id: int = Form(...),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> ContextFileResponse:
    """
    Upload a context file.
    
    Args:
        file: File to upload
        session_id: Session ID to associate with
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Uploaded file information
        
    Raises:
        HTTPException: If file validation fails or session not found
    """
    # Verify session belongs to user
    cursor = await db.execute(
        "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id)
    )
    if await cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    # Validate filename exists
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required"
        )
    
    # Validate file type
    if not validate_file_type(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(settings.allowed_file_types)}"
        )
    
    # Read file content
    content = await file.read()
    file_size = len(content)
    
    # Validate file size
    if not validate_file_size(file_size):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds maximum allowed size of {settings.max_upload_size} bytes"
        )
    
    # Calculate file hash
    content_hash = calculate_file_hash(content)
    
    # Generate storage path
    now = utc_now()
    file_ext = Path(file.filename).suffix.lower()
    
    # Enforce allowed_file_types at storage step (SC-02)
    if file_ext not in settings.allowed_file_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension {file_ext} is not allowed."
        )

    # Never write files with executable or script extensions directly (SC-02)
    dangerous_exts = {".exe", ".bat", ".cmd", ".com", ".pif", ".scr", ".vbs", ".js", ".jar", ".msi", ".dll", ".sh", ".py", ".ps1"}
    if file_ext in dangerous_exts:
        file_ext = file_ext + ".txt"

    stored_filename = f"{content_hash}{file_ext}"
    stored_path = settings.context_files_dir / stored_filename
    
    # Save file to disk
    async with aiofiles.open(stored_path, 'wb') as f:
        await f.write(content)
    
    # Store file metadata in database
    cursor = await db.execute(
        """
        INSERT INTO context_files (
            session_id, user_id, filename, original_path, stored_path,
            file_type, mime_type, size_bytes, content_hash, is_indexed,
            uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            user_id,
            file.filename,
            None,  # original_path
            str(stored_path),
            file_ext,
            file.content_type,
            file_size,
            content_hash,
            0,  # is_indexed
            now.isoformat()
        )
    )
    await db.commit()
    
    file_id = cursor.lastrowid
    if file_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create context file"
        )
    
    return ContextFileResponse(
        id=file_id,
        filename=file.filename,
        file_type=file_ext,
        size_bytes=file_size,
        uploaded_at=now,
        is_indexed=False
    )


@router.delete("/context/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_context_file(
    file_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Remove a context file.
    
    Args:
        file_id: File ID to remove
        db: Database connection
        user_id: Current user ID
        
    Raises:
        HTTPException: If file not found or access denied
    """
    # Get file info with user verification
    cursor = await db.execute(
        "SELECT stored_path FROM context_files WHERE id = ? AND user_id = ?",
        (file_id, user_id)
    )
    row = await cursor.fetchone()
    
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Context file with id {file_id} not found"
        )
    
    # Delete file from disk (with error handling)
    try:
        stored_path = Path(row["stored_path"])
        if stored_path.exists():
            stored_path.unlink()
    except Exception as e:
        # Log error but continue with database deletion
        import logging
        logging.warning(f"Failed to delete file from disk: {e}")
    
    # Delete from database
    await db.execute(
        "DELETE FROM context_files WHERE id = ?",
        (file_id,)
    )
    await db.commit()


@router.get("/artifacts", response_model=ArtifactsResponse)
async def get_artifacts(
    session_id: Optional[int] = None,
    artifact_type: Optional[ArtifactType] = None,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> ArtifactsResponse:
    """
    Get artifacts with optional filtering.
    
    Args:
        session_id: Filter by session ID
        artifact_type: Filter by artifact type
        db: Database connection
        user_id: Current user ID
        
    Returns:
        List of artifacts
    """
    # Build query with user verification through sessions
    where_clauses = []
    params = []
    
    query_base = """
        SELECT a.* FROM session_artifacts a
        JOIN sessions s ON a.session_id = s.id
        WHERE s.user_id = ?
    """
    params.append(user_id)
    
    if session_id is not None:
        where_clauses.append("a.session_id = ?")
        params.append(session_id)
    
    if artifact_type:
        where_clauses.append("a.artifact_type = ?")
        params.append(artifact_type.value)
    
    if where_clauses:
        query_base += " AND " + " AND ".join(where_clauses)
    
    query_base += " ORDER BY a.created_at DESC"
    
    cursor = await db.execute(query_base, params)
    rows = await cursor.fetchall()
    
    artifacts = []
    for row in rows:
        artifacts.append(ArtifactResponse(
            id=row["id"],
            artifact_type=ArtifactType(row["artifact_type"]),
            name=row["name"],
            path=row["path"],
            mime_type=row["mime_type"],
            size_bytes=row["size_bytes"],
            created_at=datetime.fromisoformat(row["created_at"]),
            session_id=row["session_id"]
        ))
    
    return ArtifactsResponse(
        artifacts=artifacts,
        total=len(artifacts)
    )


@router.post("/artifacts", response_model=ArtifactResponse, status_code=status.HTTP_201_CREATED)
async def create_artifact(
    artifact_data: SessionArtifactCreate,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> ArtifactResponse:
    """
    Create a new artifact.
    
    Args:
        artifact_data: Artifact creation data
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Created artifact
        
    Raises:
        HTTPException: If session not found or access denied
    """
    # Verify session belongs to user
    cursor = await db.execute(
        "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
        (artifact_data.session_id, user_id)
    )
    if await cursor.fetchone() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {artifact_data.session_id} not found"
        )
    
    now = utc_now()
    
    cursor = await db.execute(
        """
        INSERT INTO session_artifacts (
            session_id, message_id, artifact_type, name, path,
            content, mime_type, size_bytes, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            artifact_data.session_id,
            artifact_data.message_id,
            artifact_data.artifact_type.value,
            artifact_data.name,
            artifact_data.path,
            artifact_data.content,
            artifact_data.mime_type,
            artifact_data.size_bytes,
            json.dumps(artifact_data.metadata) if artifact_data.metadata else None,
            now.isoformat()
        )
    )
    await db.commit()
    
    artifact_id = cursor.lastrowid
    if artifact_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create artifact"
        )
    
    return ArtifactResponse(
        id=artifact_id,
        artifact_type=artifact_data.artifact_type,
        name=artifact_data.name,
        path=artifact_data.path,
        mime_type=artifact_data.mime_type,
        size_bytes=artifact_data.size_bytes,
        created_at=now,
        session_id=artifact_data.session_id
    )


async def _fetch_artifact_row(
    artifact_id: int,
    db: aiosqlite.Connection,
    user_id: int,
) -> aiosqlite.Row:
    cursor = await db.execute(
        """
        SELECT a.* FROM session_artifacts a
        JOIN sessions s ON a.session_id = s.id
        WHERE a.id = ? AND s.user_id = ?
        """,
        (artifact_id, user_id),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact with id {artifact_id} not found",
        )
    return row


@router.get("/artifacts/{artifact_id}/download")
async def download_artifact(
    artifact_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> Response:
    """Stream artifact bytes as a file download."""
    row = await _fetch_artifact_row(artifact_id, db, user_id)
    name = row["name"] or f"artifact-{artifact_id}"
    mime_type = row["mime_type"] or mimetypes.guess_type(name)[0] or "application/octet-stream"
    disposition = f'attachment; filename="{name}"'

    if row["path"]:
        file_path = Path(row["path"])
        if not file_path.is_absolute():
            ws = await fetch_active_workspace_path(db, user_id)
            if ws:
                file_path = Path(normalize_workspace_path(ws)) / file_path
        file_path = file_path.resolve()
        ws_root = await _active_workspace_path(db, user_id)
        if file_path.is_file():
            if ws_root:
                try:
                    file_path.relative_to(Path(ws_root).resolve())
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Artifact path is outside the active workspace",
                    )
            return FileResponse(
                path=file_path,
                media_type=mime_type,
                filename=name,
                headers={"Content-Disposition": disposition},
            )

    if row["content"]:
        body = row["content"]
        if isinstance(body, str):
            body = body.encode("utf-8")
        return Response(
            content=body,
            media_type=mime_type,
            headers={"Content-Disposition": disposition},
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Artifact has no downloadable content",
    )


@router.get("/artifacts/{artifact_id}", response_model=SessionArtifact)
async def get_artifact(
    artifact_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> SessionArtifact:
    """
    Get artifact details by ID.
    
    Args:
        artifact_id: Artifact ID
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Artifact details
        
    Raises:
        HTTPException: If artifact not found or access denied
    """
    row = await _fetch_artifact_row(artifact_id, db, user_id)

    return SessionArtifact(
        id=row["id"],
        session_id=row["session_id"],
        message_id=row["message_id"],
        artifact_type=ArtifactType(row["artifact_type"]),
        name=row["name"],
        path=row["path"],
        content=row["content"],
        mime_type=row["mime_type"],
        size_bytes=row["size_bytes"],
        metadata=json.loads(row["metadata"]) if row["metadata"] else None,
        created_at=datetime.fromisoformat(row["created_at"])
    )

