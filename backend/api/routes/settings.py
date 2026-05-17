"""
Settings management API routes.
Handles user preferences and settings.
"""

from typing import Dict, Any, List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone
from pydantic import BaseModel
import aiosqlite
import json
from pathlib import Path


def utc_now() -> datetime:
    """Return current UTC datetime with timezone info."""
    return datetime.now(timezone.utc)

from backend.database.models import (
    UserPreference, UserPreferenceCreate, UserPreferenceUpdate,
    PreferenceType
)
from backend.api.dependencies import (
    get_db, get_current_user_id
)

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsResponse(BaseModel):
    """Response model for settings."""
    preferences: Dict[str, Any]
    categories: Dict[str, List[str]]


class PreferenceResponse(BaseModel):
    """Response model for a single preference."""
    key: str
    value: Any
    type: PreferenceType
    category: Optional[str]


class BulkPreferenceUpdate(BaseModel):
    """Request model for bulk preference updates."""
    preferences: Dict[str, Any]


class CliRegistryResponse(BaseModel):
    """Response model for installer CLI registry."""
    version: str
    last_updated: Optional[str] = None
    clis: List[Dict[str, Any]]


# Default settings structure
DEFAULT_SETTINGS = {
    "theme": {
        "mode": "dark",
        "accent_color": "#3b82f6"
    },
    "editor": {
        "font_size": 14,
        "line_numbers": True,
        "word_wrap": True,
        "auto_save": True
    },
    "chat": {
        "stream_responses": True,
        "show_timestamps": True,
        "code_highlighting": True,
        "auto_scroll": True
    },
    "orchestrator": {
        "default_routing": "auto",
        "enable_fallback": True,
        "max_retries": 3,
        "timeout": 30
    },
    "notifications": {
        "enable_sound": True,
        "enable_desktop": False,
        "show_errors": True
    },
    "privacy": {
        "analytics_enabled": True,
        "crash_reports": True
    }
}


@router.get("/cli-registry", response_model=CliRegistryResponse)
async def get_cli_registry() -> CliRegistryResponse:
    """
    Get CLI registry used by installer/bootstrapper.
    This keeps frontend CLI configuration aligned with system-level CLI definitions.
    """
    registry_path = (
        Path(__file__).resolve().parents[3]
        / "release"
        / "installer"
        / "bootstrapper"
        / "cli_registry.json"
    )

    if not registry_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CLI registry not found at {registry_path}"
        )

    try:
        raw = registry_path.read_text(encoding="utf-8")
        payload = json.loads(raw)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read CLI registry: {exc}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CLI registry contains invalid JSON: {exc}"
        ) from exc

    clis = payload.get("clis")
    if not isinstance(clis, list):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CLI registry is missing a valid 'clis' array"
        )

    version = payload.get("version")
    return CliRegistryResponse(
        version=str(version) if version is not None else "unknown",
        last_updated=str(payload.get("last_updated")) if payload.get("last_updated") is not None else None,
        clis=clis
    )


def parse_preference_value(value: str, pref_type: PreferenceType) -> Any:
    """Parse preference value based on type."""
    if pref_type == PreferenceType.BOOLEAN:
        return value.lower() in ('true', '1', 'yes')
    elif pref_type == PreferenceType.NUMBER:
        try:
            return int(value) if '.' not in value else float(value)
        except ValueError:
            return 0
    elif pref_type == PreferenceType.JSON:
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return {}
    else:  # STRING
        return value


def serialize_preference_value(value: Any) -> Tuple[str, PreferenceType]:
    """Serialize preference value and determine type."""
    if isinstance(value, bool):
        return (str(value).lower(), PreferenceType.BOOLEAN)
    elif isinstance(value, (int, float)):
        return (str(value), PreferenceType.NUMBER)
    elif isinstance(value, (dict, list)):
        return (json.dumps(value), PreferenceType.JSON)
    else:
        return (str(value), PreferenceType.STRING)


@router.get("", response_model=SettingsResponse)
async def get_settings(
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> SettingsResponse:
    """
    Get all user settings.
    
    Args:
        db: Database connection
        user_id: Current user ID
        
    Returns:
        User settings organized by category
    """
    cursor = await db.execute(
        """
        SELECT preference_key, preference_value, preference_type, category
        FROM user_preferences
        WHERE user_id = ?
        ORDER BY category, preference_key
        """,
        (user_id,)
    )
    rows = await cursor.fetchall()
    
    # Build preferences dict
    preferences = {}
    categories = {}
    
    for row in rows:
        key = row["preference_key"]
        value = parse_preference_value(
            row["preference_value"],
            PreferenceType(row["preference_type"])
        )
        category = row["category"] or "general"
        
        preferences[key] = value
        
        if category not in categories:
            categories[category] = []
        categories[category].append(key)
    
    # If no preferences exist, return defaults
    if not preferences:
        # Flatten default settings
        for category, settings in DEFAULT_SETTINGS.items():
            categories[category] = list(settings.keys())
            for key, value in settings.items():
                preferences[f"{category}.{key}"] = value
    
    return SettingsResponse(
        preferences=preferences,
        categories=categories
    )


@router.get("/{preference_key}", response_model=PreferenceResponse)
async def get_preference(
    preference_key: str,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> PreferenceResponse:
    """
    Get a specific preference by key.
    
    Args:
        preference_key: Preference key
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Preference value
        
    Raises:
        HTTPException: If preference not found
    """
    cursor = await db.execute(
        """
        SELECT preference_key, preference_value, preference_type, category
        FROM user_preferences
        WHERE user_id = ? AND preference_key = ?
        """,
        (user_id, preference_key)
    )
    row = await cursor.fetchone()
    
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preference '{preference_key}' not found"
        )
    
    pref_type = PreferenceType(row["preference_type"])
    value = parse_preference_value(row["preference_value"], pref_type)
    
    return PreferenceResponse(
        key=row["preference_key"],
        value=value,
        type=pref_type,
        category=row["category"]
    )


@router.put("", response_model=SettingsResponse)
async def update_settings(
    updates: BulkPreferenceUpdate,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> SettingsResponse:
    """
    Update multiple settings at once.
    
    Args:
        updates: Bulk preference updates
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Updated settings
    """
    now = utc_now()
    
    for key, value in updates.preferences.items():
        # Determine category from key (e.g., "theme.mode" -> "theme")
        parts = key.split('.', 1)
        category = parts[0] if len(parts) > 1 else "general"
        
        # Serialize value
        serialized_value, pref_type = serialize_preference_value(value)
        
        # Check if preference exists
        cursor = await db.execute(
            "SELECT id FROM user_preferences WHERE user_id = ? AND preference_key = ?",
            (user_id, key)
        )
        existing = await cursor.fetchone()
        
        if existing:
            # Update existing preference
            await db.execute(
                """
                UPDATE user_preferences
                SET preference_value = ?, preference_type = ?, updated_at = ?
                WHERE id = ?
                """,
                (serialized_value, pref_type.value, now.isoformat(), existing["id"])
            )
        else:
            # Insert new preference
            await db.execute(
                """
                INSERT INTO user_preferences (
                    user_id, preference_key, preference_value,
                    preference_type, category, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id, key, serialized_value,
                    pref_type.value, category,
                    now.isoformat(), now.isoformat()
                )
            )
    
    await db.commit()
    
    # Return updated settings
    return await get_settings(db, user_id)


@router.put("/{preference_key}", response_model=PreferenceResponse)
async def update_preference(
    preference_key: str,
    value: Any,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> PreferenceResponse:
    """
    Update a single preference.
    
    Args:
        preference_key: Preference key
        value: New value
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Updated preference
    """
    now = utc_now()
    
    # Determine category from key
    parts = preference_key.split('.', 1)
    category = parts[0] if len(parts) > 1 else "general"
    
    # Serialize value
    serialized_value, pref_type = serialize_preference_value(value)
    
    # Check if preference exists
    cursor = await db.execute(
        "SELECT id FROM user_preferences WHERE user_id = ? AND preference_key = ?",
        (user_id, preference_key)
    )
    existing = await cursor.fetchone()
    
    if existing:
        # Update existing preference
        await db.execute(
            """
            UPDATE user_preferences
            SET preference_value = ?, preference_type = ?, updated_at = ?
            WHERE id = ?
            """,
            (serialized_value, pref_type.value, now.isoformat(), existing["id"])
        )
    else:
        # Insert new preference
        await db.execute(
            """
            INSERT INTO user_preferences (
                user_id, preference_key, preference_value,
                preference_type, category, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, preference_key, serialized_value,
                pref_type.value, category,
                now.isoformat(), now.isoformat()
            )
        )
    
    await db.commit()
    
    return PreferenceResponse(
        key=preference_key,
        value=value,
        type=pref_type,
        category=category
    )


@router.post("/reset", response_model=SettingsResponse)
async def reset_settings(
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> SettingsResponse:
    """
    Reset all settings to defaults.
    
    Args:
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Default settings
    """
    # Delete all user preferences
    await db.execute(
        "DELETE FROM user_preferences WHERE user_id = ?",
        (user_id,)
    )
    
    # Insert default preferences
    now = utc_now()
    
    for category, settings in DEFAULT_SETTINGS.items():
        for key, value in settings.items():
            full_key = f"{category}.{key}"
            serialized_value, pref_type = serialize_preference_value(value)
            
            await db.execute(
                """
                INSERT INTO user_preferences (
                    user_id, preference_key, preference_value,
                    preference_type, category, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id, full_key, serialized_value,
                    pref_type.value, category,
                    now.isoformat(), now.isoformat()
                )
            )
    
    await db.commit()
    
    # Return default settings
    return await get_settings(db, user_id)


@router.delete("/{preference_key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preference(
    preference_key: str,
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Delete a specific preference.
    
    Args:
        preference_key: Preference key
        db: Database connection
        user_id: Current user ID
        
    Raises:
        HTTPException: If preference not found
    """
    cursor = await db.execute(
        "DELETE FROM user_preferences WHERE user_id = ? AND preference_key = ?",
        (user_id, preference_key)
    )
    await db.commit()
    
    if cursor.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preference '{preference_key}' not found"
        )

# Made with Bob
