"""
Configuration management for AI CLI Orchestrator Backend
"""

from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # API Configuration
    api_title: str = "AI CLI Orchestrator - Downloader API"
    api_description: str = "Backend API for AI CLI Orchestrator Downloader Page"
    api_version: str = "1.0.0"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    
    # CORS Configuration
    allowed_origins: str = "http://localhost:8000,http://localhost:5173,http://127.0.0.1:8000,http://127.0.0.1:5173"
    allow_credentials: bool = True
    allowed_methods: str = "GET,POST,PUT,DELETE,OPTIONS"
    allowed_headers: str = "*"
    
    # Application Configuration
    app_version: str = "1.0.0"
    release_date: str = "2026-05-16"
    environment: str = "development"  # development, staging, production
    
    # Paths
    backend_dir: Path = Path(__file__).parent
    downloader_dir: Path = backend_dir.parent
    dist_dir: Path = downloader_dir / "dist"
    downloads_dir: Path = downloader_dir / "downloads"
    
    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 100
    rate_limit_period: int = 60  # seconds
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    # Security
    enable_docs: bool = True  # Disable in production
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
    
    @property
    def cors_origins(self) -> List[str]:
        """Parse CORS origins from comma-separated string"""
        return [origin.strip() for origin in self.allowed_origins.split(",")]
    
    @property
    def cors_methods(self) -> List[str]:
        """Parse CORS methods from comma-separated string"""
        return [method.strip() for method in self.allowed_methods.split(",")]
    
    @property
    def is_production(self) -> bool:
        """Check if running in production environment"""
        return self.environment.lower() == "production"
    
    @property
    def is_development(self) -> bool:
        """Check if running in development environment"""
        return self.environment.lower() == "development"


# Global settings instance
settings = Settings()

# Made with Bob
