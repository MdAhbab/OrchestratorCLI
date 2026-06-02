# Changelog

All notable changes to AI CLI Orchestrator are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.8.0] — 2026-06-02

### Added
- **Auto-update system** — the app checks GitHub Releases on startup and shows a banner when a new version is available. Updates are downloaded and applied on restart.
- **venv auto-installer** — on first launch the Electron shell automatically creates `backend/venv` and installs `backend/requirements.txt` using the system Python (3.8+). No manual pip steps required.
- **Real OS terminal shell labels** — terminal cards now display the actual shell name (`PowerShell`, `bash`, `zsh`) instead of a hardcoded string.
- **Full git integration** — `push`, `commit`, `checkout`, `merge`, `rebase`, and `reset` are now available from the Git panel in single-user desktop mode (all still require `confirm: true`).
- `CHANGELOG.md` — this file.

### Changed
- **Build system** — dropped PyInstaller (incompatible with Python 3.13). The Electron app now bundles the Python source via `electron-builder extraResources`; `packaging/build.py` orchestrates venv setup → frontend build → `electron-builder`.
- **Folder layout** — `release/installer/` renamed to `packaging/` for clarity.
- **Single-user mode** — removed the `ENCRYPTION_KEY` required-in-production gate; the desktop generates its own key at runtime via `backend-manager.ts`.

### Removed
- `report.md` — internal audit artifact, no longer needed.
- `guidelines.md` — internal development notes, no longer needed.
- `release/installer/` — superseded by `packaging/`.
- `packaging/backend/pyinstaller.spec` — PyInstaller no longer used.

### Fixed
- `build.py` no longer fails when PyInstaller is absent on Python 3.13.
- Git write operations (`commit`, `push`, `checkout`) were incorrectly blocked unless `DEBUG=true`; now correctly available in single-user desktop mode.

---

## [0.7.x] and earlier

See git history for prior changes.
