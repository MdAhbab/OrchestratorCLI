"""
Custom middleware for rate limiting and security
"""

import time
import logging
from collections import defaultdict
from typing import Dict, Tuple
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple in-memory rate limiting middleware with automatic cleanup
    For production, use Redis or similar distributed cache
    """
    
    def __init__(self, app, requests_per_period: int = 100, period_seconds: int = 60, max_ips: int = 10000):
        super().__init__(app)
        self.requests_per_period = requests_per_period
        self.period_seconds = period_seconds
        self.max_ips = max_ips  # Maximum number of IPs to track
        self.request_counts: Dict[str, list] = defaultdict(list)
        self.last_cleanup = time.time()
        self.cleanup_interval = 300  # Cleanup every 5 minutes
        
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request"""
        # Check for forwarded IP (behind proxy)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        # Check for real IP
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fallback to direct client
        if request.client:
            return request.client.host
        
        return "unknown"
    
    def _clean_old_requests(self, timestamps: list, current_time: float) -> list:
        """Remove timestamps older than the rate limit period"""
        cutoff_time = current_time - self.period_seconds
        return [ts for ts in timestamps if ts > cutoff_time]
    
    def _cleanup_inactive_ips(self, current_time: float):
        """Remove IPs that haven't made requests recently"""
        cutoff_time = current_time - (self.period_seconds * 2)
        inactive_ips = [
            ip for ip, timestamps in self.request_counts.items()
            if not timestamps or max(timestamps, default=0) < cutoff_time
        ]
        for ip in inactive_ips:
            del self.request_counts[ip]
        
        # If still over limit, remove oldest IPs (LRU-style)
        if len(self.request_counts) > self.max_ips:
            sorted_ips = sorted(
                self.request_counts.items(),
                key=lambda x: max(x[1], default=0)
            )
            for ip, _ in sorted_ips[:len(self.request_counts) - self.max_ips]:
                del self.request_counts[ip]
    
    async def dispatch(self, request: Request, call_next) -> Response:
        """Process request with rate limiting"""
        
        # Skip rate limiting for health check and docs
        if request.url.path in ["/api/health", "/api/docs", "/api/redoc", "/openapi.json"]:
            return await call_next(request)
        
        client_ip = self._get_client_ip(request)
        current_time = time.time()
        
        # Periodic cleanup of inactive IPs
        if current_time - self.last_cleanup > self.cleanup_interval:
            self._cleanup_inactive_ips(current_time)
            self.last_cleanup = current_time
            logger.info(f"Rate limiter cleanup: tracking {len(self.request_counts)} IPs")
        
        # Clean old requests for current IP
        self.request_counts[client_ip] = self._clean_old_requests(
            self.request_counts[client_ip],
            current_time
        )
        
        # Check rate limit
        if len(self.request_counts[client_ip]) >= self.requests_per_period:
            logger.warning(f"Rate limit exceeded for {client_ip}")
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "Rate limit exceeded",
                    "message": f"Too many requests. Limit: {self.requests_per_period} requests per {self.period_seconds} seconds",
                    "retry_after": self.period_seconds
                }
            )
        
        # Add current request
        self.request_counts[client_ip].append(current_time)
        
        # Process request
        response = await call_next(request)
        
        # Add rate limit headers
        remaining = self.requests_per_period - len(self.request_counts[client_ip])
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_period)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(current_time + self.period_seconds))
        
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses"""
    
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Don't cache API responses
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
        
        return response

# Made with Bob
