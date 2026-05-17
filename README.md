# Orchestrator - AI-Powered Development Assistant

A unified interface for managing multiple AI CLI tools with smart dependency management, automatic workspace initialization, and comprehensive orchestration capabilities.

---

## 🚀 Quick Start

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

### Access Points

Once running, access:
- **Frontend UI:** http://localhost:5173
- **Backend API:** http://localhost:8000
- **API Documentation:** http://localhost:8000/docs
- **Alternative Docs:** http://localhost:8000/redoc
- **Health Check:** http://localhost:8000/health

---

## 📋 Features

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
WORKSPACE_DIR=./shared

# IBM Watson Credentials
STT_API_KEY=your-speech-to-text-api-key
STT_URL=https://api.us-south.speech-to-text.watson.cloud.ibm.com
WATSONX_API_KEY=your-watsonx-api-key
WATSONX_PROJECT_ID=your-watsonx-project-id
```

### IBM Watson Credentials Setup

This application integrates with IBM Watson services for speech-to-text and AI inference capabilities.

#### Required Credentials

1. **Speech-to-Text Service:**
   - `STT_API_KEY`: Your IBM Watson Speech-to-Text API key
   - `STT_URL`: Service URL (region-specific)

2. **Watsonx.ai Service:**
   - `WATSONX_API_KEY`: Your IBM Watsonx.ai API key
   - `WATSONX_PROJECT_ID`: Your Watsonx.ai project ID

#### How to Obtain Credentials

1. **Create an IBM Cloud Account:**
   - Visit [IBM Cloud](https://cloud.ibm.com/)
   - Sign up or log in to your account

2. **Create Speech-to-Text Service:**
   - Navigate to the [IBM Cloud Catalog](https://cloud.ibm.com/catalog)
   - Search for "Speech to Text"
   - Create a new service instance
   - Go to "Manage" → "Credentials" to get your API key and URL

3. **Create Watsonx.ai Service:**
   - Navigate to [IBM Watsonx](https://www.ibm.com/watsonx)
   - Create a new project or use an existing one
   - Get your API key from IBM Cloud IAM
   - Copy your project ID from the project settings

4. **Add Credentials to .env:**
   ```bash
   # Edit backend/.env and add your credentials
   STT_API_KEY=your-actual-api-key-here
   STT_URL=https://api.us-south.speech-to-text.watson.cloud.ibm.com
   WATSONX_API_KEY=your-actual-api-key-here
   WATSONX_PROJECT_ID=your-actual-project-id-here
   ```

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

#### Runtime Execution
- `WS /ws/runtimes/{runtime_id}` - Real-time runtime execution

**Message Format:**
```json
{
  "type": "execute",
  "code": "print('Hello, World!')",
  "language": "python"
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
├── data/               # Database and data files
├── uploads/            # Uploaded files
│   ├── context/       # Context files
│   └── artifacts/     # Generated artifacts
│
├── shared/            # Shared resources
│   ├── sessions/      # Session data
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
