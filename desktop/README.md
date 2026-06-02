# AI Orchestrator Desktop

Native desktop shell for [IBMbob](../README.md) using Electron and electron-builder. It loads the existing React UI, starts the FastAPI backend locally, and removes browser chrome so it feels like a downloaded app rather than a browser tab.

## Stack

| Layer | Technology |
|-------|------------|
| Shell | Electron 34 |
| UI | Existing `frontend/` Vite + React app |
| API | Existing `backend/` FastAPI app via local Uvicorn child process |
| Production UI server | Local HTTP on `127.0.0.1:5174` with `/api`, `/health`, and `/ws` proxy |
| Packaging | electron-builder: NSIS `.exe` on Windows, `.app`/DMG on macOS |

## Prerequisites

1. Node.js 18+ and npm.
2. Python 3.8+ on PATH, or the Windows `py` launcher.
3. Backend virtualenv, recommended because the packaged app starts the local Python backend:

```powershell
python -m venv backend\venv
backend\venv\Scripts\pip install -r backend\requirements.txt
```

On macOS:

```bash
python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements.txt
```

4. Desktop dependencies:

```bash
cd desktop
npm install
```

The tracked icons in `desktop/build/` are used by the app and installer. Regenerate them only if branding changes:

```powershell
powershell -File desktop\build\generate-icon.ps1
```

## Scripts

From the repository root:

| Command | Description |
|---------|-------------|
| `npm run desktop:dev` | Vite dev server plus Electron, with backend auto-started |
| `npm run desktop:build` | Compile Electron main process and build the production frontend |
| `npm run desktop:dist` | Build for the current OS |
| `npm run desktop:dist:win` | Build Windows NSIS installer `.exe` |
| `npm run desktop:dist:mac` | Build macOS `.app` and DMG on macOS |
| `npm run desktop:dist:dir` | Build unpacked app directory for smoke testing |

## Development

`npm run desktop:dev` starts Vite at `http://127.0.0.1:5173`, launches Electron with `IBMBOB_DEV=1`, and lets Electron start Uvicorn on `127.0.0.1:8000`.

The browser workflow is unchanged: `python run.py` or `cd frontend && npm run dev` still work.

## Production Run Without Installer

```powershell
npm run build --prefix frontend
cd desktop
npm run build:main
npm run start
```

Production desktop serves `frontend/dist` through the local static server on port `5174`.

## Packaging Outputs

Windows:

```powershell
npm run desktop:dist:win
```

Output: `desktop/release/AI-Orchestrator-Setup-<version>.exe`.

macOS:

```bash
npm run desktop:dist:mac
```

Outputs: an unpacked `AI Orchestrator.app` directory and `AI-Orchestrator-<version>-<arch>.dmg` under `desktop/release/`. macOS packages must be built on macOS.

The installer bundles the Electron app, frontend build, backend source, and shared templates. It does not bundle the Python virtualenv.

## Local Data

Packaged desktop mode keeps generated state in the OS user-data folder instead of the installed app bundle:

| Data | Location |
|------|----------|
| SQLite DB | `userData/data/bob.db` |
| Generated uploads/artifacts | `userData/uploads/` |
| Cache/temp | `userData/cache/`, `userData/tmp/` |
| Stable local secrets | `userData/secrets/` |

The Settings privacy panel includes a clear-cache action for generated cache/temp files. It does not delete sessions, credentials, settings, or the database.

## Window Chrome

On Windows, the app uses a frameless window with `titleBarOverlay`; the React top bar is draggable and controls opt out with `no-drag`. macOS keeps the standard native frame.

## Project Layout

```text
desktop/
  package.json
  tsconfig.json
  src/
    main.ts
    preload.ts
    backend-manager.ts
    static-server.ts
    paths.ts
  scripts/dev.js
  build/
    generate-icon.ps1
    icon.ico
    icon.png
  release/              # ignored build output
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend failed to start | Ensure Python is on PATH and `backend/venv` has `backend/requirements.txt` installed |
| Blank window in production | Run `npm run desktop:build` before `npm run desktop:dist:dir` or `npm run start` |
| Port 8000 in use | Stop other `run.py` / Uvicorn instances |
| Settings/API 503 | Wait for backend health; check Electron console output for `[backend]` logs |
| Windows installer icon error | Confirm `desktop/build/icon.ico` exists or regenerate icons |

