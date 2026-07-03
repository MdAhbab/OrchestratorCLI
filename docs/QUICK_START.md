# Quick Start Guide

Get the **AI Orchestrator** (main app) up and running in minutes.

> **Note:** The marketing/download site lives in [`downloader_page/`](../downloader_page/). This guide covers the orchestrator backend + frontend at the repo root.

---

## Prerequisites

- **Python 3.8+**
- **Node.js 16+** and npm
- **Git** (optional)

---

## Installation

### 1. Clone or download

```bash
git clone <repository-url>
cd OrchestratorCLI
```

### 2. Install dependencies

```bash
# Backend (creates backend/venv on first run via run.py)
cd backend
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
cd ..
```

---

## Running the application

### Recommended: unified launcher

From the **repo root**:

```bash
python run.py
```

This starts both backend (FastAPI) and frontend (Vite dev server), creates `backend/venv` if needed, and initializes the database when requested.

### Common options

```bash
# Backend only
python run.py --backend-only

# Frontend only
python run.py --frontend-only

# Initialize database, then start
python run.py --init-db

# Custom ports
python run.py --port 8080 --frontend-port 3000
```

---

## Access points

Once running:

| Service | URL |
|---------|-----|
| Frontend UI | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Interactive API docs | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

Configure orchestrator LLM keys in **Settings → Providers** or copy `backend/.env.example` to `backend/.env`.

---

## Testing the API

```bash
# Health check
curl http://localhost:8000/health

# API-prefixed health (same payload)
curl http://localhost:8000/api/health

# List providers
curl http://localhost:8000/api/providers
```

Open http://localhost:8000/docs for the full interactive reference.

---

## Downloader page (separate)

To run the public download/marketing site:

```bash
cd downloader_page
npm install
npm run build
npm run backend
```

See [`downloader_page/README.md`](../downloader_page/README.md) for details.

---

## Common issues

### Port already in use

**Windows:**
```bash
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**Linux/macOS:**
```bash
lsof -ti:8000 | xargs kill -9
```

### Database path

`run.py` reads `DATABASE_PATH` / `DATABASE_URL` from the environment or `backend/.env`. Default: `data/bob.db` at the repo root.

### Backend fails to import

Ensure you run commands from the **repo root** so `backend.main:app` resolves correctly.

---

## Next steps

1. Read [API.md](API.md) for REST and WebSocket endpoints
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design
3. Build installers: [release/installer/README.md](../release/installer/README.md)

---

Last Updated: 2026-05-27
