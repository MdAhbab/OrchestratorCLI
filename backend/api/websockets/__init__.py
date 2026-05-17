"""
WebSocket package for real-time communication.

This package provides WebSocket endpoints for:
- Runtime status updates
- Orchestrator routing and task updates
- Chat message streaming
"""

from .manager import ConnectionManager

__all__ = ["ConnectionManager"]

# Made with Bob
