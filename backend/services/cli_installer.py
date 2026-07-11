"""
Algorithmic CLI Installer Service — no LLM agent involved, no quota consumed.

Installs Node.js and AI CLI tools into the user's home directory:
  Windows:  %USERPROFILE%\\.ai-clis
  macOS:    ~/.ai-clis
  Linux:    ~/.ai-clis

All npm installs use --prefix so no admin/root is required.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import platform
import re
import shutil
import subprocess
import sys
import urllib.request
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Install prefix — user home, no admin needed
# ---------------------------------------------------------------------------

def get_cli_prefix() -> Path:
    """Return the user-local directory where all AI CLIs are installed."""
    return Path.home() / ".ai-clis"


def get_cli_bin_dir() -> Path:
    """Return the .bin directory inside the CLI prefix (npm puts binaries here)."""
    return get_cli_prefix() / "node_modules" / ".bin"


def get_cli_bin_dirs() -> list:
    """Return all bin directories under ~/.ai-clis that should be on PATH.

    Returns existing directories only; callers may prepend the whole list to
    os.environ["PATH"] without checking individually.
    """
    prefix = get_cli_prefix()
    candidates = [
        prefix / "node_modules" / ".bin",  # standard npm --prefix layout
        prefix / ".bin",                    # legacy / flat installs
    ]
    if sys.platform == "win32":
        candidates.append(prefix)           # some Windows CLIs land directly in prefix
    return [p for p in candidates if p.is_dir()]


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class InstallStatus(str, Enum):
    UNKNOWN = "unknown"
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"
    ALREADY_INSTALLED = "already_installed"


@dataclass
class CLIInstallEvent:
    """Emitted during installation to stream progress to the frontend via SSE."""
    slug: str
    status: InstallStatus
    message: str
    progress_pct: int = 0
    detail: str = ""


@dataclass
class NodeStatus:
    installed: bool
    version: Optional[str] = None
    npm_version: Optional[str] = None
    min_required: int = 18
    meets_requirement: bool = False
    error: Optional[str] = None


@dataclass
class CLIStatus:
    slug: str
    name: str
    installed: bool
    version: Optional[str] = None
    bin_path: Optional[str] = None
    error: Optional[str] = None
    node_required: bool = True


# ---------------------------------------------------------------------------
# Node.js detection + installation
# ---------------------------------------------------------------------------

def detect_node() -> NodeStatus:
    """Check if Node.js ≥ 18 and npm are available."""
    try:
        node_cmd = shutil.which("node")
        npm_cmd = shutil.which("npm")
        if not node_cmd or not npm_cmd:
            return NodeStatus(installed=False, error="node or npm not found in PATH")

        node_result = subprocess.run(
            [node_cmd, "--version"],
            capture_output=True, text=True, timeout=8
        )
        npm_result = subprocess.run(
            [npm_cmd, "--version"],
            capture_output=True, text=True, timeout=8
        )
        if node_result.returncode != 0 or npm_result.returncode != 0:
            return NodeStatus(installed=False, error="node or npm returned non-zero")

        node_ver = node_result.stdout.strip().lstrip("v")
        npm_ver = npm_result.stdout.strip()
        major = int(node_ver.split(".")[0]) if node_ver else 0
        return NodeStatus(
            installed=True,
            version=node_ver,
            npm_version=npm_ver,
            meets_requirement=major >= 18,
        )
    except FileNotFoundError:
        return NodeStatus(installed=False, error="node not found in PATH")
    except Exception as exc:
        return NodeStatus(installed=False, error=str(exc))


async def install_node_windows(emit) -> bool:
    """
    Install Node.js LTS on Windows via winget.
    Falls back to downloading the .msi installer if winget is unavailable.
    """
    await emit(CLIInstallEvent("node", InstallStatus.RUNNING,
                               "Checking winget availability...", 5))

    # Try winget first (available on Windows 10 1709+ / Windows 11)
    winget = shutil.which("winget")
    if winget:
        await emit(CLIInstallEvent("node", InstallStatus.RUNNING,
                                   "Installing Node.js LTS via winget...", 15))
        try:
            proc = await asyncio.create_subprocess_exec(
                "winget", "install", "OpenJS.NodeJS.LTS",
                "--silent", "--accept-package-agreements",
                "--accept-source-agreements",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            async for line in _read_lines(proc):
                await emit(CLIInstallEvent("node", InstallStatus.RUNNING, line.strip(), 40))
            await proc.wait()
            if proc.returncode == 0:
                await emit(CLIInstallEvent("node", InstallStatus.DONE,
                                           "Node.js installed via winget.", 100))
                return True
        except Exception as exc:
            logger.warning("winget failed: %s", exc)

    # Fallback: download the MSI
    await emit(CLIInstallEvent("node", InstallStatus.RUNNING,
                               "Downloading Node.js LTS .msi installer...", 20))
    try:
        msi_url = _get_node_msi_url()
        tmp = Path(os.environ.get("TEMP", "C:\\Temp")) / "node_lts_installer.msi"
        await asyncio.to_thread(_download_file, msi_url, tmp)
        await emit(CLIInstallEvent("node", InstallStatus.RUNNING,
                                   "Running MSI installer (silent)...", 60))
        proc = await asyncio.create_subprocess_exec(
            "msiexec", "/i", str(tmp), "/quiet", "/norestart",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        await proc.wait()
        tmp.unlink(missing_ok=True)
        if proc.returncode == 0:
            await emit(CLIInstallEvent("node", InstallStatus.DONE,
                                       "Node.js installed via .msi.", 100))
            return True
        await emit(CLIInstallEvent("node", InstallStatus.ERROR,
                                   f"MSI installer failed (code {proc.returncode})", 100))
        return False
    except Exception as exc:
        await emit(CLIInstallEvent("node", InstallStatus.ERROR, str(exc), 100))
        return False


async def install_node_macos(emit) -> bool:
    """
    Install Node.js LTS on macOS via Homebrew, falling back to the .pkg installer.
    """
    await emit(CLIInstallEvent("node", InstallStatus.RUNNING,
                               "Checking Homebrew availability...", 5))
    brew = shutil.which("brew")
    if brew:
        await emit(CLIInstallEvent("node", InstallStatus.RUNNING,
                                   "Installing Node.js via brew...", 15))
        try:
            proc = await asyncio.create_subprocess_exec(
                "brew", "install", "node@lts",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            async for line in _read_lines(proc):
                await emit(CLIInstallEvent("node", InstallStatus.RUNNING, line.strip(), 50))
            await proc.wait()
            if proc.returncode == 0:
                await emit(CLIInstallEvent("node", InstallStatus.DONE,
                                           "Node.js installed via Homebrew.", 100))
                return True
        except Exception as exc:
            logger.warning("brew install failed: %s", exc)

    # Fallback: download .pkg
    await emit(CLIInstallEvent("node", InstallStatus.RUNNING,
                               "Downloading Node.js LTS .pkg...", 20))
    try:
        pkg_url = _get_node_pkg_url()
        tmp = Path("/tmp/node_lts_installer.pkg")
        await asyncio.to_thread(_download_file, pkg_url, tmp)
        await emit(CLIInstallEvent("node", InstallStatus.RUNNING,
                                   "Running .pkg installer (needs password if asked)...", 60))
        proc = await asyncio.create_subprocess_exec(
            "installer", "-pkg", str(tmp), "-target", "/",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        await proc.wait()
        tmp.unlink(missing_ok=True)
        if proc.returncode == 0:
            await emit(CLIInstallEvent("node", InstallStatus.DONE,
                                       "Node.js installed via .pkg.", 100))
            return True
        await emit(CLIInstallEvent("node", InstallStatus.ERROR,
                                   f".pkg installer failed (code {proc.returncode})", 100))
        return False
    except Exception as exc:
        await emit(CLIInstallEvent("node", InstallStatus.ERROR, str(exc), 100))
        return False


async def ensure_node(emit) -> bool:
    """Check Node.js; install if missing. Returns True when Node ≥ 18 is available."""
    status = await asyncio.to_thread(detect_node)
    if status.installed and status.meets_requirement:
        await emit(CLIInstallEvent(
            "node", InstallStatus.ALREADY_INSTALLED,
            f"Node.js {status.version} (npm {status.npm_version}) already installed.", 100
        ))
        return True

    if status.installed and not status.meets_requirement:
        await emit(CLIInstallEvent(
            "node", InstallStatus.RUNNING,
            f"Node.js {status.version} found but requires ≥ 18. Upgrading...", 0
        ))
    else:
        await emit(CLIInstallEvent(
            "node", InstallStatus.RUNNING,
            "Node.js not found. Installing...", 0
        ))

    system = platform.system().lower()
    if system == "windows":
        ok = await install_node_windows(emit)
    elif system == "darwin":
        ok = await install_node_macos(emit)
    else:
        await emit(CLIInstallEvent(
            "node", InstallStatus.ERROR,
            "Automatic Node.js install not supported on this OS. "
            "Please install Node.js 18+ from https://nodejs.org/ and restart.", 100
        ))
        return False

    if ok:
        # Re-verify after install (new PATH may require shell reload)
        status2 = await asyncio.to_thread(detect_node)
        if status2.installed and status2.meets_requirement:
            return True
        await emit(CLIInstallEvent(
            "node", InstallStatus.ERROR,
            "Node.js installed but still not detected in PATH. "
            "You may need to restart your terminal / app.", 100
        ))
        return False
    return False


# ---------------------------------------------------------------------------
# CLI detection + installation
# ---------------------------------------------------------------------------

def detect_cli(slug: str, bin_name: str) -> CLIStatus:
    """
    Check if a CLI binary is available — first in ~/.ai-clis/node_modules/.bin, then in PATH.
    Returns CLIStatus with installed=True and the path if found.
    """
    # Check local prefix first
    local_bin = get_cli_bin_dir() / bin_name
    candidates = [local_bin]
    if platform.system().lower() == "windows":
        candidates += [local_bin.with_suffix(".cmd"), local_bin.with_suffix(".ps1")]

    for candidate in candidates:
        if candidate.exists():
            try:
                result = subprocess.run(
                    [str(candidate), "--version"],
                    capture_output=True, text=True, timeout=10
                )
                ver = result.stdout.strip() or result.stderr.strip()
                return CLIStatus(slug=slug, name=bin_name, installed=True,
                                 version=ver, bin_path=str(candidate))
            except Exception:
                pass

    # Check global PATH
    global_bin = shutil.which(bin_name)
    if global_bin:
        try:
            result = subprocess.run(
                [global_bin, "--version"],
                capture_output=True, text=True, timeout=10
            )
            ver = result.stdout.strip() or result.stderr.strip()
            return CLIStatus(slug=slug, name=bin_name, installed=True,
                             version=ver, bin_path=global_bin)
        except Exception:
            return CLIStatus(slug=slug, name=bin_name, installed=True,
                             bin_path=global_bin)

    return CLIStatus(slug=slug, name=bin_name, installed=False)


async def install_cli(
    slug: str,
    npm_package: str,
    emit,
) -> bool:
    """
    Install a single CLI via npm into ~/.ai-clis (no admin needed).
    Streams progress events via emit().
    """
    prefix = get_cli_prefix()
    prefix.mkdir(parents=True, exist_ok=True)

    await emit(CLIInstallEvent(slug, InstallStatus.RUNNING,
                               f"Installing {npm_package} into {prefix}...", 10))

    npm_cmd = shutil.which("npm") or "npm"
    try:
        proc = await asyncio.create_subprocess_exec(
            npm_cmd, "install", "--prefix", str(prefix),
            npm_package,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env={**os.environ, "NPM_CONFIG_UPDATE_NOTIFIER": "false"},
        )
        last_pct = 10
        async for line in _read_lines(proc):
            line = line.strip()
            if not line:
                continue
            # Estimate progress from npm output keywords
            if "added" in line or "packages" in line:
                last_pct = min(last_pct + 20, 90)
            await emit(CLIInstallEvent(slug, InstallStatus.RUNNING, line, last_pct))

        await proc.wait()
        if proc.returncode == 0:
            await emit(CLIInstallEvent(slug, InstallStatus.DONE,
                                       f"{npm_package} installed successfully.", 100))
            return True
        else:
            await emit(CLIInstallEvent(slug, InstallStatus.ERROR,
                                       f"npm install exited with code {proc.returncode}", 100))
            return False
    except FileNotFoundError:
        await emit(CLIInstallEvent(slug, InstallStatus.ERROR,
                                   "npm not found. Please install Node.js first.", 100))
        return False
    except Exception as exc:
        await emit(CLIInstallEvent(slug, InstallStatus.ERROR, str(exc), 100))
        return False


# ---------------------------------------------------------------------------
# High-level service
# ---------------------------------------------------------------------------

class CLIInstallerService:
    """
    Coordinates Node.js + CLI detection and installation.
    Loads the CLI registry from packaging/bootstrapper/cli_registry.json.
    """

    def __init__(self, registry_path: Optional[Path] = None) -> None:
        if registry_path is None:
            registry_path = (
                Path(__file__).resolve().parents[2]
                / "packaging" / "bootstrapper" / "cli_registry.json"
            )
        self._registry_path = registry_path
        self._registry: List[Dict[str, Any]] = []
        self._load_registry()

    def _load_registry(self) -> None:
        try:
            data = json.loads(self._registry_path.read_text(encoding="utf-8"))
            self._registry = data.get("clis", [])
        except Exception as exc:
            logger.warning("Could not load CLI registry: %s", exc)
            self._registry = []

    def get_registry(self) -> List[Dict[str, Any]]:
        return self._registry

    def _find_entry(self, slug: str) -> Optional[Dict[str, Any]]:
        for entry in self._registry:
            if entry.get("slug") == slug:
                return entry
        return None

    def status_all(self) -> Dict[str, Any]:
        """Return current install status for Node.js and all CLIs."""
        node = detect_node()
        cli_statuses = []
        for entry in self._registry:
            slug = entry.get("slug", "")
            bin_name = entry.get("bin_name", slug)
            node_required = entry.get("node_required", True)
            if not node_required:
                # API-only entries (grok, deepseek) — no binary to check
                cli_statuses.append({
                    "slug": slug,
                    "name": entry.get("name", slug),
                    "installed": True,  # configured via API key, not binary
                    "node_required": False,
                    "api_only": True,
                    "description": entry.get("description", ""),
                    "specialties": entry.get("specialties", []),
                })
                continue
            s = detect_cli(slug, bin_name)
            cli_statuses.append({
                "slug": slug,
                "name": entry.get("name", slug),
                "installed": s.installed,
                "version": s.version,
                "bin_path": s.bin_path,
                "node_required": node_required,
                "api_only": False,
                "description": entry.get("description", ""),
                "specialties": entry.get("specialties", []),
                "npm_package": entry.get("npm_package") or entry.get("package"),
                "fallback_doc_url": entry.get("fallback_doc_url", ""),
            })
        return {
            "node": {
                "installed": node.installed,
                "version": node.version,
                "npm_version": node.npm_version,
                "meets_requirement": node.meets_requirement,
                "min_required": node.min_required,
                "error": node.error,
            },
            "install_prefix": str(get_cli_prefix()),
            "clis": cli_statuses,
        }

    async def install_node_stream(self) -> AsyncIterator[CLIInstallEvent]:
        """Stream Node.js installation events."""
        queue: asyncio.Queue[Optional[CLIInstallEvent]] = asyncio.Queue()

        async def emit(event: CLIInstallEvent) -> None:
            await queue.put(event)

        async def _run():
            await ensure_node(emit)
            await queue.put(None)  # sentinel

        asyncio.create_task(_run())
        while True:
            event = await queue.get()
            if event is None:
                break
            yield event

    async def install_cli_stream(self, slug: str) -> AsyncIterator[CLIInstallEvent]:
        """Stream installation events for a single CLI."""
        entry = self._find_entry(slug)
        if not entry:
            yield CLIInstallEvent(slug, InstallStatus.ERROR,
                                  f"Unknown CLI slug: {slug}", 100)
            return

        if not entry.get("node_required", True):
            yield CLIInstallEvent(slug, InstallStatus.DONE,
                                  "This provider is API-key only — no binary to install.", 100)
            return

        npm_package = entry.get("npm_package") or entry.get("package")
        bin_name = entry.get("bin_name", slug)
        if not npm_package or npm_package == "n/a":
            yield CLIInstallEvent(slug, InstallStatus.ERROR,
                                  "No npm package defined for this CLI.", 100)
            return

        queue: asyncio.Queue[Optional[CLIInstallEvent]] = asyncio.Queue()

        async def emit(event: CLIInstallEvent) -> None:
            await queue.put(event)

        async def _run():
            # 1. Ensure Node.js
            node_ok = await ensure_node(emit)
            if not node_ok:
                await queue.put(CLIInstallEvent(
                    slug, InstallStatus.ERROR,
                    "Node.js installation failed — cannot continue.", 100
                ))
                await queue.put(None)
                return

            # 2. Check if already installed
            existing = await asyncio.to_thread(detect_cli, slug, bin_name)
            if existing.installed:
                await queue.put(CLIInstallEvent(
                    slug, InstallStatus.ALREADY_INSTALLED,
                    f"{entry['name']} is already installed ({existing.version}).", 100
                ))
                await queue.put(None)
                return

            # 3. Install
            await install_cli(slug, npm_package, emit)
            await queue.put(None)

        asyncio.create_task(_run())
        while True:
            event = await queue.get()
            if event is None:
                break
            yield event

    async def install_all_stream(
        self, slugs: Optional[List[str]] = None
    ) -> AsyncIterator[CLIInstallEvent]:
        """Stream installation events for all CLIs (or a subset by slug list)."""
        queue: asyncio.Queue[Optional[CLIInstallEvent]] = asyncio.Queue()

        async def emit(event: CLIInstallEvent) -> None:
            await queue.put(event)

        entries = [
            e for e in self._registry
            if (slugs is None or e.get("slug") in slugs)
            and e.get("node_required", True)
            and e.get("npm_package") not in (None, "n/a")
        ]

        async def _run():
            node_ok = await ensure_node(emit)
            if not node_ok:
                await queue.put(CLIInstallEvent(
                    "node", InstallStatus.ERROR,
                    "Node.js installation failed — aborting.", 100
                ))
                await queue.put(None)
                return

            for entry in entries:
                slug = entry["slug"]
                bin_name = entry.get("bin_name", slug)
                npm_package = entry.get("npm_package") or entry.get("package")
                existing = await asyncio.to_thread(detect_cli, slug, bin_name)
                if existing.installed:
                    await emit(CLIInstallEvent(
                        slug, InstallStatus.ALREADY_INSTALLED,
                        f"{entry['name']} already installed.", 100
                    ))
                    continue
                await install_cli(slug, npm_package, emit)

            await queue.put(None)

        asyncio.create_task(_run())
        while True:
            event = await queue.get()
            if event is None:
                break
            yield event

    def verify(self, slug: str) -> CLIStatus:
        entry = self._find_entry(slug)
        if not entry:
            return CLIStatus(slug=slug, name=slug, installed=False,
                             error="Unknown slug")
        bin_name = entry.get("bin_name", slug)
        return detect_cli(slug, bin_name)


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_service: Optional[CLIInstallerService] = None


def get_cli_installer_service() -> CLIInstallerService:
    global _service
    if _service is None:
        _service = CLIInstallerService()
    return _service


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _read_lines(proc: asyncio.subprocess.Process):
    """Async generator that yields decoded lines from a subprocess stdout."""
    assert proc.stdout is not None
    while True:
        line = await proc.stdout.readline()
        if not line:
            break
        yield line.decode(errors="replace")


def _get_node_msi_url() -> str:
    """Return the Windows MSI URL for the current Node.js LTS release."""
    arch = "x64" if platform.machine().endswith("64") else "x86"
    # Node.js LTS download index
    index_url = "https://nodejs.org/dist/index.json"
    with urllib.request.urlopen(index_url, timeout=15) as resp:
        releases = json.loads(resp.read())
    lts_releases = [r for r in releases if r.get("lts")]
    latest = lts_releases[0]
    version = latest["version"]
    return (
        f"https://nodejs.org/dist/{version}/node-{version}-{arch}.msi"
    )


def _get_node_pkg_url() -> str:
    """Return the macOS .pkg URL for the current Node.js LTS release."""
    index_url = "https://nodejs.org/dist/index.json"
    with urllib.request.urlopen(index_url, timeout=15) as resp:
        releases = json.loads(resp.read())
    lts_releases = [r for r in releases if r.get("lts")]
    latest = lts_releases[0]
    version = latest["version"]
    arch = "arm64" if platform.machine() == "arm64" else "x64"
    return (
        f"https://nodejs.org/dist/{version}/node-{version}.pkg"
    )


def _download_file(url: str, dest: Path) -> None:
    """Download a file with a User-Agent header."""
    req = urllib.request.Request(url, headers={"User-Agent": "OrchestratorCLI-Installer/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as f:
        while chunk := resp.read(65536):
            f.write(chunk)
