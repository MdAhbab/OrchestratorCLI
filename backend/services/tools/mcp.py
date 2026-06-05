"""
Model Context Protocol (MCP) tool integration layer.

Provides a transport-agnostic interface for registering and invoking MCP-compatible
tools that agents and the orchestrator can call during task execution.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional
import uuid

logger = logging.getLogger(__name__)

ToolHandler = Callable[[Dict[str, Any]], Awaitable[Any]]


@dataclass
class MCPToolDescriptor:
    name: str
    description: str
    input_schema: Dict[str, Any] = field(default_factory=dict)
    handler: Optional[ToolHandler] = None


@dataclass
class MCPToolResult:
    tool: str
    success: bool
    output: Any = None
    error: Optional[str] = None


class MCPToolRegistry:
    """Registry of MCP-style tools available to the orchestrator and agents."""

    def __init__(self) -> None:
        self._tools: Dict[str, MCPToolDescriptor] = {}

    def register(self, tool: MCPToolDescriptor) -> None:
        self._tools[tool.name] = tool
        logger.info("Registered MCP tool: %s", tool.name)

    def list_tools(self) -> List[MCPToolDescriptor]:
        return list(self._tools.values())

    def get(self, name: str) -> Optional[MCPToolDescriptor]:
        return self._tools.get(name)

    async def invoke(self, name: str, arguments: Dict[str, Any]) -> MCPToolResult:
        tool = self._tools.get(name)
        if not tool:
            return MCPToolResult(tool=name, success=False, error=f"Unknown tool: {name}")
        if not tool.handler:
            return MCPToolResult(
                tool=name, success=False, error="Tool has no handler registered"
            )
        try:
            output = await tool.handler(arguments)
            return MCPToolResult(tool=name, success=True, output=output)
        except Exception as e:
            logger.exception("MCP tool %s failed", name)
            return MCPToolResult(tool=name, success=False, error=str(e))


def _register_builtin_tools(registry: MCPToolRegistry) -> None:
    async def echo_handler(args: Dict[str, Any]) -> Any:
        return {"echo": args.get("message", "")}

    async def workspace_list_handler(args: Dict[str, Any]) -> Any:
        from pathlib import Path

        root_arg = args.get("path", ".")
        workspace_root = args.get("workspace_root")
        if workspace_root:
            base = Path(str(workspace_root)).resolve()
        else:
            base = Path(".").resolve()
        target = (base / str(root_arg)).resolve()
        try:
            target.relative_to(base)
        except ValueError:
            return {"files": [], "error": "path outside workspace root"}
        if not target.is_dir():
            return {"files": [], "error": "not a directory"}
        files = [p.name for p in target.iterdir() if p.is_file()][:100]
        return {"files": files, "path": str(target)}

    registry.register(
        MCPToolDescriptor(
            name="echo",
            description="Echo a message (connectivity test)",
            input_schema={"type": "object", "properties": {"message": {"type": "string"}}},
            handler=echo_handler,
        )
    )
    registry.register(
        MCPToolDescriptor(
            name="workspace.list_files",
            description="List files in a workspace directory",
            input_schema={
                "type": "object",
                "properties": {"path": {"type": "string"}},
            },
            handler=workspace_list_handler,
        )
    )


def _register_cli_tools(registry: MCPToolRegistry) -> None:
    """Register cli.* MCP tools that let the central AI drive worker CLIs.

    Each handler is a thin async wrapper around the synchronous functions in
    backend.services.tools.cli_tools (Part C of ORCHESTRATOR_V0.9.md).
    """
    import asyncio
    from backend.services.tools import cli_tools

    async def _run(args: Dict[str, Any]) -> Any:
        return await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: cli_tools.run_task(
                slug=str(args.get("agent", "")),
                prompt=str(args.get("prompt", "")),
                model=args.get("model"),
                mode=str(args.get("mode", "auto")),
                owns_files=args.get("owns_files"),
            ),
        )

    async def _set_model(args: Dict[str, Any]) -> Any:
        return await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: cli_tools.set_model(
                slug=str(args.get("agent", "")),
                model=str(args.get("model", "")),
            ),
        )

    async def _set_mode(args: Dict[str, Any]) -> Any:
        return await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: cli_tools.set_mode(
                slug=str(args.get("agent", "")),
                mode=str(args.get("mode", "auto")),
            ),
        )

    async def _get_usage(args: Dict[str, Any]) -> Any:
        return await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: cli_tools.get_usage(slug=str(args.get("agent", ""))),
        )

    async def _login(args: Dict[str, Any]) -> Any:
        return await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: cli_tools.login(slug=str(args.get("agent", ""))),
        )

    async def _stop(args: Dict[str, Any]) -> Any:
        return await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: cli_tools.stop(slug=str(args.get("agent", ""))),
        )

    registry.register(
        MCPToolDescriptor(
            name="cli.run_task",
            description=(
                "Run a task on a worker CLI (claude-code, gemini-cli, codex-cli, "
                "copilot-cli). Builds the concrete non-interactive command from "
                "cli_commands.json and writes it to the agent's live PTY."
            ),
            input_schema={
                "type": "object",
                "required": ["agent", "prompt"],
                "properties": {
                    "agent":      {"type": "string", "description": "CLI slug, e.g. 'claude-code'"},
                    "prompt":     {"type": "string", "description": "Task description / instruction"},
                    "model":      {"type": "string", "description": "Optional model override"},
                    "mode":       {
                        "type": "string",
                        "enum": ["auto", "yolo", "interactive"],
                        "default": "auto",
                        "description": "Permission mode (prefer 'auto'; 'yolo' requires user opt-in)",
                    },
                    "owns_files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "File paths this agent is allowed to edit (MU-5 scope)",
                    },
                },
            },
            handler=_run,
        )
    )

    registry.register(
        MCPToolDescriptor(
            name="cli.set_model",
            description="Switch the active model on a worker CLI's PTY session.",
            input_schema={
                "type": "object",
                "required": ["agent", "model"],
                "properties": {
                    "agent": {"type": "string"},
                    "model": {"type": "string", "description": "Model identifier"},
                },
            },
            handler=_set_model,
        )
    )

    registry.register(
        MCPToolDescriptor(
            name="cli.set_mode",
            description=(
                "Set the approval/permission mode on a worker CLI. "
                "'auto' = safe auto-approve edits; 'yolo' = full bypass (user must opt-in); "
                "'interactive' = no change (human in the loop)."
            ),
            input_schema={
                "type": "object",
                "required": ["agent", "mode"],
                "properties": {
                    "agent": {"type": "string"},
                    "mode":  {
                        "type": "string",
                        "enum": ["auto", "yolo", "interactive"],
                    },
                },
            },
            handler=_set_mode,
        )
    )

    registry.register(
        MCPToolDescriptor(
            name="cli.get_usage",
            description=(
                "Dispatch the usage-query command to a worker CLI's PTY. "
                "The result must be parsed from the PTY output stream (see cli_usage.py). "
                "Returns dispatch status; parsed {used, limit, pct, reset_at} available via Q-1."
            ),
            input_schema={
                "type": "object",
                "required": ["agent"],
                "properties": {
                    "agent": {"type": "string"},
                },
            },
            handler=_get_usage,
        )
    )

    registry.register(
        MCPToolDescriptor(
            name="cli.login",
            description=(
                "Write the CLI's login command into its PTY so the user can complete "
                "the interactive auth flow (OAuth / device-code / browser)."
            ),
            input_schema={
                "type": "object",
                "required": ["agent"],
                "properties": {
                    "agent": {"type": "string"},
                },
            },
            handler=_login,
        )
    )

    registry.register(
        MCPToolDescriptor(
            name="cli.stop",
            description=(
                "Send a graceful interrupt (Ctrl-C) to a worker CLI's PTY. "
                "Used by the pre-emption monitor (Q-3) to stop an in-flight task."
            ),
            input_schema={
                "type": "object",
                "required": ["agent"],
                "properties": {
                    "agent": {"type": "string"},
                },
            },
            handler=_stop,
        )
    )


_registry: Optional[MCPToolRegistry] = None


def get_mcp_registry() -> MCPToolRegistry:
    global _registry
    if _registry is None:
        _registry = MCPToolRegistry()
        _register_builtin_tools(_registry)
        _register_cli_tools(_registry)
    return _registry
