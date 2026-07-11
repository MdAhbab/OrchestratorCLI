"""
Custom CLI registry service.

Stores user-defined CLI commands in the `custom_cli` table so they can be
surfaced alongside the bundled installer registry in the agent picker. The
service is deliberately sync (SQLite stdlib) to match the rest of the
backend's persistence layer.

Validation rules:
    - `slug` must match `^[a-z0-9][a-z0-9-]{1,62}$` so it can be used safely
      as a directory/file name and a CLI identifier.
    - `command` must be an executable name (no shell metacharacters) and
      non-empty.
    - `args_template` is optional; defaults to `{prompt}`.
    - `display_name` is required, max 80 chars.
    - `description` is optional, max 500 chars.

Future: the orchestrator can call `expand_args(template, prompt)` to render
the templated string into a real command line.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import aiosqlite


SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
COMMAND_RE = re.compile(r"^[A-Za-z0-9_.+/\\-]+$")
MAX_DISPLAY_NAME = 80
MAX_DESCRIPTION = 500
DEFAULT_ARGS_TEMPLATE = "{prompt}"


class CustomCliError(ValueError):
    """Raised when a custom CLI registration payload is invalid."""


@dataclass
class CustomCli:
    slug: str
    display_name: str
    command: str
    args_template: str
    description: Optional[str]
    enabled: bool
    created_at: str
    updated_at: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _validate_slug(slug: str) -> str:
    if not isinstance(slug, str) or not SLUG_RE.match(slug):
        raise CustomCliError(
            "Slug must be 2-63 chars: lowercase letters, digits, and '-' "
            "(must start with a letter or digit)."
        )
    return slug


def _validate_command(command: str) -> str:
    if not isinstance(command, str) or not command.strip():
        raise CustomCliError("Command is required.")
    if not COMMAND_RE.match(command.strip()):
        raise CustomCliError(
            "Command may only contain letters, digits, '.', '_', '+', '/', "
            "'\\', and '-'."
        )
    return command.strip()


def _validate_display_name(name: str) -> str:
    if not isinstance(name, str) or not name.strip():
        raise CustomCliError("Display name is required.")
    if len(name) > MAX_DISPLAY_NAME:
        raise CustomCliError(
            f"Display name must be ≤ {MAX_DISPLAY_NAME} characters."
        )
    return name.strip()


def _validate_description(desc: Optional[str]) -> Optional[str]:
    if desc is None:
        return None
    if not isinstance(desc, str):
        raise CustomCliError("Description must be a string.")
    if len(desc) > MAX_DESCRIPTION:
        raise CustomCliError(
            f"Description must be ≤ {MAX_DESCRIPTION} characters."
        )
    return desc or None


def _validate_args_template(template: Optional[str]) -> str:
    if template is None or template == "":
        return DEFAULT_ARGS_TEMPLATE
    if not isinstance(template, str):
        raise CustomCliError("Args template must be a string.")
    # Disallow shell metas even inside the template; orchestrator will render
    # the prompt from a controlled source but defense in depth here is cheap.
    if re.search(r"[;&|`$<>\n\r]", template):
        raise CustomCliError(
            "Args template must not contain shell metacharacters "
            "(';', '&', '|', '`', '$', '<', '>', newlines)."
        )
    return template


def _row_to_obj(row) -> CustomCli:
    """Map a sqlite3.Row / aiosqlite.Row / tuple into a CustomCli dataclass.

    `aiosqlite.Row` is dict-like, but the stdlib `sqlite3.Row` requires
    `row_factory` to be set, otherwise the cursor yields bare tuples. Handle
    both shapes plus dicts (already mapped).
    """
    if isinstance(row, dict):
        d = dict(row)
    elif hasattr(row, "keys"):
        d = dict(row)
    else:
        # Tuple — best-effort positional mapping. Keep in sync with the SELECT.
        cols = ("slug", "display_name", "command", "args_template",
                "description", "enabled", "created_at", "updated_at")
        d = dict(zip(cols, row))
    d["enabled"] = bool(d.get("enabled")) if d.get("enabled") is not None else False
    return CustomCli(**d)


def list_custom_clis(conn, *, enabled_only: bool = False) -> List[CustomCli]:
    """Return all registered custom CLIs (newest first)."""
    sql = "SELECT * FROM custom_cli"
    params: tuple = ()
    if enabled_only:
        sql += " WHERE enabled = 1"
    sql += " ORDER BY created_at DESC, slug ASC"
    cur = conn.execute(sql, params)
    return [_row_to_obj(r) for r in cur.fetchall()]


def get_custom_cli(conn, slug: str) -> Optional[CustomCli]:
    slug = _validate_slug(slug)
    cur = conn.execute("SELECT * FROM custom_cli WHERE slug = ?", (slug,))
    row = cur.fetchone()
    return _row_to_obj(row) if row else None


def register_custom_cli(
    conn,
    *,
    slug: str,
    display_name: str,
    command: str,
    args_template: Optional[str] = None,
    description: Optional[str] = None,
    enabled: bool = True,
) -> CustomCli:
    """Upsert a custom CLI by slug. Returns the resulting row."""
    s = _validate_slug(slug)
    dn = _validate_display_name(display_name)
    cmd = _validate_command(command)
    args = _validate_args_template(args_template)
    desc = _validate_description(description)

    now = _now_iso()
    conn.execute(
        """
        INSERT INTO custom_cli (
            slug, display_name, command, args_template,
            description, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
            display_name  = excluded.display_name,
            command       = excluded.command,
            args_template = excluded.args_template,
            description   = excluded.description,
            enabled       = excluded.enabled,
            updated_at    = excluded.updated_at
        """,
        (s, dn, cmd, args, desc, 1 if enabled else 0, now, now),
    )
    conn.commit()
    fetched = get_custom_cli(conn, s)
    assert fetched is not None  # we just upserted it
    return fetched


def delete_custom_cli(conn, slug: str) -> bool:
    """Delete a custom CLI by slug. Returns True if a row was removed."""
    s = _validate_slug(slug)
    cur = conn.execute("DELETE FROM custom_cli WHERE slug = ?", (s,))
    conn.commit()
    return cur.rowcount > 0


def expand_args(template: str, prompt: str) -> str:
    """
    Render an args template by substituting `{prompt}` (and only that
    placeholder, to keep templating predictable). Other `{name}` placeholders
    are left untouched so future fields can be added without breaking
    existing user templates.
    """
    if not isinstance(template, str):
        return ""
    return template.replace("{prompt}", prompt)


# ---------------------------------------------------------------------------
# Async variants (used by FastAPI route handlers with the shared aiosqlite
# connection from `get_db`). These mirror the sync API 1:1.
# ---------------------------------------------------------------------------


async def list_custom_clis_async(
    db: aiosqlite.Connection,
    *,
    enabled_only: bool = False,
) -> List[CustomCli]:
    sql = "SELECT * FROM custom_cli"
    params: tuple = ()
    if enabled_only:
        sql += " WHERE enabled = 1"
    sql += " ORDER BY created_at DESC, slug ASC"
    cur = await db.execute(sql, params)
    try:
        rows = await cur.fetchall()
    finally:
        await cur.close()
    return [_row_to_obj(r) for r in rows]


async def get_custom_cli_async(
    db: aiosqlite.Connection,
    slug: str,
) -> Optional[CustomCli]:
    slug = _validate_slug(slug)
    cur = await db.execute("SELECT * FROM custom_cli WHERE slug = ?", (slug,))
    try:
        row = await cur.fetchone()
    finally:
        await cur.close()
    return _row_to_obj(row) if row else None


async def register_custom_cli_async(
    db: aiosqlite.Connection,
    *,
    slug: str,
    display_name: str,
    command: str,
    args_template: Optional[str] = None,
    description: Optional[str] = None,
    enabled: bool = True,
) -> CustomCli:
    """Upsert a custom CLI by slug (async variant)."""
    s = _validate_slug(slug)
    dn = _validate_display_name(display_name)
    cmd = _validate_command(command)
    args = _validate_args_template(args_template)
    desc = _validate_description(description)

    now = _now_iso()
    await db.execute(
        """
        INSERT INTO custom_cli (
            slug, display_name, command, args_template,
            description, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
            display_name  = excluded.display_name,
            command       = excluded.command,
            args_template = excluded.args_template,
            description   = excluded.description,
            enabled       = excluded.enabled,
            updated_at    = excluded.updated_at
        """,
        (s, dn, cmd, args, desc, 1 if enabled else 0, now, now),
    )
    await db.commit()
    fetched = await get_custom_cli_async(db, s)
    assert fetched is not None  # we just upserted it
    return fetched


async def delete_custom_cli_async(
    db: aiosqlite.Connection,
    slug: str,
) -> bool:
    """Delete a custom CLI by slug (async variant). Returns True if removed."""
    s = _validate_slug(slug)
    cur = await db.execute("DELETE FROM custom_cli WHERE slug = ?", (s,))
    try:
        rowcount = cur.rowcount
    finally:
        await cur.close()
    await db.commit()
    return rowcount > 0
