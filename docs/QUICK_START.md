# Quick Start Guide

Get the AI CLI Orchestrator up and running in minutes.

---

## Prerequisites

- **Node.js** 16+ and npm
- **Python** 3.8+
- **Git** (optional)

---

## Installation

### 1. Clone or Download

```bash
git clone <repository-url>
cd IBMbob
```

### 2. Install Dependencies

```bash
# Frontend dependencies
cd downloader_page
npm install

# Backend dependencies
pip install -r backend/requirements.txt
```

---

## Running the Application

### Option 1: Quick Start (Windows)

```bash
cd downloader_page
start.bat
```

This will automatically open two terminal windows:
- Frontend at http://localhost:5173
- Backend at http://localhost:8000

### Option 2: Manual Start (All Platforms)

**Terminal 1 - Frontend:**
```bash
cd downloader_page
npm run dev
```

**Terminal 2 - Backend:**
```bash
cd downloader_page/backend
python run.py
```

---

## Accessing the Application

Once both servers are running:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/api/docs

---

## Testing the API

### Using curl

```bash
# Health check
curl http://localhost:8000/api/health

# Get version info
curl http://localhost:8000/api/version

# Get system status
curl http://localhost:8000/api/status
```

### Using Browser

Simply visit:
- http://localhost:8000/api/health
- http://localhost:8000/api/version
- http://localhost:8000/api/docs (Interactive API documentation)

---

## Common Issues

### Port Already in Use

If port 8000 or 5173 is already in use:

**Windows:**
```bash
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**Linux/Mac:**
```bash
lsof -ti:8000 | xargs kill -9
```

### Dependencies Not Installing

```bash
# Clear npm cache
npm cache clean --force
rm -rf node_modules
npm install

# Reinstall Python packages
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### Frontend Not Loading

Build the frontend first:
```bash
cd downloader_page
npm run build
```

---

## Next Steps

1. **Explore the API**: Visit http://localhost:8000/api/docs
2. **Read Documentation**: Check [`README.md`](../README.md)
3. **Configure Environment**: Edit `.env` files for custom settings
4. **Deploy**: See [`downloader_page/DEPLOYMENT.md`](../downloader_page/DEPLOYMENT.md)

---

## Development Workflow

### Frontend Development

```bash
cd downloader_page
npm run dev
# Hot reload enabled - changes reflect immediately
```

### Backend Development

```bash
cd downloader_page/backend
python run.py
# Auto-reload enabled - changes reflect immediately
```

### Production Build

```bash
cd downloader_page
npm run build
npm run backend
# Access at http://localhost:8000
```

---

## Stopping the Application

Press `Ctrl+C` in each terminal window to stop the servers.

---

## Getting Help

- **Documentation**: [`README.md`](../README.md)
- **API Reference**: [`docs/API.md`](API.md)
- **Project Structure**: [`docs/PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md)
- **Deployment Guide**: [`downloader_page/DEPLOYMENT.md`](../downloader_page/DEPLOYMENT.md)

---

Last Updated: 2026-05-16