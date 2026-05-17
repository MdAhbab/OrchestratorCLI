"""
Utilities Package

This package contains utility modules for the IBM Bob backend:
- logger: Centralized logging configuration
- validators: Common validation functions
- exceptions: Custom exception classes and handlers
"""

from .logger import get_logger, setup_logging
from .validators import (
    validate_email,
    validate_file_type,
    validate_file_size,
    validate_url,
    validate_provider_id,
    validate_session_id,
)
from .exceptions import (
    DatabaseError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    ProviderError,
    QuotaExceededError,
    FileUploadError,
    SessionNotFoundError,
    register_exception_handlers,
)

__all__ = [
    # Logger
    "get_logger",
    "setup_logging",
    # Validators
    "validate_email",
    "validate_file_type",
    "validate_file_size",
    "validate_url",
    "validate_provider_id",
    "validate_session_id",
    # Exceptions
    "DatabaseError",
    "ValidationError",
    "AuthenticationError",
    "AuthorizationError",
    "ProviderError",
    "QuotaExceededError",
    "FileUploadError",
    "SessionNotFoundError",
    "register_exception_handlers",
]

# Made with Bob
