# AI CLI Orchestrator - Installer

This directory contains all the components needed to build production-ready installers for the AI CLI Orchestrator.

## 📁 Directory Structure

```
installer/
├── backend/          # Backend packaging with PyInstaller
├── windows/          # Windows installer (Inno Setup)
├── macos/           # macOS installer (DMG)
├── bootstrapper/    # CLI dependency manager
├── workspace/       # Workspace templates
├── scripts/         # Build automation scripts
├── dist/           # Build output (gitignored)
└── version.json    # Version configuration
```

## 🚀 Quick Start

### Prerequisites

**For Windows builds:**
- Python 3.11+
- PyInstaller: `pip install pyinstaller`
- Inno Setup 6.x: Download from https://jrsoftware.org/isdl.php

**For macOS builds:**
- Python 3.11+
- PyInstaller: `pip install pyinstaller`
- Xcode Command Line Tools: `xcode-select --install`

**For both:**
- Node.js 18+ and npm (for CLI bootstrapping)
- All backend dependencies: `pip install -r ../backend/requirements.txt`

### Building Installers

#### Build All Components
```bash
# From installer directory
python build.py
```

#### Build Backend Only
```bash
cd backend
python build_backend.py
```

#### Build Windows Installer
```bash
cd windows
python build_windows.py
```

#### Build macOS Installer
```bash
cd macos
bash build_macos.sh
```

## 📦 What Gets Built

### Backend Executable
- **Windows**: `orchestrator-backend.exe` (~40-50MB)
- **macOS**: `orchestrator-backend.app` (~40-50MB)
- **Contains**: Python runtime, FastAPI, React frontend, all dependencies

### Platform Installers
- **Windows**: `orchestrator-setup.exe` (~50-60MB)
- **macOS**: `orchestrator-setup.dmg` (~50-60MB)

## 🔧 Component Details

### Backend Packaging
The backend is packaged using PyInstaller with:
- Embedded Python 3.11 runtime
- FastAPI application and dependencies
- React frontend static files
- Workspace templates
- CLI bootstrapper

### Windows Installer
Uses Inno Setup to create a professional Windows installer with:
- System requirements checking
- Desktop shortcut creation
- Start menu integration
- Uninstaller
- UAC elevation when needed

### macOS Installer
Creates a DMG with:
- Drag-to-Applications interface
- App bundle structure
- Code signing ready
- Notarization ready

### CLI Bootstrapper
Smart dependency manager that:
- Downloads AI CLI tools on first run
- Handles network failures gracefully
- Shows real-time progress
- Falls back to manual instructions

## 🧪 Testing

### Test Backend Executable
```bash
cd backend/dist
./orchestrator-backend  # or orchestrator-backend.exe on Windows
```

### Test Installer
```bash
# Windows
cd dist/windows
orchestrator-setup.exe

# macOS
cd dist/macos
open orchestrator-setup.dmg
```

## 📝 Configuration

### Version Management
Edit `version.json` to update:
- Version number
- Release date
- Build number
- Release notes

### CLI Registry
Edit `bootstrapper/cli_registry.json` to:
- Add new AI CLIs
- Update install commands
- Change priorities
- Mark as required/optional

### Workspace Templates
Edit files in `workspace/` to customize:
- Default workspace configuration
- Skill template
- Plan template

## 🐛 Troubleshooting

### PyInstaller Issues
```bash
# Clean build
rm -rf backend/build backend/dist
python build_backend.py
```

### Missing Dependencies
```bash
# Reinstall all dependencies
pip install -r ../backend/requirements.txt
pip install pyinstaller
```

### Inno Setup Not Found
- Download from https://jrsoftware.org/isdl.php
- Add to PATH or specify full path in build script

## 📚 Documentation

- **Installation Guide**: See `docs/INSTALLATION.md`
- **Build Guide**: See `docs/BUILD_GUIDE.md`
- **Architecture**: See `../INSTALLER_PLAN.md`
- **Summary**: See `../INSTALLER_SUMMARY.md`

## 🔗 Related Files

- Backend source: `../backend/`
- Frontend source: `../frontend/`
- Downloader page: `../downloader_page/`
- Shared resources: `../shared/`

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the detailed plan in `../INSTALLER_PLAN.md`
3. Check existing issues on GitHub
4. Create a new issue with details

## 🎯 Next Steps

1. Install prerequisites
2. Run `python build.py` to build all components
3. Test the installer on a clean VM
4. Deploy to download server
5. Update downloader page with links

---

**Ready to build production-ready installers!** 🚀