# AI CLI Orchestrator - Installer

Build production-ready installers for the AI Orchestrator main app.

> **Primary Windows pipeline:** `windows/setup.iss`  
> `windows/installer.iss` is deprecated (legacy IBM Bob paths).

## Directory structure

```
release/installer/
├── backend/          # PyInstaller packaging (bundles repo backend/)
├── windows/          # Inno Setup (setup.iss)
├── macos/            # DMG creation (create_dmg.sh)
├── bootstrapper/     # CLI dependency manager
├── launcher/         # Windows tray launcher
├── workspace/        # Workspace templates
├── dist/             # Build output (gitignored)
└── version.json      # Version configuration
```

## Quick start

### Prerequisites

**Windows builds:**
- Python 3.11+
- PyInstaller: `pip install pyinstaller`
- Inno Setup 6.x: https://jrsoftware.org/isdl.php
- Place `icon.ico` in `windows/` before running Inno Setup

**macOS builds:**
- Python 3.11+
- PyInstaller
- Xcode Command Line Tools: `xcode-select --install`

**Both:**
- Node.js 18+ (CLI bootstrapping)
- Main backend deps: `pip install -r ../../backend/requirements.txt`
- Installer build deps: `pip install -r backend/requirements.txt`

### Build commands

```bash
# From release/installer/
python build.py

# Backend executable only
cd backend
python build_backend.py

# Windows installer (after backend build)
cd ../windows
python build_windows.py

# macOS DMG
cd ../macos
bash create_dmg.sh
```

## What gets built

| Artifact | Path |
|----------|------|
| Backend exe | `backend/dist/orchestrator-backend.exe` |
| Windows installer | `dist/windows/orchestrator-setup.exe` |
| macOS DMG | `dist/macos/` (via `create_dmg.sh`) |

PyInstaller resolves the **repo root** (`parents[2]` from `backend/build_backend.py`) and bundles `backend/` with entrypoint `backend.main:app`.

## Component notes

### Backend packaging

- Spec: `backend/pyinstaller.spec`
- Packaged launcher: `backend/main.py` imports `backend.main:app`
- Requirements synced from `../../backend/requirements.txt`

### Windows installer

- Use **`windows/setup.iss`** (license: `../../../LICENSE` at repo root)
- Legacy `installer.iss` kept with deprecation comment only

### macOS

- Script name: **`macos/create_dmg.sh`** (not `build_macos.sh`)

### CLI bootstrapper

Edit `bootstrapper/cli_registry.json` to add or update AI CLI install definitions.

## Testing

```bash
# Test packaged backend
cd backend/dist
./orchestrator-backend.exe   # Windows
./orchestrator-backend       # Linux/macOS binary

# Test Windows installer
cd ../dist/windows
./orchestrator-setup.exe
```

## Troubleshooting

```bash
# Clean PyInstaller output
rm -rf backend/build backend/dist
python backend/build_backend.py

# Reinstall deps
pip install -r ../../backend/requirements.txt
pip install -r backend/requirements.txt
```

## Related paths

| Resource | Location |
|----------|----------|
| Main backend source | `../../backend/` |
| Main frontend source | `../../frontend/` |
| Downloader site | `../../downloader_page/` |
| Shared workspace | `../../shared/` |
| Architecture plan | `../../docs/ARCHITECTURE.md` |

## Documentation

- [docs/QUICK_START.md](../../docs/QUICK_START.md) — run from source
- [docs/PROJECT_STRUCTURE.md](../../docs/PROJECT_STRUCTURE.md) — repo layout
- [composer_report.md](../../composer_report.md) — audit findings (installer section)

---

Last Updated: 2026-05-27
