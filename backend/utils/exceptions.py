"""
Custom Exception Classes and Handlers

Provides:
- Custom exception classes for different error types
- Exception handlers for FastAPI
- Standardized error response formatting
"""

from typing import Any, Dict, Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


# ============================================================================
# Custom Exception Classes
# ============================================================================


class AppException(Exception):
    """Base exception class for application errors."""

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize application exception.

        Args:
            message: Error message
            status_code: HTTP status code
            details: Additional error details
        """
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class DatabaseError(AppException):
    """Raised when database operations fail."""

    def __init__(
        self,
        message: str = "Database operation failed",
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize database error.

        Args:
            message: Error message
            details: Additional error details

        Example:
            >>> raise DatabaseError("Failed to connect to database")
        """
        super().__init__(
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details,
        )


class ValidationError(AppException):
    """Raised when input validation fails."""

    def __init__(
        self,
        message: str = "Validation failed",
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize validation error.

        Args:
            message: Error message
            details: Additional error details (e.g., field errors)

        Example:
            >>> raise ValidationError("Invalid email format", {"field": "email"})
        """
        super().__init__(
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


class AuthenticationError(AppException):
    """Raised when authentication fails."""

    def __init__(
        self,
        message: str = "Authentication failed",
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize authentication error.

        Args:
            message: Error message
            details: Additional error details

        Example:
            >>> raise AuthenticationError("Invalid API key")
        """
        super().__init__(
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            details=details,
        )


class AuthorizationError(AppException):
    """Raised when user lacks required permissions."""

    def __init__(
        self,
        message: str = "Insufficient permissions",
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize authorization error.

        Args:
            message: Error message
            details: Additional error details

        Example:
            >>> raise AuthorizationError("Access denied to this resource")
        """
        super().__init__(
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
            details=details,
        )


class ProviderError(AppException):
    """Raised when AI provider operations fail."""

    def __init__(
        self,
        message: str = "Provider operation failed",
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize provider error.

        Args:
            message: Error message
            details: Additional error details (e.g., provider name, error code)

        Example:
            >>> raise ProviderError("OpenAI API error", {"provider": "openai", "code": "rate_limit"})
        """
        super().__init__(
            message=message,
            status_code=status.HTTP_502_BAD_GATEWAY,
            details=details,
        )


class ServiceError(AppException):
    """Raised when an external service operation fails."""

    def __init__(
        self,
        message: str = "Service operation failed",
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            message=message,
            status_code=status.HTTP_502_BAD_GATEWAY,
            details=details,
        )


class QuotaExceededError(AppException):
    """Raised when usage quota is exceeded."""

    def __init__(
        self,
        message: str = "Quota exceeded",
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize quota exceeded error.

        Args:
            message: Error message
            details: Additional error details (e.g., limit, current usage)

        Example:
            >>> raise QuotaExceededError("Daily API limit reached", {"limit": 1000, "used": 1000})
        """
        super().__init__(
            message=message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details=details,
        )


class FileUploadError(AppException):
    """Raised when file upload operations fail."""

    def __init__(
        self,
        message: str = "File upload failed",
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize file upload error.

        Args:
            message: Error message
            details: Additional error details (e.g., filename, size)

        Example:
            >>> raise FileUploadError("File too large", {"max_size": "10MB", "actual_size": "15MB"})
        """
        super().__init__(
            message=message,
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            details=details,
        )


class SessionNotFoundError(AppException):
    """Raised when a session is not found."""

    def __init__(
        self,
        message: str = "Session not found",
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize session not found error.

        Args:
            message: Error message
            details: Additional error details (e.g., session_id)

        Example:
            >>> raise SessionNotFoundError("Session does not exist", {"session_id": "sess_123"})
        """
        super().__init__(
            message=message,
            status_code=status.HTTP_404_NOT_FOUND,
            details=details,
        )


class ResourceNotFoundError(AppException):
    """Raised when a requested resource is not found."""

    def __init__(
        self,
        message: str = "Resource not found",
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize resource not found error.

        Args:
            message: Error message
            details: Additional error details

        Example:
            >>> raise ResourceNotFoundError("Provider not found", {"provider_id": "unknown"})
        """
        super().__init__(
            message=message,
            status_code=status.HTTP_404_NOT_FOUND,
            details=details,
        )


class ConfigurationError(AppException):
    """Raised when configuration is invalid or missing."""

    def __init__(
        self,
        message: str = "Configuration error",
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize configuration error.

        Args:
            message: Error message
            details: Additional error details

        Example:
            >>> raise ConfigurationError("Missing required environment variable", {"var": "DATABASE_URL"})
        """
        super().__init__(
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details,
        )


# ============================================================================
# Error Response Formatting
# ============================================================================


def format_error_response(
    message: str,
    status_code: int,
    details: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Format error response in a standardized way.

    Args:
        message: Error message
        status_code: HTTP status code
        details: Additional error details
        request_id: Request ID for tracking

    Returns:
        Formatted error response dictionary

    Example:
        >>> format_error_response("Not found", 404, {"resource": "user"}, "req-123")
        {'error': {'message': 'Not found', 'status_code': 404, 'details': {'resource': 'user'}, 'request_id': 'req-123'}}
    """
    error_response = {
        "error": {
            "message": message,
            "status_code": status_code,
        }
    }

    if details:
        error_response["error"]["details"] = details

    if request_id:
        error_response["error"]["request_id"] = request_id

    return error_response


# ============================================================================
# Exception Handlers
# ============================================================================


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """
    Handle custom application exceptions.

    Args:
        request: FastAPI request object
        exc: Application exception

    Returns:
        JSON response with error details
    """
    # Get request ID if available
    request_id = getattr(request.state, "request_id", None)

    return JSONResponse(
        status_code=exc.status_code,
        content=format_error_response(
            message=exc.message,
            status_code=exc.status_code,
            details=exc.details,
            request_id=request_id,
        ),
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Handle FastAPI validation errors.

    Args:
        request: FastAPI request object
        exc: Validation error

    Returns:
        JSON response with validation error details
    """
    # Get request ID if available
    request_id = getattr(request.state, "request_id", None)

    # Format validation errors
    errors = []
    for error in exc.errors():
        errors.append(
            {
                "field": ".".join(str(loc) for loc in error["loc"]),
                "message": error["msg"],
                "type": error["type"],
            }
        )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=format_error_response(
            message="Validation error",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"errors": errors},
            request_id=request_id,
        ),
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """
    Handle HTTP exceptions.

    Args:
        request: FastAPI request object
        exc: HTTP exception

    Returns:
        JSON response with error details
    """
    # Get request ID if available
    request_id = getattr(request.state, "request_id", None)

    return JSONResponse(
        status_code=exc.status_code,
        content=format_error_response(
            message=exc.detail,
            status_code=exc.status_code,
            request_id=request_id,
        ),
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handle unexpected exceptions.

    Args:
        request: FastAPI request object
        exc: Exception

    Returns:
        JSON response with generic error message
    """
    # Get request ID if available
    request_id = getattr(request.state, "request_id", None)

    # Log the exception (logger should be configured)
    import logging

    logger = logging.getLogger(__name__)
    logger.exception(f"Unhandled exception: {exc}")

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=format_error_response(
            message="Internal server error",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details={"type": type(exc).__name__},
            request_id=request_id,
        ),
    )


# ============================================================================
# Registration Function
# ============================================================================


def register_exception_handlers(app) -> None:
    """
    Register all exception handlers with FastAPI app.

    Args:
        app: FastAPI application instance

    Example:
        >>> from fastapi import FastAPI
        >>> app = FastAPI()
        >>> register_exception_handlers(app)
    """
    # Custom application exceptions
    app.add_exception_handler(AppException, app_exception_handler)

    # FastAPI validation errors
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    # HTTP exceptions
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)

    # Catch-all for unexpected exceptions
    app.add_exception_handler(Exception, general_exception_handler)

# Made with Bob
