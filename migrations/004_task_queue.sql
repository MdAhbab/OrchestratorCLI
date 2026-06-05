-- Migration 004: Add task_queue table for quota-aware pre-emptive CLI handoff (Q-3).
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS task_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL,
    division_id     TEXT    NOT NULL,
    agent_slug      TEXT    NOT NULL,
    payload         TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'queued'
                            CHECK(status IN ('queued', 'running', 'done', 'failed')),
    rerouted_from   TEXT,
    requeue_count   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_queue_session_id  ON task_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_task_queue_agent_slug  ON task_queue(agent_slug);
CREATE INDEX IF NOT EXISTS idx_task_queue_status      ON task_queue(status);
CREATE INDEX IF NOT EXISTS idx_task_queue_created_at  ON task_queue(created_at DESC);

COMMIT;
PRAGMA foreign_keys=ON;
