"""
Onboarding API: persist the result of the first-run setup wizard.

The frontend collects:
  - The workspace folder the user picked.
  - The list of CLI providers (by short id e.g. "claude", "gemini") they want enabled.
  - Per-CLI auth config (api_key, account email, endpoint, key path, etc.).

This endpoint upserts the workspace, flips `providers.is_enabled` based on the
selection, stores any provided API keys as encrypted `provider_credentials`,
mirrors UI prefs into `user_preferences`, and marks `ui.onboarded = true`.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.api.dependencies import get_current_user_id, get_db
from backend.utils.credentials import encrypt_credential
from backend.utils.paths import normalize_workspace_path

router = APIRouter(prefix="/onboarding", tags=["onboarding"])
logger = logging.getLogger(__name__)

# Orchestrator HTTP LLM providers — never disabled by CLI onboarding selection (CRIT-006)
ORCHESTRATOR_LLM_NAMES = frozenset({"grok", "gemini-api", "deepseek-api"})
INFRA_PROVIDER_NAMES = frozenset(
    {"openai", "anthropic", "google", "ollama", "openai-embedding", "openai-tts", "openai-stt", "bob"}
)


from backend.utils import utc_now


def utc_now_iso() -> str:
    return utc_now().isoformat()


class OnboardingWorkspace(BaseModel):
    path: str
    name: Optional[str] = None


class OnboardingCliConfig(BaseModel):
    method: str = "api_key"
    email: Optional[str] = None
    secret: Optional[str] = None
    endpoint: Optional[str] = None
    keyPath: Optional[str] = None
    model: Optional[str] = None
    accountEmail: Optional[str] = None
    accountProvider: Optional[str] = None
    accountPlan: Optional[str] = None


class OnboardingRequest(BaseModel):
    workspace: OnboardingWorkspace
    selected: List[str] = Field(
        default_factory=list,
        description="Provider short ids (e.g. ['claude','gemini','bob']).",
    )
    cli_configs: Dict[str, OnboardingCliConfig] = Field(default_factory=dict)
    shared_email: Optional[str] = None


class OnboardingResponse(BaseModel):
    workspace_id: int
    enabled_providers: List[str]
    stored_credentials: List[str]
    preferences_written: int


async def _upsert_workspace(
    db: aiosqlite.Connection, user_id: int, workspace: OnboardingWorkspace
) -> int:
    """Insert or update a workspace row for this user."""
    path_resolved = normalize_workspace_path(workspace.path)
    name = workspace.name or Path(path_resolved).name or "workspace"
    now = utc_now_iso()

    cur = await db.execute(
        "SELECT id FROM workspaces WHERE user_id = ? AND path = ?",
        (user_id, path_resolved),
    )
    row = await cur.fetchone()
    if row:
        wid = int(row["id"])
        await db.execute(
            "UPDATE workspaces SET name = ?, path = ?, is_active = 1, updated_at = ? WHERE id = ?",
            (name, path_resolved, now, wid),
        )
        # Mark all others inactive.
        await db.execute(
            "UPDATE workspaces SET is_active = 0, updated_at = ? "
            "WHERE user_id = ? AND id != ?",
            (now, user_id, wid),
        )
        return wid

    await db.execute(
        "UPDATE workspaces SET is_active = 0, updated_at = ? WHERE user_id = ?",
        (now, user_id),
    )
    cur = await db.execute(
        """
        INSERT INTO workspaces (user_id, name, description, path, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        """,
        (user_id, name, f"Workspace at {path_resolved}", path_resolved, now, now),
    )
    return int(cur.lastrowid or 0)


async def _set_provider_enabled(
    db: aiosqlite.Connection,
    provider_name: str,
    enabled: bool,
    default_model: Optional[str] = None,
) -> Optional[int]:
    """Toggle `is_enabled` on a provider keyed by `name`. Returns provider id."""
    cur = await db.execute(
        "SELECT id FROM providers WHERE name = ?",
        (provider_name,),
    )
    row = await cur.fetchone()
    if not row:
        return None
    pid = int(row["id"])
    if default_model:
        await db.execute(
            "UPDATE providers SET is_enabled = ?, default_model = ?, updated_at = ? WHERE id = ?",
            (1 if enabled else 0, default_model, utc_now_iso(), pid),
        )
    else:
        await db.execute(
            "UPDATE providers SET is_enabled = ?, updated_at = ? WHERE id = ?",
            (1 if enabled else 0, utc_now_iso(), pid),
        )
    return pid


async def _upsert_credential(
    db: aiosqlite.Connection,
    user_id: int,
    provider_id: int,
    cfg: OnboardingCliConfig,
) -> bool:
    """Encrypt + store/refresh a credential row for this provider. Returns True if stored."""
    if cfg.method in {"account", "oauth"}:
        return False
    if not cfg.secret:
        return False

    now = utc_now_iso()
    encrypted = encrypt_credential(cfg.secret)
    additional = {
        "auth_method": cfg.method,
        "endpoint": cfg.endpoint,
        "key_path": cfg.keyPath,
        "account_email": cfg.accountEmail or cfg.email,
        "account_provider": cfg.accountProvider,
        "account_plan": cfg.accountPlan,
        "model": cfg.model,
    }
    additional_json = json.dumps({k: v for k, v in additional.items() if v})

    cur = await db.execute(
        """
        SELECT id FROM provider_credentials
        WHERE user_id = ? AND provider_id = ? AND credential_name = 'default'
        """,
        (user_id, provider_id),
    )
    row = await cur.fetchone()
    if row:
        await db.execute(
            """
            UPDATE provider_credentials
            SET api_key = ?, additional_config = ?, is_active = 1, updated_at = ?
            WHERE id = ?
            """,
            (encrypted, additional_json, now, int(row["id"])),
        )
    else:
        await db.execute(
            """
            INSERT INTO provider_credentials (
                user_id, provider_id, credential_name, api_key,
                additional_config, is_active, created_at, updated_at
            ) VALUES (?, ?, 'default', ?, ?, 1, ?, ?)
            """,
            (user_id, provider_id, encrypted, additional_json, now, now),
        )
    return True


async def _set_preference(
    db: aiosqlite.Connection,
    user_id: int,
    key: str,
    value: Any,
    category: Optional[str] = None,
) -> None:
    """Upsert a single user preference row."""
    if isinstance(value, bool):
        text = "true" if value else "false"
        ptype = "boolean"
    elif isinstance(value, (int, float)):
        text = str(value)
        ptype = "number"
    elif isinstance(value, (dict, list)):
        text = json.dumps(value)
        ptype = "json"
    else:
        text = "" if value is None else str(value)
        ptype = "string"

    now = utc_now_iso()
    await db.execute(
        """
        INSERT INTO user_preferences (user_id, preference_key, preference_value, preference_type, category, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, preference_key) DO UPDATE SET
            preference_value = excluded.preference_value,
            preference_type = excluded.preference_type,
            category = excluded.category,
            updated_at = excluded.updated_at
        """,
        (user_id, key, text, ptype, category, now, now),
    )


@router.post("/complete", response_model=OnboardingResponse)
async def complete_onboarding(
    payload: OnboardingRequest,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> OnboardingResponse:
    """Persist everything the onboarding wizard collected."""
    if not payload.workspace.path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="workspace.path is required",
        )

    path_resolved = normalize_workspace_path(payload.workspace.path)
    workspace_id = await _upsert_workspace(
        db,
        user_id,
        OnboardingWorkspace(path=path_resolved, name=payload.workspace.name),
    )

    selected = set(payload.selected)

    enabled_map: Dict[str, bool] = {}

    # Look up every known provider so we can flip the ones not selected to disabled.
    cur = await db.execute("SELECT id, name FROM providers")
    rows = await cur.fetchall()
    all_provider_names = {row["name"]: int(row["id"]) for row in rows}

    enabled_providers: List[str] = []
    stored_credentials: List[str] = []

    for name, pid in all_provider_names.items():
        is_selected = name in selected
        # Keep orchestrator LLM + infra providers enabled regardless of CLI picks
        if name in ORCHESTRATOR_LLM_NAMES or name in INFRA_PROVIDER_NAMES:
            is_selected = True
        enabled_map[name] = is_selected
        cfg = payload.cli_configs.get(name)
        default_model = cfg.model if (cfg and cfg.model) else None
        await _set_provider_enabled(db, name, is_selected, default_model)
        if is_selected:
            enabled_providers.append(name)
            if cfg and await _upsert_credential(db, user_id, pid, cfg):
                stored_credentials.append(name)

    # Mirror UI preferences for parity with the existing store hydration code.
    prefs_written = 0
    pref_pairs: List[tuple] = [
        ("ui.onboarded", True, "ui"),
        ("ui.workspace.path", path_resolved, "ui"),
        ("ui.workspace.name", payload.workspace.name or Path(path_resolved).name, "ui"),
    ]
    for name in all_provider_names:
        cfg = payload.cli_configs.get(name)
        forced = name in ORCHESTRATOR_LLM_NAMES or name in INFRA_PROVIDER_NAMES
        pref_pairs.append((f"cli.{name}.enabled", enabled_map.get(name, name in selected), "cli"))
        pref_pairs.append((f"cli.{name}.configured", bool(cfg) or forced, "cli"))
        if cfg:
            if cfg.model:
                pref_pairs.append((f"cli.{name}.model", cfg.model, "cli"))
            if cfg.method:
                pref_pairs.append((f"cli.{name}.authMethod", cfg.method, "cli"))
            if cfg.endpoint:
                pref_pairs.append((f"cli.{name}.endpoint", cfg.endpoint, "cli"))
            if cfg.accountEmail or cfg.email:
                pref_pairs.append(
                    (f"cli.{name}.accountEmail", cfg.accountEmail or cfg.email, "cli")
                )
            if cfg.accountProvider:
                pref_pairs.append((f"cli.{name}.accountProvider", cfg.accountProvider, "cli"))
            if cfg.accountPlan:
                pref_pairs.append((f"cli.{name}.accountPlan", cfg.accountPlan, "cli"))

    for key, value, category in pref_pairs:
        await _set_preference(db, user_id, key, value, category)
        prefs_written += 1

    await db.commit()

    logger.info(
        "Onboarding complete for user %s: workspace=%s enabled=%s secrets=%s prefs=%s",
        user_id, workspace_id, enabled_providers, stored_credentials, prefs_written,
    )

    return OnboardingResponse(
        workspace_id=workspace_id,
        enabled_providers=enabled_providers,
        stored_credentials=stored_credentials,
        preferences_written=prefs_written,
    )
