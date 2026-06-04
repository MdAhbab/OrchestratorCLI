# Changelog

All notable changes to AI CLI Orchestrator are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.8.1] — 2026-06-05

### Added
- **Quota Tracking & Quota-Aware Rerouting** (`A-CRIT-01`) — Automatically updates user provider usage and gates LLM provider selections if exhausted. Reroutes agent division assignments dynamically to non-exhausted agents, adds annotations to division metadata, and broadcasts the event via WebSocket.
- **Backend Port Auto-Detection** (`C-MED-02`) — Automatically scans for a free port on localhost starting from 8000 to prevent launch failures due to busy ports.
- **winpty Import Failure Diagnostics** (`C-MED-04`) — Windows PTY startup errors now capture and present detailed traceback exception details if `pywinpty` is missing or fails to import.
- **VoiceButton Error Toast Notifications** (`B-MED-03`) — Web Speech API error codes (e.g. microphone access blocked or no speech detected) are now captured and displayed as Sonner toast alerts.
- **Workspace Context File-Upload Failure Feedback** (`B-HIGH-03`) — Displays clear error toast notifications to the user if drag-and-drop workspace file uploads fail.
- **Degraded Heuristic Plan Badge** (`A-HIGH-03`) — Displays warning banner details in the Chat message bubble when the LLM planner response fails to parse or is forced to fallback.
- **Global Backend Offline Banner** (`B-MED-01`) — Displays a clear status indicator in the top header if the desktop frontend fails to communicate with the local FastAPI server.

### Fixed
- **Health-Aware Routing** (`A-MED-01`) — Router now tracks and caches provider health status (`HEALTHY` on success, `UNAVAILABLE` on failures), sorting unavailable providers to the bottom of the candidate list for all routing strategies.
- **Robust SSE/WS Error Handling** (`A-HIGH-02` / `B-HIGH-01`) — Surfaces token generation and model routing errors directly as client toasts and recovers connection states.
- **API Error Handling Envelopes** (`A-LOW-01`) — Normalized parsing of error envelopes (e.g. nested error message structures) in the frontend.
- **Configurable Context Window Limit** (`A-MED-06`) — Exposed context window history loading via `context_window_limit` settings parameter instead of hardcoded 20/30 limits.
- **Drift/Fallback App Version Alignment** (`C-LOW-01`) — Aligned the fallback app version in preload script to match `0.8.1`.
- **Improved Provider Log Tracebacks** (`A-LOW-02`) — Preserves traceback contexts on provider attempt and WebSockets execution failures.

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
