# AI Orchestrator — Multi-Agent Platform

Production-oriented multi-agent AI orchestration: a central orchestrator (Grok / Gemini / DeepSeek) plans and routes work to parallel CLI coding agents.

**Architecture:** see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Quick Start

### Prerequisites

- **Python 3.8+**
- **Node.js 16+** and npm
- **Git** (optional)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd IBMbob

# Install backend dependencies
cd backend
pip install -r requirements.txt

# Install frontend dependencies
cd ../frontend
npm install
```

### Running the Application

**Simple Start (Recommended):**
```bash
# From project root - runs both backend and frontend
python run.py
```

**Backend Only:**
```bash
python run.py --backend-only
```

**Frontend Only:**
```bash
python run.py --frontend-only
```

**Custom Ports:**
```bash
python run.py --port 8080 --frontend-port 3000
```

**First Time Setup:**
```bash
# Initialize database and start servers
python run.py --init-db
```

### Desktop app

An Electron desktop shell is available in [`desktop/`](desktop/README.md). It runs the existing React UI and FastAPI backend locally without browser chrome.

```bash
# One-time: backend venv + desktop deps
python -m venv backend/venv && backend/venv/Scripts/pip install -r backend/requirements.txt
cd desktop && npm install

# Dev desktop (Vite + Electron)
npm run desktop:dev

# Windows installer (.exe)
npm run desktop:dist:win

# macOS .app / DMG (run on macOS)
npm run desktop:dist:mac
```

Browser development (`python run.py`, `npm run dev` in `frontend/`) is unchanged.

### Access Points

Once running, access:
- **Frontend UI:** http://localhost:5173
- **Backend API:** http://localhost:8000
- **API Documentation:** http://localhost:8000/docs
- **Alternative Docs:** http://localhost:8000/redoc
- **Health Check:** http://localhost:8000/health

### Orchestrator LLM keys

Configure in **Settings → Providers** or `backend/.env`:

```env
GROK_API_KEY=your-xai-key
GEMINI_API_KEY=your-google-key
DEEPSEEK_API_KEY=your-deepseek-key
```

Priority defaults: Grok → Gemini → DeepSeek (automatic fallback on failure).

---

### Core Capabilities
- ✅ **Multi-Provider Support** - Integrate with multiple AI providers (OpenAI, Anthropic, etc.)
- ✅ **Runtime Management** - Execute and manage code runtimes (Python, Node.js, etc.)
- ✅ **Session Management** - Persistent conversation sessions with context
- ✅ **Workspace Management** - Organize projects and files
- ✅ **WebSocket Support** - Real-time communication for runtime execution
- ✅ **Analytics & Monitoring** - Track usage and performance metrics
- ✅ **Encryption** - Secure storage of sensitive data (API keys, credentials)

### Technical Features
- ✅ **FastAPI Backend** - High-performance async API
- ✅ **React Frontend** - Modern UI with TypeScript and Tailwind CSS
- ✅ **SQLite Database** - Lightweight, embedded database
- ✅ **RESTful API** - Well-documented endpoints
- ✅ **WebSocket API** - Real-time bidirectional communication
- ✅ **CORS Support** - Configurable cross-origin requests
- ✅ **Environment-based Configuration** - Easy deployment management

---

## 🏗️ Architecture Overview

### Backend Architecture

```
backend/
├── main.py                 # FastAPI application entry point
├── config.py              # Configuration management
├── requirements.txt       # Python dependencies
├── api/                   # API layer
│   ├── routes/           # REST endpoints
│   │   ├── analytics.py
│   │   ├── orchestrator.py
│   │   ├── providers.py
│   │   ├── runtimes.py
│   │   ├── sessions.py
│   │   ├── settings.py
│   │   └── workspace.py
│   └── websockets/       # WebSocket endpoints
│       ├── manager.py
│       └── runtimes.py
├── services/             # Business logic
│   ├── analytics_service.py
│   ├── encryption_service.py
│   ├── orchestrator_service.py
│   ├── provider_service.py
│   ├── runtime_service.py
│   ├── session_service.py
│   └── workspace_service.py
├── database/             # Data layer
│   ├── models.py        # SQLAlchemy models
│   ├── init_db.py       # Database initialization
│   └── schema.sql       # Database schema
└── utils/               # Utilities
    ├── exceptions.py
    ├── logger.py
    └── validators.py
```

### Frontend Architecture

```
frontend/
├── src/
│   ├── main.tsx          # Application entry point
│   ├── app/
│   │   ├── App.tsx       # Main application component
│   │   └── components/   # React components
│   │       ├── ChatView.tsx
│   │       ├── Settings.tsx
│   │       ├── Sidebar.tsx
│   │       ├── TopBar.tsx
│   │       └── ui/       # shadcn/ui components
│   └── styles/           # CSS and styling
├── package.json
└── vite.config.ts
```

---

## ⚙️ Configuration

### Backend Configuration

Create a `.env` file in the `backend/` directory:

```bash
cp backend/.env.example backend/.env
```

**Configuration Options:**

```env
# Application
APP_ENV=development
DEBUG=true

# API
API_HOST=0.0.0.0
API_PORT=8000

# Database
DATABASE_URL=sqlite+aiosqlite:///./data/bob.db

# Security
SECRET_KEY=your-secret-key-change-in-production
ENCRYPTION_KEY=your-encryption-key-here

# CORS
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]

# Logging
LOG_LEVEL=INFO
LOG_JSON_FORMAT=false

# Directories
UPLOAD_DIR=./uploads
TEMP_DIR=./runtime/tmp
CACHE_DIR=./runtime/cache
WORKSPACE_DIR=./shared

# Orchestrator LLM providers (at least one recommended)
GROK_API_KEY=
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
DEFAULT_ORCHESTRATOR_MODEL=grok-3
```

### Orchestrator LLM setup

The orchestrator uses **Grok**, **Gemini**, or **DeepSeek** APIs for planning and chat. Configure via the Settings UI (encrypted in DB) or environment variables above.

- **Grok**: [xAI Console](https://console.x.ai/) → API key
- **Gemini**: [Google AI Studio](https://aistudio.google.com/) → API key  
- **DeepSeek**: [DeepSeek Platform](https://platform.deepseek.com/) → API key

Fallback order: `ORCHESTRATOR_PROVIDER_PRIORITY=grok,gemini-api,deepseek-api`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for routing, A2A, and MCP details.

#### Security Best Practices

- **Never commit** your `.env` file to version control
- Use different credentials for development and production
- Rotate API keys regularly
- Store production credentials in a secure secrets manager
- The `.env` file is already included in `.gitignore`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_ENV` | Environment (development/production) | `development` |
| `DEBUG` | Enable debug mode | `true` |
| `API_HOST` | Backend host | `0.0.0.0` |
| `API_PORT` | Backend port | `8000` |
| `DATABASE_URL` | Database connection string | `sqlite+aiosqlite:///./data/bob.db` |
| `SECRET_KEY` | Secret key for sessions | Required in production |
| `ENCRYPTION_KEY` | Key for encrypting sensitive data | Required in production |
| `CORS_ORIGINS` | Allowed CORS origins | `["http://localhost:5173"]` |

---

## 🔧 API Documentation

### REST API Endpoints

#### Providers
- `GET /api/providers` - List all AI providers
- `POST /api/providers` - Add new provider
- `GET /api/providers/{id}` - Get provider details
- `PUT /api/providers/{id}` - Update provider
- `DELETE /api/providers/{id}` - Delete provider

#### Sessions
- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create new session
- `GET /api/sessions/{id}` - Get session details
- `PUT /api/sessions/{id}` - Update session
- `DELETE /api/sessions/{id}` - Delete session

#### Runtimes
- `GET /api/runtimes` - List available runtimes
- `POST /api/runtimes/execute` - Execute code
- `GET /api/runtimes/{id}/status` - Get runtime status

#### Workspace
- `GET /api/workspace/files` - List workspace files
- `POST /api/workspace/files` - Upload file
- `GET /api/workspace/files/{path}` - Get file content
- `DELETE /api/workspace/files/{path}` - Delete file

#### Analytics
- `GET /api/analytics/usage` - Get usage statistics
- `GET /api/analytics/sessions` - Get session analytics

#### Settings
- `GET /api/settings` - Get application settings
- `PUT /api/settings` - Update settings
- `GET /api/settings/cli-registry` - Get CLI registry used by installer/bootstrapper

### WebSocket API

#### Terminal Streaming
- `WS /ws/terminals/{runtime_id}` - Real-time PTY terminal I/O for a spawned CLI runtime

**Message Format (client → server):**
```json
{
  "type": "input",
  "data": "ls -la\r"
}
```

For complete API documentation, visit http://localhost:8000/docs when the backend is running.

---

## 📁 Project Structure

```
IBMbob/
├── backend/              # FastAPI backend
│   ├── api/             # API routes and WebSockets
│   ├── services/        # Business logic
│   ├── database/        # Database models and initialization
│   ├── utils/           # Utility functions
│   ├── main.py          # Application entry point
│   ├── config.py        # Configuration
│   └── requirements.txt # Python dependencies
│
├── frontend/            # React frontend
│   ├── src/            # Source code
│   ├── package.json    # Node dependencies
│   └── vite.config.ts  # Vite configuration
│
├── data/               # Local SQLite database files (generated, ignored)
├── uploads/            # Uploaded/generated files (generated, ignored)
│   ├── context/       # Context files
│   └── artifacts/     # Generated artifacts
├── runtime/            # Runtime cache/tmp data (generated, ignored)
│   ├── cache/
│   └── tmp/
│
├── shared/            # Shared resources
│   ├── sessions/      # Session data
│   ├── plan.md        # Shared project plan
│   └── skill.md       # Skill templates
│
├── docs/              # Documentation
│   ├── API.md         # API documentation
│   ├── PROJECT_STRUCTURE.md
│   └── QUICK_START.md
│
├── release/           # Release and installer files
│   └── installer/     # Installer builder
│
├── run.py            # Main launcher script
├── README.md         # This file
└── LICENSE           # License information
```

---

## 💻 Development Guide

### Backend Development

```bash
# Navigate to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Run with auto-reload
python run.py --reload

# Run tests (if available)
pytest tests/
```

### Frontend Development

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Running Both Servers

```bash
# From project root
python run.py

# With custom ports
python run.py --port 8080 --frontend-port 3000

# Production mode (no auto-reload)
python run.py --no-reload
```

### Database Management

```bash
# Initialize/reset database
python run.py --init-db

# The database will be created at: data/bob.db
```

---

## 🐛 Troubleshooting

### Port Already in Use

**Windows:**
```bash
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**Linux/macOS:**
```bash
lsof -ti:8000 | xargs kill -9
```

**Or use different ports:**
```bash
python run.py --port 8001 --frontend-port 5174
```

### Missing Dependencies

**Backend:**
```bash
cd backend
pip install -r requirements.txt
```

**Frontend:**
```bash
cd frontend
npm install
```

### Database Issues

```bash
# Reset the database
python run.py --init-db
```

### Permission Errors (Linux/macOS)

```bash
chmod +x run.py
./run.py
```

### Python Version Issues

Ensure Python 3.8 or higher is installed:
```bash
python --version
```

### Node.js Not Found

Install Node.js from: https://nodejs.org/

---

## 🚢 Production Deployment

### Backend Deployment

```bash
# Install dependencies
cd backend
pip install -r requirements.txt

# Set production environment variables
export APP_ENV=production
export DEBUG=false
export SECRET_KEY=your-production-secret-key
export ENCRYPTION_KEY=your-production-encryption-key

# Run with production settings
python run.py --no-reload --host 0.0.0.0 --port 8000
```

### Frontend Deployment

```bash
# Build frontend
cd frontend
npm run build

# The built files will be in frontend/dist/
# Serve with a web server (nginx, Apache, etc.)
```

### Using Process Managers

**PM2:**
```bash
pm2 start run.py --interpreter python3 --name ibm-bob
```

**Supervisor:**
```ini
[program:ibm-bob]
command=python run.py --no-reload
directory=/path/to/IBMbob
autostart=true
autorestart=true
```

### Docker Deployment (Optional)

Create a `Dockerfile` for containerized deployment:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Run application
CMD ["python", "run.py", "--no-reload", "--host", "0.0.0.0"]
```

---

## 📊 Tech Stack

### Backend
- **FastAPI** - Modern, fast web framework
- **Uvicorn** - ASGI server
- **SQLAlchemy** - SQL toolkit and ORM
- **Pydantic** - Data validation
- **python-dotenv** - Environment variable management
- **cryptography** - Encryption support
- **httpx** - HTTP client for provider integrations
- **aiosqlite** - Async SQLite support

### Frontend
- **React 18** - UI library
- **TypeScript** - Type-safe JavaScript
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Re-usable component library
- **Framer Motion** - Animation library

---

## 🔒 Security

### Best Practices

1. **Change Default Keys**: Always change `SECRET_KEY` and `ENCRYPTION_KEY` in production
2. **Use HTTPS**: Deploy behind a reverse proxy with SSL/TLS
3. **Restrict CORS**: Configure `CORS_ORIGINS` to only allow trusted domains
4. **Environment Variables**: Never commit `.env` files to version control
5. **Database Backups**: Regularly backup the `data/bob.db` file
6. **Update Dependencies**: Keep all dependencies up to date

### Encryption

Sensitive data (API keys, credentials) is encrypted using the `ENCRYPTION_KEY`. Ensure this key is:
- At least 32 characters long
- Randomly generated
- Securely stored
- Never committed to version control

---

## Audits

Security and architecture audit reports for this repository:

- [composer_report.md](composer_report.md) — Composer audit (installer, docs, API gaps, frontend wiring)
- [gemini_report.md](gemini_report.md) — Gemini audit

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

## 🆘 Support & Documentation

- **Quick Start:** See above for installation and running instructions
- **API Documentation:** http://localhost:8000/docs (when backend is running)
- **Additional Docs:** Check the `docs/` directory for more detailed guides
- **Issues:** Create a GitHub issue for bug reports or feature requests

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 Changelog

### Version 1.0.0 (Current)
- Initial release
- Multi-provider AI integration
- Runtime management system
- Session and workspace management
- WebSocket support for real-time execution
- Comprehensive API documentation
- Modern React frontend with TypeScript

---

**Built with ❤️ for developers who use multiple AI CLI tools**

Last Updated: 2026-05-17
