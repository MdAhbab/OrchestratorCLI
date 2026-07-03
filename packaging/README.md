# AI CLI Orchestrator — Packaging

Builds the production desktop installers using **electron-builder**. Python
backend source and the built frontend are bundled via `extraResources` — there
is no PyInstaller step.

> The legacy PyInstaller + Inno Setup pipeline (`setup.iss`, `create_dmg.sh`,
> `build_windows.py`, `launcher/`) was removed (audit C-HIGH-02). `build.py` is
> the single source of truth.

## What gets built

| Platform | Target | Artifact |
|----------|--------|----------|
| Windows  | NSIS   | `AI-Orchestrator-Setup-${version}.exe` (x64) |
| macOS    | DMG    | `AI-Orchestrator-${version}-${arch}.dmg` (x64 + arm64) |
| Linux    | AppImage + deb | `AI-Orchestrator-${version}-${arch}.AppImage`, `.deb` |

Output lands in `desktop/release/`. Configuration lives in
[`desktop/package.json`](../desktop/package.json) under `build`.

## Quick start

```bash
# From repo root — builds backend venv, frontend, and the installer for the host OS
python packaging/build.py
```

`build.py` runs three steps: (1) `packaging/backend/build_backend.py` (venv +
deps), (2) `npm run build` in `frontend/`, (3) `npm run dist -- --win|--mac|--linux`
in `desktop/`.

On Windows, when no signing certificate is configured, `build.py` creates an
unsigned local installer and passes
`--config.win.signAndEditExecutable=false`. This avoids electron-builder's
`winCodeSign` symlink extraction failure in non-admin shells.

## Prerequisites

- **Node.js 18+** and npm
- **Python 3.8+** (for the backend venv build step)
- Build **on** each target OS (electron-builder does not cross-compile NSIS/DMG)

## Self-contained installer (optional — bundles Python)

By default the installed app uses the end user's system Python to create a venv
on first launch. To remove that requirement (audit C-CRIT-01), bundle a
relocatable Python before building:

```bash
python packaging/fetch_python.py            # downloads into desktop/resources/python
python packaging/build.py
```

`desktop/src/paths.ts → getBundledPython()` then prefers the bundled interpreter,
falling back to system Python when absent.

## Code signing & notarization (optional — audit C-CRIT-02)

Unsigned builds work for local testing but trigger Gatekeeper/SmartScreen
warnings for end users. To sign:

**macOS** — provide a Developer ID cert (keychain or `CSC_LINK`/`CSC_KEY_PASSWORD`)
and export, then build:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="XXXXXXXXXX"
python packaging/build.py
```

Hardened-runtime entitlements: [`desktop/build/entitlements.mac.plist`](../desktop/build/entitlements.mac.plist).
Notarization runs via the `afterSign` hook [`desktop/scripts/notarize.js`](../desktop/scripts/notarize.js)
(a no-op when the Apple env vars are unset).

**Windows** — set `CSC_LINK` (path/URL to `.pfx`) and `CSC_KEY_PASSWORD`;
electron-builder signs the NSIS installer automatically.

Signed Windows release builds use electron-builder's `winCodeSign` tools. If
extracting those tools fails with a symlink privilege error, run from an
elevated shell or enable Windows Developer Mode.

## Auto-update

`desktop/src/updater.ts` checks GitHub Releases (`MdAhbab/OrchestratorCLI`). Publish
artifacts whose names match the `artifactName` patterns above; macOS auto-update
requires signed + notarized builds.

## Directory layout

| Path | Purpose |
|------|---------|
| `build.py` | Top-level build orchestration (electron-builder) |
| `fetch_python.py` | Optional: download relocatable Python for self-contained builds |
| `backend/` | Backend venv build helper + requirements |
| `bootstrapper/cli_registry.json` | AI CLI install definitions used by the installer service |
| `windows/README.txt` | End-user install/troubleshooting guide (shipped) |
| `workspace/` | First-run workspace templates |
| `version.json` | Release version + minimum requirements |

## Related

- [docs/QUICK_START.md](../docs/QUICK_START.md) — run from source
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — system architecture
- [audit.md](../audit.md) — system audit this packaging setup resolves
