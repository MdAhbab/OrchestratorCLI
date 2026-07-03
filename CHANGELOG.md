# Changelog

All notable changes to AI CLI Orchestrator are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Performance
- **Dependency prune** — removed 145 unused npm packages and 45 dead shadcn/ui components; the frontend now depends only on what it imports.
- **Code-splitting** — Settings, Onboarding, Processes, and the fullscreen terminal load on demand; xterm, React, and motion ship as separately cacheable vendor chunks. Initial JS payload drops from ~1.04 MB to ~450 kB.
- **Visibility-aware polling** — every dashboard poller pauses while the window is hidden; git status and the session list are fetched once and shared across TopBar/Sidebar/SessionHistory instead of per-panel.
- **Chat streaming** — only the streaming bubble re-renders per token (memoized messages, stable handlers); auto-scroll jumps instantly during streams and no longer hijacks the scrollback while reading history.
- **PTY reader backoff** — idle terminal reader threads back off to 250 ms polls instead of waking 50×/s, and snap back on input/output.

### Fixed
- `POST /agents/a2a/send` crashed with a `NameError` (missing `A2AEnvelope` import).
- A plan division naming an unknown agent no longer 500s the whole dispatch — the division is skipped and annotated, valid ones still delegate.
- Division status updates never applied because the updater regex didn't match the `divisions.md` format the writer emits.
- Quota bars now parse the backend's list response and 0–1 fractions correctly, including the pre-empt tier.
- Terminal WebSockets reconnected in a loop after every token refresh (single-use token URL was an effect dependency); the fullscreen terminal also doubled keystrokes after reconnect (leaked xterm `onData` handler).
- Assigned-task commands are quoted for the actual shell — PowerShell vs zsh/bash — so apostrophes survive on macOS/Linux and the fallback echo works everywhere.
- Killing a terminal now terminates the whole process tree (`taskkill /T` on Windows, process group on POSIX); sessions no client ever attached to tear down after the idle window; concurrent terminals are capped by `max_concurrent_processes` (HTTP 429 when full).
- Hardened `/workspace/git/run` against argument-level escapes (`--upload-pack`, `--receive-pack`, `--output`, `git config` writes).
- Storage-summary and clear-cache endpoints no longer block the event loop on large directory walks.
- Desktop: WebSocket proxy errors no longer crash the main process; quit waits for the backend to stop (no orphaned uvicorn); reopening from the macOS Dock no longer boots a second backend; external links are restricted to http/https/mailto and in-window navigation is locked to the app origin; the auto-updater targets the renamed `MdAhbab/OrchestratorCLI` repository directly.

### Changed
- Analytics strip shows only real route/latency data (fabricated sparklines removed); the orchestrator graph no longer invents dispatch log lines; voice dictation no longer types a canned demo transcript when speech recognition is unavailable.
- The Settings font-size preference now actually scales the UI; dropdowns are keyboard-accessible (arrows/Home/End/Escape, ARIA listbox); each main view is isolated behind its own error boundary so one crash can't drop chat state.
- Remaining legacy branding renamed: desktop bridge is `window.orchestratorDesktop`, dev/env vars are `ORCHESTRATOR_DEV`, `ORCHESTRATOR_VITE_URL`, `ORCHESTRATOR_USER_DATA`, and docs/links point at `MdAhbab/OrchestratorCLI`.

---

## [0.9.1] — 2026-06-06

### Added
- **Benchmark-informed routing** — the orchestrator now routes tasks using real per-CLI benchmark data (SWE-bench / Terminal-Bench / specialties) from `backend/services/orchestrator/cli_benchmarks.json`. The system prompt carries a capability table, the offline split orders by capability, and quota hand-offs pick the strongest eligible CLI (frontend→Gemini, backend→Codex, architecture/hard-bugs→Claude).
- **Quota-aware pre-emptive CLI hand-off** — worker-CLI usage is parsed from terminal output (`cli_usage.py`); when a CLI passes the pre-empt threshold (90%) the orchestrator reroutes the task **before** exhaustion and queues it on an alternate CLI (`task_queue` table + `orchestrator/handoff.py`).
- **CLI tool layer** — uniform MCP tools (`cli.run_task / set_model / set_mode / get_usage / login / stop`) let the central AI drive each CLI via a per-CLI verb map (`cli_commands.json`), with shell-quoting and a destructive-command deny-list.
- **Self-contained, ad-hoc-signed macOS arm64 DMG** — bundles a relocatable Python with all backend deps and the SQL migrations, so it runs with **no system Python and no first-launch network**. A free `codesign -s -` hook (`desktop/scripts/afterPack.js`) avoids the "app is damaged" block — no paid Developer ID required.
- **Desktop bridge** `window.ibbobDesktop` exposed (fixes desktop detection); per-CLI quota bars (`QuotaBar`) in Processes.
- **`central_ai.json`** — orchestrator multi-provider keys + fallback order (seeder wiring tracked for a later release).

### Changed
- **Workspace setup** is now robust in both desktop and browser (text-input + Validate fallback, keep-prior-value on cancel, active-workspace indicator).
- **Downloader / `orchestrator.ahbab.dev`** — direct download links; **all GitHub links removed**; unsigned-build notice reworded for macOS + Windows; the live `/demo` route is preserved; deploy guide added for the custom domain (`public/CNAME`).
- **Version bumped to 0.9.1** across backend, frontend, desktop, packaging, and downloader.

### Fixed
- **GitHub Copilot CLI definition** — corrected the npm package to `@github/copilot` and the binary to `copilot` (was the outdated `@github/copilot-cli` / `github-copilot-cli`), so install/verify/run actually work.
- **Cline CLI** — corrected the npm package to `cline` (was `@cline/cli`).
- **Worker-CLI usage parsing** — recognizes real phrasings ("95% of your daily limit", "429", "resets at HH:MM") so pre-emption fires.
- **Packaged migrations** — `migrations/` is now bundled so `init_db.apply_sql_migrations()` finds and applies them in the installed app.

### Removed
- `AI CLI Research and Benchmarking.md` — research source distilled into `cli_benchmarks.json`.
- `ORCHESTRATOR_V0.9.md` — internal audit/plan, no longer needed (work shipped).

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
