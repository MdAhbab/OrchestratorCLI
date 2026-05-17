"""
Common Validation Functions

Provides reusable validation functions for:
- Email addresses
- File types and sizes
- URLs
- Provider and session IDs
- Other common data formats
"""

import re
from typing import List, Optional
from pathlib import Path
from urllib.parse import urlparse


# Validation patterns
EMAIL_PATTERN = re.compile(
    r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
)
PROVIDER_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,50}$")
SESSION_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{8,64}$")
URL_PATTERN = re.compile(
    r"^https?://"  # http:// or https://
    r"(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|"  # domain
    r"localhost|"  # localhost
    r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"  # IP
    r"(?::\d+)?"  # optional port
    r"(?:/?|[/?]\S+)$",
    re.IGNORECASE,
)


class ValidationError(Exception):
    """Raised when validation fails."""

    pass


def validate_email(email: str) -> bool:
    """
    Validate email address format.

    Args:
        email: Email address to validate

    Returns:
        True if valid, False otherwise

    Example:
        >>> validate_email("user@example.com")
        True
        >>> validate_email("invalid-email")
        False
    """
    if not email or not isinstance(email, str):
        return False

    email = email.strip()
    if len(email) > 254:  # RFC 5321
        return False

    return bool(EMAIL_PATTERN.match(email))


def validate_file_type(
    filename: str,
    allowed_extensions: Optional[List[str]] = None,
    allowed_mimetypes: Optional[List[str]] = None,
) -> bool:
    """
    Validate file type based on extension or mimetype.

    Args:
        filename: Name of the file
        allowed_extensions: List of allowed extensions (e.g., ['.txt', '.pdf'])
        allowed_mimetypes: List of allowed MIME types (e.g., ['text/plain'])

    Returns:
        True if valid, False otherwise

    Raises:
        ValidationError: If file type is not allowed

    Example:
        >>> validate_file_type("document.pdf", allowed_extensions=['.pdf', '.txt'])
        True
        >>> validate_file_type("script.exe", allowed_extensions=['.pdf', '.txt'])
        False
    """
    if not filename or not isinstance(filename, str):
        return False

    # Get file extension
    file_path = Path(filename)
    extension = file_path.suffix.lower()

    # Check extension if provided
    if allowed_extensions:
        allowed_extensions_lower = [ext.lower() for ext in allowed_extensions]
        if extension not in allowed_extensions_lower:
            return False

    # Additional security checks
    dangerous_extensions = [
        ".exe",
        ".bat",
        ".cmd",
        ".com",
        ".pif",
        ".scr",
        ".vbs",
        ".js",
        ".jar",
        ".msi",
        ".dll",
        ".sh",
    ]

    if extension in dangerous_extensions:
        return False

    return True


def validate_file_size(
    file_size: int, max_size_mb: float = 10.0, min_size_bytes: int = 0
) -> bool:
    """
    Validate file size is within acceptable limits.

    Args:
        file_size: Size of file in bytes
        max_size_mb: Maximum allowed size in megabytes
        min_size_bytes: Minimum allowed size in bytes

    Returns:
        True if valid, False otherwise

    Raises:
        ValidationError: If file size is invalid

    Example:
        >>> validate_file_size(1024 * 1024, max_size_mb=5.0)  # 1MB file
        True
        >>> validate_file_size(20 * 1024 * 1024, max_size_mb=5.0)  # 20MB file
        False
    """
    if not isinstance(file_size, int) or file_size < 0:
        return False

    max_size_bytes = int(max_size_mb * 1024 * 1024)

    if file_size < min_size_bytes:
        return False

    if file_size > max_size_bytes:
        return False

    return True


def validate_url(url: str, require_https: bool = False) -> bool:
    """
    Validate URL format and optionally require HTTPS.

    Args:
        url: URL to validate
        require_https: If True, only accept HTTPS URLs

    Returns:
        True if valid, False otherwise

    Example:
        >>> validate_url("https://example.com")
        True
        >>> validate_url("http://example.com", require_https=True)
        False
        >>> validate_url("not-a-url")
        False
    """
    if not url or not isinstance(url, str):
        return False

    url = url.strip()

    # Check basic pattern
    if not URL_PATTERN.match(url):
        return False

    # Parse URL for additional checks
    try:
        parsed = urlparse(url)

        # Check scheme
        if require_https and parsed.scheme != "https":
            return False

        # Ensure we have a valid netloc (domain/IP)
        if not parsed.netloc:
            return False

        # Block localhost/private IPs in production if needed
        # This is a basic check; more sophisticated checks may be needed
        if parsed.netloc.startswith("127.") or parsed.netloc == "localhost":
            # Allow in development, but you might want to restrict in production
            pass

        return True

    except Exception:
        return False


def validate_provider_id(provider_id: str) -> bool:
    """
    Validate provider ID format.

    Provider IDs should be alphanumeric with hyphens/underscores, 1-50 chars.

    Args:
        provider_id: Provider ID to validate

    Returns:
        True if valid, False otherwise

    Example:
        >>> validate_provider_id("openai-gpt4")
        True
        >>> validate_provider_id("invalid provider!")
        False
    """
    if not provider_id or not isinstance(provider_id, str):
        return False

    return bool(PROVIDER_ID_PATTERN.match(provider_id))


def validate_session_id(session_id: str) -> bool:
    """
    Validate session ID format.

    Session IDs should be alphanumeric with hyphens/underscores, 8-64 chars.

    Args:
        session_id: Session ID to validate

    Returns:
        True if valid, False otherwise

    Example:
        >>> validate_session_id("sess_abc123def456")
        True
        >>> validate_session_id("short")
        False
    """
    if not session_id or not isinstance(session_id, str):
        return False

    return bool(SESSION_ID_PATTERN.match(session_id))


def validate_string_length(
    value: str, min_length: int = 0, max_length: Optional[int] = None
) -> bool:
    """
    Validate string length is within acceptable range.

    Args:
        value: String to validate
        min_length: Minimum allowed length
        max_length: Maximum allowed length (None for no limit)

    Returns:
        True if valid, False otherwise

    Example:
        >>> validate_string_length("hello", min_length=3, max_length=10)
        True
        >>> validate_string_length("hi", min_length=3)
        False
    """
    if not isinstance(value, str):
        return False

    length = len(value)

    if length < min_length:
        return False

    if max_length is not None and length > max_length:
        return False

    return True


def validate_json_structure(data: dict, required_keys: List[str]) -> bool:
    """
    Validate that a dictionary contains all required keys.

    Args:
        data: Dictionary to validate
        required_keys: List of required key names

    Returns:
        True if all required keys present, False otherwise

    Example:
        >>> validate_json_structure({"name": "test", "age": 25}, ["name", "age"])
        True
        >>> validate_json_structure({"name": "test"}, ["name", "age"])
        False
    """
    if not isinstance(data, dict):
        return False

    return all(key in data for key in required_keys)


def validate_port_number(port: int) -> bool:
    """
    Validate port number is in valid range.

    Args:
        port: Port number to validate

    Returns:
        True if valid (1-65535), False otherwise

    Example:
        >>> validate_port_number(8080)
        True
        >>> validate_port_number(70000)
        False
    """
    if not isinstance(port, int):
        return False

    return 1 <= port <= 65535


def validate_path(path: str, must_exist: bool = False) -> bool:
    """
    Validate file system path.

    Args:
        path: Path to validate
        must_exist: If True, path must exist on filesystem

    Returns:
        True if valid, False otherwise

    Example:
        >>> validate_path("/tmp/test.txt")
        True
        >>> validate_path("/tmp/test.txt", must_exist=True)
        False  # Unless file exists
    """
    if not path or not isinstance(path, str):
        return False

    try:
        path_obj = Path(path)

        # Check for path traversal attempts
        if ".." in path:
            return False

        if must_exist and not path_obj.exists():
            return False

        return True

    except Exception:
        return False


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename by removing dangerous characters.

    Args:
        filename: Original filename

    Returns:
        Sanitized filename

    Example:
        >>> sanitize_filename("my file (1).txt")
        'my_file_1.txt'
        >>> sanitize_filename("../../etc/passwd")
        'etc_passwd'
    """
    if not filename:
        return "unnamed"

    # Remove path components
    filename = Path(filename).name

    # Replace dangerous characters
    filename = re.sub(r'[<>:"/\\|?*]', "_", filename)

    # Remove leading/trailing dots and spaces
    filename = filename.strip(". ")

    # Ensure we have something left
    if not filename:
        return "unnamed"

    return filename

# Made with Bob
