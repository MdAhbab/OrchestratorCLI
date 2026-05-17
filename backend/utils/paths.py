"""Filesystem helpers shared by onboarding, PTY spawn, and git routes."""

from __future__ import annotations

import os
from pathlib import Path


def normalize_workspace_path(path: str) -> str:
    """Expand ~ / env and return an absolute, resolved path string."""
    if not path or not str(path).strip():
        return path
    expanded = os.path.expandvars(os.path.expanduser(str(path).strip()))
    return str(Path(expanded).resolve())
