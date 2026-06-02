-- SQLite Database Schema for AI Orchestrator Backend System
-- Enable WAL mode for better concurrency
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA synchronous=NORMAL;

-- ============================================================================
-- USERS AND WORKSPACES
-- ============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    path TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_is_active ON workspaces(is_active);
CREATE INDEX IF NOT EXISTS idx_workspaces_path ON workspaces(path);

-- ============================================================================
-- PROVIDERS AND CREDENTIALS
-- ============================================================================

-- Providers table
CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    provider_type TEXT NOT NULL CHECK(provider_type IN ('llm', 'embedding', 'tts', 'stt', 'vision')),
    base_url TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT 1,
    supports_streaming BOOLEAN NOT NULL DEFAULT 0,
    supports_function_calling BOOLEAN NOT NULL DEFAULT 0,
    max_tokens INTEGER,
    default_model TEXT,
    config_schema TEXT, -- JSON schema for provider-specific config
    cost_per_token REAL DEFAULT 0.0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_providers_name ON providers(name);
CREATE INDEX IF NOT EXISTS idx_providers_type ON providers(provider_type);
CREATE INDEX IF NOT EXISTS idx_providers_is_enabled ON providers(is_enabled);

-- Provider credentials (encrypted storage)
CREATE TABLE IF NOT EXISTS provider_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    credential_name TEXT NOT NULL,
    api_key TEXT NOT NULL, -- Should be encrypted before storage
    api_secret TEXT, -- Should be encrypted before storage
    additional_config TEXT, -- JSON for additional provider-specific config
    is_active BOOLEAN NOT NULL DEFAULT 1,
    quota_limit INTEGER,
    quota_used INTEGER DEFAULT 0,
    quota_reset_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
    UNIQUE(user_id, provider_id, credential_name)
);

CREATE INDEX IF NOT EXISTS idx_provider_credentials_user_id ON provider_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider_id ON provider_credentials(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_is_active ON provider_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_user_active ON provider_credentials(user_id, is_active);


-- ============================================================================
-- SESSIONS AND MESSAGES
-- ============================================================================

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    workspace_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'archived')),
    session_type TEXT NOT NULL DEFAULT 'chat' CHECK(session_type IN ('chat', 'task', 'workflow', 'dispatch')),
    metadata TEXT, -- JSON for additional session metadata
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);

-- Session agents (tracks which agents participated in a session)
CREATE TABLE IF NOT EXISTS session_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    agent_name TEXT NOT NULL,
    agent_role TEXT,
    provider_id INTEGER,
    model_name TEXT,
    tokens_used INTEGER DEFAULT 0,
    cost_estimate REAL DEFAULT 0.0,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_session_agents_session_id ON session_agents(session_id);
CREATE INDEX IF NOT EXISTS idx_session_agents_agent_name ON session_agents(agent_name);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    parent_message_id INTEGER,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'function', 'tool')),
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text' CHECK(content_type IN ('text', 'code', 'image', 'file', 'error')),
    agent_name TEXT,
    provider_id INTEGER,
    model_name TEXT,
    tokens_used INTEGER DEFAULT 0,
    metadata TEXT, -- JSON for additional message metadata (function calls, tool uses, etc.)
    is_edited BOOLEAN NOT NULL DEFAULT 0,
    is_deleted BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_message_id) REFERENCES messages(id) ON DELETE SET NULL,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent_message_id ON messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_agent_name ON messages(agent_name);

-- Session artifacts (files, outputs, results generated during session)
CREATE TABLE IF NOT EXISTS session_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    message_id INTEGER,
    artifact_type TEXT NOT NULL CHECK(artifact_type IN ('file', 'code', 'image', 'data', 'log', 'output')),
    name TEXT NOT NULL,
    path TEXT,
    content TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    metadata TEXT, -- JSON for additional artifact metadata
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_session_artifacts_session_id ON session_artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_session_artifacts_message_id ON session_artifacts(message_id);
CREATE INDEX IF NOT EXISTS idx_session_artifacts_type ON session_artifacts(artifact_type);

-- ============================================================================
-- CLI RUNTIME AND LOGS
-- ============================================================================

-- CLI runtimes (tracks running CLI/PTY processes per provider)
CREATE TABLE IF NOT EXISTS cli_runtimes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,                              -- optional: PTY may not be bound to a chat session
    provider_id INTEGER,                             -- the agent this PTY represents
    process_id INTEGER,                              -- OS pid; populated once PTY spawns
    command TEXT NOT NULL,
    working_directory TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'killed', 'paused', 'pending')),
    exit_code INTEGER,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cli_runtimes_session_id ON cli_runtimes(session_id);
CREATE INDEX IF NOT EXISTS idx_cli_runtimes_provider_id ON cli_runtimes(provider_id);
CREATE INDEX IF NOT EXISTS idx_cli_runtimes_process_id ON cli_runtimes(process_id);
CREATE INDEX IF NOT EXISTS idx_cli_runtimes_status ON cli_runtimes(status);

-- CLI logs (stdout/stderr from CLI processes)
CREATE TABLE IF NOT EXISTS cli_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runtime_id INTEGER NOT NULL,
    log_type TEXT NOT NULL CHECK(log_type IN ('stdout', 'stderr', 'system')),
    content TEXT NOT NULL,
    line_number INTEGER,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (runtime_id) REFERENCES cli_runtimes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cli_logs_runtime_id ON cli_logs(runtime_id);
CREATE INDEX IF NOT EXISTS idx_cli_logs_log_type ON cli_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_cli_logs_timestamp ON cli_logs(timestamp);

-- ============================================================================
-- CONTEXT FILES
-- ============================================================================

-- Context files (files uploaded or referenced in sessions)
CREATE TABLE IF NOT EXISTS context_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_path TEXT,
    stored_path TEXT NOT NULL,
    file_type TEXT,
    mime_type TEXT,
    size_bytes INTEGER NOT NULL,
    content_hash TEXT, -- SHA256 hash for deduplication
    is_indexed BOOLEAN NOT NULL DEFAULT 0,
    embedding_id TEXT, -- Reference to vector embedding if indexed
    metadata TEXT, -- JSON for additional file metadata
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_context_files_session_id ON context_files(session_id);
CREATE INDEX IF NOT EXISTS idx_context_files_user_id ON context_files(user_id);
CREATE INDEX IF NOT EXISTS idx_context_files_content_hash ON context_files(content_hash);
CREATE INDEX IF NOT EXISTS idx_context_files_is_indexed ON context_files(is_indexed);

-- ============================================================================
-- ORCHESTRATOR CONFIGURATION
-- ============================================================================

-- Orchestrator configuration
CREATE TABLE IF NOT EXISTS orchestrator_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    config_name TEXT NOT NULL,
    routing_strategy TEXT NOT NULL DEFAULT 'auto' CHECK(routing_strategy IN ('auto', 'manual', 'round_robin', 'least_cost', 'fastest')),
    default_provider_id INTEGER,
    fallback_provider_id INTEGER,
    max_retries INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 30,
    enable_caching BOOLEAN NOT NULL DEFAULT 1,
    enable_streaming BOOLEAN NOT NULL DEFAULT 1,
    config_data TEXT, -- JSON for additional orchestrator settings
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (default_provider_id) REFERENCES providers(id) ON DELETE SET NULL,
    FOREIGN KEY (fallback_provider_id) REFERENCES providers(id) ON DELETE SET NULL,
    UNIQUE(user_id, config_name)
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_config_user_id ON orchestrator_config(user_id);
CREATE INDEX IF NOT EXISTS idx_orchestrator_config_is_active ON orchestrator_config(is_active);

-- Routing history (tracks orchestrator routing decisions)
CREATE TABLE IF NOT EXISTS routing_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    message_id INTEGER,
    orchestrator_config_id INTEGER,
    selected_provider_id INTEGER,
    routing_reason TEXT,
    routing_strategy TEXT NOT NULL,
    latency_ms INTEGER,
    tokens_used INTEGER,
    cost_estimate REAL,
    was_fallback BOOLEAN NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL,
    FOREIGN KEY (orchestrator_config_id) REFERENCES orchestrator_config(id) ON DELETE SET NULL,
    FOREIGN KEY (selected_provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_routing_history_session_id ON routing_history(session_id);
CREATE INDEX IF NOT EXISTS idx_routing_history_message_id ON routing_history(message_id);
CREATE INDEX IF NOT EXISTS idx_routing_history_provider_id ON routing_history(selected_provider_id);
CREATE INDEX IF NOT EXISTS idx_routing_history_created_at ON routing_history(created_at);

-- ============================================================================
-- USER PREFERENCES
-- ============================================================================

-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    preference_key TEXT NOT NULL,
    preference_value TEXT NOT NULL,
    preference_type TEXT NOT NULL DEFAULT 'string' CHECK(preference_type IN ('string', 'number', 'boolean', 'json')),
    category TEXT, -- e.g., 'ui', 'notifications', 'privacy', 'performance'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, preference_key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_category ON user_preferences(category);

-- ============================================================================
-- USAGE ANALYTICS
-- ============================================================================

-- Usage analytics
CREATE TABLE IF NOT EXISTS usage_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_id INTEGER,
    provider_id INTEGER,
    event_type TEXT NOT NULL CHECK(event_type IN ('message_sent', 'message_received', 'session_created', 'session_completed', 'file_uploaded', 'command_executed', 'error_occurred')),
    event_category TEXT, -- e.g., 'chat', 'cli', 'file', 'system'
    tokens_used INTEGER DEFAULT 0,
    cost_estimate REAL DEFAULT 0.0,
    latency_ms INTEGER,
    metadata TEXT, -- JSON for additional event data
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_analytics_user_id ON usage_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_session_id ON usage_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_provider_id ON usage_analytics(provider_id);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_event_type ON usage_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_created_at ON usage_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_user_created ON usage_analytics(user_id, created_at DESC);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Trigger to update updated_at timestamp for users
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to update updated_at timestamp for workspaces
CREATE TRIGGER IF NOT EXISTS update_workspaces_timestamp 
AFTER UPDATE ON workspaces
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE workspaces SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to update updated_at timestamp for providers
CREATE TRIGGER IF NOT EXISTS update_providers_timestamp 
AFTER UPDATE ON providers
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE providers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to update updated_at timestamp for provider_credentials
CREATE TRIGGER IF NOT EXISTS update_provider_credentials_timestamp 
AFTER UPDATE ON provider_credentials
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE provider_credentials SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to update updated_at timestamp for sessions
CREATE TRIGGER IF NOT EXISTS update_sessions_timestamp 
AFTER UPDATE ON sessions
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to update updated_at timestamp for messages
CREATE TRIGGER IF NOT EXISTS update_messages_timestamp 
AFTER UPDATE ON messages
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE messages SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to update updated_at timestamp for orchestrator_config
CREATE TRIGGER IF NOT EXISTS update_orchestrator_config_timestamp 
AFTER UPDATE ON orchestrator_config
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE orchestrator_config SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to update updated_at timestamp for user_preferences
CREATE TRIGGER IF NOT EXISTS update_user_preferences_timestamp 
AFTER UPDATE ON user_preferences
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE user_preferences SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

