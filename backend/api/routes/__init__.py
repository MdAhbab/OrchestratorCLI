"""
API routes package for IBM Bob Backend.
Contains all API endpoint implementations.
"""

# Import all route modules for easy access
from backend.api.routes import (
    sessions,
    providers,
    orchestrator,
    runtimes,
    workspace,
    analytics,
    settings
)

__all__ = [
    "sessions",
    "providers",
    "orchestrator",
    "runtimes",
    "workspace",
    "analytics",
    "settings"
]

# Made with Bob
