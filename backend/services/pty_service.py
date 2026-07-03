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
import secrets
import shlex
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class PtyLimitError(RuntimeError):
    """Raised when the configured concurrent-terminal cap is reached."""


_NativePTY: Any = None
_PTY_AVAILABLE = False
_PTY_IMPORT_ERROR: Optional[str] = None

if sys.platform == "win32":
    try:
        from winpty import PTY as _NativePTY  # type: ignore

        _PTY_AVAILABLE = True
    except Exception as e:  # pragma: no cover
        import traceback
        _PTY_IMPORT_ERROR = traceback.format_exc()
        logger.warning("pywinpty unavailable: %s", e)
else:
    _PTY_AVAILABLE = True  # PosixPTY defined below; import may still fail at runtime


PTY_AVAILABLE = _PTY_AVAILABLE


class PosixPTY:
    """POSIX PTY backend (Linux/macOS) with a pywinpty-compatible surface."""

    def __init__(self, cols: int, rows: int) -> None:
        import pty as pty_mod

        self._master, self._slave = pty_mod.openpty()
        self._set_winsize(cols, rows)
        self._pid: Optional[int] = None
        self._exitstatus: Optional[int] = None

    @staticmethod
    def _set_winsize_fd(fd: int, cols: int, rows: int) -> None:
        import fcntl
        import struct
        import termios

        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

    def _set_winsize(self, cols: int, rows: int) -> None:
        self._set_winsize_fd(self._master, cols, rows)

    def spawn(
        self,
        appname: str,
        cmdline: Optional[str] = None,
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
    ) -> bool:
        argv = [appname]
        if cmdline:
            argv.extend(shlex.split(cmdline))
        pid = os.fork()
        if pid == 0:
            try:
                os.close(self._master)
                os.setsid()
                import termios

                os.ioctl(self._slave, termios.TIOCSCTTY, 0)
                os.dup2(self._slave, 0)
                os.dup2(self._slave, 1)
                os.dup2(self._slave, 2)
                if self._slave > 2:
                    os.close(self._slave)
                if cwd:
                    os.chdir(cwd)
                if env is not None:
                    os.execvpe(argv[0], argv, env)
                else:
                    os.execvp(argv[0], argv)
            except Exception:
                os._exit(127)
        self._pid = pid
        os.close(self._slave)
        return True

    @property
    def pid(self) -> Optional[int]:
        return self._pid

    def read(self, blocking: bool = False) -> str:
        import select

        if blocking:
            ready = True
        else:
            ready, _, _ = select.select([self._master], [], [], 0)
        if not ready:
            return ""
        try:
            data = os.read(self._master, 4096)
        except OSError:
            return ""
        if not data:
            return ""
        return data.decode("utf-8", errors="replace")

    def write(self, data: str) -> None:
        payload = data.encode("utf-8", errors="replace") if isinstance(data, str) else data
        os.write(self._master, payload)

    def isalive(self) -> bool:
        if self._pid is None:
            return False
        pid, status = os.waitpid(self._pid, os.WNOHANG)
        if pid == 0:
            return True
        if os.WIFEXITED(status):
            self._exitstatus = os.WEXITSTATUS(status)
        elif os.WIFSIGNALED(status):
            self._exitstatus = -os.WTERMSIG(status)
        return False

    def get_exitstatus(self) -> Optional[int]:
        return self._exitstatus

    def set_size(self, cols: int, rows: int) -> None:
        self._set_winsize(max(20, int(cols)), max(5, int(rows)))


if sys.platform != "win32":
    _NativePTY = PosixPTY


def _build_cli_env() -> Dict[str, str]:
    """Return a copy of os.environ with ~/.ai-clis bin dirs prepended to PATH.

    This makes CLIs installed by the app available inside every spawned PTY
    without the user having to modify their global shell profile.
    """
    env = dict(os.environ)
    try:
        from backend.services.cli_installer import get_cli_bin_dirs  # lazy to avoid circular
        extra_dirs = [str(p) for p in get_cli_bin_dirs()]
    except Exception:
        extra_dirs = []
    if extra_dirs:
        env["PATH"] = os.pathsep.join(extra_dirs) + os.pathsep + env.get("PATH", "")
    return env


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
    # Non-Windows (development convenience): use bash or zsh.
    for sh in ("/bin/zsh", "/bin/bash", "/bin/sh"):
        if Path(sh).exists():
            return [sh, "-i"]
    return ["/bin/sh", "-i"]


def _shell_label() -> str:
    """Human-readable label for the OS shell that will be spawned."""
    shell_argv = _default_shell()
    exe = Path(shell_argv[0]).stem.lower()
    if "pwsh" in exe or "powershell" in exe:
        return "PowerShell"
    if "zsh" in exe:
        return "zsh"
    if "bash" in exe:
        return "bash"
    if "cmd" in exe:
        return "Command Prompt"
    return exe


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

        self._pty: Any = None
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
        self.user_id: Optional[int] = None
        self._idle_timer: Optional[threading.Timer] = None
        self._idle_seconds: float = 300.0  # 5 min — gives user time to reconnect
        self._shell_label: str = _shell_label()
        # Adaptive reader sleep: fast while output flows, backing off toward
        # _READ_SLEEP_MAX on quiet terminals so idle sessions don't spin.
        self._read_sleep: float = self._READ_SLEEP_MIN

    _READ_SLEEP_MIN = 0.02
    _READ_SLEEP_MAX = 0.25

    @property
    def status(self) -> str:
        return self._status

    @property
    def shell_label(self) -> str:
        """Human-readable name of the OS shell being used (e.g. 'PowerShell', 'bash')."""
        return self._shell_label

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
        if not PTY_AVAILABLE or _NativePTY is None:
            msg = (
                "Native PTY is not available on this platform. "
                "Install pywinpty on Windows."
            )
            if sys.platform == "win32" and _PTY_IMPORT_ERROR:
                msg += f"\nImport error details:\n{_PTY_IMPORT_ERROR}\nIf you see 'DLL load failed', make sure the Microsoft Visual C++ Redistributable is installed on your system."
            raise RuntimeError(msg)
        self._loop = loop

        aug_env = _build_cli_env()
        argv = _default_shell()
        appname = argv[0]
        cmdline_args = " ".join(f'"{a}"' if " " in a else a for a in argv[1:]) if len(argv) > 1 else None
        try:
            self._pty = _NativePTY(self.cols, self.rows)
            if sys.platform == "win32":
                # pywinpty's low-level PTY API expects a Windows environment
                # block string: "KEY=VALUE\0KEY2=VALUE2\0".
                win_env = "\0".join(
                    f"{k}={v}" for k, v in aug_env.items() if "\0" not in k and "\0" not in v
                ) + "\0"
                ok = self._pty.spawn(appname, cmdline=cmdline_args, cwd=self.cwd, env=win_env)
            else:
                ok = self._pty.spawn(appname, cmdline=cmdline_args, cwd=self.cwd, env=aug_env)
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
        # M2: if no client ever attaches (e.g. the spawner crashed before
        # opening the WS), tear the session down after the idle window instead
        # of leaking the shell process. attach() cancels this timer.
        with self._lock:
            if not self._subscribers:
                self._schedule_idle_teardown()

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
                        if idle_strikes > 10:
                            break
                    else:
                        idle_strikes = 0
                    time.sleep(self._read_sleep)
                    # Back off gradually while quiet; write() resets this so
                    # keystroke echo stays snappy.
                    self._read_sleep = min(self._read_sleep * 1.5, self._READ_SLEEP_MAX)
                    continue
                idle_strikes = 0
                self._read_sleep = self._READ_SLEEP_MIN
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
            self._dispatch("\r\n[orch] process exited\r\n", system=True)

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
            if self._idle_timer is not None:
                self._idle_timer.cancel()
                self._idle_timer = None

    def detach(self, callback: Callable[[str], None]) -> None:
        with self._lock:
            try:
                self._subscribers.remove(callback)
            except ValueError:
                pass
            if not self._subscribers:
                self._schedule_idle_teardown()

    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)

    def _schedule_idle_teardown(self) -> None:
        if self._idle_timer is not None:
            self._idle_timer.cancel()

        def _teardown() -> None:
            with self._lock:
                if self._subscribers:
                    return
            pty_manager.remove(self.runtime_id)

        self._idle_timer = threading.Timer(self._idle_seconds, _teardown)
        self._idle_timer.daemon = True
        self._idle_timer.start()

    def write(self, data: str) -> None:
        if self._pty is None or not self._pty.isalive():
            return
        try:
            self._read_sleep = self._READ_SLEEP_MIN
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
        """Best-effort pause: Suspend Windows process via ntdll."""
        self._status = "paused"
        if sys.platform == "win32" and self._pid:
            try:
                import ctypes
                handle = ctypes.windll.kernel32.OpenProcess(0x0800, False, self._pid)
                if handle:
                    ctypes.windll.ntdll.NtSuspendProcess(handle)
                    ctypes.windll.kernel32.CloseHandle(handle)
            except Exception as e:
                logger.warning(f"Failed to suspend process {self._pid}: {e}")

    def resume(self) -> None:
        if self._pty is not None and self._pty.isalive():
            self._status = "running"
            if sys.platform == "win32" and self._pid:
                try:
                    import ctypes
                    handle = ctypes.windll.kernel32.OpenProcess(0x0800, False, self._pid)
                    if handle:
                        ctypes.windll.ntdll.NtResumeProcess(handle)
                        ctypes.windll.kernel32.CloseHandle(handle)
                except Exception as e:
                    logger.warning(f"Failed to resume process {self._pid}: {e}")

    def kill(self) -> None:
        self._stopped.set()
        pid = self._pid
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
        # Closing the PTY drops the shell but grandchildren (npm/node spawned
        # inside it) can survive — terminate the whole tree explicitly.
        if pid:
            try:
                if sys.platform == "win32":
                    import subprocess

                    subprocess.run(
                        ["taskkill", "/PID", str(pid), "/T", "/F"],
                        capture_output=True,
                        timeout=10,
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                    )
                else:
                    import signal

                    # The child called setsid(), so its pgid == pid.
                    os.killpg(pid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                pass
            except Exception as e:
                logger.debug(f"pty[{self.runtime_id}] tree kill: {e}")

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
        self._lock = threading.Lock()
        self._ws_tokens: Dict[int, Tuple[str, float]] = {}

    def generate_ws_token(self, runtime_id: int) -> str:
        with self._lock:
            now = time.time()
            if runtime_id in self._ws_tokens:
                token, expires = self._ws_tokens[runtime_id]
                if expires - now > 15.0:
                    return token
            token = secrets.token_hex(16)
            self._ws_tokens[runtime_id] = (token, now + 30.0)
            return token

    def verify_ws_token(self, runtime_id: int, token: Optional[str]) -> bool:
        if not token:
            return False
        with self._lock:
            if runtime_id not in self._ws_tokens:
                return False
            stored_token, expires = self._ws_tokens[runtime_id]
            if time.time() > expires:
                del self._ws_tokens[runtime_id]
                return False
            is_valid = secrets.compare_digest(stored_token, token)
            if is_valid:
                del self._ws_tokens[runtime_id]
            return is_valid

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    @property
    def loop(self) -> asyncio.AbstractEventLoop:
        if self._loop is None:
            self._loop = asyncio.get_running_loop()
        return self._loop

    def has(self, runtime_id: int) -> bool:
        with self._lock:
            return runtime_id in self._sessions

    def get(self, runtime_id: int) -> Optional[PtySession]:
        with self._lock:
            return self._sessions.get(runtime_id)

    def active_for_provider(
        self, provider_id: int, user_id: Optional[int] = None
    ) -> Optional[PtySession]:
        with self._lock:
            for session in list(self._sessions.values()):
                if session.provider_id != provider_id or not session.is_alive():
                    continue
                if user_id is not None and session.user_id not in (None, user_id):
                    continue
                return session
            return None

    def list_active(self) -> List[PtySession]:
        with self._lock:
            return [s for s in list(self._sessions.values()) if s.is_alive()]

    def create(
        self,
        runtime_id: int,
        provider_id: Optional[int],
        provider_name: str,
        cwd: str,
        user_id: Optional[int] = None,
    ) -> PtySession:
        with self._lock:
            if runtime_id in self._sessions:
                existing = self._sessions[runtime_id]
                if user_id is not None:
                    existing.user_id = user_id
                return existing
            # Enforce the configured process cap; dead sessions are reaped first.
            from backend.config import settings as _settings

            cap = max(1, int(getattr(_settings, "max_concurrent_processes", 5)))
            alive = [s for s in self._sessions.values() if s.is_alive()]
            if len(alive) >= cap:
                raise PtyLimitError(
                    f"Concurrent terminal limit reached ({cap}). "
                    "Stop an existing terminal before starting a new one."
                )
        session = PtySession(
            runtime_id=runtime_id,
            provider_id=provider_id,
            provider_name=provider_name,
            cwd=cwd,
        )
        session.user_id = user_id
        session.start(self.loop)

        with self._lock:
            existing = self._sessions.get(runtime_id)
            if existing is not None:
                session.kill()
                if user_id is not None:
                    existing.user_id = user_id
                return existing
            self._sessions[runtime_id] = session
            return session

    def remove(self, runtime_id: int) -> None:
        with self._lock:
            session = self._sessions.pop(runtime_id, None)
        if session is not None:
            session.kill()

    def shutdown(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for s in sessions:
            s.kill()


# Global singleton consumed by routes + websockets.
pty_manager = PtyManager()
