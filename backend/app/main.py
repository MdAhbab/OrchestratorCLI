"""
AI CLI Orchestrator - FastAPI Backend
Main application entry point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Create FastAPI application
app = FastAPI(
    title="AI CLI Orchestrator API",
    description="Backend API for AI CLI Orchestrator",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "AI CLI Orchestrator API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ai-cli-orchestrator"
    }


@app.get("/api/version")
async def get_version():
    """Get application version and download links"""
    return {
        "version": "1.0.0",
        "release_date": "2026-05-16",
        "downloads": {
            "windows": "/downloads/orchestrator-setup.exe",
            "macos": "/downloads/orchestrator-setup.dmg",
            "linux": "/downloads/orchestrator-setup.AppImage"
        },
        "checksums": {
            "windows": "sha256:pending",
            "macos": "sha256:pending",
            "linux": "sha256:pending"
        },
        "release_notes": "Initial release of AI CLI Orchestrator"
    }


@app.get("/api/status")
async def get_status():
    """Get system status"""
    return {
        "server": "running",
        "clis": [],
        "session": None
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

# Made with Bob
