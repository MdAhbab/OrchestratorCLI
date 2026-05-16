# AI CLI Orchestrator - Backend

Production-ready FastAPI backend with security features, rate limiting, and proper CORS configuration.

## Features

✅ **Environment-based Configuration** - Separate configs for dev/staging/production  
✅ **CORS Security** - Configurable origins, no wildcards in production  
✅ **Rate Limiting** - In-memory rate limiting with customizable limits  
✅ **Security Headers** - X-Frame-Options, X-Content-Type-Options, etc.  
✅ **SHA256 Checksums** - Automatic checksum generation for downloads  
✅ **Error Handling** - Comprehensive error handling and logging  
✅ **Health Checks** - Monitoring endpoints for load balancers  
✅ **API Documentation** - Auto-generated Swagger/ReDoc (dev only)  

## Quick Start

### Development

```bash
# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp ../.env.example ../.env

# Run development server
python run.py
```

Server will start at `http://127.0.0.1:8000`

### Production

```bash
# Use production environment
cp ../.env.production ../.env

# Edit .env with your production settings
nano ../.env

# Install gunicorn
pip install gunicorn

# Run with gunicorn
gunicorn main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

## Project Structure

```
backend/
├── main.py           # FastAPI application and routes
├── config.py         # Configuration management with Pydantic
├── utils.py          # Utility functions (checksums, file info)
├── middleware.py     # Custom middleware (rate limiting, security)
├── requirements.txt  # Python dependencies
├── run.py           # Development server runner
└── README.md        # This file
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Serve React frontend |
| GET | `/api/health` | Health check |
| GET | `/api/version` | Version info and downloads |
| GET | `/api/status` | System status |
| GET | `/api/download/{platform}` | Platform-specific download info |
| GET | `/downloads/{filename}` | Download installer files |

### Documentation (Dev Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/docs` | Swagger UI |
| GET | `/api/redoc` | ReDoc documentation |

## Configuration

### Environment Variables

See [`.env.example`](../.env.example) for all available options.

**Key Settings:**

```env
# API
API_HOST=127.0.0.1
API_PORT=8000

# CORS (comma-separated)
ALLOWED_ORIGINS=http://localhost:8000,http://localhost:5173

# Environment
ENVIRONMENT=development  # development, staging, production

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_PERIOD=60

# Security
ENABLE_DOCS=true  # false in production
LOG_LEVEL=INFO    # WARNING in production
```

### CORS Configuration

**Development:**
```env
ALLOWED_ORIGINS=http://localhost:8000,http://localhost:5173
```

**Production:**
```env
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

⚠️ **Never use wildcards (`*`) in production!**

## Security Features

### 1. Rate Limiting

Protects against abuse with configurable limits:

```python
# Default: 100 requests per 60 seconds
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_PERIOD=60
```

Response headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

### 2. Security Headers

Automatically added to all responses:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

### 3. File Validation

Downloads are validated for:
- File existence
- Correct file extension
- Minimum file size (prevents serving empty files)
- SHA256 checksum generation

### 4. Error Handling

Custom error handlers for:
- 404 Not Found
- 429 Rate Limit Exceeded
- 500 Internal Server Error

## Monitoring

### Health Check

```bash
curl http://localhost:8000/api/health
```

Response:
```json
{
  "status": "healthy",
  "service": "ai-cli-orchestrator",
  "version": "1.0.0",
  "environment": "development"
}
```

### Logs

Structured logging with configurable levels:

```python
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR, CRITICAL
```

## Development

### Adding New Endpoints

1. Add route to `main.py`:
```python
@app.get("/api/new-endpoint")
async def new_endpoint():
    return {"message": "Hello"}
```

2. Update CORS if needed in `config.py`

3. Test with:
```bash
curl http://localhost:8000/api/new-endpoint
```

### Testing

```bash
# Install test dependencies
pip install pytest httpx

# Run tests
pytest
```

## Deployment

See [`DEPLOYMENT.md`](../DEPLOYMENT.md) for detailed deployment instructions including:
- Docker deployment
- Systemd service setup
- Nginx configuration
- SSL/TLS setup
- Monitoring and logging

## Troubleshooting

### CORS Errors

**Problem:** Frontend can't access API

**Solution:**
1. Check `ALLOWED_ORIGINS` includes frontend URL
2. Verify protocol matches (http vs https)
3. Check browser console for specific error

### Rate Limiting

**Problem:** Getting 429 errors

**Solution:**
1. Check `X-RateLimit-*` headers
2. Increase `RATE_LIMIT_REQUESTS` if needed
3. Implement Redis for distributed rate limiting

### Downloads Not Working

**Problem:** Files not downloading

**Solution:**
1. Verify `downloads/` directory exists
2. Check file permissions
3. Ensure files have correct extensions
4. Check logs for errors

## Dependencies

Core dependencies:
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `pydantic` - Configuration management
- `pydantic-settings` - Environment variable support

See [`requirements.txt`](requirements.txt) for complete list.

## License

MIT License - See [LICENSE](../../LICENSE) for details.

## Support

- Documentation: See [DEPLOYMENT.md](../DEPLOYMENT.md)
- Issues: [GitHub Issues](https://github.com/yourusername/ai-cli-orchestrator/issues)
- API Docs: http://localhost:8000/api/docs (development only)