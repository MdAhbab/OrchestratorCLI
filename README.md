# AI CLI Orchestrator

A unified interface for managing multiple AI CLI tools with smart dependency management and automatic workspace initialization.

---

## 🚀 Quick Start

### Run the Downloader Page (Recommended)

**Windows:**
```bash
cd downloader_page
start.bat
```

**Manual (Any OS):**
```bash
# Terminal 1 - Frontend
cd downloader_page
npm run dev

# Terminal 2 - Backend
cd downloader_page/backend
python run.py
```

**Access:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/docs

---

## 📦 Installation

### Downloader Page Setup

```bash
cd downloader_page

# Install frontend dependencies
npm install

# Install backend dependencies
pip install -r backend/requirements.txt
```

### Main UI Setup (Optional - UI Mockup)

```bash
cd frontend
npm install
npm run dev
# Access at http://localhost:5174
```

---

## 📁 Project Structure

```
IBMbob/
├── downloader_page/          # Download website (MAIN PROJECT)
│   ├── src/                  # React frontend
│   ├── backend/              # FastAPI backend
│   │   ├── main.py          # API endpoints
│   │   ├── config.py        # Configuration
│   │   ├── utils.py         # Utilities
│   │   ├── middleware.py    # Security & rate limiting
│   │   └── run.py           # Dev server
│   ├── downloads/            # Installer files
│   ├── .env                  # Development config
│   ├── .env.production       # Production config
│   └── README.md            # Detailed documentation
│
├── frontend/                 # Main UI mockup
│   └── src/                  # React components
│
├── release/                  # Installer builder
│   └── installer/
│       ├── backend/          # App to package
│       ├── bootstrapper/     # CLI manager
│       ├── windows/          # Windows installer
│       └── macos/           # macOS installer
│
├── shared/                   # Shared resources
├── README.md                # This file
├── PROJECT_STRUCTURE.md     # Detailed structure
└── LICENSE
```

---

## 🎯 Key Features

### Downloader Page
- ✅ Modern React UI with dark theme
- ✅ Responsive design (mobile/tablet/desktop)
- ✅ Automatic installer detection
- ✅ REST API with FastAPI
- ✅ Security hardening (CORS, rate limiting, headers)
- ✅ SHA256 checksums for downloads
- ✅ Environment-based configuration

### Installer System
- ✅ PyInstaller packaging
- ✅ Windows installer (Inno Setup)
- ✅ macOS installer (DMG)
- ✅ Smart CLI bootstrapper
- ✅ Automatic dependency management

---

## 🔧 API Endpoints

### Downloader Backend (Port 8000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serve React frontend |
| `/api/health` | GET | Health check |
| `/api/version` | GET | Version info & downloads |
| `/api/status` | GET | System status |
| `/api/download/{platform}` | GET | Platform-specific info |
| `/downloads/{filename}` | GET | Download installer files |
| `/api/docs` | GET | API documentation (dev only) |

---

## 🛠️ Development

### Frontend Development
```bash
cd downloader_page
npm run dev
# Hot reload enabled at http://localhost:5173
```

### Backend Development
```bash
cd downloader_page/backend
python run.py
# Auto-reload enabled at http://localhost:8000
```

### Production Build
```bash
cd downloader_page
npm run build
npm run backend
# Access at http://localhost:8000
```

---

## 🔒 Security Features

- **CORS**: Environment-based origin configuration
- **Rate Limiting**: 100 requests/60s (dev), 50 requests/60s (prod)
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, etc.
- **Input Validation**: Strict parameter sanitization
- **File Validation**: Extension and size checks
- **SHA256 Checksums**: Automatic generation for downloads

---

## 🌐 Environment Configuration

### Development (.env)
```env
ENVIRONMENT=development
ALLOWED_ORIGINS=http://localhost:8000,http://localhost:5173
ENABLE_DOCS=true
RATE_LIMIT_REQUESTS=100
```

### Production (.env.production)
```env
ENVIRONMENT=production
ALLOWED_ORIGINS=https://yourdomain.com
ENABLE_DOCS=false
RATE_LIMIT_REQUESTS=50
```

---

## 📚 Documentation

- [`README.md`](README.md) - This file (quick start)
- [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) - Detailed structure
- [`downloader_page/README.md`](downloader_page/README.md) - Complete guide
- [`downloader_page/DEPLOYMENT.md`](downloader_page/DEPLOYMENT.md) - Deployment guide
- [`downloader_page/backend/README.md`](downloader_page/backend/README.md) - Backend docs

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:8000 | xargs kill -9
```

### Dependencies Not Installed
```bash
# Frontend
cd downloader_page
npm install

# Backend
cd downloader_page/backend
pip install -r requirements.txt
```

### Frontend Not Loading
```bash
cd downloader_page
npm run build
```

---

## 🚢 Deployment

See [`downloader_page/DEPLOYMENT.md`](downloader_page/DEPLOYMENT.md) for complete deployment instructions including:
- Docker deployment
- Systemd service setup
- Nginx reverse proxy
- SSL/TLS configuration
- Production checklist

---

## 📊 Tech Stack

### Frontend
- React 18
- TypeScript
- Vite 6
- Tailwind CSS 4
- shadcn/ui components

### Backend
- FastAPI
- Uvicorn
- Python 3.8+
- Pydantic
- Custom middleware (rate limiting, security)

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

---

## 🆘 Support

- **Documentation**: Check README files in each directory
- **Issues**: Create a GitHub issue
- **API Docs**: Visit http://localhost:8000/api/docs when backend is running

---

**Built with ❤️ for developers who use multiple AI CLI tools**

Last Updated: 2026-05-16