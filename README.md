# AI CLI Orchestrator

A unified interface for managing multiple AI CLI tools with smart dependency management and automatic workspace initialization.

---

## 🎯 Project Overview

This project consists of two main components:

### 1. **Downloader Page** (`downloader_page/`)
Public-facing website where users download the installer.
- React + TypeScript frontend
- FastAPI backend
- Automatic installer detection
- Download distribution system

### 2. **Installer Builder** (`installer/`)
Tools and scripts that BUILD the actual installer executables.
- PyInstaller packaging
- Windows installer (Inno Setup)
- macOS installer (DMG)
- Smart CLI bootstrapper
- Workspace initialization

---

## 🚀 Quick Start

### Run Downloader Page

**Windows (Easiest):**
```bash
cd downloader_page
start.bat
```

**Manual:**
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
- Backend: http://localhost:8000

### Build Installers

```bash
cd installer

# Build all platforms
python build.py --all

# Build specific platform
python build.py --windows
python build.py --macos
```

---

## 📦 Installation

### Downloader Page Setup:
```bash
cd downloader_page
npm install
pip install -r backend/requirements.txt
```

### Installer Setup:
```bash
cd installer
pip install -r backend/requirements.txt
```

---

## 📁 Project Structure

```
BOB/
│
├── downloader_page/              # Download website
│   ├── src/                      # React frontend
│   ├── backend/                  # FastAPI backend
│   ├── downloads/                # Installer files
│   ├── start.bat                 # Quick start script
│   └── README.md                 # Full documentation
│
├── installer/                    # Installer builder
│   ├── backend/                  # App to package
│   ├── bootstrapper/             # CLI dependency manager
│   ├── windows/                  # Windows installer scripts
│   ├── macos/                    # macOS installer scripts
│   ├── workspace/                # User workspace templates
│   ├── build.py                  # Main build script
│   └── README.md                 # Build documentation
│
├── backend/                      # Main application backend
│   └── app/
│       └── main.py
│
├── frontend/                     # Main application frontend
│   └── src/
│
├── shared/                       # Shared resources
│   ├── skill.md
│   └── sessions/
│
├── PROJECT_STRUCTURE.md          # Detailed structure explanation
├── README.md                     # This file
└── LICENSE
```

---

## 🔄 Complete Workflow

### 1. Build Installers
```bash
cd installer
python build.py --all
```
**Output:** `installer/dist/AI-CLI-Orchestrator-Setup.exe` and `.dmg`

### 2. Copy to Downloads
```bash
cp installer/dist/*.exe downloader_page/downloads/
cp installer/dist/*.dmg downloader_page/downloads/
```

### 3. Run Downloader Page
```bash
cd downloader_page
start.bat
```

### 4. Users Download
- Visit: http://localhost:8000
- Click download button
- Install on their machine

---

## 🎯 Key Features

### Downloader Page
- ✅ Modern React UI with dark theme
- ✅ Responsive design (mobile/tablet/desktop)
- ✅ Automatic installer detection
- ✅ Dynamic download availability
- ✅ File size display
- ✅ REST API for version info
- ✅ Hot reload in development

### Installer System
- ✅ PyInstaller packaging
- ✅ Windows installer (Inno Setup)
- ✅ macOS installer (DMG)
- ✅ Smart CLI bootstrapper
- ✅ Automatic dependency management
- ✅ Workspace initialization
- ✅ Cross-platform support

---

## 📚 Documentation

### Main Documentation
- [`README.md`](README.md) - This file (project overview)
- [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) - Detailed structure explanation
- [`LICENSE`](LICENSE) - MIT License

### Component Documentation
- [`downloader_page/README.md`](downloader_page/README.md) - Complete downloader page guide (438 lines)
- [`installer/README.md`](installer/README.md) - Installer build documentation
- [`downloader_page/downloads/README.md`](downloader_page/downloads/README.md) - Installer files info

---

## 🛠️ Development

### Downloader Page Development
```bash
cd downloader_page

# Frontend (hot reload)
npm run dev

# Backend (auto-reload)
cd backend && python run.py

# Production build
npm run build
npm run backend
```

### Installer Development
```bash
cd installer

# Test build
python build.py --windows

# Check output
ls dist/
```

---

## 🌐 URLs

### Downloader Page
- Frontend Dev: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/docs
- Version Info: http://localhost:8000/api/version

---

## 🔧 Tech Stack

### Downloader Page
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS 4, shadcn/ui
- **Backend**: FastAPI, Uvicorn, Python 3.8+

### Installer
- **Packaging**: PyInstaller
- **Windows**: Inno Setup
- **macOS**: DMG tools
- **Bootstrapper**: Python, npm

---

## 📝 Common Tasks

### Start Everything
```bash
cd downloader_page
start.bat
```

### Build New Installer
```bash
cd installer
python build.py --windows
cp dist/*.exe ../downloader_page/downloads/
```

### Deploy Downloader Page
```bash
cd downloader_page
npm run build
# Upload dist/ and backend/ to server
```

### Update Version
1. Edit `installer/version.json`
2. Edit `downloader_page/backend/main.py`
3. Rebuild installers
4. Copy to downloads folder

---

## 🐛 Troubleshooting

### Downloader Page Issues
See [`downloader_page/README.md`](downloader_page/README.md#troubleshooting)

### Installer Build Issues
See [`installer/README.md`](installer/README.md)

### Common Problems

**Port already in use:**
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**Dependencies not installed:**
```bash
# Downloader page
cd downloader_page
npm install
pip install -r backend/requirements.txt

# Installer
cd installer
pip install -r backend/requirements.txt
```

**Downloads not working:**
1. Check backend is running
2. Check files exist in `downloader_page/downloads/`
3. Check file names match exactly
4. Visit http://localhost:8000/api/version

---

## 🔒 Security

### Windows SmartScreen Warning
Downloaded `.exe` files show security warnings because they're not digitally signed.

**To fix:**
1. Get code signing certificate
2. Sign installer with `signtool.exe`
3. Build reputation with Microsoft

### Production Checklist
- [ ] Sign installers
- [ ] Restrict CORS origins
- [ ] Enable HTTPS
- [ ] Add rate limiting
- [ ] Generate checksums
- [ ] Monitor logs

---

## 🚢 Deployment

### Downloader Page
See [`downloader_page/README.md#deployment`](downloader_page/README.md#deployment)

### Installer Distribution
1. Build installers
2. Copy to `downloader_page/downloads/`
3. Deploy downloader page
4. Users download from website

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🆘 Support

- **Documentation**: Check README files in each directory
- **Issues**: Create a GitHub issue
- **API Docs**: Visit http://localhost:8000/api/docs

---

## 📊 Project Status

### ✅ Completed
- Downloader page (frontend + backend)
- Installer build system
- Windows installer (Inno Setup)
- macOS installer (DMG)
- Smart CLI bootstrapper
- Workspace initialization
- Documentation
- Download functionality
- API integration

### 🔄 In Progress
- Real installer testing
- Code signing
- Release workflow

### 📋 Planned
- Linux installer (AppImage)
- Automated testing
- CI/CD pipeline
- Analytics dashboard

---

**Built with ❤️ for developers who use multiple AI CLI tools**

Last Updated: 2026-05-16