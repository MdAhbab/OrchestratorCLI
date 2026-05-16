# AI CLI Orchestrator - Project Structure

## Overview

This project consists of two main components:

### 1. **Downloader Page** (`downloader_page/`)
The public-facing website where users download the installer.

**Purpose**: Marketing page + download distribution
**Tech Stack**: React + FastAPI
**Output**: Web application serving installer files

```
downloader_page/
├── src/              # React frontend (TypeScript + Tailwind)
├── backend/          # FastAPI server (serves frontend + API)
├── downloads/        # Place built installers here
└── dist/            # Built frontend (after npm run build)
```

### 2. **Installer Builder** (`installer/`)
Tools and scripts that CREATE the actual installer executables.

**Purpose**: Build Windows/macOS/Linux installers
**Tech Stack**: Python + PyInstaller + Inno Setup + DMG tools
**Output**: `.exe`, `.dmg`, `.AppImage` files

```
installer/
├── backend/          # FastAPI app to be packaged
├── bootstrapper/     # CLI dependency manager
├── windows/          # Inno Setup scripts (.exe builder)
├── macos/           # DMG creation scripts
└── workspace/       # Template files for user workspace
```

## Workflow

```
┌─────────────────────────────────────────────────────────┐
│ 1. BUILD INSTALLERS (installer/)                        │
│    python installer/build.py --all                      │
│    ↓                                                     │
│    Creates: AI-CLI-Orchestrator-Setup.exe (Windows)     │
│            AI-CLI-Orchestrator-Setup.dmg (macOS)        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. COPY TO DOWNLOADS (manual or automated)              │
│    cp installer/dist/*.exe downloader_page/downloads/   │
│    cp installer/dist/*.dmg downloader_page/downloads/   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. RUN DOWNLOADER PAGE (downloader_page/)               │
│    npm run build && npm run backend                     │
│    ↓                                                     │
│    Users visit: http://localhost:8000                   │
│    Users download installers                            │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

```
BOB/
│
├── downloader_page/              # Download website
│   ├── src/                      # React source
│   │   ├── app/
│   │   │   ├── App.tsx
│   │   │   └── components/
│   │   └── styles/
│   ├── backend/                  # FastAPI backend
│   │   ├── main.py              # API + static serving
│   │   ├── run.py               # Dev server
│   │   └── requirements.txt
│   ├── downloads/               # Installer files go here
│   ├── dist/                    # Built frontend
│   ├── package.json
│   ├── README.md
│   ├── SETUP.md
│   └── PROJECT_OVERVIEW.md
│
├── installer/                    # Installer builder
│   ├── backend/                 # App to be packaged
│   │   ├── main.py             # FastAPI app entry point
│   │   ├── pyinstaller.spec    # PyInstaller config
│   │   └── build_backend.py    # Build script
│   ├── bootstrapper/            # CLI dependency manager
│   │   ├── bootstrap.py        # Smart installer logic
│   │   └── cli_registry.json   # AI CLI tools config
│   ├── windows/                 # Windows installer
│   │   ├── setup.iss           # Inno Setup script
│   │   └── build_windows.py    # Build script
│   ├── macos/                   # macOS installer
│   │   └── create_dmg.sh       # DMG creation script
│   ├── workspace/               # User workspace templates
│   │   ├── workspace.yaml.template
│   │   ├── skill.md.template
│   │   └── plan.md.template
│   ├── build.py                 # Main build orchestrator
│   ├── version.json             # Version info
│   └── README.md
│
├── backend/                      # Main application backend
│   └── app/
│       └── main.py              # Core FastAPI app
│
├── frontend/                     # Main application frontend
│   └── src/
│
├── shared/                       # Shared resources
│   ├── skill.md
│   └── sessions/
│
├── docs/                         # Documentation
│
├── README.md                     # Main project README
├── LICENSE
└── .gitignore
```

## Key Concepts

### Downloader Page
- **What it is**: A website that users visit to download the installer
- **What it does**: Displays product info, detects available installers, serves download files
- **How to run**: `cd downloader_page && npm run build && npm run backend`
- **Access at**: http://localhost:8000

### Installer
- **What it is**: Build tools that create the actual installer executables
- **What it does**: Packages the FastAPI app, React frontend, and dependencies into standalone installers
- **How to run**: `cd installer && python build.py --all`
- **Output**: Installer files in `installer/dist/`

### The Connection
1. Installer builds the `.exe` and `.dmg` files
2. These files are copied to `downloader_page/downloads/`
3. Downloader page backend detects and serves these files
4. Users download and run the installers
5. Installers install the full application on user's computer

## Quick Commands

### Downloader Page
```bash
cd downloader_page

# Install dependencies
npm install
pip install -r backend/requirements.txt

# Development
npm run dev              # Frontend only (Vite)
npm run backend          # Backend only (FastAPI)

# Production
npm run build            # Build frontend
npm run backend          # Serve built frontend + API
```

### Installer
```bash
cd installer

# Install dependencies
pip install -r backend/requirements.txt

# Build all platforms
python build.py --all

# Build specific platform
python build.py --windows
python build.py --macos

# Output: installer/dist/
```

## Development Workflow

### Working on Downloader Page
1. Make changes to React components in `downloader_page/src/`
2. Run `npm run dev` to see changes with hot reload
3. Build with `npm run build` when ready
4. Test full stack with `npm run backend`

### Working on Installer
1. Make changes to installer scripts in `installer/`
2. Test build with `python build.py --windows` (or --macos)
3. Check output in `installer/dist/`
4. Copy to `downloader_page/downloads/` for testing

### Full Integration Test
1. Build installer: `cd installer && python build.py --windows`
2. Copy to downloads: `cp installer/dist/*.exe downloader_page/downloads/`
3. Build downloader: `cd downloader_page && npm run build`
4. Run backend: `npm run backend`
5. Visit: http://localhost:8000
6. Test download button

## Documentation

- **Main README**: [`README.md`](README.md) - Project overview
- **Downloader README**: [`downloader_page/README.md`](downloader_page/README.md) - Downloader page docs
- **Downloader Setup**: [`downloader_page/SETUP.md`](downloader_page/SETUP.md) - Setup guide
- **Downloader Overview**: [`downloader_page/PROJECT_OVERVIEW.md`](downloader_page/PROJECT_OVERVIEW.md) - Architecture
- **Installer README**: [`installer/README.md`](installer/README.md) - Installer docs

## Common Questions

**Q: Why are there two separate folders?**
A: `downloader_page/` is the website, `installer/` builds the actual installer files. They serve different purposes.

**Q: Where do I put the installer files?**
A: After building with `installer/build.py`, copy the output from `installer/dist/` to `downloader_page/downloads/`

**Q: How do I test the download page?**
A: Run `cd downloader_page && npm run build && npm run backend`, then visit http://localhost:8000

**Q: How do I build a new installer?**
A: Run `cd installer && python build.py --windows` (or --macos)

**Q: What's the difference between the two backends?**
A: `installer/backend/` is the app that gets packaged into the installer. `downloader_page/backend/` is the web server that serves the download page.

---

**Last Updated**: 2026-05-16