"""
CLI usage signal parser (Q-1).

Parses terminal buffer text from worker CLIs (Claude Code, Gemini CLI, Codex,
Copilot, etc.) to extract quota/rate-limit signals so the orchestrator can
pre-emptively reroute tasks before a CLI exhausts its quota.

Usage:
    parsed = parse_usage_from_text(session.buffer_snapshot())
    if parsed:
        await quota_service.record_cli_usage(db, provider_id, user_id, parsed)
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Compiled regex patterns (order matters — more specific first)
# ---------------------------------------------------------------------------

# Hard-limit / forbidden patterns → exhausted=True immediately
_RE_HARD_LIMIT = re.compile(
    r"""
    usage\s+limit\s+(?:reached|exceeded|hit)
    | quota\s+(?:exceeded|exhausted|reached|hit)
    | monthly\s+(?:usage\s+)?(?:limit|cap)\s+(?:reached|exceeded)
    | you['']ve\s+(?:hit|reached|exceeded)\s+(?:your\s+)?(?:usage\s+)?(?:limit|quota|cap)
    | forbidden                              # HTTP 403 style
    | access\s+denied                        # generic gate
    | (billing|subscription)\s+(?:limit|cap|quota)
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Rate-limit patterns (may or may not be hard-exhausted)
_RE_RATE_LIMIT = re.compile(
    r"""
    rate[\s_-]?limit(?:ed|ing)?
    | too\s+many\s+requests
    | \b429\b
    | request\s+quota\s+exceeded
    | api\s+(?:rate\s+)?limit
    """,
    re.IGNORECASE | re.VERBOSE,
)

# "resets at <time>" / "resets in <duration>"
_RE_RESET_AT = re.compile(
    r"""
    reset(?:s)?\s+(?:at|in|on)\s+
    ([\d]{1,2}[:/][\d]{2}(?:[:/][\d]{2})?  # HH:MM or HH:MM:SS
     |\d{4}-\d{2}-\d{2}(?:T[\d:]+)?         # ISO date/datetime
     |in\s+\d+\s+(?:second|minute|hour)s?   # relative "in N minutes"
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)

# "X% of [your|the] [daily|weekly|monthly|hourly] [usage] (limit|quota|cap)"
# Window word is optional (group 2 may be None), and possessive/article words
# ("your"/"the") between "of" and the window are tolerated.
_RE_PCT_OF_LIMIT = re.compile(
    r"""
    (\d+(?:\.\d+)?)\s*%\s+of\s+
    (?:your\s+|the\s+)?
    (?:(daily|weekly|monthly|hourly)\s+)?
    (?:usage\s+)?(?:limit|quota|cap)
    """,
    re.IGNORECASE | re.VERBOSE,
)

# "used N / limit M" or "N of M tokens"
_RE_USED_OF_LIMIT = re.compile(
    r"""
    (?:used?|consumed?|spent?)\s+
    ([\d,]+)\s*/\s*([\d,]+)               # "used 8000 / 10000"
    | ([\d,]+)\s+(?:tokens?|requests?)\s+of\s+([\d,]+)  # "800 tokens of 1000"
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Generic "quota" keyword (lowest priority signal)
_RE_QUOTA = re.compile(r"\bquota\b", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse_usage_from_text(text: str) -> Optional[dict]:
    """Parse rate-limit / quota signals from a CLI terminal buffer.

    Returns a dict with keys:
        used      : int or None
        limit     : int or None
        pct       : float 0..1 or None
        reset_at  : str (ISO-8601) or None
        exhausted : bool
        quota_window : str or None

    Returns None when no quota signal is detected at all.
    The dict is always best-effort; individual fields may be None when they
    cannot be derived from the available text.

    Exhaustion rules (more conservative than before to avoid false positives):

    1. An explicit >=100% numeric threshold (e.g. "used 1000 / 1000",
       "100% of limit") is authoritative — exhausted flips immediately.
    2. Otherwise, *at least two distinct match categories* must corroborate
       (HARD_LIMIT, RATE_LIMIT, USED_AT_LIMIT). A single weak signal in
       isolation is reported but does not mark the CLI as exhausted.
    3. The bare "quota" keyword is informational only and never exhausts.
    """
    if not text:
        return None

    result: dict = {
        "used": None,
        "limit": None,
        "pct": None,
        "reset_at": None,
        "exhausted": False,
        "quota_window": None,
    }
    found_any_signal = False

    # Track distinct corroborating categories so we can require >=2 (or a
    # numeric override) before declaring the CLI exhausted.
    categories: set[str] = set()
    numeric_override: bool = False

    # 1. Hard-limit check (forbidden / access denied / quota-exceeded prose)
    if _RE_HARD_LIMIT.search(text):
        found_any_signal = True
        categories.add("HARD_LIMIT")

    # 2. Rate-limit / 429 patterns
    if _RE_RATE_LIMIT.search(text):
        found_any_signal = True
        categories.add("RATE_LIMIT")

    # 3. "X% of daily/weekly/monthly limit"
    m = _RE_PCT_OF_LIMIT.search(text)
    if m:
        found_any_signal = True
        pct_raw = float(m.group(1)) / 100.0
        result["pct"] = min(pct_raw, 1.0)
        window_word = (m.group(2) or "").lower()
        if window_word:
            result["quota_window"] = window_word  # e.g. "daily"
        if pct_raw >= 1.0:
            categories.add("PCT_AT_LIMIT")
            numeric_override = True

    # 4. "used N / limit M" (or "N tokens of M")
    m = _RE_USED_OF_LIMIT.search(text)
    if m:
        found_any_signal = True
        if m.group(1) and m.group(2):
            used = int(m.group(1).replace(",", ""))
            limit = int(m.group(2).replace(",", ""))
        else:
            used = int(m.group(3).replace(",", ""))
            limit = int(m.group(4).replace(",", ""))
        result["used"] = used
        result["limit"] = limit
        if limit > 0:
            pct = used / limit
            result["pct"] = min(round(pct, 4), 1.0)
            if pct >= 1.0:
                categories.add("USED_AT_LIMIT")
                numeric_override = True
        else:
            result["pct"] = 0.0

    # 5. "resets at <time>" — informational, never exhausts
    m = _RE_RESET_AT.search(text)
    if m:
        found_any_signal = True
        raw_reset = m.group(1).strip()
        parsed_iso = _try_parse_reset_time(raw_reset)
        if parsed_iso:
            result["reset_at"] = parsed_iso

    # 6. Bare "quota" keyword as a weak signal (only flag if nothing else matched)
    if not found_any_signal and _RE_QUOTA.search(text):
        found_any_signal = True
        # Weak signal — never marks exhausted on its own.

    if not found_any_signal:
        return None

    # Apply the consolidated exhaustion decision:
    #   - numeric override (>=100%) is authoritative, OR
    #   - at least 2 distinct corroborating categories matched.
    if numeric_override or len(categories) >= 2:
        result["exhausted"] = True

    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _try_parse_reset_time(raw: str) -> Optional[str]:
    """Attempt to parse a reset-time string into an ISO-8601 UTC string."""
    raw = raw.strip()
    # Already ISO-ish
    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d",
        "%H:%M:%S",
        "%H:%M",
    ):
        try:
            dt = datetime.strptime(raw, fmt)
            if dt.year == 1900:
                # Time-only formats: combine with today's UTC date
                today = datetime.now(tz=timezone.utc).date()
                dt = dt.replace(year=today.year, month=today.month, day=today.day,
                                tzinfo=timezone.utc)
            elif dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue
    return None
