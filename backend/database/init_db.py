"""
Database initialization module for the AI Orchestrator platform.
Handles SQLite database creation, schema initialization, and default data seeding.
"""

import sqlite3
import os
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from contextlib import contextmanager
from datetime import datetime
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DatabaseInitializer:
    """Handles database initialization and management."""
    
    def __init__(self, db_path: str = "storage/data/orchestrator.db"):
        """
        Initialize the database initializer.
        
        Args:
            db_path: Path to the SQLite database file
        """
        self.db_path = db_path
        self.schema_path = Path(__file__).parent / "schema.sql"
        self.migrations_dir = Path(__file__).resolve().parents[2] / "migrations"
        
    def _ensure_data_directory(self) -> None:
        """Ensure the parent directory of the database file exists and is writable.

        Previously enforced that the DB must live under a folder named 'data/'.
        That constraint is now relaxed to support containerised or custom
        mount-point installs (e.g. /var/lib/orchestrator/orchestrator.db, a
        user-data dir on Windows). We still prefer the canonical
        <project>/storage/data/ location for new installs.
        """
        abs_path = Path(self.db_path).resolve()
        db_dir = abs_path.parent
        if db_dir and not db_dir.exists():
            db_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"Created database directory: {db_dir}")
    
    @contextmanager
    def get_connection(self):
        """
        Context manager for database connections.
        Ensures proper connection handling and cleanup.
        
        Yields:
            sqlite3.Connection: Database connection
        """
        conn = None
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row  # Enable column access by name
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            if conn:
                conn.close()
    
    def enable_wal_mode(self) -> None:
        """
        Enable Write-Ahead Logging (WAL) mode for better concurrency.
        WAL mode allows multiple readers and one writer to operate concurrently.
        """
        try:
            with self.get_connection() as conn:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("PRAGMA synchronous=NORMAL")
                conn.execute("PRAGMA foreign_keys=ON")
                logger.info("WAL mode enabled successfully")
        except Exception as e:
            logger.error(f"Failed to enable WAL mode: {e}")
            raise
    
    def create_tables(self) -> None:
        """
        Create all database tables from schema.sql file.
        """
        try:
            if not self.schema_path.exists():
                raise FileNotFoundError(f"Schema file not found: {self.schema_path}")
            
            with open(self.schema_path, 'r', encoding='utf-8') as f:
                schema_sql = f.read()
            
            with self.get_connection() as conn:
                conn.executescript(schema_sql)
                logger.info("Database tables created successfully")
        except Exception as e:
            logger.error(f"Failed to create tables: {e}")
            raise

    def apply_migrations(self) -> None:
        """
        Apply idempotent migrations for DBs that pre-date schema tweaks.
        Currently:
          - cli_runtimes: add provider_id column if missing.
          - cli_runtimes: relax session_id / process_id NOT NULL (rebuild table).
        """
        try:
            with self.get_connection() as conn:
                cur = conn.cursor()

                cur.execute("PRAGMA table_info(cli_runtimes)")
                cols = {row[1]: row for row in cur.fetchall()}

                # 1) provider_id column
                if "provider_id" not in cols:
                    logger.info("Migration: adding provider_id to cli_runtimes")
                    cur.execute("ALTER TABLE cli_runtimes ADD COLUMN provider_id INTEGER")
                    cur.execute(
                        "CREATE INDEX IF NOT EXISTS idx_cli_runtimes_provider_id "
                        "ON cli_runtimes(provider_id)"
                    )

                # 2) NOT NULL relaxation on session_id / process_id.
                cur.execute("PRAGMA table_info(cli_runtimes)")
                cols = {row[1]: row for row in cur.fetchall()}
                session_notnull = bool(cols.get("session_id", (None, None, None, 0))[3])
                process_notnull = bool(cols.get("process_id", (None, None, None, 0))[3])
                if session_notnull or process_notnull:
                    logger.info("Migration: relaxing NOT NULL on cli_runtimes.session_id/process_id")
                    cur.executescript(
                        """
                        PRAGMA foreign_keys=OFF;
                        BEGIN;
                        CREATE TABLE cli_runtimes_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            session_id INTEGER,
                            provider_id INTEGER,
                            process_id INTEGER,
                            command TEXT NOT NULL,
                            working_directory TEXT NOT NULL,
                            status TEXT NOT NULL DEFAULT 'running'
                                CHECK(status IN ('running','completed','failed','killed','paused','pending')),
                            exit_code INTEGER,
                            started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            completed_at TIMESTAMP,
                            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                            FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
                        );
                        INSERT INTO cli_runtimes_new
                            (id, session_id, provider_id, process_id, command,
                             working_directory, status, exit_code, started_at, completed_at)
                        SELECT id, session_id, provider_id, process_id, command,
                               working_directory, status, exit_code, started_at, completed_at
                        FROM cli_runtimes;
                        DROP TABLE cli_runtimes;
                        ALTER TABLE cli_runtimes_new RENAME TO cli_runtimes;
                        CREATE INDEX IF NOT EXISTS idx_cli_runtimes_session_id
                            ON cli_runtimes(session_id);
                        CREATE INDEX IF NOT EXISTS idx_cli_runtimes_provider_id
                            ON cli_runtimes(provider_id);
                        CREATE INDEX IF NOT EXISTS idx_cli_runtimes_process_id
                            ON cli_runtimes(process_id);
                        CREATE INDEX IF NOT EXISTS idx_cli_runtimes_status
                            ON cli_runtimes(status);
                        COMMIT;
                        PRAGMA foreign_keys=ON;
                        """
                    )
                cur.execute("PRAGMA table_info(providers)")
                prov_cols = {row[1]: row for row in cur.fetchall()}
                if "cost_per_token" not in prov_cols:
                    logger.info("Migration: adding cost_per_token to providers")
                    cur.execute("ALTER TABLE providers ADD COLUMN cost_per_token REAL DEFAULT 0.0")

                conn.commit()
                logger.info("Migrations applied successfully")
        except Exception as e:
            logger.error(f"Failed to apply migrations: {e}")
            raise

    def apply_sql_migrations(self) -> None:
        """Run versioned SQL files from /migrations once each (tracks schema_migrations)."""
        mig_dir = self.migrations_dir
        if not mig_dir.is_dir():
            return
        files = sorted(mig_dir.glob("*.sql"))
        if not files:
            return
        try:
            with self.get_connection() as conn:
                cur = conn.cursor()
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL UNIQUE,
                        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                for fp in files:
                    name = fp.name
                    cur.execute(
                        "SELECT 1 FROM schema_migrations WHERE name = ?",
                        (name,),
                    )
                    if cur.fetchone():
                        continue
                    sql = fp.read_text(encoding="utf-8")
                    cur.executescript(sql)
                    cur.execute(
                        "INSERT INTO schema_migrations (name) VALUES (?)",
                        (name,),
                    )
                    logger.info(f"Applied SQL migration: {name}")
                conn.commit()
        except Exception as e:
            logger.error(f"Failed SQL migrations: {e}")
            raise
    
    def seed_default_providers(self) -> None:
        """
        Seed the database with default provider configurations.
        """
        default_providers = [
            {
                'name': 'openai',
                'display_name': 'OpenAI',
                'provider_type': 'llm',
                'base_url': 'https://api.openai.com/v1',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 1,
                'max_tokens': 128000,
                'default_model': 'gpt-4-turbo-preview',
                'config_schema': json.dumps({
                    'api_key': {'type': 'string', 'required': True},
                    'organization': {'type': 'string', 'required': False}
                })
            },
            {
                'name': 'anthropic',
                'display_name': 'Anthropic Claude',
                'provider_type': 'llm',
                'base_url': 'https://api.anthropic.com/v1',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 1,
                'max_tokens': 200000,
                'default_model': 'claude-3-opus-20240229',
                'config_schema': json.dumps({
                    'api_key': {'type': 'string', 'required': True}
                })
            },
            {
                'name': 'google',
                'display_name': 'Google Gemini',
                'provider_type': 'llm',
                'base_url': 'https://generativelanguage.googleapis.com/v1',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 1,
                'max_tokens': 1000000,
                'default_model': 'gemini-pro',
                'config_schema': json.dumps({
                    'api_key': {'type': 'string', 'required': True}
                })
            },
            {
                'name': 'ollama',
                'display_name': 'Ollama (Local)',
                'provider_type': 'llm',
                'base_url': 'http://localhost:11434',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 0,
                'max_tokens': 32768,
                'default_model': 'llama2',
                'config_schema': json.dumps({
                    'base_url': {'type': 'string', 'required': False}
                })
            },
            {
                'name': 'openai-embedding',
                'display_name': 'OpenAI Embeddings',
                'provider_type': 'embedding',
                'base_url': 'https://api.openai.com/v1',
                'is_enabled': 0,
                'supports_streaming': 0,
                'supports_function_calling': 0,
                'default_model': 'text-embedding-3-large',
                'config_schema': json.dumps({
                    'api_key': {'type': 'string', 'required': True}
                })
            },
            {
                'name': 'openai-tts',
                'display_name': 'OpenAI Text-to-Speech',
                'provider_type': 'tts',
                'base_url': 'https://api.openai.com/v1',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 0,
                'default_model': 'tts-1',
                'config_schema': json.dumps({
                    'api_key': {'type': 'string', 'required': True}
                })
            },
            {
                'name': 'openai-stt',
                'display_name': 'OpenAI Speech-to-Text',
                'provider_type': 'stt',
                'base_url': 'https://api.openai.com/v1',
                'is_enabled': 0,
                'supports_streaming': 0,
                'supports_function_calling': 0,
                'default_model': 'whisper-1',
                'config_schema': json.dumps({
                    'api_key': {'type': 'string', 'required': True}
                })
            },
            {
                'name': 'grok',
                'display_name': 'Grok',
                'provider_type': 'llm',
                'base_url': 'https://api.x.ai/v1',
                'is_enabled': 1,
                'supports_streaming': 1,
                'supports_function_calling': 1,
                'max_tokens': 131072,
                'default_model': 'grok-3',
                'config_schema': json.dumps({
                    'role': 'orchestrator',
                    'api_key': {'type': 'string', 'required': True},
                    'priority': {'type': 'number', 'default': 10},
                })
            },
            {
                'name': 'gemini-api',
                'display_name': 'Gemini',
                'provider_type': 'llm',
                'base_url': 'https://generativelanguage.googleapis.com/v1beta',
                'is_enabled': 1,
                'supports_streaming': 1,
                'supports_function_calling': 1,
                'max_tokens': 1048576,
                'default_model': 'gemini-2.5-pro',
                'config_schema': json.dumps({
                    'role': 'orchestrator',
                    'api_key': {'type': 'string', 'required': True},
                    'priority': {'type': 'number', 'default': 20},
                })
            },
            {
                'name': 'deepseek-api',
                'display_name': 'DeepSeek',
                'provider_type': 'llm',
                'base_url': 'https://api.deepseek.com/v1',
                'is_enabled': 1,
                'supports_streaming': 1,
                'supports_function_calling': 0,
                'max_tokens': 65536,
                'default_model': 'deepseek-chat',
                'config_schema': json.dumps({
                    'role': 'orchestrator',
                    'api_key': {'type': 'string', 'required': True},
                    'priority': {'type': 'number', 'default': 30},
                })
            },
            {
                'name': 'claude',
                'display_name': 'Claude Code',
                'provider_type': 'llm',
                'base_url': 'https://api.anthropic.com/v1',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 1,
                'max_tokens': 200000,
                'default_model': 'claude-3-5-sonnet-latest',
                'config_schema': json.dumps({'api_key': {'type': 'string', 'required': True}})
            },
            {
                'name': 'gemini',
                'display_name': 'Gemini CLI',
                'provider_type': 'llm',
                'base_url': 'https://generativelanguage.googleapis.com/v1',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 1,
                'max_tokens': 1000000,
                'default_model': 'gemini-1.5-flash',
                'config_schema': json.dumps({'api_key': {'type': 'string', 'required': True}})
            },
            {
                'name': 'codex',
                'display_name': 'Codex CLI',
                'provider_type': 'llm',
                'base_url': 'https://api.openai.com/v1',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 1,
                'max_tokens': 128000,
                'default_model': 'gpt-4o-mini',
                'config_schema': json.dumps({'api_key': {'type': 'string', 'required': True}})
            },
            {
                'name': 'copilot',
                'display_name': 'Copilot CLI',
                'provider_type': 'llm',
                'base_url': 'https://api.githubcopilot.com',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 0,
                'max_tokens': 32000,
                'default_model': 'gpt-4o',
                'config_schema': json.dumps({'token': {'type': 'string', 'required': True}})
            },
            {
                'name': 'deepseek',
                'display_name': 'DeepSeek',
                'provider_type': 'llm',
                'base_url': 'https://api.deepseek.com/v1',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 1,
                'max_tokens': 64000,
                'default_model': 'deepseek-coder',
                'config_schema': json.dumps({'api_key': {'type': 'string', 'required': True}})
            },
            {
                'name': 'kimi',
                'display_name': 'Kimi Code',
                'provider_type': 'llm',
                'base_url': 'https://api.moonshot.cn/v1',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 0,
                'max_tokens': 128000,
                'default_model': 'moonshot-v1-8k',
                'config_schema': json.dumps({'api_key': {'type': 'string', 'required': True}})
            },
            {
                'name': 'cline',
                'display_name': 'Cline CLI',
                'provider_type': 'llm',
                'base_url': '',
                'is_enabled': 0,
                'supports_streaming': 1,
                'supports_function_calling': 0,
                'max_tokens': 128000,
                'default_model': 'claude-3-5-sonnet-latest',
                'config_schema': json.dumps({'api_key': {'type': 'string', 'required': True}})
            }
        ]
        
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                for provider in default_providers:
                    # Check if provider already exists
                    cursor.execute(
                        "SELECT id FROM providers WHERE name = ?",
                        (provider['name'],)
                    )
                    
                    if cursor.fetchone() is None:
                        # Determine cost_per_token based on name (BIZ-08)
                        cost_map = {
                            'ollama': 0.0,
                            'gemini': 0.000075,
                            'google': 0.000075,
                            'deepseek': 0.00015,
                            'kimi': 0.0003,
                            'openai': 0.0015,
                            'grok': 0.002,
                            'anthropic': 0.003,
                            'claude': 0.003,
                        }
                        cost_val = 0.001  # Default fallback cost
                        for key, val in cost_map.items():
                            if key in provider['name'].lower():
                                cost_val = val
                                break

                        cursor.execute("""
                            INSERT INTO providers (
                                name, display_name, provider_type, base_url,
                                is_enabled, supports_streaming, supports_function_calling,
                                max_tokens, default_model, config_schema, cost_per_token
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            provider['name'],
                            provider['display_name'],
                            provider['provider_type'],
                            provider['base_url'],
                            provider['is_enabled'],
                            provider['supports_streaming'],
                            provider['supports_function_calling'],
                            provider.get('max_tokens'),
                            provider['default_model'],
                            provider['config_schema'],
                            cost_val
                        ))
                        logger.info(f"Seeded provider: {provider['display_name']} with cost {cost_val}")
                
                logger.info("Default providers seeded successfully")
        except Exception as e:
            logger.error(f"Failed to seed default providers: {e}")
            raise
    
    def seed_default_user(self) -> int:
        """
        Create a default user for initial setup.
        
        Returns:
            int: The ID of the created user
            
        Raises:
            ValueError: If user creation fails
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Check if default user exists
                cursor.execute("SELECT id FROM users WHERE username = ?", ('default',))
                existing_user = cursor.fetchone()
                
                if existing_user:
                    user_id = existing_user[0]
                    if not isinstance(user_id, int):
                        raise ValueError(f"Invalid user ID type: {type(user_id)}")
                    logger.info("Default user already exists")
                    return user_id
                
                # Create default user
                cursor.execute("""
                    INSERT INTO users (username, full_name, is_active)
                    VALUES (?, ?, ?)
                """, ('default', 'Default User', 1))
                
                user_id = cursor.lastrowid
                if user_id is None or not isinstance(user_id, int):
                    raise ValueError("Failed to create user: no valid ID returned")
                
                logger.info(f"Created default user with ID: {user_id}")
                
                return user_id
        except Exception as e:
            logger.error(f"Failed to create default user: {e}")
            raise
    
    def seed_default_workspace(self, user_id: int) -> int:
        """
        Ensure the default user has at least one workspace pointed at the project root.
        Returns the workspace id (existing or newly created).
        """
        try:
            project_root = str(Path(__file__).resolve().parents[2])
            with self.get_connection() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT id FROM workspaces WHERE user_id = ? ORDER BY id LIMIT 1",
                    (user_id,)
                )
                row = cur.fetchone()
                if row:
                    return int(row[0])
                cur.execute(
                    """
                    INSERT INTO workspaces (user_id, name, description, path, is_active)
                    VALUES (?, ?, ?, ?, 1)
                    """,
                    (user_id, "workspace", "Default workspace", project_root)
                )
                wid = cur.lastrowid
                logger.info(f"Created default workspace with id={wid}")
                return int(wid)
        except Exception as e:
            logger.error(f"Failed to seed default workspace: {e}")
            raise

    def seed_default_orchestrator_config(self, user_id: int) -> None:
        """Ensure the default user has an active orchestrator_config row."""
        try:
            with self.get_connection() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT id FROM orchestrator_config WHERE user_id = ? AND is_active = 1",
                    (user_id,)
                )
                if cur.fetchone():
                    return
                # Prefer Grok as default orchestrator LLM if configured.
                cur.execute("SELECT id FROM providers WHERE name = 'grok' LIMIT 1")
                grok_row = cur.fetchone()
                default_provider_id = int(grok_row[0]) if grok_row else None
                if default_provider_id is None:
                    cur.execute("SELECT id FROM providers WHERE name = 'gemini-api' LIMIT 1")
                    gem_row = cur.fetchone()
                    default_provider_id = int(gem_row[0]) if gem_row else None
                cur.execute(
                    """
                    INSERT INTO orchestrator_config (
                        user_id, config_name, routing_strategy,
                        default_provider_id, max_retries, timeout_seconds,
                        enable_caching, enable_streaming, is_active
                    ) VALUES (?, ?, 'auto', ?, 3, 30, 1, 1, 1)
                    """,
                    (user_id, "Default Configuration", default_provider_id)
                )
                logger.info("Created default orchestrator config")
        except Exception as e:
            logger.error(f"Failed to seed default orchestrator config: {e}")
            raise

    def seed_default_preferences(self, user_id: int) -> None:
        """
        Seed default user preferences.
        
        Args:
            user_id: The user ID to create preferences for
        """
        default_preferences = [
            ('theme', 'dark', 'string', 'ui'),
            ('language', 'en', 'string', 'ui'),
            ('notifications_enabled', 'true', 'boolean', 'notifications'),
            ('auto_save', 'true', 'boolean', 'performance'),
            ('streaming_enabled', 'true', 'boolean', 'performance'),
            ('max_context_files', '10', 'number', 'performance'),
            ('default_model', 'gpt-4-turbo-preview', 'string', 'performance')
        ]
        
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                for key, value, pref_type, category in default_preferences:
                    cursor.execute("""
                        INSERT OR IGNORE INTO user_preferences 
                        (user_id, preference_key, preference_value, preference_type, category)
                        VALUES (?, ?, ?, ?, ?)
                    """, (user_id, key, value, pref_type, category))
                
                logger.info(f"Seeded default preferences for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to seed default preferences: {e}")
            raise
    
    def initialize_database(self, force: bool = False) -> None:
        """
        Initialize the complete database with schema and default data.
        
        Args:
            force: If True, recreate the database even if it exists
        """
        try:
            # Ensure data directory exists (this can rewrite self.db_path)
            self._ensure_data_directory()

            # Check if database exists
            db_exists = os.path.exists(self.db_path)
            
            if db_exists and not force:
                logger.info(f"Database already exists at {self.db_path} — running migrations + idempotent seeds")
                self.create_tables()       # CREATE TABLE IF NOT EXISTS
                self.apply_migrations()
                self.apply_sql_migrations()
                self.enable_wal_mode()
                self.seed_default_providers()
                user_id = self.seed_default_user()
                self.seed_default_workspace(user_id)
                self.seed_default_orchestrator_config(user_id)
                self.seed_default_preferences(user_id)
                return
            
            if db_exists and force:
                logger.warning(f"Removing existing database at {self.db_path}")
                os.remove(self.db_path)
            
            # Create tables
            logger.info("Creating database tables...")
            self.create_tables()
            
            # Apply migrations (idempotent)
            logger.info("Applying migrations...")
            self.apply_migrations()
            self.apply_sql_migrations()
            
            # Enable WAL mode
            logger.info("Enabling WAL mode...")
            self.enable_wal_mode()
            
            # Seed default data
            logger.info("Seeding default providers...")
            self.seed_default_providers()
            
            logger.info("Creating default user...")
            user_id = self.seed_default_user()
            
            logger.info("Seeding default workspace...")
            self.seed_default_workspace(user_id)
            
            logger.info("Seeding default orchestrator config...")
            self.seed_default_orchestrator_config(user_id)
            
            logger.info("Seeding default preferences...")
            self.seed_default_preferences(user_id)
            
            logger.info(f"Database initialized successfully at {self.db_path}")
            
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise
    
    def verify_database(self) -> Dict[str, Any]:
        """
        Verify database integrity and return statistics.
        
        Returns:
            Dict containing database statistics
            
        Raises:
            Exception: If verification fails
        """
        # Define allowed table names to prevent SQL injection
        ALLOWED_TABLES: Tuple[str, ...] = (
            'users', 'workspaces', 'providers', 'provider_credentials',
            'sessions', 'session_agents', 'messages', 'session_artifacts',
            'cli_runtimes', 'cli_logs', 'context_files',
            'orchestrator_config', 'user_preferences', 'usage_analytics',
            'routing_history', 'schema_migrations'
        )
        
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                stats: Dict[str, Any] = {}
                
                # Get table counts - using parameterized queries with validated table names
                for table in ALLOWED_TABLES:
                    # Validate table name is alphanumeric and underscore only
                    if not table.replace('_', '').isalnum():
                        logger.warning(f"Skipping invalid table name: {table}")
                        continue
                    
                    # Safe to use table name after validation
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    result = cursor.fetchone()
                    if result:
                        stats[table] = result[0]
                
                # Check WAL mode
                cursor.execute("PRAGMA journal_mode")
                result = cursor.fetchone()
                stats['journal_mode'] = result[0] if result else 'unknown'
                
                # Check foreign keys
                cursor.execute("PRAGMA foreign_keys")
                result = cursor.fetchone()
                stats['foreign_keys_enabled'] = bool(result[0]) if result else False
                
                logger.info("Database verification completed")
                return stats
                
        except Exception as e:
            logger.error(f"Failed to verify database: {e}")
            raise


def init_database(db_path: str = "storage/data/orchestrator.db", force: bool = False) -> DatabaseInitializer:
    """
    Convenience function to initialize the database.
    
    Args:
        db_path: Path to the SQLite database file
        force: If True, recreate the database even if it exists
        
    Returns:
        DatabaseInitializer instance
    """
    initializer = DatabaseInitializer(db_path)
    initializer.initialize_database(force=force)
    return initializer


if __name__ == "__main__":
    """
    Run database initialization when executed directly.
    """
    import argparse
    
    parser = argparse.ArgumentParser(description="Initialize AI Orchestrator database")
    parser.add_argument(
        "--db-path",
        default="storage/data/orchestrator.db",
        help="Path to the SQLite database file"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force recreation of the database"
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Verify database after initialization"
    )
    
    args = parser.parse_args()
    
    # Initialize database
    initializer = init_database(db_path=args.db_path, force=args.force)
    
    # Verify if requested
    if args.verify:
        stats = initializer.verify_database()
        print("\nDatabase Statistics:")
        print("-" * 50)
        for key, value in stats.items():
            print(f"{key}: {value}")

