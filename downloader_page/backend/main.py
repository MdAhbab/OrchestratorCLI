"""
AI CLI Orchestrator - Downloader Page Backend
Serves the React frontend and provides download API endpoints
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import logging
import os

# Import custom modules
from config import settings
from utils import calculate_sha256, get_file_info, validate_download_file
from middleware import RateLimitMiddleware, SecurityHeadersMiddleware

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format=settings.log_format
)

logger = logging.getLogger(__name__)

# Log startup configuration
logger.info(f"Starting {settings.api_title} v{settings.api_version}")
logger.info(f"Environment: {settings.environment}")
logger.info(f"CORS Origins: {settings.cors_origins}")

# Get the directory paths from settings
BACKEND_DIR = settings.backend_dir
DOWNLOADER_DIR = settings.downloader_dir
DIST_DIR = settings.dist_dir
DOWNLOADS_DIR = settings.downloads_dir

# Create FastAPI application
app = FastAPI(
    title=settings.api_title,
    description=settings.api_description,
    version=settings.api_version,
    docs_url="/api/docs" if settings.enable_docs else None,
    redoc_url="/api/redoc" if settings.enable_docs else None
)

# Add security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# Add rate limiting middleware (if enabled)
if settings.rate_limit_enabled:
    app.add_middleware(
        RateLimitMiddleware,
        requests_per_period=settings.rate_limit_requests,
        period_seconds=settings.rate_limit_period
    )
    logger.info(f"Rate limiting enabled: {settings.rate_limit_requests} requests per {settings.rate_limit_period}s")

# Configure CORS with environment-based settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.allow_credentials,
    allow_methods=settings.cors_methods,
    allow_headers=["*"] if settings.allowed_headers == "*" else settings.allowed_headers.split(","),
)

logger.info("CORS configured successfully")

# Create downloads directory if it doesn't exist
if not DOWNLOADS_DIR.exists():
    try:
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        logger.info(f"Created downloads directory: {DOWNLOADS_DIR}")
    except Exception as e:
        logger.error(f"Failed to create downloads directory: {e}")

# Mount static files for downloads
if DOWNLOADS_DIR.exists():
    app.mount("/downloads", StaticFiles(directory=str(DOWNLOADS_DIR)), name="downloads")
    logger.info(f"Downloads directory mounted: {DOWNLOADS_DIR}")
else:
    logger.warning(f"Downloads directory not found: {DOWNLOADS_DIR}")

# Mount the React frontend (after building with npm run build)
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")
    logger.info(f"Frontend assets mounted: {DIST_DIR / 'assets'}")
else:
    logger.warning(f"Frontend dist directory not found: {DIST_DIR}")


@app.get("/")
async def serve_frontend():
    """Serve the React frontend"""
    index_file = DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    
    return JSONResponse(
        status_code=503,
        content={
            "name": settings.api_title,
            "version": settings.api_version,
            "status": "frontend_not_built",
            "message": "Frontend not built. Run 'npm run build' in downloader_page directory.",
            "environment": settings.environment
        }
    )


@app.get("/api/health")
async def health_check():
    """
    Health check endpoint for monitoring and load balancers
    
    Returns:
        JSON with health status
    """
    return {
        "status": "healthy",
        "service": "ai-cli-orchestrator",
        "version": settings.api_version,
        "environment": settings.environment,
        "timestamp": os.environ.get("STARTUP_TIME", "unknown")
    }


@app.get("/api/version")
async def get_version():
    """
    Get application version and download links with checksums
    
    Returns:
        JSON with version info, download links, and SHA256 checksums
    """
    
    # Check which installers are available
    downloads = {}
    checksums = {}
    
    # Platform configurations
    platforms = {
        "windows": {
            "filename": "AI-CLI-Orchestrator-Setup.exe",
            "extensions": [".exe"]
        },
        "macos": {
            "filename": "AI-CLI-Orchestrator-Setup.dmg",
            "extensions": [".dmg"]
        },
        "linux": {
            "filename": "AI-CLI-Orchestrator-Setup.AppImage",
            "extensions": [".appimage"]
        }
    }
    
    if DOWNLOADS_DIR.exists():
        for platform, config in platforms.items():
            file_path = DOWNLOADS_DIR / config["filename"]
            
            if file_path.exists() and validate_download_file(file_path, config["extensions"]):
                file_info = get_file_info(file_path)
                
                if file_info:
                    downloads[platform] = {
                        "url": f"/downloads/{config['filename']}",
                        "size": file_info["size"],
                        "size_formatted": file_info["size_formatted"],
                        "available": True,
                        "modified": file_info["modified"]
                    }
                    
                    if file_info["checksum"]:
                        checksums[platform] = f"sha256:{file_info['checksum']}"
                    else:
                        checksums[platform] = "sha256:calculating..."
                else:
                    downloads[platform] = {"available": False, "error": "File info unavailable"}
            else:
                downloads[platform] = {"available": False}
    else:
        # Downloads directory doesn't exist
        for platform in platforms.keys():
            downloads[platform] = {"available": False, "error": "Downloads directory not found"}
    
    return {
        "version": settings.app_version,
        "release_date": settings.release_date,
        "downloads": downloads,
        "checksums": checksums,
        "release_notes": "Initial release of AI CLI Orchestrator with smart bootstrapper for AI CLI tools",
        "features": [
            "Unified interface for multiple AI CLI tools",
            "Smart dependency management",
            "Automatic workspace initialization",
            "Cross-platform support (Windows, macOS, Linux)",
            "Secure downloads with SHA256 verification"
        ],
        "environment": settings.environment
    }


@app.get("/api/status")
async def get_status():
    """
    Get system status
    
    Returns:
        JSON with server status
    """
    return {
        "server": "running",
        "version": settings.api_version,
        "environment": settings.environment,
        "clis": [],
        "session": None,
        "downloads_available": DOWNLOADS_DIR.exists()
    }


@app.get("/api/download/{platform}")
async def get_download_info(platform: str):
    """
    Get detailed download information for a specific platform
    
    Args:
        platform: Platform name (windows, macos, linux)
        
    Returns:
        JSON with detailed download info
        
    Raises:
        HTTPException: If platform is invalid or file not found
    """
    # Validate and sanitize platform parameter
    platform = platform.lower().strip()
    
    # Whitelist of allowed platforms
    platform_files = {
        "windows": "AI-CLI-Orchestrator-Setup.exe",
        "macos": "AI-CLI-Orchestrator-Setup.dmg",
        "linux": "AI-CLI-Orchestrator-Setup.AppImage"
    }
    
    # Strict validation - only allow alphanumeric characters
    if not platform.isalnum():
        raise HTTPException(
            status_code=400,
            detail="Invalid platform parameter"
        )
    
    if platform not in platform_files:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid platform. Must be one of: {', '.join(platform_files.keys())}"
        )
    
    file_path = DOWNLOADS_DIR / platform_files[platform]
    
    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Download not available for {platform}"
        )
    
    file_info = get_file_info(file_path)
    
    if not file_info:
        raise HTTPException(
            status_code=500,
            detail="Error retrieving file information"
        )
    
    return {
        "platform": platform,
        "filename": file_info["name"],
        "size": file_info["size"],
        "size_formatted": file_info["size_formatted"],
        "modified": file_info["modified"],
        "checksum": file_info["checksum"],
        "download_url": f"/downloads/{platform_files[platform]}",
        "verify_command": f"sha256sum {platform_files[platform]}" if platform == "linux" else f"shasum -a 256 {platform_files[platform]}"
    }


@app.exception_handler(404)
async def not_found_handler(request, exc):
    """Custom 404 handler"""
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not Found",
            "message": f"The requested resource was not found: {request.url.path}",
            "status_code": 404
        }
    )


@app.exception_handler(500)
async def internal_error_handler(request, exc):
    """Custom 500 handler"""
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": "An unexpected error occurred. Please try again later.",
            "status_code": 500
        }
    )


if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting server on {settings.api_host}:{settings.api_port}")
    
    uvicorn.run(
        app,
        host=settings.api_host,
        port=settings.api_port,
        log_level=settings.log_level.lower()
    )

# Made with Bob
