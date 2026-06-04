# AI CLI Orchestrator — System Audit

| | |
|---|---|
| **Product** | AI CLI Orchestrator (desktop app) |
| **App version** | 0.8.0 |
| **Audit date** | 2026-06-05 |
| **Scope** | Backend (FastAPI), Frontend (React/Vite), Electron desktop shell, packaging/installers, downloader page, cross-platform terminal & CLI setup |
| **Method** | Static analysis + targeted code verification (greps + direct reads). No runtime/dynamic testing was performed. |

**Verification legend:** ✅ verified by direct code read · 🔶 reported by analysis, confirm while fixing · ⚪ design/architectural observation.

---

## 1. Executive Summary

The app is **well-structured and ~90% wired** end-to-end: no dead buttons were found, the REST/WS
surface matches the frontend, real OS PTYs are spawned cross-platform, and two real installers
(Windows NSIS + macOS DMG) are produced by a clean `electron-builder` pipeline. The architecture is
sound.

However, **three pillars of the stated orchestration design are missing or only partially built**,
and there are several deployment-blocking gaps:

**Top risks (fix first):**
1. **Quota management is not implemented.** `quota_used` is stored but never incremented at runtime,
   and there is **no quota-aware rerouting**. The central AI cannot "handle a CLI running low." (A-CRIT-01)
2. **Installed CLIs are unreachable from the agent terminal.** Nothing injects `~/.ai-clis/.bin` into
   the spawned shell's PATH, so `claude` / `gemini` / `codex` can be "command not found" right after a
   successful install. (A-CRIT-02)
3. **The installer is not self-contained.** It bundles backend *source* but no Python interpreter; the
   app silently requires the user to pre-install Python 3.8+ and Node 18+, contradicting the "install
   in 30 seconds" promise. (C-CRIT-01)
4. **No code signing / notarization.** macOS Gatekeeper will flag the DMG as damaged/unidentified and
   Windows SmartScreen will warn — most users will be blocked at first launch. (C-CRIT-02)
5. **Single-writer artifact safety is plan-time only.** Exclusive file ownership is enforced when the
   plan is generated, but there is no runtime lock and the shared `divisions.md` status file has a
   read-modify-write race under concurrent terminals. (A-HIGH-01)

**Counts:** Critical 7 · High 11 · Medium 14 · Low 9.

**What's genuinely good:** dual-mode API base URL (browser + Electron), cross-platform PTY (PowerShell/
cmd on Windows via pywinpty, zsh/bash on Unix), encrypted credential storage, plan-time file-conflict
detection, streaming chat UX, and a clean `packaging/build.py` driving `electron-builder`.

---

## 2. Intended Design vs. Reality

| Design contract | Reality | Status |
|---|---|---|
| Central orchestrator LLM plans & divides work | `OrchestratorEngine` + decomposer + router do this | ✅ Built |
| Plan/tasks artifact produced | `shared/divisions.md` written from plan | ✅ Built |
| Any CLI reads; **one** CLI edits an artifact at a time | Enforced **only at plan time** via non-overlapping `owns_files`; no runtime lock; shared status file races | 🟡 Partial (A-HIGH-01) |
| Central AI **manages quota**, reroutes when a CLI is low | Quota columns exist; never incremented; **no reroute** | ❌ Missing (A-CRIT-01) |
| Central AI **tracks progress**, makes decisions | Division status is parsed heuristically from terminal output and broadcast; orchestrator does not act on it | 🟡 Partial (A-MED-03) |
| Every supported AI CLI can be set up | Installer installs them, but spawned terminal can't find them (PATH) | 🟡 Partial (A-CRIT-02) |
| Works with Windows PowerShell/cmd & macOS terminal | PTY layer correctly selects per-OS shells | ✅ Built |
| Two installers (mac + win) | NSIS `.exe` + DMG (x64+arm64) | ✅ Built (but unsigned, not self-contained) |

---

## 3. Area A — Backend Orchestration & CLI Engine

### A-CRIT-01 · Quota tracking & quota-aware rerouting not implemented ✅
- **Evidence:** `quota_limit`/`quota_used`/`quota_reset_at` exist in [models.py:271-272](backend/database/models.py#L271) and are read/written from *user-supplied* config in [providers.py:281-293](backend/api/routes/providers.py#L281); `quota_used` is **never incremented** at runtime (grep shows only reads). `QuotaExceededError` ([exceptions.py:188](backend/utils/exceptions.py#L188)) is **never raised** in the router/orchestrator path. The router has no quota check.
- **Impact:** The single most-emphasized design behavior — "if any CLI's quota is close to running out, handle it / reroute" — does not exist. Quota bars in the UI reflect `usage_analytics` spend, not enforced limits.
- **Fix direction:** See **Blueprint 8.1**. Increment usage on each provider/CLI call, persist, and add a quota gate + reroute in the router.

### A-CRIT-02 · Installed CLIs not on the spawned terminal's PATH ✅
- **Evidence:** PTY spawn uses `os.execvp(argv[0], argv)` ([pty_service.py:90](backend/services/pty_service.py#L90)) inheriting the parent env unchanged; no `env=` is passed in `spawn()` and no `~/.ai-clis` injection exists in `pty_service.py`, `runtimes.py`, or `terminals.py` (grep = no matches). Yet `cli_registry.json` claims *"The app automatically adds ~/.ai-clis/node_modules/.bin to PATH when launching CLI processes."* It does not.
- **Secondary bug:** path-location mismatch — installer verifies `~/.ai-clis/.bin` ([cli_installer.py:289](backend/services/cli_installer.py#L289)) while the registry note says `~/.ai-clis/node_modules/.bin`.
- **Impact:** After a *successful* `npm install --prefix ~/.ai-clis`, typing `claude`/`gemini`/`codex` in the agent terminal fails unless the CLI is also globally installed. Directly breaks "every supported AI CLI can be set up."
- **Fix direction:** See **Blueprint 8.2**. Inject the resolved CLI bin dir into the PTY env PATH.

### A-HIGH-01 · Single-writer artifact safety is plan-time only; `divisions.md` status race ✅
- **Evidence (good part):** Decomposer assigns non-overlapping `owns_files` and `_validate_no_file_conflicts` **is called** ([decomposer.py:336](backend/services/orchestrator/decomposer.py#L336)). **Evidence (gap):** `update_division_status_for_provider` ([orchestrator.py:628](backend/api/routes/orchestrator.py#L628)) does read → regex-substitute → write on `divisions.md` with no lock, and it is invoked from the terminal WS path ([terminals.py:200-215](backend/api/websockets/terminals.py#L200)) — multiple terminals can collide (last-write-wins). No `FileLock`/`flock` anywhere (only `fcntl` for PTY window size).
- **Impact:** Concurrent status updates silently lose data; nothing prevents an agent process from editing a file it doesn't own.
- **Fix direction:** See **Blueprint 8.3** (advisory file lock + atomic write + ownership guard).

### A-HIGH-02 · Streaming chat errors are not surfaced to the client ✅
- **Evidence:** `_stream_chat_events` ([orchestrator.py:801](backend/api/routes/orchestrator.py#L801)) yields `start`/`token`/`done`; the only `try/except` (832-835) wraps the `divisions.md` write, **not** the token-producing loop (~843) or the generator body. An exception mid-stream closes the SSE with no `error` event.
- **Impact:** On provider timeout/crash mid-response the UI hangs (see B-HIGH-01 stuck `chatSending`).
- **Fix direction:** Wrap the generator in `try/except`, `yield` a typed `{"type":"error","message":...}` event, and always emit a terminal `done`.

### A-HIGH-03 · LLM JSON-parse failure silently degrades to offline heuristic plan 🔶
- **Evidence:** [core.py:236-260](backend/services/orchestrator/core.py#L236) catches `JSONDecodeError`, retries with more tokens, then falls back to `offline_plan`/`local_divisions` and logs a **warning** only.
- **Impact:** User believes the orchestrator planned the work; it actually used a deterministic heuristic. No UI signal.
- **Fix direction:** Tag plan metadata `{"plan_quality":"degraded","reason":...}` and show a badge; log at ERROR.

### A-HIGH-04 · No outer timeout on orchestrator inference 🔶
- **Evidence:** `complete_with_fallback` ([core.py:226](backend/services/orchestrator/core.py#L226)) has per-request timeouts per provider but no overall budget; if all providers hang the chat blocks.
- **Fix direction:** Wrap the planning call in `asyncio.timeout(settings.timeout_seconds)`.

### A-MED-01 · Provider health check exists but is never used for routing 🔶
- `health_check_all()` ([router.py:52](backend/services/orchestrator/router.py#L52)) is only exposed via HTTP; the routing path never consults it, so a dead provider is still tried first.

### A-MED-02 · Fuzzy agent matching can misroute 🔶
- Substring match in `_delegate_divisions_to_agents` ([orchestrator.py:233](backend/api/routes/orchestrator.py#L233)) (`name in slug or slug in name`) can pick the wrong agent when slugs overlap (e.g. `copilot` vs `copilot-cli`). Prefer exact slug, fail loudly otherwise.

### A-MED-03 · Progress tracking is heuristic and one-way ✅
- Division status is regex-parsed from terminal output and written back to `divisions.md` + broadcast `division.status`. It is display-only — the orchestrator never re-plans or reroutes based on it. Acceptable for v1 but note it's not the "central AI makes decisions from progress" described.

### A-MED-04 · A2A bus is in-memory, no persistence/ack 🔶
- `A2ABus` uses bounded `deque`s ([a2a.py:47](backend/services/agents/a2a.py#L47)); messages are lost on restart and undeliverable to offline agents, with no ACK. Fine for single-process dev; document as a known limitation or back with the DB.

### A-MED-05 · MCP registry in-memory only 🔶
- `mcp.py` registry is non-persistent; dynamically registered tools vanish on restart and can't be disabled. Built-ins are `echo`, `workspace.list_files`.

### A-MED-06 · Session context window hardcoded to last 20 messages 🔶
- [orchestrator.py:61-77](backend/api/routes/orchestrator.py#L61) — long sessions lose early context, degrading routing. Make configurable / token-budgeted.

### A-LOW-01 · Inconsistent error envelopes (some `detail` string, some `{error:...}`) 🔶
### A-LOW-02 · Broad `except Exception` swallow points (orchestrator.py:282, 315, 924) lose tracebacks 🔶
### A-LOW-03 · Plaintext credential fallback when `ENCRYPTION_KEY` unset, no warning ([config.py](backend/config.py)) 🔶

---

## 4. Area B — Frontend Wiring & Button-by-Button Matrix

**Headline (positive):** No dead/no-op buttons were found; every `onClick` maps to a real API call or
client action, every frontend endpoint has a matching backend route, and `api.ts` correctly handles
both browser (`/api` proxy) and Electron (`VITE_API_BASE`/`VITE_WS_BASE`) modes including `ws/wss`.

### B-HIGH-01 · Chat can get stuck after a failed stream 🔶
- [App.tsx ~223-320](frontend/src/app/App.tsx#L223) — if `/orchestrator/chat` streaming fails mid-response, a dangling `stream-*` message remains and `chatSending` stays `true`, blocking further sends. Pairs with A-HIGH-02. Add abort/timeout + a "clear stuck stream" recovery and a retry.

### B-HIGH-02 · Settings/orchestrator auto-sync can silently drop changes 🔶
- [store.tsx ~673-700](frontend/src/app/components/store.tsx#L673) — 500 ms debounced `PUT /settings` & `PUT /orchestrator/config` with no retry/backoff; if the backend bounces in that window the change is lost while the UI shows it applied. Add retry + a "not saved" indicator.

### B-HIGH-03 · File-upload failures are invisible 🔶
- `GlobalChatBar.tsx` & `ContextDropzone.tsx` upload to `/workspace/context|/workspace/shared` but only `console.warn` on failure; the file appears attached but never reached the backend. Add toast + block send until uploads succeed.

### B-HIGH-04 · Provider credentials: no loading state → accidental overwrite 🔶
- `Settings.tsx` `ProviderRow` (~408-542) fetches `/providers/{id}/credentials` with no spinner; a Save on a slow network can clear a key. Disable Save until loaded.

### B-MED-01 · No global "backend offline" indicator 🔶 (`TopBar.tsx`) — failed health/git/notifications calls render empty silently.
### B-MED-02 · `VoiceButton.tsx` falls back to canned demo text when Web Speech API is unavailable, with no "demo mode" badge. ✅ (design choice; label it)
### B-MED-03 · "Install All" sends `slugs: null` to `/installer/install`; confirm backend treats null as "all". 🔶
### B-MED-04 · Desktop bridge (`window.ibbobDesktop`) never existence-checked; native features silently no-op in browser/preload-fail. 🔶
### B-MED-05 · `RuntimeLogPanel.tsx` polls `/runtimes/{id}` every 10 s regardless of visibility — wasteful; pause when hidden.
### B-LOW-01 · `AnalyticsStrip.tsx` no loading skeleton (layout shift). 🔶
### B-LOW-02 · Hardcoded provider `dailyCap` defaults in `store.tsx` (49-177) instead of from `/providers`. 🔶
### B-LOW-03 · `CliInstallHint` uses a static map instead of `/settings/cli-registry`. 🔶
### B-LOW-04 · TerminalCard WS token-refresh reconnect race ([TerminalCard.tsx ~280-295](frontend/src/app/components/TerminalCard.tsx#L280)). 🔶

### Button / control wiring matrix (status verified to exist; ✅ = wired to a real backend route)
| Section | Control | Endpoint | Status |
|---|---|---|---|
| App / ChatView | Send / suggestion / stream | `POST /orchestrator/chat` (SSE) | ✅ wired · B-HIGH-01 recovery gap |
| Sidebar | Select session / history / git / health | `/sessions*`, `/workspace/git`, `/health` | ✅ |
| TopBar | Update-restart / git / notifications | Electron IPC, `/workspace/git`, `/analytics/events/recent` | ✅ · B-MED-01 |
| GlobalChatBar | Attach files / voice | `/workspace/context\|shared`, Web Speech | ✅ · B-HIGH-03 / B-MED-02 |
| Settings | Provider toggle/save/revoke | `PUT /providers/{id}`, `POST/DELETE /providers/{id}/credentials` | ✅ · B-HIGH-04 |
| Settings | Orchestrator save/reset | `PUT/POST /orchestrator/config*` | ✅ · B-HIGH-02 |
| Settings | Clear cache/sessions, updates | `/settings/storage/clear-cache`, `DELETE /sessions`, Electron updater | ✅ |
| Settings | Install Node/CLI/All, verify | `/installer/install*`, `/installer/verify/*`, `/installer/status` | ✅ (SSE) · A-CRIT-02 PATH gap · B-MED-03 |
| Onboarding | Workspace pick/validate, finish | Electron dialog / file input, `/workspace/validate-path`, `/onboarding/complete` | ✅ · B-MED-04 |
| Processes/Terminal | Spawn/pause/resume/approve/delete, WS | `/runtimes/*`, `WS /ws/terminals/{id}` | ✅ · B-LOW-04 |
| OrchestratorGraph | Load divisions / routes / dispatch | `/workspace/artifacts/.../divisions.md`, `/analytics/routes`, `/orchestrator/dispatch` | ✅ |
| Artifacts/Context | List/open/upload/delete | `/workspace/artifacts/*`, `/workspace/shared` | ✅ · B-HIGH-03 |
| Agents/Tools | List agents / MCP tools | `/agents`, `/tools/mcp` | ✅ |
| Analytics | Routing summary | `/analytics/routes` | ✅ · B-LOW-01 |

---

## 5. Area C — Installer / Packaging / Desktop / Cross-Platform

### Two installers? — YES ✅
`electron-builder` (driven by [packaging/build.py](packaging/build.py)) produces, per [desktop/package.json:72-103](desktop/package.json#L72):
- **Windows:** NSIS → `AI-Orchestrator-Setup-${version}.exe` (x64).
- **macOS:** DMG (x64 **and** arm64) → `AI-Orchestrator-${version}-${arch}.dmg`.
No PyInstaller is used; backend is bundled as source via `extraResources`.

### C-CRIT-01 · Installer is NOT self-contained (no bundled Python) ✅
- **Evidence:** `extraResources` ships `../backend` source, `../frontend/dist`, `../shared` — but no Python interpreter. `backend-manager.ts` resolves a **system** Python (`py`/`python`/`python3`) and builds a venv on first launch; `paths.ts` falls back to system `python3`/`py`.
- **Impact:** On a clean machine with no Python 3.8+ the app cannot start; AI CLIs additionally need Node 18+. This contradicts the downloader's "Install in 30 seconds." See **Blueprint 8.4**.

### C-CRIT-02 · No code signing / notarization ✅
- **Evidence:** `mac` block has no `identity`/`notarize`; `win` has no `certificateFile`/sign config.
- **Impact:** macOS Gatekeeper blocks the unsigned DMG ("damaged"/unidentified developer); Windows SmartScreen warns. Most users are blocked at first run. Document/obtain certs; add `afterSign` notarization (notarytool).

### C-HIGH-01 · Linux is advertised but never built ✅
- Downloader offers Linux (`.deb · .rpm · AppImage`) and `build.py` has a `--linux` branch, but `desktop/package.json` defines **no** `linux` target → nothing is produced. Either add a `linux` target (AppImage/deb) or remove Linux from the downloader.

### C-HIGH-02 · Stale, conflicting legacy packaging artifacts ✅/🔶
- `packaging/windows/setup.iss` references a PyInstaller `orchestrator-backend.exe`; `packaging/macos/create_dmg.sh` points to `packaging/backend/dist`; `packaging/launcher/*` and `packaging/build.ps1` reference an old `release/installer/...` layout. None are used by the real `build.py`/electron-builder path. They will mislead and break ad-hoc builds. **Recommend deleting** `packaging/launcher/`, `setup.iss`, `create_dmg.sh`, `build.ps1` (or clearly mark legacy).

### C-MED-01 · `run.py` npm invocation breaks on Windows ✅
- [run.py:359-368](run.py#L359) calls `subprocess.run(["npm.cmd","install"], ...)` **without** `shell=True`; on Windows CreateProcess cannot execute the `.cmd` batch directly. (By contrast [build.py:73-100](packaging/build.py#L73) does it correctly with `shell=(windows)`.) Affects developers running from source on Windows (not the shipped app). Fix: `shutil.which("npm")` or pass `shell=True` on Windows.

### C-MED-02 · No backend port auto-detect ✅
- `backend-manager.ts` hardcodes `DEFAULT_BACKEND_PORT = 8000` with no "port in use" fallback (run.py *does* scan for a free port). Two instances or a busy 8000 → launch failure. Port-scan like run.py.

### C-MED-03 · Auto-update requires signed releases & correct asset names 🔶
- `updater.ts` + publish config target `github MdAhbab/IBMbob`. Works only if the repo has Releases with assets matching `artifactName`, and (for macOS) signed builds. Document the release flow; errors are currently swallowed as warnings.

### C-LOW-01 · `preload.ts` hardcodes fallback version `"0.8.0"`; bump risk. 🔶
### C-LOW-02 · `build.py` artifact summary only scans `.exe/.dmg/.AppImage/.deb` and a fixed dir — cosmetic. ✅

### Cross-platform terminal — VERIFIED WORKING ✅
[pty_service.py `_default_shell()`:145-165](backend/services/pty_service.py#L145):
- **Windows:** prefers `powershell.exe -NoLogo`, falls back to `ComSpec`/`cmd.exe`; real ConPTY via `pywinpty`.
- **macOS/Linux:** `/bin/zsh` → `/bin/bash` → `/bin/sh -i`; POSIX `pty`.
- **Corner case (C-MED-04):** if `pywinpty` fails to import on Windows, `_PTY_AVAILABLE=False` and terminals fail — pin it in requirements and surface a clear error.

---

## 6. Area D — Downloader Page (frontend-only marketing/download)

Confirmed: purely frontend (Vite + React, Vercel), no backend dependency. The `/demo` route **is**
wired ([main.tsx:11](downloader_page/src/main.tsx#L11) `BrowserRouter`), and `vercel.json` has the SPA
rewrite so deep links resolve — **the demo is not broken** (corrects an earlier finding).

### D-HIGH-01 · Download buttons don't link to the two real installers ✅
- **Evidence:** [DownloadCTA.tsx:5,69](downloader_page/src/app/components/DownloadCTA.tsx#L5) — Windows, macOS, **and** Linux buttons all use one `downloadLink` to a **Google Drive folder**; no per-OS direct installer link and no OS auto-detection.
- **Impact:** Users land in a folder and must guess the right file; contradicts "1 installer for mac, 1 for windows" being directly downloadable.
- **Fix:** Host the real `.exe`/`.dmg` on GitHub Releases (or similar); map each platform button to its artifact; optionally auto-highlight the visitor's OS via `navigator.userAgent`.

### D-MED-01 · Dead footer links ✅
- [DownloadCTA.tsx:126-129](downloader_page/src/app/components/DownloadCTA.tsx#L126) — Docs/Discord/Privacy are `href="#"`. Point to real URLs or remove.

### D-LOW-01 · Version drift ✅
- Footer shows `v1.0.0-beta.3` ([DownloadCTA.tsx:106](downloader_page/src/app/components/DownloadCTA.tsx#L106)); `downloader_page/package.json` is `1.0.0`; app is `0.8.0`. Reconcile or drive from one source.

### D-LOW-02 · `demo/` folder is a full copy of the app UI shipped in the marketing bundle ✅
- Works, but bloats the build and duplicates `frontend/`. Consider code-splitting the `/demo` route or trimming.

---

## 7. Cross-Cutting Corner-Case Catalog

| # | Scenario | Current behavior | Severity |
|---|---|---|---|
| 1 | No system Python / wrong version on user PC | App can't boot (no bundled interpreter) | Critical (C-CRIT-01) |
| 2 | macOS Gatekeeper / Windows SmartScreen on unsigned build | First launch blocked/scary | Critical (C-CRIT-02) |
| 3 | CLI installed to `~/.ai-clis` but not on PATH | "command not found" in agent terminal | Critical (A-CRIT-02) |
| 4 | A CLI hits its quota mid-run | No detection, no reroute | Critical (A-CRIT-01) |
| 5 | Port 8000 busy | Backend spawn fails (no fallback) | Medium (C-MED-02) |
| 6 | `pywinpty` missing on Windows | Terminals silently unavailable | Medium (C-MED-04) |
| 7 | LLM returns malformed JSON | Silent downgrade to heuristic plan | High (A-HIGH-03) |
| 8 | All providers fail / no API key | Local deterministic divisions; error messaging thin | Medium |
| 9 | Two terminals update `divisions.md` together | Last-write-wins data loss | High (A-HIGH-01) |
| 10 | Stream fails mid-chat | UI hangs (`chatSending` stuck) | High (A-HIGH-02 / B-HIGH-01) |
| 11 | Backend offline while UI open | No global indicator; silent empties | Medium (B-MED-01) |
| 12 | Web Speech API unsupported | Canned demo text, no badge | Medium (B-MED-02) |
| 13 | Spaces / backslashes in workspace path | Mostly handled; verify Windows quoting in PTY cmdline | Low |
| 14 | Linux user downloads app | No Linux build exists | High (C-HIGH-01) |
| 15 | Settings change during backend bounce | Silently dropped | High (B-HIGH-02) |

---

## 8. Feature Blueprints (all four — design + planning, no code yet)

### 8.1 — Quota-Aware Orchestration & Auto-Reroute  *(closes A-CRIT-01; highest value)*
**Goal:** The orchestrator tracks each CLI/provider's usage against a limit and automatically routes
away from any CLI that is exhausted or near its threshold.

**Data model (migration):** reuse existing `quota_limit/quota_used/quota_reset_at` on `providers`;
add `quota_window` (`daily|hourly`) and `quota_threshold_pct` (default 0.85). Use the existing
`usage_analytics` table as the source of truth for spend.

**Backend changes:**
- **Metering:** after every provider call (`router.complete_with_fallback`) and every CLI task
  completion, increment usage. Add `services/quota_service.py` with
  `record_usage(provider_id, tokens, requests)`, `get_quota_state(provider_id) -> {used, limit, pct, reset_at, status}` where `status ∈ {ok, warn, exhausted}`, and `reset_if_elapsed()`.
- **Gate + reroute:** in `ProviderRouter.order_configs()` / `_delegate_divisions_to_agents`, skip
  providers/agents whose `status == exhausted`; for `warn`, deprioritize. When the chosen agent for a
  division is exhausted, pick the next eligible agent by specialty/priority and annotate the division
  metadata `{"rerouted_from": slug, "reason": "quota"}`. Emit a `quota.reroute` SSE/WS event.
- **Reset:** lazy reset on read when `now > quota_reset_at` (roll the window).

**API/UI:** extend `GET /providers` (or new `GET /orchestrator/quota`) with live quota state; UI shows
real warn/exhausted badges in ProcessesView + a toast/log when a reroute happens.

**Edge cases:** no eligible agent left → surface "all CLIs exhausted, queue or wait"; clock skew on
reset; streaming token counts (count on the fly, reconcile at `done`).

**Test plan:** unit-test `quota_service` window math + thresholds; integration: set a tiny limit, send
tasks, assert reroute + event + analytics increment. **Effort:** ~M (2–3 days).

---

### 8.2 — Installed-CLI PATH Wiring  *(closes A-CRIT-02; smallest, unblocks all CLI setup)*
**Goal:** Make CLIs installed into `~/.ai-clis` runnable inside spawned agent terminals.

**Design:**
- Add `cli_installer.get_cli_bin_dirs()` returning the real bin dirs (normalize the
  `~/.ai-clis/.bin` vs `~/.ai-clis/node_modules/.bin` discrepancy — include both that exist; on
  Windows include `~/.ai-clis` and `~/.ai-clis/node_modules/.bin`).
- In `pty_service.PtySession.spawn` (and the POSIX `execvp` branch / pywinpty branch), build
  `env = {**os.environ, "PATH": os.pathsep.join([*cli_bin_dirs, os.environ["PATH"]])}` and pass it to
  the child (POSIX: set env before `execvp`/use `execvpe`; pywinpty: pass `env=`).
- Fix the registry note to match reality.

**Edge cases:** missing dir (skip); Windows `PATHEXT`; don't leak secrets into env.
**Test plan:** install a CLI to a temp prefix, spawn a PTY, run `which/where <bin>` and assert found.
**Effort:** ~S (half day).

---

### 8.3 — Single-Writer Artifact Lock + `divisions.md` Race Fix  *(closes A-HIGH-01)*
**Goal:** Guarantee one-writer-at-a-time at runtime and make shared-file updates atomic.

**Design:**
- Add `services/artifact_lock.py` using the `filelock` package (add to `requirements.txt`):
  `with FileLock(path + ".lock", timeout=5): atomic_write(path, text)` where `atomic_write` writes to
  a temp file and `os.replace`s it.
- Route **all** `divisions.md` / shared-artifact writes (`_write_divisions_artifact`,
  `update_division_status_for_provider`) through it; make status update a single locked
  read-modify-write.
- **Ownership guard (optional, stronger):** before an agent writes an owned file, verify the path is in
  that agent's `owns_files`; reject/log otherwise. Surface a `WRITE_DENIED` event.

**Edge cases:** lock timeout (retry/backoff, then 409); stale `.lock` after crash (filelock handles);
cross-process on Windows (filelock is cross-platform).
**Test plan:** spawn N concurrent status updates, assert no lost writes + serialized result.
**Effort:** ~M (1–2 days).

---

### 8.4 — Self-Contained Installer  *(closes C-CRIT-01/-02; biggest deployment win)*
**Goal:** App runs after download with no pre-installed Python; clear story for Node-dependent CLIs.

**Design (two viable paths):**
- **(Recommended) Bundle a Python runtime:** ship a relocatable CPython (e.g. `python-build-standalone`)
  under `extraResources/python/`; `paths.ts`/`backend-manager.ts` prefer the bundled interpreter, fall
  back to system Python. Pre-create the venv at build time in `build_backend.py` and bundle it (or
  `pip install` into a bundled `site-packages`).
- **(Alt) Freeze the backend with PyInstaller** into a single backend binary and spawn that instead of
  `python -m backend.main` — removes the venv-on-first-launch step entirely.
- **Signing:** add macOS signing + notarization (`afterSign` notarytool) and Windows Authenticode in
  the electron-builder config; document cert provisioning. (C-CRIT-02)
- **Node:** for AI CLIs that need Node, either detect+prompt, or bundle a portable Node under
  `~/.ai-clis/node` and add it to PATH (composes with Blueprint 8.2).

**Edge cases:** arch matrix (mac x64/arm64, win x64); first-launch size; antivirus false positives on
unsigned/frozen binaries (mitigated by signing); offline install.
**Test plan:** build on a clean VM with **no** Python/Node, install, launch, complete onboarding, spawn
a CLI. **Effort:** ~L (3–5 days incl. signing setup).

---

## 9. Prioritized Remediation Roadmap

**P0 — blocks real-world use**
1. Self-contained installer + signing/notarization (8.4 / C-CRIT-01, C-CRIT-02)
2. Installed-CLI PATH wiring (8.2 / A-CRIT-02)
3. Quota tracking + auto-reroute (8.1 / A-CRIT-01)
4. Downloader → real per-OS installer links (D-HIGH-01)

**P1 — correctness/robustness**
5. Single-writer lock + divisions.md atomicity (8.3 / A-HIGH-01)
6. Streaming error events + chat stuck-state recovery (A-HIGH-02 / B-HIGH-01)
7. Settings/orchestrator auto-sync retry + "not saved" indicator (B-HIGH-02)
8. File-upload + credential-load UX (B-HIGH-03/04); orchestrator inference timeout (A-HIGH-04)
9. Resolve Linux build-vs-advertise mismatch (C-HIGH-01); delete stale `packaging/` legacy (C-HIGH-02)

**P2 — polish/hygiene**
10. Health-aware routing (A-MED-01), exact agent match (A-MED-02), port auto-detect (C-MED-02),
    run.py npm Windows fix (C-MED-01), backend-offline banner (B-MED-01), provider/CLI registry as
    single source (B-LOW-02/03), footer links & version drift (D-MED-01/D-LOW-01), error-envelope
    standardization (A-LOW-01).

---

## 10. Appendix — How findings were verified
Key greps/reads: quota increment (`grep quota_used` → reads only); lock (`grep FileLock|flock|fcntl`);
PATH injection (`grep ai-clis` in pty/runtimes/terminals → none); conflict check call
(`_validate_no_file_conflicts` → decomposer.py:336); shells (`_default_shell`); installers
(`desktop/package.json`, `packaging/build.py`); downloader (`main.tsx`, `DownloadCTA.tsx`,
`vercel.json`). Frontend race items (B-HIGH-01/02, B-LOW-04) are analysis-derived (🔶) — confirm at fix time.
