"""
Application configuration for IBM Bob Backend.
Uses Pydantic Settings for environment variable management.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Find and load the .env file securely using python-dotenv
config_dir = Path(__file__).parent.resolve()
env_path = config_dir / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    # Try parent directory if running from within backend/
    root_env_path = config_dir.parent / ".env"
    if root_env_path.exists():
        load_dotenv(dotenv_path=root_env_path)
    else:
        # Fallback to default behavior
        load_dotenv()

_extra_dotenv = os.environ.get("DOTENV_PATH") or os.environ.get("BOB_DOTENV_PATH")
if _extra_dotenv and Path(_extra_dotenv).is_file():
    load_dotenv(dotenv_path=_extra_dotenv, override=True)

from pydantic_settings import BaseSettings, SettingsConfigDict, NoDecode
from pydantic import field_validator, ValidationError
from typing import List, Optional, Annotated, Any
import secrets


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application
    app_name: str = "IBM Bob Backend"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # API
    api_prefix: str = "/api"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    
    # CORS
    cors_origins: Annotated[List[str], NoDecode] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]
    cors_allow_credentials: bool = True
    cors_allow_methods: Annotated[List[str], NoDecode] = ["*"]
    cors_allow_headers: Annotated[List[str], NoDecode] = ["*"]

    @field_validator('cors_origins', 'cors_allow_methods', 'cors_allow_headers', mode='before')
    @classmethod
    def parse_comma_separated_list(cls, v: Any) -> List[str]:
        """Parse comma-separated lists from environment variables."""
        if isinstance(v, str):
            return [x.strip() for x in v.split(',') if x.strip()]
        return v
    
    # Database
    database_url: str = "sqlite+aiosqlite:///./data/bob.db"
    database_path: Path = Path("./data/bob.db")
    database_echo: bool = False
    
    # File Storage
    upload_dir: Path = Path("./uploads")
    context_files_dir: Path = Path("./uploads/context")
    artifacts_dir: Path = Path("./uploads/artifacts")
    max_upload_size: int = 10 * 1024 * 1024  # 10MB
    allowed_file_types: List[str] = [
        ".txt", ".md", ".py", ".js", ".ts", ".json", ".yaml", ".yml",
        ".html", ".css", ".xml", ".csv", ".pdf", ".docx", ".png", ".jpg", ".jpeg"
    ]
    
    # Security
    secret_key: str = ""  # Must be set via environment variable
    encryption_key: Optional[str] = None  # For encrypting provider credentials
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    
    @field_validator('secret_key')
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        """Validate and generate secret key if not provided."""
        if not v or v == "your-secret-key-change-in-production":
            # Generate a secure random key
            return secrets.token_urlsafe(32)
        if len(v) < 32:
            raise ValueError("secret_key must be at least 32 characters long")
        return v
    
    @field_validator('max_upload_size')
    @classmethod
    def validate_max_upload_size(cls, v: int) -> int:
        """Validate max upload size."""
        if v <= 0:
            raise ValueError("max_upload_size must be positive")
        if v > 100 * 1024 * 1024:  # 100MB
            raise ValueError("max_upload_size cannot exceed 100MB")
        return v
    
    @field_validator('max_retries')
    @classmethod
    def validate_max_retries(cls, v: int) -> int:
        """Validate max retries."""
        if v < 0 or v > 10:
            raise ValueError("max_retries must be between 0 and 10")
        return v
    
    # IBM Watson Configuration
    stt_api_key: Optional[str] = None
    stt_url: Optional[str] = None
    watsonx_api_key: Optional[str] = None
    watsonx_project_id: Optional[str] = None
    
    # Orchestrator
    default_routing_strategy: str = "auto"
    max_retries: int = 3
    timeout_seconds: int = 30
    enable_caching: bool = True
    enable_streaming: bool = True
    
    # CLI Runtime
    max_concurrent_processes: int = 5
    process_timeout_seconds: int = 300
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        env_list_separator=","
    )
    
    def model_post_init(self, __context) -> None:
        """Post-initialization hook to create directories."""
        ud = os.environ.get("IBMBOB_USER_DATA", "").strip()
        if ud:
            root = Path(ud)
            object.__setattr__(self, "upload_dir", root / "uploads")
            object.__setattr__(self, "context_files_dir", root / "uploads" / "context")
            object.__setattr__(self, "artifacts_dir", root / "uploads" / "artifacts")
        if "database_path" not in self.model_fields_set:
            derived_database_path = self._parse_sqlite_path_from_url(self.database_url)
            if derived_database_path is not None:
                self.database_path = derived_database_path
        self._create_directories()

    @staticmethod
    def _parse_sqlite_path_from_url(database_url: str) -> Optional[Path]:
        """Extract a filesystem path from a SQLite database URL."""
        for prefix in ("sqlite+aiosqlite:///", "sqlite:///"):
            if database_url.startswith(prefix):
                raw_path = database_url[len(prefix):]
                if raw_path and raw_path != ":memory:":
                    return Path(raw_path)
        return None
    
    def _create_directories(self) -> None:
        """Create necessary directories if they don't exist."""
        try:
            self.database_path.parent.mkdir(parents=True, exist_ok=True)
            self.upload_dir.mkdir(parents=True, exist_ok=True)
            self.context_files_dir.mkdir(parents=True, exist_ok=True)
            self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            # Log error but don't fail initialization
            import logging
            logging.warning(f"Failed to create directories: {e}")


# Global settings instance
settings = Settings()

# Made with Bob
