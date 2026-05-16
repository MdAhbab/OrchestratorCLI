# Deployment Guide

## Backend Deployment

### Prerequisites
- Python 3.9+
- pip or poetry for dependency management

### Installation

1. **Install dependencies**:
```bash
cd downloader_page/backend
pip install -r requirements.txt
```

2. **Configure environment**:
```bash
# Copy example environment file
cp ../.env.example ../.env

# Edit .env with your settings
# For production, use .env.production as reference
```

3. **Run the server**:

**Development**:
```bash
python run.py
```

**Production** (with gunicorn):
```bash
pip install gunicorn
gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Environment Variables

#### Development (.env)
```env
ENVIRONMENT=development
API_HOST=127.0.0.1
API_PORT=8000
ALLOWED_ORIGINS=http://localhost:8000,http://localhost:5173
ENABLE_DOCS=true
LOG_LEVEL=INFO
RATE_LIMIT_REQUESTS=100
```

#### Production (.env.production)
```env
ENVIRONMENT=production
API_HOST=0.0.0.0
API_PORT=8000
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
ENABLE_DOCS=false
LOG_LEVEL=WARNING
RATE_LIMIT_REQUESTS=50
```

### Docker Deployment

Create `Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY dist/ ./dist/
COPY downloads/ ./downloads/

WORKDIR /app/backend

EXPOSE 8000

CMD ["gunicorn", "main:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

Build and run:
```bash
docker build -t ai-cli-orchestrator .
docker run -p 8000:8000 --env-file .env.production ai-cli-orchestrator
```

### Systemd Service (Linux)

Create `/etc/systemd/system/ai-cli-orchestrator.service`:
```ini
[Unit]
Description=AI CLI Orchestrator Backend
After=network.target

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/opt/ai-cli-orchestrator/backend
Environment="PATH=/opt/ai-cli-orchestrator/venv/bin"
EnvironmentFile=/opt/ai-cli-orchestrator/.env.production
ExecStart=/opt/ai-cli-orchestrator/venv/bin/gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable ai-cli-orchestrator
sudo systemctl start ai-cli-orchestrator
sudo systemctl status ai-cli-orchestrator
```

---

## Frontend Deployment

### Build for Production

1. **Install dependencies**:
```bash
cd downloader_page
npm install
```

2. **Configure environment**:
```bash
# Create production environment file
cat > .env.production << EOF
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_APP_NAME="AI CLI Orchestrator"
VITE_APP_VERSION="1.0.0"
EOF
```

3. **Build**:
```bash
npm run build
```

The built files will be in `downloader_page/dist/`.

### Deployment Options

#### Option 1: Serve with Backend (Recommended)
The backend automatically serves the frontend from the `dist/` directory. Just ensure the frontend is built before starting the backend.

#### Option 2: Separate Static Hosting (CDN)
Deploy `dist/` to:
- **Netlify**: `netlify deploy --prod --dir=dist`
- **Vercel**: `vercel --prod`
- **AWS S3 + CloudFront**
- **GitHub Pages**

Update `VITE_API_BASE_URL` to point to your backend API.

---

## Nginx Configuration

### Reverse Proxy Setup

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Proxy to Backend
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Cache static assets
    location /assets/ {
        proxy_pass http://127.0.0.1:8000/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Download files
    location /downloads/ {
        proxy_pass http://127.0.0.1:8000/downloads/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Security Checklist

### Before Production Deployment

- [ ] Set `ENVIRONMENT=production` in `.env`
- [ ] Configure specific `ALLOWED_ORIGINS` (remove wildcards)
- [ ] Set `ENABLE_DOCS=false` to disable API documentation
- [ ] Use HTTPS/TLS certificates (Let's Encrypt)
- [ ] Set appropriate `RATE_LIMIT_REQUESTS` (lower for production)
- [ ] Configure firewall rules (allow only 80, 443)
- [ ] Set up monitoring and logging
- [ ] Generate and verify SHA256 checksums for downloads
- [ ] Implement backup strategy
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure log rotation
- [ ] Review and update security headers

### CORS Configuration

**Development**:
```env
ALLOWED_ORIGINS=http://localhost:8000,http://localhost:5173
```

**Production**:
```env
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Rate Limiting

**Development**: 100 requests/minute
**Production**: 50 requests/minute (adjust based on traffic)

---

## Monitoring

### Health Check Endpoint
```bash
curl https://yourdomain.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "ai-cli-orchestrator",
  "version": "1.0.0",
  "environment": "production"
}
```

### Logging

Logs are written to stdout/stderr. Configure log aggregation:

**Using journalctl** (systemd):
```bash
journalctl -u ai-cli-orchestrator -f
```

**Using Docker**:
```bash
docker logs -f ai-cli-orchestrator
```

---

## Troubleshooting

### CORS Errors
- Verify `ALLOWED_ORIGINS` includes your frontend domain
- Check browser console for specific CORS error
- Ensure protocol (http/https) matches

### Rate Limiting
- Check `X-RateLimit-*` headers in response
- Adjust `RATE_LIMIT_REQUESTS` if needed
- Implement Redis for distributed rate limiting

### File Downloads Not Working
- Verify `downloads/` directory exists
- Check file permissions (readable by web server)
- Ensure files have correct extensions
- Verify SHA256 checksums are generated

### API Documentation Not Accessible
- Check `ENABLE_DOCS` setting
- In production, docs are disabled by default
- Access at `/api/docs` (Swagger) or `/api/redoc`

---

## Performance Optimization

### Backend
- Use multiple workers: `--workers 4`
- Enable gzip compression in Nginx
- Implement caching for version endpoint
- Use Redis for rate limiting in production

### Frontend
- Enable asset compression
- Use CDN for static assets
- Implement service worker for offline support
- Optimize images and fonts

---

## Backup Strategy

### Files to Backup
- `/downloads/` - Installer files
- `.env.production` - Configuration
- Database (if added later)
- SSL certificates

### Automated Backup Script
```bash
#!/bin/bash
BACKUP_DIR="/backups/ai-cli-orchestrator"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/backup_$DATE.tar.gz" \
    /opt/ai-cli-orchestrator/downloads \
    /opt/ai-cli-orchestrator/.env.production

# Keep only last 7 days
find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +7 -delete
```

---

## Scaling Considerations

### Horizontal Scaling
- Use load balancer (Nginx, HAProxy)
- Implement Redis for shared rate limiting
- Use shared storage for downloads (S3, NFS)
- Database for session management

### Vertical Scaling
- Increase worker count
- Allocate more memory
- Use faster storage (SSD)

---

## Support

For issues or questions:
- GitHub Issues: [repository-url]
- Documentation: [docs-url]
- Email: support@yourdomain.com