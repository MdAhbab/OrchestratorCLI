"""
Real Windows PTY service for the Parallel Terminals page.

Each agent card in the UI is backed by a `PtySession` that wraps a real
PowerShell process via pywinpty. Output is broadcast to all attached WS
subscribers, and a rolling ring buffer is kept so newly attached clients
get the recent history.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Callable, Deque, Dict, List, Optional

logger = logging.getLogger(__name__)

# pywinpty is Windows-only.
try:
    from winpty import PTY as WinPTY  # type: ignore
    _PTY_AVAILABLE = sys.platform == "win32"
except Exception as e:  # pragma: no cover
    WinPTY = None  # type: ignore
    _PTY_AVAILABLE = False
    logger.warning(f"pywinpty unavailable: {e}")


PTY_AVAILABLE = _PTY_AVAILABLE


def _default_shell() -> List[str]:
    """Return the preferred shell command line for this platform."""
    if sys.platform == "win32":
        # PowerShell is preferred; fall back to cmd if missing.
        ps = os.environ.get("ComSpec", "cmd.exe")
        powershell = None
        for candidate in (
            r"C:\Program Files\PowerShell\7\pwsh.exe",
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
        ):
            if Path(candidate).exists():
                powershell = candidate
                break
        if powershell:
            return [powershell, "-NoLogo"]
        return [ps]
    # Non-Windows (development convenience): use bash.
    return ["/bin/bash", "-i"]


class PtySession:
    """A single PTY-backed shell session that streams output to subscribers."""

    def __init__(
        self,
        runtime_id: int,
        provider_id: Optional[int],
        provider_name: str,
        cwd: str,
        cols: int = 120,
        rows: int = 30,
    ) -> None:
        self.runtime_id = runtime_id
        self.provider_id = provider_id
        self.provider_name = provider_name
        self.cwd = str(cwd)
        self.cols = cols
        self.rows = rows

        self._pty: Optional[WinPTY] = None
        self._pid: Optional[int] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._stopped = threading.Event()
        # Ring buffer of UTF-8 chunks (rendered output, ANSI included).
        self._buffer: Deque[str] = deque(maxlen=4000)
        # Subscriber callbacks. Each one accepts a single string chunk.
        self._subscribers: List[Callable[[str], None]] = []
        self._exit_code: Optional[int] = None
        self._started_at: float = time.time()
        self._status: str = "starting"
        self._lock = threading.Lock()

    @property
    def status(self) -> str:
        return self._status

    @property
    def pid(self) -> Optional[int]:
        return self._pid

    @property
    def exit_code(self) -> Optional[int]:
        return self._exit_code

    def buffer_snapshot(self) -> str:
        with self._lock:
            return "".join(self._buffer)

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        """Spawn the underlying shell and begin pumping output."""
        if not PTY_AVAILABLE or WinPTY is None:
            raise RuntimeError(
                "Native PTY is not available on this platform. "
                "Install pywinpty (Windows only)."
            )
        self._loop = loop

        argv = _default_shell()
        appname = argv[0]
        cmdline_args = " ".join(f'"{a}"' if " " in a else a for a in argv[1:]) if len(argv) > 1 else None
        try:
            self._pty = WinPTY(self.cols, self.rows)
            ok = self._pty.spawn(appname, cmdline=cmdline_args, cwd=self.cwd)
            if not ok:
                raise RuntimeError(f"PTY spawn failed for {appname} {cmdline_args or ''}")
            self._pid = getattr(self._pty, "pid", None)
        except Exception as e:
            self._status = "failed"
            raise RuntimeError(f"Failed to start PTY: {e}") from e

        self._status = "running"
        self._reader_thread = threading.Thread(
            target=self._read_loop, name=f"pty-reader-{self.runtime_id}", daemon=True
        )
        self._reader_thread.start()

    def _read_loop(self) -> None:
        assert self._pty is not None
        # ConPTY's `blocking=True` behaviour is unreliable; poll non-blocking
        # and sleep briefly. This keeps the reader responsive to kill().
        idle_strikes = 0
        try:
            while not self._stopped.is_set():
                try:
                    chunk = self._pty.read(blocking=False)
                except Exception as e:
                    logger.debug(f"pty[{self.runtime_id}] read error: {e}")
                    break
                if not chunk:
                    # Nothing to read right now. If the process is gone, exit.
                    try:
                        alive = self._pty.isalive()
                    except Exception:
                        alive = False
                    if not alive:
                        idle_strikes += 1
                        if idle_strikes > 3:
                            break
                    else:
                        idle_strikes = 0
                    time.sleep(0.02)
                    continue
                idle_strikes = 0
                if isinstance(chunk, bytes):  # safety
                    try:
                        chunk = chunk.decode("utf-8", errors="replace")
                    except Exception:
                        chunk = chunk.decode("latin-1", errors="replace")
                with self._lock:
                    self._buffer.append(chunk)
                self._dispatch(chunk)
        finally:
            # Process exit handling
            try:
                if self._pty is not None and not self._pty.isalive():
                    self._exit_code = self._pty.get_exitstatus()
            except Exception:
                self._exit_code = None
            self._status = "exited"
            self._dispatch("\r\n[bob] process exited\r\n", system=True)

    def _dispatch(self, chunk: str, system: bool = False) -> None:
        # Snapshot the subscriber list to avoid holding the lock during callbacks.
        with self._lock:
            subs = list(self._subscribers)
        for cb in subs:
            try:
                cb(chunk)
            except Exception as e:
                logger.warning(f"pty subscriber error: {e}")

    def attach(self, callback: Callable[[str], None]) -> None:
        with self._lock:
            self._subscribers.append(callback)

    def detach(self, callback: Callable[[str], None]) -> None:
        with self._lock:
            try:
                self._subscribers.remove(callback)
            except ValueError:
                pass

    def write(self, data: str) -> None:
        if self._pty is None or not self._pty.isalive():
            return
        try:
            self._pty.write(data)
        except Exception as e:
            logger.warning(f"pty[{self.runtime_id}] write failed: {e}")

    def resize(self, cols: int, rows: int) -> None:
        if self._pty is None:
            return
        try:
            self.cols = max(20, int(cols))
            self.rows = max(5, int(rows))
            self._pty.set_size(self.cols, self.rows)
        except Exception as e:
            logger.debug(f"pty resize ignored: {e}")

    def pause(self) -> None:
        """Best-effort pause: Windows has no SIGSTOP, so we just mark status."""
        self._status = "paused"

    def resume(self) -> None:
        if self._pty is not None and self._pty.isalive():
            self._status = "running"

    def kill(self) -> None:
        self._stopped.set()
        try:
            if self._pty is not None:
                # Sending Ctrl+C is friendlier first.
                try:
                    self._pty.write("\x03")
                except Exception:
                    pass
                # Then close the PTY.
                try:
                    del self._pty
                except Exception:
                    pass
        finally:
            self._pty = None
            if self._status not in ("exited", "failed"):
                self._status = "killed"

    def is_alive(self) -> bool:
        if self._pty is None:
            return False
        try:
            return bool(self._pty.isalive())
        except Exception:
            return False


class PtyManager:
    """Singleton manager that owns all PTY sessions in the process."""

    def __init__(self) -> None:
        self._sessions: Dict[int, PtySession] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    @property
    def loop(self) -> asyncio.AbstractEventLoop:
        if self._loop is None:
            self._loop = asyncio.get_event_loop()
        return self._loop

    def has(self, runtime_id: int) -> bool:
        return runtime_id in self._sessions

    def get(self, runtime_id: int) -> Optional[PtySession]:
        return self._sessions.get(runtime_id)

    def active_for_provider(self, provider_id: int) -> Optional[PtySession]:
        for session in self._sessions.values():
            if session.provider_id == provider_id and session.is_alive():
                return session
        return None

    def list_active(self) -> List[PtySession]:
        return [s for s in self._sessions.values() if s.is_alive()]

    def create(
        self,
        runtime_id: int,
        provider_id: Optional[int],
        provider_name: str,
        cwd: str,
    ) -> PtySession:
        if runtime_id in self._sessions:
            return self._sessions[runtime_id]
        session = PtySession(
            runtime_id=runtime_id,
            provider_id=provider_id,
            provider_name=provider_name,
            cwd=cwd,
        )
        session.start(self.loop)
        self._sessions[runtime_id] = session
        return session

    def remove(self, runtime_id: int) -> None:
        session = self._sessions.pop(runtime_id, None)
        if session is not None:
            session.kill()

    def shutdown(self) -> None:
        for s in list(self._sessions.values()):
            s.kill()
        self._sessions.clear()


# Global singleton consumed by routes + websockets.
pty_manager = PtyManager()
