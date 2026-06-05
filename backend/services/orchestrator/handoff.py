"""
Quota-aware handoff helpers (Q-3, MU-2).

Provides:
  enqueue()            — persist a task onto the task_queue table.
  pick_alternate()     — choose the best eligible alternate agent slug.
  build_handoff_prompt() — craft a continuation prompt for the receiving CLI.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import aiosqlite

from backend.utils import utc_now

logger = logging.getLogger(__name__)

# MU-2: cap the number of times a single division may be re-queued.
MAX_REQUEUES: int = 3


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def enqueue(
    db: aiosqlite.Connection,
    session_id: int,
    division_id: str,
    agent_slug: str,
    payload: Any,
    rerouted_from: Optional[str] = None,
) -> Optional[int]:
    """
    Insert a task onto the task_queue table for the given agent.

    Enforces MAX_REQUEUES (MU-2): if the division has already been re-queued
    MAX_REQUEUES times, the insert is skipped and None is returned.

    Returns the new row id, or None if the task was not enqueued.
    """
    # Check the current requeue_count for this division in this session.
    try:
        cur = await db.execute(
            """
            SELECT MAX(requeue_count) AS max_reqs
            FROM task_queue
            WHERE session_id = ? AND division_id = ?
            """,
            (session_id, division_id),
        )
        row = await cur.fetchone()
        current_requeues: int = int(row["max_reqs"] or 0) if row and row["max_reqs"] is not None else 0

        if current_requeues >= MAX_REQUEUES:
            logger.warning(
                "enqueue: division %r has already been re-queued %d/%d times — skipping.",
                division_id, current_requeues, MAX_REQUEUES,
            )
            return None

        payload_str = payload if isinstance(payload, str) else json.dumps(payload)
        now = utc_now().isoformat()

        cursor = await db.execute(
            """
            INSERT INTO task_queue
                (session_id, division_id, agent_slug, payload, status, rerouted_from, requeue_count, created_at)
            VALUES
                (?, ?, ?, ?, 'queued', ?, ?, ?)
            """,
            (
                session_id,
                division_id,
                agent_slug,
                payload_str,
                rerouted_from,
                current_requeues + 1,
                now,
            ),
        )
        await db.commit()
        row_id = cursor.lastrowid
        logger.info(
            "enqueue: division=%r → agent=%r (rerouted_from=%r, requeue_count=%d) id=%s",
            division_id, agent_slug, rerouted_from, current_requeues + 1, row_id,
        )
        return int(row_id) if row_id else None

    except Exception:
        logger.exception(
            "enqueue failed for session_id=%s division_id=%r agent_slug=%r",
            session_id, division_id, agent_slug,
        )
        return None


def pick_alternate(
    slug: str,
    all_agents: Dict[str, Any],
    quota_states: Dict[int, Dict[str, Any]],
) -> Optional[str]:
    """
    Choose the best alternate agent whose quota status is 'ok' or 'warn',
    preferring 'ok' over 'warn', and excluding the current slug.

    Parameters
    ----------
    slug        : the slug of the current (ineligible) agent to avoid.
    all_agents  : dict of {slug: provider_row} (as built in _delegate_divisions_to_agents).
    quota_states: dict of {provider_db_id: quota_state_dict}.

    Returns the best alternate slug, or None if none is available.
    """
    ok_candidates: List[str] = []
    warn_candidates: List[str] = []

    for alt_slug, alt_row in all_agents.items():
        if alt_slug == slug:
            continue
        alt_db_id = int(alt_row["id"])
        alt_qstate = quota_states.get(alt_db_id, {"status": "unlimited"})
        alt_status = str(alt_qstate.get("status", "unlimited"))
        alt_pct = float(alt_qstate.get("pct", 0.0))

        # Import here to avoid circular import at module level.
        from backend.services.quota_service import QUOTA_PREEMPT_PCT

        if alt_pct >= QUOTA_PREEMPT_PCT:
            # This alternate is also above the pre-empt threshold — skip it.
            continue
        if alt_status in ("ok", "unlimited"):
            ok_candidates.append(alt_slug)
        elif alt_status == "warn":
            warn_candidates.append(alt_slug)
        # 'exhausted' → not eligible

    if ok_candidates:
        return ok_candidates[0]
    if warn_candidates:
        return warn_candidates[0]
    return None


def build_handoff_prompt(
    original_task: str,
    prior_summary: Optional[str] = None,
    rerouted_from: Optional[str] = None,
    owns_files: Optional[List[str]] = None,
) -> str:
    """
    Build a continuation prompt for the receiving CLI agent.

    The prompt instructs the new CLI to CONTINUE (not restart) from where the
    previous agent left off, and explicitly forbids re-doing files that are
    already owned/completed.

    Parameters
    ----------
    original_task  : the original task description for this division.
    prior_summary  : a short summary of work already completed (from the
                     handoff packet / terminal snapshot).
    rerouted_from  : slug of the previous agent (for context).
    owns_files     : list of files the previous agent had ownership of.
    """
    lines: List[str] = [
        "**[HANDOFF — CONTINUE, DO NOT RESTART]**",
        "",
        f"You are continuing a task that was previously assigned to another agent"
        + (f" ({rerouted_from})" if rerouted_from else "")
        + " and was interrupted due to quota constraints.",
        "",
        "## Original task",
        original_task.strip(),
        "",
    ]

    if prior_summary:
        lines += [
            "## Work completed so far (by prior agent)",
            prior_summary.strip(),
            "",
            "**Do NOT re-do or overwrite any work described above.**",
            "",
        ]

    if owns_files:
        file_list = "\n".join(f"  - `{f}`" for f in owns_files)
        lines += [
            "## Files already owned / in-progress by the prior agent",
            "You may read these files but should only modify them where the prior",
            "agent's work is clearly incomplete:",
            file_list,
            "",
        ]

    lines += [
        "## Instructions",
        "1. Pick up from where the prior agent left off.",
        "2. Do not re-implement or duplicate completed work.",
        "3. Focus only on the remaining, incomplete portions of the original task.",
        "4. When done, confirm completion clearly.",
        "",
    ]

    return "\n".join(lines)
