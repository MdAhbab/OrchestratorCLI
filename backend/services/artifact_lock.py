"""
Artifact lock service — single-writer guarantee for divisions.md and other
shared workspace files (closes A-HIGH-01).

Uses the `filelock` package (cross-platform, handles stale locks after crash)
with an atomic write pattern (write-to-temp + os.replace) to prevent torn reads.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

logger = logging.getLogger(__name__)

# Timeout in seconds before a waiting writer gives up.
LOCK_TIMEOUT = 8.0


def _try_import_filelock():
    try:
        from filelock import FileLock, Timeout  # type: ignore[import]
        return FileLock, Timeout
    except ImportError:
        return None, None


def atomic_write(path: Path, text: str, encoding: str = "utf-8") -> None:
    """
    Write *text* to *path* atomically by writing to a sibling temp file
    and calling os.replace() — avoids torn reads by concurrent processes.
    """
    parent = path.parent
    parent.mkdir(parents=True, exist_ok=True)
    # Use the same directory so os.replace() is an atomic rename on POSIX.
    fd, tmp_path = tempfile.mkstemp(dir=parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding=encoding) as fh:
            fh.write(text)
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


@contextmanager
def _file_lock(path: Path) -> Generator[None, None, None]:
    """Context manager that acquires an advisory .lock file beside *path*."""
    FileLock, Timeout = _try_import_filelock()
    if FileLock is None:
        # filelock not installed — degrade gracefully (no advisory lock).
        logger.warning(
            "filelock package not installed; no advisory lock for %s. "
            "Install it via: pip install filelock",
            path,
        )
        yield
        return

    lock_path = str(path) + ".lock"
    lock = FileLock(lock_path, timeout=LOCK_TIMEOUT)
    try:
        lock.acquire()
        yield
    except Timeout:  # type: ignore[misc]
        logger.error(
            "Could not acquire file lock for %s within %.1fs — skipping write. "
            "Another writer may be stuck.",
            path,
            LOCK_TIMEOUT,
        )
        raise
    finally:
        try:
            lock.release()
        except Exception:
            pass


async def locked_write(path: Path, text: str, encoding: str = "utf-8") -> None:
    """
    Thread-safe, async-friendly atomic write to *path*.

    Acquires an advisory file lock (filelock), writes atomically, releases.
    Runs the blocking lock + write in a thread-pool executor so the event
    loop is not blocked.
    """
    def _do_write() -> None:
        with _file_lock(path):
            atomic_write(path, text, encoding=encoding)

    await asyncio.to_thread(_do_write)


async def locked_read_modify_write(
    path: Path,
    modifier,  # Callable[[str], str]
    encoding: str = "utf-8",
) -> bool:
    """
    Atomic read-modify-write under an advisory lock.

    *modifier* receives the current file content (or empty string if the
    file does not exist) and must return the new content.  Returns True if
    the file was actually written (content changed), False otherwise.
    """
    def _do_rmw() -> bool:
        with _file_lock(path):
            current = ""
            if path.is_file():
                current = path.read_text(encoding=encoding)
            new_content = modifier(current)
            if new_content == current:
                return False
            atomic_write(path, new_content, encoding=encoding)
            return True

    return await asyncio.to_thread(_do_rmw)
