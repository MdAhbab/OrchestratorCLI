"""
AI Orchestrator - Main FastAPI Application
Provides REST API for the multi-agent orchestration platform.
"""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from datetime import datetime, timezone

from backend.config import settings
from backend.database.models import HealthCheckResponse, ErrorResponse
from backend.api.dependencies import get_db_connection, close_db_connection
from backend.database.init_db import init_database
from backend.utils.exceptions import register_exception_handlers

# Import all route modules
from backend.api.routes import (
    sessions,
    providers,
    orchestrator,
    runtimes,
    workspace,
    analytics,
    settings as settings_routes,
    onboarding,
    agents,
    tools,
)
from backend.api.websockets import terminals as ws_terminals
from backend.services.pty_service import pty_manager

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format=settings.log_format
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Startup
    logger.info("Starting AI Orchestrator Backend...")
    logger.info(f"Environment: {'Development' if settings.debug else 'Production'}")
    logger.info(f"Database: {settings.database_path}")
    
    # Initialize schema/migrations then open connection (CRIT-002)
    try:
        init_database(str(settings.database_path.resolve()), force=False)
        await get_db_connection()
        logger.info("Database initialized and connection established")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise
    
    # Create necessary directories
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.context_files_dir.mkdir(parents=True, exist_ok=True)
    settings.artifacts_dir.mkdir(parents=True, exist_ok=True)
    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    settings.temp_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Storage directories initialized")
    
    # Bind PTY manager to the running event loop so reader threads can
    # safely dispatch output back to websocket connections.
    import asyncio as _asyncio
    pty_manager.bind_loop(_asyncio.get_running_loop())
    
    logger.info("AI Orchestrator Backend started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down AI Orchestrator Backend...")
    
    # Stop any live PTY sessions cleanly.
    pty_manager.shutdown()

    # Stop connection manager heartbeat task (CONC-07)
    from backend.api.websockets import connection_manager
    await connection_manager.stop_heartbeat()

    # Close database connection
    await close_db_connection()
    logger.info("Database connection closed")
    
    logger.info("AI Orchestrator Backend shutdown complete")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="REST API for AI Orchestrator - Multi-Agent Orchestration Platform",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

register_exception_handlers(app)


# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https?://(127\.0\.0\.1|localhost):\d+",
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
)


# Exception handlers
def _error_json(
    error: str,
    detail: str,
    code: str,
    status_code: int,
) -> JSONResponse:
    """Build a JSON error response without risking datetime serialization bugs."""
    payload = ErrorResponse(error=error, detail=detail, code=code).model_dump(mode="json")
    return JSONResponse(status_code=status_code, content=payload)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle request validation errors."""
    logger.warning(f"Validation error: {exc.errors()}")
    return _error_json(
        "Validation Error",
        str(exc.errors()),
        "VALIDATION_ERROR",
        status.HTTP_422_UNPROCESSABLE_ENTITY,
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return _error_json(
        "Internal Server Error",
        str(exc) if settings.debug else "An unexpected error occurred",
        "INTERNAL_ERROR",
        status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


# Health check endpoint
@app.get("/health", response_model=HealthCheckResponse, tags=["health"])
async def health_check() -> HealthCheckResponse:
    """
    Health check endpoint.
    Returns the current status of the application and database.
    """
    db_status = "disconnected"
    app_status = "unhealthy"
    
    try:
        # Test database connection
        conn = await get_db_connection()
        if conn:
            await conn.execute("SELECT 1")
            db_status = "connected"
            app_status = "healthy"
    except Exception as e:
        logger.error(f"Health check failed: {e}")
    
    return HealthCheckResponse(
        status=app_status,
        database=db_status,
        version=settings.app_version,
        timestamp=datetime.now(timezone.utc)
    )


@app.get(f"{settings.api_prefix}/health", response_model=HealthCheckResponse, tags=["health"])
async def health_check_api() -> HealthCheckResponse:
    """Same health payload under /api so dev proxies only need one prefix."""
    return await health_check()


# Root endpoint
@app.get("/", tags=["root"])
async def root():
    """Root endpoint with API information."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "docs": "/docs",
        "health": "/health"
    }


# Register API routes
app.include_router(sessions.router, prefix=settings.api_prefix)
app.include_router(providers.router, prefix=settings.api_prefix)
app.include_router(orchestrator.router, prefix=settings.api_prefix)
app.include_router(runtimes.router, prefix=settings.api_prefix)
app.include_router(workspace.router, prefix=settings.api_prefix)
app.include_router(analytics.router, prefix=settings.api_prefix)
app.include_router(settings_routes.router, prefix=settings.api_prefix)
app.include_router(onboarding.router, prefix=settings.api_prefix)
app.include_router(agents.router, prefix=settings.api_prefix)
app.include_router(tools.router, prefix=settings.api_prefix)

# WebSocket router (no /api prefix so URL stays /ws/terminals/<id>).
app.include_router(ws_terminals.router)

_bundled = os.getenv("ORCHESTRATOR_BUNDLED", os.getenv("BOB_BUNDLED", "")).strip().lower() in ("1", "true", "yes")
_dist_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _bundled and _dist_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_dist_dir), html=True), name="frontend")


# Middleware for request logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests."""
    start_time = datetime.now(timezone.utc)
    
    # Log request
    logger.info(f"Request: {request.method} {request.url.path}")
    
    # Process request
    response = await call_next(request)
    
    # Calculate duration
    duration = (datetime.now(timezone.utc) - start_time).total_seconds()
    
    # Log response
    logger.info(
        f"Response: {request.method} {request.url.path} "
        f"- Status: {response.status_code} - Duration: {duration:.3f}s"
    )
    
    return response


if __name__ == "__main__":
    import uvicorn
    
    # Run the application
    uvicorn.run(
        "backend.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )

