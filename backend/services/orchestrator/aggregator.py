"""Response aggregation from multiple agent outputs."""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Tuple

from .messages import OrchestratorPlan, TaskDivision


def _division_key(d: TaskDivision) -> Tuple[str, str]:
    """Key a division by (agent short, instructions hash) so genuine
    distinct tasks on the same agent are preserved when merging plans."""
    digest = hashlib.sha1((d.instructions or "").encode("utf-8")).hexdigest()[:12]
    return (d.short, digest)


def merge_divisions(
    primary: List[TaskDivision],
    supplemental: List[TaskDivision],
) -> List[TaskDivision]:
    """Merge divisions while preserving two distinct tasks on the same
    agent. Earlier behaviour keyed on the agent ``short`` only, which
    silently dropped legitimate fan-outs (e.g. two Claude Code tasks).
    """
    seen: set[Tuple[str, str]] = {_division_key(d) for d in primary}
    merged: List[TaskDivision] = list(primary)
    for d in supplemental:
        key = _division_key(d)
        if key not in seen:
            merged.append(d)
            seen.add(key)
    return merged


def aggregate_agent_results(
    plan: OrchestratorPlan,
    agent_outputs: Dict[str, str],
) -> OrchestratorPlan:
    """Combine per-agent stdout/summary into orchestrator metadata."""
    if not agent_outputs:
        return plan
    summaries: List[str] = []
    for short, output in agent_outputs.items():
        preview = output.strip()[:400]
        if preview:
            summaries.append(f"**{short}**: {preview}")
    if summaries:
        plan.metadata["agent_outputs"] = agent_outputs
        plan.thinking = plan.thinking + [f"Collected output from {len(agent_outputs)} agent(s)"]
    return plan
