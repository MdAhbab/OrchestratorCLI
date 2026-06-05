"""
Quota tracking and quota-aware routing service (closes A-CRIT-01).

Responsibilities:
  - record_usage()   — increment quota_used after every provider call.
  - get_quota_state()— return {used, limit, pct, reset_at, status} for a credential row.
  - reset_if_elapsed()— lazy window reset when now > quota_reset_at.
  - filter_ok_configs()— drop exhausted providers from a config list; deprioritize 'warn' ones.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Literal

import aiosqlite

from backend.utils import utc_now

logger = logging.getLogger(__name__)

QuotaStatus = Literal["ok", "warn", "exhausted", "unlimited"]

WARN_THRESHOLD_PCT = 0.85      # 85 % of limit → warn
QUOTA_PREEMPT_PCT = 0.90       # 90 % of limit → pre-empt (reroute before exhaustion)


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def record_usage(
    db: aiosqlite.Connection,
    provider_db_id: int,
    user_id: int,
    tokens: int = 0,
    requests: int = 1,
) -> None:
    """
    Increment quota_used for the active credential of a given provider+user.
    Also resets the window first if it has elapsed.
    """
    try:
        cur = await db.execute(
            """
            SELECT id, quota_used, quota_limit, quota_reset_at
            FROM provider_credentials
            WHERE provider_id = ? AND user_id = ? AND is_active = 1
            ORDER BY id DESC
            LIMIT 1
            """,
            (provider_db_id, user_id),
        )
        row = await cur.fetchone()
        if row is None:
            return  # No credential row — nothing to track.

        cred_id: int = row["id"]
        quota_used: int = row["quota_used"] or 0
        quota_limit: Optional[int] = row["quota_limit"]
        reset_at: Optional[datetime] = _parse_dt(row["quota_reset_at"])
        now = utc_now()

        # Lazy window reset: if the reset_at has passed, start a new window.
        if reset_at and now >= reset_at:
            quota_used = 0
            new_reset_at = (now + timedelta(days=1)).isoformat()
            await db.execute(
                "UPDATE provider_credentials SET quota_used = 0, quota_reset_at = ? WHERE id = ?",
                (new_reset_at, cred_id),
            )
            await db.commit()
            logger.info("Quota window reset for credential %s (provider_id=%s)", cred_id, provider_db_id)

        # Increment by the larger of (tokens // 1000, requests).
        increment = max(requests, tokens // 1000) if tokens > 0 else requests
        new_used = quota_used + increment

        await db.execute(
            "UPDATE provider_credentials SET quota_used = ? WHERE id = ?",
            (new_used, cred_id),
        )
        await db.commit()
        logger.debug("Quota updated: cred_id=%s used=%s limit=%s", cred_id, new_used, quota_limit)

    except Exception:
        logger.exception("record_usage failed for provider_db_id=%s", provider_db_id)


async def record_cli_usage(
    db: aiosqlite.Connection,
    provider_db_id: int,
    user_id: int,
    parsed: Dict[str, Any],
) -> None:
    """
    Update quota_used / quota_limit / quota_reset_at from a parsed CLI usage dict
    (output of cli_usage.parse_usage_from_text).

    Q-1: worker-CLI usage signal feed-in.
    Q-4: honours 'quota_window' key if present ('daily'|'weekly'|'monthly'|'hourly').
    Does NOT remove or rename existing functions.
    """
    if not parsed:
        return
    try:
        cur = await db.execute(
            """
            SELECT id, quota_used, quota_limit, quota_reset_at
            FROM provider_credentials
            WHERE provider_id = ? AND user_id = ? AND is_active = 1
            ORDER BY id DESC
            LIMIT 1
            """,
            (provider_db_id, user_id),
        )
        row = await cur.fetchone()
        if row is None:
            return  # No credential row — nothing to track.

        cred_id: int = row["id"]
        now = utc_now()

        # Determine the reset window from the parsed dict (Q-4), defaulting to daily.
        window = str(parsed.get("quota_window") or "daily").lower()
        _WINDOW_DELTA = {
            "hourly": timedelta(hours=1),
            "daily":  timedelta(days=1),
            "weekly": timedelta(weeks=1),
            "monthly": timedelta(days=30),
        }
        window_delta = _WINDOW_DELTA.get(window, timedelta(days=1))

        updates: Dict[str, Any] = {}

        # Apply parsed used/limit if present.
        if parsed.get("used") is not None:
            updates["quota_used"] = int(parsed["used"])
        if parsed.get("limit") is not None:
            updates["quota_limit"] = int(parsed["limit"])

        # Derive pct-based quota_used estimate when only pct is available.
        if parsed.get("pct") is not None and parsed.get("used") is None:
            existing_limit = updates.get("quota_limit") or row["quota_limit"]
            if existing_limit:
                updates["quota_used"] = int(float(parsed["pct"]) * int(existing_limit))

        # Handle exhausted=True: force quota_used to quota_limit.
        if parsed.get("exhausted"):
            limit_val = updates.get("quota_limit") or row["quota_limit"]
            if limit_val:
                updates["quota_used"] = int(limit_val)
            else:
                # No limit known — store a sentinel large enough to exceed QUOTA_PREEMPT_PCT.
                updates["quota_used"] = 9999
                updates["quota_limit"] = 9999

        # Apply reset_at from parsed signal (authoritative when present).
        if parsed.get("reset_at"):
            updates["quota_reset_at"] = parsed["reset_at"]
        elif "quota_reset_at" not in updates:
            # Ensure reset_at is set if it was missing.
            existing_reset = _parse_dt(row["quota_reset_at"])
            if existing_reset is None or now >= existing_reset:
                updates["quota_reset_at"] = (now + window_delta).isoformat()

        if not updates:
            return

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [cred_id]
        await db.execute(
            f"UPDATE provider_credentials SET {set_clause} WHERE id = ?",
            values,
        )
        await db.commit()
        logger.debug(
            "record_cli_usage: cred_id=%s updates=%s",
            cred_id, {k: updates[k] for k in updates},
        )
    except Exception:
        logger.exception("record_cli_usage failed for provider_db_id=%s", provider_db_id)


async def get_quota_state(
    db: aiosqlite.Connection,
    provider_db_id: int,
    user_id: int,
) -> Dict[str, Any]:
    """
    Return a dict: {used, limit, pct, reset_at, status}
    status ∈ {'ok', 'warn', 'exhausted', 'unlimited'}
    """
    try:
        cur = await db.execute(
            """
            SELECT quota_used, quota_limit, quota_reset_at
            FROM provider_credentials
            WHERE provider_id = ? AND user_id = ? AND is_active = 1
            ORDER BY id DESC
            LIMIT 1
            """,
            (provider_db_id, user_id),
        )
        row = await cur.fetchone()
        if row is None:
            return {"used": 0, "limit": None, "pct": 0.0, "reset_at": None, "status": "unlimited"}

        used: int = row["quota_used"] or 0
        limit: Optional[int] = row["quota_limit"]
        reset_at = row["quota_reset_at"]

        if not limit:
            return {"used": used, "limit": None, "pct": 0.0, "reset_at": reset_at, "status": "unlimited"}

        pct = used / limit
        if pct >= 1.0:
            status: QuotaStatus = "exhausted"
        elif pct >= WARN_THRESHOLD_PCT:
            status = "warn"
        else:
            status = "ok"

        return {
            "used": used,
            "limit": limit,
            "pct": round(pct, 4),
            "reset_at": reset_at,
            "status": status,
        }
    except Exception:
        logger.exception("get_quota_state failed for provider_db_id=%s", provider_db_id)
        return {"used": 0, "limit": None, "pct": 0.0, "reset_at": None, "status": "unlimited"}


async def get_quota_states_bulk(
    db: aiosqlite.Connection,
    user_id: int,
) -> Dict[int, Dict[str, Any]]:
    """
    Return quota state keyed by provider_db_id for all credentials of a user.
    More efficient than calling get_quota_state in a loop.
    """
    try:
        cur = await db.execute(
            """
            SELECT provider_id, quota_used, quota_limit, quota_reset_at
            FROM provider_credentials
            WHERE user_id = ? AND is_active = 1
            """,
            (user_id,),
        )
        rows = await cur.fetchall()
        result: Dict[int, Dict[str, Any]] = {}
        now = utc_now()
        for row in rows:
            pid: int = row["provider_id"]
            used: int = row["quota_used"] or 0
            limit: Optional[int] = row["quota_limit"]
            reset_at = row["quota_reset_at"]

            # Treat as reset if window has elapsed (lazy; DB not updated here).
            reset_dt = _parse_dt(reset_at)
            if reset_dt and now >= reset_dt:
                used = 0

            if not limit:
                result[pid] = {"used": used, "limit": None, "pct": 0.0, "reset_at": reset_at, "status": "unlimited"}
                continue

            pct = used / limit
            if pct >= 1.0:
                status: QuotaStatus = "exhausted"
            elif pct >= WARN_THRESHOLD_PCT:
                status = "warn"
            else:
                status = "ok"

            result[pid] = {
                "used": used,
                "limit": limit,
                "pct": round(pct, 4),
                "reset_at": reset_at,
                "status": status,
            }
        return result
    except Exception:
        logger.exception("get_quota_states_bulk failed for user_id=%s", user_id)
        return {}
