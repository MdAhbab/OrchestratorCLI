-- Migration 005: Add custom_cli table for user-defined CLI inputs.
-- Lets users register their own CLI commands (slug, command, args template,
-- description) so the orchestrator can surface them alongside the bundled
-- registry in the agent picker. Idempotent (CREATE TABLE IF NOT EXISTS).

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS custom_cli (
    slug            TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    command         TEXT NOT NULL,
    args_template   TEXT NOT NULL DEFAULT '{prompt}',
    description     TEXT,
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_cli_enabled ON custom_cli(enabled);
CREATE INDEX IF NOT EXISTS idx_custom_cli_created_at ON custom_cli(created_at DESC);

CREATE TRIGGER IF NOT EXISTS update_custom_cli_timestamp
AFTER UPDATE ON custom_cli
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE custom_cli SET updated_at = CURRENT_TIMESTAMP WHERE slug = NEW.slug;
END;

COMMIT;
PRAGMA foreign_keys=ON;
