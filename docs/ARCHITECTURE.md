# AI Orchestrator — Architecture

Production-oriented multi-agent AI orchestration platform. The **orchestrator** is the central intelligence layer; **CLI agents** execute work in parallel PTY terminals; **LLM providers** (Grok, DeepSeek, Gemini) power planning and routing.

## System overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                      │
│  Chat · Processes/PTY · Settings · Onboarding · Command palette  │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST / WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                   FastAPI Backend (/api)                         │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │ Orchestrator │  │   Agents    │  │  Providers / Runtimes    │ │
│  │   Engine     │  │  Registry   │  │  PTY · Workspace · WS    │ │
│  └──────┬───────┘  └──────┬──────┘  └──────────────────────────┘ │
│         │                 │                                        │
│  ┌──────▼───────┐  ┌──────▼──────┐  ┌──────────────────────────┐ │
│  │ LLM Router   │  │   A2A Bus   │  │  MCP Tool Registry       │ │
│  │ Grok/Gemini/ │  │  messaging  │  │  workspace.list_files…   │ │
│  │  DeepSeek    │  └─────────────┘  └──────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    SQLite (storage/data/orchestrator.db)
```

## Layer responsibilities

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Orchestrator** | `backend/services/orchestrator/` | Task decomposition, LLM routing, fallback, response aggregation, shared context |
| **Providers** | `backend/services/providers/` | Extensible LLM API adapters (OpenAI-compatible + Gemini) |
| **Agents** | `backend/services/agents/` | CLI agent registration, A2A message bus, PTY adapters |
| **Tools** | `backend/services/tools/` | MCP-style tool registry and invocation |
| **Transport** | `backend/api/routes/`, `backend/api/websockets/` | REST + WebSocket APIs |
| **Persistence** | `backend/database/` | Sessions, messages, credentials, routing history |

## Orchestration flow

1. User sends a message → `POST /api/orchestrator/chat`
2. **OrchestratorEngine** loads:
   - Orchestrator LLM credentials (Grok / Gemini / DeepSeek) from DB or env
   - Enabled CLI agents (Claude, Gemini CLI, Codex, …)
3. **ProviderRouter** calls LLMs in priority order with retries and fallback
4. LLM returns JSON plan: `content`, `thinking`, `divisions[]`, `artifacts[]`
5. If all LLMs fail → **local router** assigns tasks deterministically to enabled agents
6. Plan persisted to session messages + `workspace/shared/divisions.md`
7. UI shows divisions; user opens **Processes** → spawns PTY per agent via `/api/runtimes/spawn`

## Provider system

### Supported orchestrator LLMs

| Provider ID | API | Config |
|-------------|-----|--------|
| `grok` | xAI OpenAI-compatible | `GROK_API_KEY` or Settings → Providers |
| `gemini-api` | Google Generative Language API | `GEMINI_API_KEY` |
| `deepseek-api` | DeepSeek OpenAI-compatible | `DEEPSEEK_API_KEY` |

### Routing behavior

- **Priority**: lower `priority` in provider `config_schema` / DB wins (default: Grok → Gemini → DeepSeek)
- **Health checks**: `GET /api/orchestrator/providers/health`
- **Fallback**: on auth/timeout/error, next provider is tried (`max_retries` per provider with backoff)
- **Cost-aware**: `cost_per_1k_tokens` in provider config (optional)

### Adding a new LLM provider

1. Implement `LLMProvider` in `backend/services/providers/your_provider.py`
2. Register in `backend/services/providers/registry.py`
3. Seed provider row in `init_db.py` + migration SQL
4. Add frontend entry in `store.tsx` if user-configurable

## Agent lifecycle

1. **Discovery** — `GET /api/agents` merges DB providers + live PTY sessions
2. **Registration** — `AgentRegistry` tracks descriptors (in-memory; DB is source of truth for config)
3. **Spawn** — `POST /api/runtimes/spawn` starts PowerShell PTY bound to provider
4. **Assignment** — orchestrator `divisions[]` → UI dispatches task text to terminal WebSocket
5. **A2A** — agents exchange messages via `POST /api/agents/a2a/send`, inbox at `/api/agents/a2a/inbox/{id}`
6. **Handoff** — `CLIAgentAdapter.handoff()` for structured agent-to-agent delegation

## A2A (Agent-to-Agent) design

- **Transport**: in-process `A2ABus` (swap for Redis/NATS in production)
- **Envelope**: `from_agent`, `to_agent`, `content`, `message_type`, `session_id`
- **Types**: `request`, `response`, `broadcast`, `handoff`
- **History**: `GET /api/agents/a2a/history?session_id=`

## MCP integration

- **Registry**: `backend/services/tools/mcp.py`
- **List tools**: `GET /api/tools/mcp`
- **Invoke**: `POST /api/tools/mcp/{name}/invoke`
- Built-in tools: `echo`, `workspace.list_files`
- Extend by calling `get_mcp_registry().register(MCPToolDescriptor(...))`

## Environment variables

See `backend/.env.example`. Key orchestrator vars:

```env
GROK_API_KEY=
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
DEFAULT_ORCHESTRATOR_MODEL=grok-3
ORCHESTRATOR_PROVIDER_PRIORITY=grok,gemini-api,deepseek-api
ENCRYPTION_KEY=          # Fernet key for stored provider credentials
```

## Development setup

```bash
cd OrchestratorCLI
python run.py --no-reload
# Frontend: http://localhost:5173
# API docs: http://localhost:8000/docs
```

Initialize DB (fresh install):

```bash
python -m backend.database.init_db --force
```

Apply migration for existing DBs:

```bash
sqlite3 storage/data/orchestrator.db < migrations/002_orchestrator_providers.sql
```

## Deployment

- **Dev**: `python run.py`
- **Production**: `python run.py --no-reload` behind reverse proxy; set `DEBUG=false`, strong `SECRET_KEY` + `ENCRYPTION_KEY`
- **Bundled desktop**: `release/installer/` (PyInstaller + Inno Setup); set `ORCHESTRATOR_BUNDLED=1`

## Extension guidelines

| Extend | Steps |
|--------|-------|
| **New LLM** | Subclass `LLMProvider` or `OpenAICompatibleProvider`, register, seed DB |
| **New CLI agent** | Add provider seed, frontend `DEFAULT_PROVIDERS`, installer `cli_registry.json` |
| **New MCP tool** | Register handler in `mcp.py` or plugin module |
| **New transport** | Implement adapter matching `A2ABus` interface |

## API summary

| Endpoint | Purpose |
|----------|---------|
| `POST /api/orchestrator/chat` | Main orchestrator conversation |
| `GET /api/orchestrator/providers/health` | LLM provider health |
| `GET /api/agents` | Agent discovery |
| `POST /api/agents/a2a/send` | A2A messaging |
| `GET /api/tools/mcp` | MCP tool catalog |
| `POST /api/runtimes/spawn` | Start CLI PTY |
| `WS /ws/terminals/{id}` | Terminal I/O + ask |

---

*The `downloader_page/` module is intentionally excluded from this architecture and remains unchanged.*
