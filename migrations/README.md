# Database migrations

## Layout

| File | Purpose |
|------|---------|
| `001_cli_pty.sql` | Placeholder; PTY tables are created by `backend/database/init_db.py` and `apply_migrations()` at startup. |
| `002_orchestrator_providers.sql` | Legacy migration that disables the old `bob` provider. Fresh installs never seed `bob`; this only applies when upgrading older databases. |
| `003_sessions_dispatch.sql` | Rebuilds `sessions` so dispatch sessions created by orchestrator reroutes are valid on upgraded databases. |

## Fresh install vs upgrade

- **Fresh install:** `python run.py` / FastAPI lifespan runs `init_database()` which applies the canonical schema from `backend/database/schema.sql`.
- **Upgrade:** SQL files in this folder are applied idempotently by `apply_migrations()` when present.

## SQLite note

The orchestrator app uses **SQLite** (not PostgreSQL). Installer `shared/skill.md` templates should match the runtime stack documented in `docs/ARCHITECTURE.md`.
