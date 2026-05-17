"""
Centralized Logging Configuration

Provides structured logging with:
- Different log levels for development and production
- File and console logging handlers
- Request ID tracking for debugging
- JSON format option for production
- Log rotation configuration
"""

import logging
import logging.handlers
import sys
import json
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime
import contextvars

# Context variable for request ID tracking
request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_id", default=None
)


class RequestIdFilter(logging.Filter):
    """Add request ID to log records for request tracking."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Add request_id to the log record."""
        record.request_id = request_id_var.get() or "N/A"
        return True


class JSONFormatter(logging.Formatter):
    """Format log records as JSON for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        """Format the log record as JSON."""
        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "N/A"),
        }

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add extra fields
        if hasattr(record, "extra_data"):
            log_data["extra"] = record.extra_data

        # Add file location for debugging
        if record.pathname:
            log_data["file"] = {
                "path": record.pathname,
                "line": record.lineno,
                "function": record.funcName,
            }

        return json.dumps(log_data)


class ColoredFormatter(logging.Formatter):
    """Add colors to console output for better readability."""

    # ANSI color codes
    COLORS = {
        "DEBUG": "\033[36m",  # Cyan
        "INFO": "\033[32m",  # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",  # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        """Format with colors for console output."""
        # Add color to level name
        levelname = record.levelname
        if levelname in self.COLORS:
            record.levelname = (
                f"{self.COLORS[levelname]}{levelname}{self.RESET}"
            )

        # Format the message
        formatted = super().format(record)

        # Reset levelname for other handlers
        record.levelname = levelname

        return formatted


def setup_logging(
    level: str = "INFO",
    log_dir: Optional[Path] = None,
    json_format: bool = False,
    console_output: bool = True,
    file_output: bool = True,
    max_bytes: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 5,
) -> None:
    """
    Setup centralized logging configuration.

    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_dir: Directory for log files (default: ./logs)
        json_format: Use JSON format for structured logging
        console_output: Enable console output
        file_output: Enable file output
        max_bytes: Maximum size of each log file before rotation
        backup_count: Number of backup files to keep

    Example:
        >>> setup_logging(level="DEBUG", json_format=False)
        >>> logger = get_logger(__name__)
        >>> logger.info("Application started")
    """
    # Create log directory if needed
    if log_dir is None:
        log_dir = Path("logs")
    log_dir.mkdir(parents=True, exist_ok=True)

    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))

    # Remove existing handlers
    root_logger.handlers.clear()

    # Add request ID filter
    request_filter = RequestIdFilter()

    # Console handler
    if console_output:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(getattr(logging, level.upper()))

        if json_format:
            console_formatter = JSONFormatter()
        else:
            console_formatter = ColoredFormatter(
                fmt="%(asctime)s | %(levelname)-8s | %(request_id)s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )

        console_handler.setFormatter(console_formatter)
        console_handler.addFilter(request_filter)
        root_logger.addHandler(console_handler)

    # File handler with rotation
    if file_output:
        # Main log file
        file_handler = logging.handlers.RotatingFileHandler(
            log_dir / "app.log",
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.setLevel(getattr(logging, level.upper()))

        if json_format:
            file_formatter = JSONFormatter()
        else:
            file_formatter = logging.Formatter(
                fmt="%(asctime)s | %(levelname)-8s | %(request_id)s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )

        file_handler.setFormatter(file_formatter)
        file_handler.addFilter(request_filter)
        root_logger.addHandler(file_handler)

        # Error log file (only ERROR and CRITICAL)
        error_handler = logging.handlers.RotatingFileHandler(
            log_dir / "error.log",
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        error_handler.setLevel(logging.ERROR)

        if json_format:
            error_formatter = JSONFormatter()
        else:
            error_formatter = logging.Formatter(
                fmt="%(asctime)s | %(levelname)-8s | %(request_id)s | %(name)s | %(message)s\n%(pathname)s:%(lineno)d in %(funcName)s\n",
                datefmt="%Y-%m-%d %H:%M:%S",
            )

        error_handler.setFormatter(error_formatter)
        error_handler.addFilter(request_filter)
        root_logger.addHandler(error_handler)

    # Suppress noisy loggers
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the specified name.

    Args:
        name: Logger name (typically __name__)

    Returns:
        Logger instance

    Example:
        >>> logger = get_logger(__name__)
        >>> logger.info("Processing request")
    """
    return logging.getLogger(name)


def set_request_id(request_id: str) -> None:
    """
    Set the request ID for the current context.

    Args:
        request_id: Unique request identifier

    Example:
        >>> set_request_id("req-123-456")
    """
    request_id_var.set(request_id)


def get_request_id() -> Optional[str]:
    """
    Get the current request ID.

    Returns:
        Current request ID or None

    Example:
        >>> request_id = get_request_id()
    """
    return request_id_var.get()


def clear_request_id() -> None:
    """
    Clear the request ID from the current context.

    Example:
        >>> clear_request_id()
    """
    request_id_var.set(None)


class LoggerAdapter(logging.LoggerAdapter):
    """
    Logger adapter that adds extra context to log messages.

    Example:
        >>> logger = get_logger(__name__)
        >>> adapter = LoggerAdapter(logger, {"user_id": "123"})
        >>> adapter.info("User action")
    """

    def process(
        self, msg: str, kwargs: Dict[str, Any]
    ) -> tuple[str, Dict[str, Any]]:
        """Add extra context to log records."""
        if "extra" not in kwargs:
            kwargs["extra"] = {}

        # Add adapter's extra data
        kwargs["extra"]["extra_data"] = self.extra

        return msg, kwargs

# Made with Bob
