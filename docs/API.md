# API Documentation

Complete API reference for the AI CLI Orchestrator Downloader Backend.

---

## Base URL

- **Development**: `http://localhost:8000`
- **Production**: `https://yourdomain.com`

---

## Authentication

Currently, no authentication is required for public endpoints. Rate limiting is applied to all endpoints.

---

## Rate Limiting

- **Development**: 100 requests per 60 seconds per IP
- **Production**: 50 requests per 60 seconds per IP

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)

---

## Endpoints

### 1. Root Endpoint

**GET /**

Serves the React frontend application.

**Response:**
- `200 OK`: Returns index.html
- `503 Service Unavailable`: Frontend not built

**Example:**
```bash
curl http://localhost:8000/
```

---

### 2. Health Check

**GET /api/health**

Health check endpoint for monitoring and load balancers.

**Response:**
```json
{
  "status": "healthy",
  "service": "ai-cli-orchestrator",
  "version": "1.0.0",
  "environment": "development",
  "timestamp": "2026-05-16T19:00:00Z"
}
```

**Example:**
```bash
curl http://localhost:8000/api/health
```

---

### 3. Version Information

**GET /api/version**

Get application version, available downloads, and SHA256 checksums.

**Response:**
```json
{
  "version": "1.0.0",
  "release_date": "2026-05-16",
  "downloads": {
    "windows": {
      "url": "/downloads/AI-CLI-Orchestrator-Setup.exe",
      "size": 12345678,
      "size_formatted": "11.77 MB",
      "available": true,
      "modified": "2026-05-16T19:00:00Z"
    },
    "macos": {
      "url": "/downloads/AI-CLI-Orchestrator-Setup.dmg",
      "size": 12345678,
      "size_formatted": "11.77 MB",
      "available": true,
      "modified": "2026-05-16T19:00:00Z"
    },
    "linux": {
      "available": false
    }
  },
  "checksums": {
    "windows": "sha256:abc123...",
    "macos": "sha256:def456..."
  },
  "release_notes": "Initial release...",
  "features": [
    "Unified interface for multiple AI CLI tools",
    "Smart dependency management",
    "Automatic workspace initialization"
  ],
  "environment": "development"
}
```

**Example:**
```bash
curl http://localhost:8000/api/version
```

---

### 4. System Status

**GET /api/status**

Get current system status.

**Response:**
```json
{
  "server": "running",
  "version": "1.0.0",
  "environment": "development",
  "clis": [],
  "session": null,
  "downloads_available": true
}
```

**Example:**
```bash
curl http://localhost:8000/api/status
```

---

### 5. Platform Download Info

**GET /api/download/{platform}**

Get detailed download information for a specific platform.

**Parameters:**
- `platform` (path): Platform name - `windows`, `macos`, or `linux`

**Response:**
```json
{
  "platform": "windows",
  "filename": "AI-CLI-Orchestrator-Setup.exe",
  "size": 12345678,
  "size_formatted": "11.77 MB",
  "modified": "2026-05-16T19:00:00Z",
  "checksum": "abc123...",
  "download_url": "/downloads/AI-CLI-Orchestrator-Setup.exe",
  "verify_command": "shasum -a 256 AI-CLI-Orchestrator-Setup.exe"
}
```

**Errors:**
- `400 Bad Request`: Invalid platform parameter
- `404 Not Found`: Download not available for platform
- `500 Internal Server Error`: Error retrieving file information

**Example:**
```bash
curl http://localhost:8000/api/download/windows
```

---

### 6. Download Files

**GET /downloads/{filename}**

Download installer files directly.

**Parameters:**
- `filename` (path): Installer filename

**Valid Filenames:**
- `AI-CLI-Orchestrator-Setup.exe` (Windows)
- `AI-CLI-Orchestrator-Setup.dmg` (macOS)
- `AI-CLI-Orchestrator-Setup.AppImage` (Linux)

**Response:**
- `200 OK`: File download
- `404 Not Found`: File not found

**Example:**
```bash
curl -O http://localhost:8000/downloads/AI-CLI-Orchestrator-Setup.exe
```

---

### 7. API Documentation

**GET /api/docs**

Interactive API documentation (Swagger UI).

**Note:** Only available in development mode (`ENABLE_DOCS=true`)

**Example:**
```
http://localhost:8000/api/docs
```

---

### 8. Alternative API Documentation

**GET /api/redoc**

Alternative API documentation (ReDoc).

**Note:** Only available in development mode (`ENABLE_DOCS=true`)

**Example:**
```
http://localhost:8000/api/redoc
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "status_code": 400
}
```

### Common Status Codes

- `200 OK`: Request successful
- `400 Bad Request`: Invalid request parameters
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service temporarily unavailable

---

## Security Headers

All responses include security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cache-Control: no-cache` (for API responses)

---

## CORS Configuration

### Development
```
Access-Control-Allow-Origin: http://localhost:8000, http://localhost:5173
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

### Production
```
Access-Control-Allow-Origin: https://yourdomain.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

---

## Testing

### Using curl

```bash
# Health check
curl http://localhost:8000/api/health

# Get version info
curl http://localhost:8000/api/version

# Get platform info
curl http://localhost:8000/api/download/windows

# Download file
curl -O http://localhost:8000/downloads/AI-CLI-Orchestrator-Setup.exe
```

### Using Python

```python
import requests

# Health check
response = requests.get('http://localhost:8000/api/health')
print(response.json())

# Get version info
response = requests.get('http://localhost:8000/api/version')
data = response.json()
print(f"Version: {data['version']}")
print(f"Downloads: {data['downloads']}")
```

### Using JavaScript

```javascript
// Health check
fetch('http://localhost:8000/api/health')
  .then(res => res.json())
  .then(data => console.log(data));

// Get version info
fetch('http://localhost:8000/api/version')
  .then(res => res.json())
  .then(data => {
    console.log('Version:', data.version);
    console.log('Downloads:', data.downloads);
  });
```

---

## Changelog

### Version 1.0.0 (2026-05-16)
- Initial release
- Health check endpoint
- Version information endpoint
- System status endpoint
- Platform-specific download info
- File download endpoint
- Rate limiting
- Security headers
- CORS configuration
- SHA256 checksums

---

Last Updated: 2026-05-16