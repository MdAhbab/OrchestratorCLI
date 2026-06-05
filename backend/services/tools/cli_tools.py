"""
CLI Tool Layer (Subagent 1 — Part C of ORCHESTRATOR_V0.9.md).

Provides build_command(), run_task(), set_model(), set_mode(), get_usage(),
login(), and stop() — the abstract MCP-facing operations that the central AI
uses to drive worker CLIs (Claude Code, Gemini CLI, Codex CLI, Copilot CLI)
without hardcoding per-CLI flags elsewhere.

Safety:
  MU-3 — DESTRUCTIVE_DENY blocks obviously destructive shell commands.
  MU-5 — owns_files scope is threaded through run_task(); enforcement TODO.
  MU-8 — shlex.quote() wraps every interpolated value; control bytes stripped.
"""

from __future__ import annotations

import json
import logging
import re
import shlex
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

_JSON_PATH = Path(__file__).parent / "cli_commands.json"

# Slug → human-readable provider_name stored in PtySession.provider_name.
# These must match whatever name the spawn route writes into the session
# (from cli_registry.json "name" field).
_SLUG_TO_PROVIDER_NAME: Dict[str, str] = {
    "claude-code":  "Claude Code",
    "gemini-cli":   "Gemini CLI",
    "codex-cli":    "Codex CLI",
    "copilot-cli":  "GitHub Copilot CLI",
}


# ---------------------------------------------------------------------------
# Command registry loading
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def load_cli_commands() -> Dict[str, Any]:
    """Load and cache cli_commands.json.  Returns the full dict."""
    try:
        with open(_JSON_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        logger.debug("Loaded cli_commands.json (%d slugs)", len(data))
        return data
    except Exception as exc:
        logger.error("Failed to load cli_commands.json: %s", exc)
        return {}


def _verb_template(slug: str, verb: str) -> str:
    """Return the raw template string for (slug, verb), falling back to _default."""
    commands = load_cli_commands()
    entry = commands.get(slug) or commands.get("_default") or {}
    return entry.get(verb, "")


# ---------------------------------------------------------------------------
# MU-8 — safe interpolation
# ---------------------------------------------------------------------------

_CTRL_RE = re.compile(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]")


def _strip_control(text: str) -> str:
    """Remove ASCII control bytes (excluding TAB/LF/CR) from text."""
    return _CTRL_RE.sub("", text)


def build_command(
    slug: str,
    verb: str,
    prompt: Optional[str] = None,
    model: Optional[str] = None,
    mode: Optional[str] = None,
) -> str:
    """Fill a cli_commands.json template and return the ready-to-run string.

    All interpolated values are shell-quoted (MU-8).  The *mode* argument is
    used only when verb=="run" to append the appropriate auto/yolo flag.

    Args:
        slug:   CLI slug, e.g. "claude-code".
        verb:   Command verb: "run", "model", "auto", "yolo", "usage",
                "login", "stop", "resume".
        prompt: Task prompt (for "run" verb).
        model:  Model id (for "model" verb or appended to "run").
        mode:   "auto" | "yolo" | "interactive" (only for "run").

    Returns:
        The concrete shell command string, ready to be written to a PTY.
    """
    template = _verb_template(slug, verb)
    if not template:
        return ""

    # Substitute {prompt} — shell-quoted, control bytes stripped.
    if prompt is not None:
        safe_prompt = shlex.quote(_strip_control(str(prompt)))
        template = template.replace("{prompt}", safe_prompt)

    # Substitute {model} — shell-quoted.
    if model is not None:
        safe_model = shlex.quote(_strip_control(str(model)))
        template = template.replace("{model}", safe_model)

    # Derive {bin} from registry for the _default fallback.
    commands = load_cli_commands()
    entry = commands.get(slug) or commands.get("_default") or {}
    # bin is the first word of the run template as a best-effort; real callers
    # should not rely on _default for known slugs.
    run_tpl = entry.get("run", "")
    bin_name = shlex.quote(run_tpl.split()[0]) if run_tpl else slug
    template = template.replace("{bin}", bin_name)

    # For the "run" verb, append mode flags if requested.
    if verb == "run" and mode and mode != "interactive":
        mode_flag = _verb_template(slug, mode)  # e.g. _verb_template("claude-code","auto")
        if mode_flag:
            template = f"{template} {mode_flag}"

    # For the "run" verb, append model flag if provided.
    if verb == "run" and model is not None:
        model_flag = _verb_template(slug, "model")
        if model_flag:
            safe_model = shlex.quote(_strip_control(str(model)))
            model_flag = model_flag.replace("{model}", safe_model)
            template = f"{template} {model_flag}"

    return template.strip()


# ---------------------------------------------------------------------------
# MU-3 — destructive command deny-list
# ---------------------------------------------------------------------------

# Patterns that should never be injected into a PTY by the tool layer (MU-3).
# Named DESTRUCTIVE_DENY for discoverability; also accessible via _DESTRUCTIVE_PATTERNS.
DESTRUCTIVE_DENY: List[re.Pattern[str]] = [
    re.compile(r"\brm\s+-[^\s]*r[^\s]*\s", re.IGNORECASE),           # rm -rf / rm -r
    re.compile(r"\brm\s+--recursive\b", re.IGNORECASE),
    re.compile(r"\bmkfs\b", re.IGNORECASE),                           # mkfs.*
    re.compile(r"\bdd\b.*\bof=", re.IGNORECASE),                      # dd if= of=
    re.compile(r":\(\)\s*\{.*:\|:.*&", re.DOTALL),                    # fork bomb :(){:|:&};:
    re.compile(r"\bgit\s+push\s+.*--force\b", re.IGNORECASE),         # git push --force
    re.compile(r"\bcurl\b[^|]*\|[^|]*\bsh\b", re.IGNORECASE),        # curl | sh
    re.compile(r"\bwget\b[^|]*\|[^|]*\bsh\b", re.IGNORECASE),        # wget | sh
    re.compile(r"\bshutdown\b", re.IGNORECASE),                       # shutdown
    re.compile(r"\breboot\b", re.IGNORECASE),                         # reboot
    re.compile(r"\bpoweroff\b", re.IGNORECASE),                       # poweroff
    re.compile(r"\bnpm\s+publish\b", re.IGNORECASE),                  # npm publish
    re.compile(r"\bpip\s+install\b.*--break-system-packages\b", re.IGNORECASE),
    re.compile(r"\bsudo\b", re.IGNORECASE),                           # sudo escalation
    re.compile(r"\bchmod\s+777\b", re.IGNORECASE),                    # chmod 777
]


def check_safe(command: str) -> None:
    """Raise ValueError if *command* matches the destructive deny-list (MU-3)."""
    for pattern in DESTRUCTIVE_DENY:
        if pattern.search(command):
            raise ValueError(
                f"Command blocked by destructive deny-list (MU-3): matched /{pattern.pattern}/"
            )


# ---------------------------------------------------------------------------
# PTY resolution helpers
# ---------------------------------------------------------------------------

def _find_session_for_slug(slug: str) -> Any:
    """Return the live PtySession for *slug*, or None if not found.

    Matches by provider_name (case-insensitive) using _SLUG_TO_PROVIDER_NAME.
    Falls back to matching the slug string itself against provider_name.
    """
    try:
        from backend.services.pty_service import pty_manager  # lazy import
    except ImportError:
        logger.warning("pty_service not available; no PTY lookup possible")
        return None

    target_name = _SLUG_TO_PROVIDER_NAME.get(slug, slug).lower()
    for session in pty_manager.list_active():
        if session.provider_name and session.provider_name.lower() == target_name:
            return session
        # Fuzzy: slug substring match against provider_name
        if slug.lower() in (session.provider_name or "").lower():
            return session
    return None


# ---------------------------------------------------------------------------
# Public tool functions
# ---------------------------------------------------------------------------

def run_task(
    slug: str,
    prompt: str,
    model: Optional[str] = None,
    mode: str = "auto",
    owns_files: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Build the run command for *slug*, safety-check it, and write it to the PTY.

    Args:
        slug:        CLI slug (e.g. "claude-code").
        prompt:      The task description / instruction.
        model:       Optional model override (e.g. "claude-opus-4-5").
        mode:        Permission mode: "auto" | "yolo" | "interactive".
        owns_files:  Declared file-ownership scope for this agent (MU-5).
                     # TODO(0.9.1): before writing to the PTY, parse the prompt
                     #              for file references and reject any that fall
                     #              outside this list.

    Returns:
        Dict with keys: status, command, agent.
        status is one of: "dispatched", "no_runtime", "blocked", "error".
    """
    try:
        command = build_command(slug, "run", prompt=prompt, model=model, mode=mode)
    except Exception as exc:
        logger.exception("build_command failed for slug=%s", slug)
        return {"status": "error", "command": "", "agent": slug, "error": str(exc)}

    if not command:
        return {
            "status": "error",
            "command": command,
            "agent": slug,
            "error": f"No 'run' template for slug '{slug}'",
        }

    try:
        check_safe(command)
    except ValueError as exc:
        logger.warning("run_task blocked for slug=%s: %s", slug, exc)
        return {"status": "blocked", "command": command, "agent": slug, "error": str(exc)}

    session = _find_session_for_slug(slug)
    if session is None:
        return {"status": "no_runtime", "command": command, "agent": slug}

    session.write(command + "\r")
    logger.info("run_task dispatched slug=%s command=%r", slug, command)
    # owns_files is included in the response so callers can audit scope (MU-5).
    return {
        "status": "dispatched",
        "command": command,
        "agent": slug,
        "owns_files": owns_files,
    }


def set_model(slug: str, model: str) -> Dict[str, Any]:
    """Write the model-selection command into the agent's PTY.

    For interactive CLIs that support a /model slash command this writes the
    flag form; for non-interactive use callers should pass model into run_task.
    """
    session = _find_session_for_slug(slug)
    if session is None:
        return {"status": "no_runtime", "agent": slug}

    command = build_command(slug, "model", model=model)
    if not command:
        return {"status": "error", "agent": slug, "error": f"No 'model' template for '{slug}'"}

    session.write(command + "\r")
    return {"status": "dispatched", "command": command, "agent": slug}


def set_mode(slug: str, mode: str) -> Dict[str, Any]:
    """Write the mode-selection flag into the agent's PTY.

    *mode* must be "auto" or "yolo"; "interactive" is a no-op (already there).
    """
    if mode == "interactive":
        return {"status": "ok", "agent": slug, "note": "interactive mode; no command needed"}

    if mode not in ("auto", "yolo"):
        return {"status": "error", "agent": slug, "error": f"Unknown mode '{mode}'"}

    session = _find_session_for_slug(slug)
    if session is None:
        return {"status": "no_runtime", "agent": slug}

    flag = _verb_template(slug, mode)
    if not flag:
        return {"status": "error", "agent": slug, "error": f"No '{mode}' template for '{slug}'"}

    session.write(flag + "\r")
    return {"status": "dispatched", "command": flag, "agent": slug}


def get_usage(slug: str) -> Dict[str, Any]:
    """Write the usage command to the PTY and return best-effort metadata.

    The actual usage numbers must be parsed from the PTY output stream; this
    function only dispatches the query.  Full parsing is handled by
    backend/services/cli_usage.py (Subagent 2 — TODO(0.9.1)).
    """
    session = _find_session_for_slug(slug)
    if session is None:
        return {"status": "no_runtime", "agent": slug}

    command = _verb_template(slug, "usage")
    if not command:
        return {
            "status": "error",
            "agent": slug,
            "error": f"No 'usage' template for '{slug}'",
        }

    session.write(command + "\r")
    return {"status": "dispatched", "command": command, "agent": slug}


def login(slug: str) -> Dict[str, Any]:
    """Write the login command into the agent's PTY for the user to complete."""
    session = _find_session_for_slug(slug)
    if session is None:
        return {"status": "no_runtime", "agent": slug}

    command = _verb_template(slug, "login")
    if not command:
        return {"status": "error", "agent": slug, "error": f"No 'login' template for '{slug}'"}

    session.write(command + "\r")
    return {"status": "dispatched", "command": command, "agent": slug}


def stop(slug: str) -> Dict[str, Any]:
    """Send a graceful interrupt (Ctrl-C) to the agent's PTY (MU-3 / Q-3).

    If a slug-specific stop command exists in cli_commands.json it is written
    first; then Ctrl-C is always sent as a fallback.
    """
    session = _find_session_for_slug(slug)
    if session is None:
        return {"status": "no_runtime", "agent": slug}

    stop_cmd = _verb_template(slug, "stop")
    if stop_cmd:
        session.write(stop_cmd + "\r")

    # Ctrl-C as a universal graceful interrupt.
    session.write("\x03")
    return {"status": "dispatched", "command": stop_cmd or "<Ctrl-C>", "agent": slug}
