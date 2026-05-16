"""
Utility functions for the backend
"""

import hashlib
import logging
from pathlib import Path
from typing import Optional, Dict
from datetime import datetime

logger = logging.getLogger(__name__)

# Cache for file checksums: {file_path: (mtime, checksum)}
_checksum_cache: Dict[str, tuple[float, str]] = {}


def calculate_sha256(file_path: Path, use_cache: bool = True) -> Optional[str]:
    """
    Calculate SHA256 checksum for a file with caching
    
    Args:
        file_path: Path to the file
        use_cache: Whether to use cached checksum if available
        
    Returns:
        SHA256 hash string or None if file doesn't exist
    """
    if not file_path.exists():
        logger.warning(f"File not found for checksum: {file_path}")
        return None
    
    try:
        file_path_str = str(file_path)
        current_mtime = file_path.stat().st_mtime
        
        # Check cache if enabled
        if use_cache and file_path_str in _checksum_cache:
            cached_mtime, cached_checksum = _checksum_cache[file_path_str]
            if cached_mtime == current_mtime:
                logger.debug(f"Using cached SHA256 for {file_path.name}")
                return cached_checksum
        
        # Calculate checksum
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            # Read file in chunks to handle large files
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        
        checksum = sha256_hash.hexdigest()
        
        # Update cache
        if use_cache:
            _checksum_cache[file_path_str] = (current_mtime, checksum)
        
        logger.info(f"Calculated SHA256 for {file_path.name}: {checksum}")
        return checksum
    except Exception as e:
        logger.error(f"Error calculating checksum for {file_path}: {e}")
        return None


def format_file_size(size_bytes: int) -> str:
    """
    Format file size in human-readable format
    
    Args:
        size_bytes: File size in bytes
        
    Returns:
        Formatted string (e.g., "15.2 MB")
    """
    size = float(size_bytes)
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024.0:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} PB"


def get_file_info(file_path: Path) -> Optional[Dict]:
    """
    Get comprehensive file information
    
    Args:
        file_path: Path to the file
        
    Returns:
        Dictionary with file info or None if file doesn't exist
    """
    if not file_path.exists():
        return None
    
    try:
        stat = file_path.stat()
        return {
            "name": file_path.name,
            "size": stat.st_size,
            "size_formatted": format_file_size(stat.st_size),
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "checksum": calculate_sha256(file_path)
        }
    except Exception as e:
        logger.error(f"Error getting file info for {file_path}: {e}")
        return None


def validate_download_file(file_path: Path, expected_extensions: Optional[list] = None) -> bool:
    """
    Validate if a file is safe to download
    
    Args:
        file_path: Path to the file
        expected_extensions: List of allowed extensions (e.g., ['.exe', '.dmg'])
        
    Returns:
        True if file is valid, False otherwise
    """
    if not file_path.exists():
        return False
    
    if not file_path.is_file():
        return False
    
    if expected_extensions:
        if file_path.suffix.lower() not in expected_extensions:
            logger.warning(f"Invalid file extension: {file_path.suffix}")
            return False
    
    # Check file size (prevent serving empty or suspiciously small files)
    if file_path.stat().st_size < 1024:  # Less than 1KB
        logger.warning(f"File too small: {file_path}")
        return False
    
    return True

# Made with Bob
