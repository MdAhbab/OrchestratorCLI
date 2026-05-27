# System Audit Report (2026-05-27)

**Branding**
- **IBM/hackathon references remain in public demo and docs**: marketing copy and demo strings still mention IBM BOB/IBM Cloud and a hackathon write-up. This will confuse a product launch and creates brand/IP risk. See [downloader_page/src/imports/PROBLEM_ANALYSIS.md](downloader_page/src/imports/PROBLEM_ANALYSIS.md#L17), [downloader_page/src/app/demo/App.tsx](downloader_page/src/app/demo/App.tsx#L157), [downloader_page/src/app/demo/components/store.tsx](downloader_page/src/app/demo/components/store.tsx#L152), [downloader_page/src/app/demo/components/ChatView.tsx](downloader_page/src/app/demo/components/ChatView.tsx#L290), [downloader_page/src/app/demo/components/Settings.tsx](downloader_page/src/app/demo/components/Settings.tsx#L491), and [release/installer/README.md](release/installer/README.md#L6).
  Fix: replace IBM/IBM Cloud strings with your product brand and neutral provider text across demo data, UI labels, and docs.
  Fix: remove or relocate the hackathon analysis to private/internal docs, or rewrite it as a product case study.
  Fix: keep the Bob CLI as a feature, but rename it without IBM references and align it with the actual product configuration.

**Security & Privacy**
- **Onboarding collects account passwords and stores them while UI claims they are never sent**. The UI states passwords are never sent, but `secret` is posted and encrypted server-side. See [frontend/src/app/components/Onboarding.tsx](frontend/src/app/components/Onboarding.tsx#L147) and [frontend/src/app/components/Onboarding.tsx](frontend/src/app/components/Onboarding.tsx#L772) plus backend storage in [backend/api/routes/onboarding.py](backend/api/routes/onboarding.py#L161).
  Fix: remove password collection for account-based CLIs and rely on native OAuth/CLI login flows instead.
  Fix: if tokens must be stored, use OS keychain integrations (Windows Credential Manager/macOS Keychain) and only persist opaque tokens.
  Fix: update the copy to describe the real storage model and surface a clear security disclaimer.

**Backend/Frontend Contract**
- **Onboarding preferences mark infra providers disabled even when forced enabled**, causing UI state drift. The backend forces infra/orchestrator providers enabled but writes preferences using `name in selected` only. See [backend/api/routes/onboarding.py](backend/api/routes/onboarding.py#L291) and frontend hydration in [frontend/src/app/components/store.tsx](frontend/src/app/components/store.tsx#L300).
  Fix: write preference values using the computed `is_selected` (post-force) or skip infra providers entirely in preference writes.
  Fix: during hydration, prefer DB `is_enabled` when preferences are missing or contradictory.
  Fix: add a migration to reconcile existing users so provider toggles stop flipping on refresh.

- **Session status enum mismatch (`failed`)**: frontend expects a `failed` status but backend does not allow it. See [frontend/src/app/components/store.tsx](frontend/src/app/components/store.tsx#L227) and [backend/database/models.py](backend/database/models.py#L30).
  Fix: add `FAILED` to `SessionStatus` (plus API handling) or remove it from frontend UI/state models.
  Fix: add explicit mapping and validation to prevent invalid status writes.
  Fix: update UI filters and badges to match the backend enum set.

**UX / Forms / Actions**
- **Workspace picker stores `~/{handle.name}` and can resolve to an invalid path**. This often loses the full path and fails validation. See [frontend/src/app/components/Onboarding.tsx](frontend/src/app/components/Onboarding.tsx#L111).
  Fix: persist the handle (File System Access API) or prompt users to paste an absolute path explicitly.
  Fix: on desktop builds, use native APIs (Electron/Tauri) to capture full paths.
  Fix: show path validation feedback before allowing the user to continue.

- **Editor accent buttons do nothing** in Settings. The UI renders color chips without state/persistence. See [frontend/src/app/components/Settings.tsx](frontend/src/app/components/Settings.tsx#L260).
  Fix: add a `ui.prefs.accentColor` preference and store it through the existing settings sync.
  Fix: pipe the color into CSS variables and update the theme provider on change.
  Fix: show the active color state and persist it across reloads.

- **Provider configuration can flip to “not configured” after saving** if the key is masked or unchanged. The save handler sets `configured` based only on local `secret`. See [frontend/src/app/components/Settings.tsx](frontend/src/app/components/Settings.tsx#L383).
  Fix: treat masked credentials as configured and preserve `p.configured` when the backend already has a stored credential.
  Fix: only set `configured=false` after a successful revoke or when the backend reports missing credentials.
  Fix: show an explicit UI toast if credential storage fails.

- **Session history “Clear” fails silently** because the backend requires `?confirm=true`. The UI calls `DELETE /sessions` without the flag. See [frontend/src/app/components/SessionHistory.tsx](frontend/src/app/components/SessionHistory.tsx#L194), [frontend/src/app/components/store.tsx](frontend/src/app/components/store.tsx#L727), and [backend/api/routes/sessions.py](backend/api/routes/sessions.py#L398).
  Fix: add the required confirmation flag to the request and surface errors when the deletion fails.
  Fix: keep the existing confirm dialog but pass it through to the backend.
  Fix: add a success toast so users know history is truly cleared.

- **Git command runner cannot confirm write operations** and will fail for commit/push. The UI never passes `confirm`, and production blocks those commands. See [frontend/src/app/components/Sidebar.tsx](frontend/src/app/components/Sidebar.tsx#L169) and [backend/api/routes/workspace.py](backend/api/routes/workspace.py#L307).
  Fix: detect write subcommands client-side, prompt for confirmation, and send `confirm: true` when the user approves.
  Fix: hide/disable write commands when `DEBUG` is false, and show a clear tooltip why.
  Fix: add backend responses to the UI so users see failures immediately.

- **Shared context uploads skip file type and size validation**. `/workspace/shared` writes files without the safety checks used by `/workspace/context`. See [frontend/src/app/components/GlobalChatBar.tsx](frontend/src/app/components/GlobalChatBar.tsx#L36) and [backend/api/routes/workspace.py](backend/api/routes/workspace.py#L336).
  Fix: reuse `validate_file_type` and `validate_file_size` for shared uploads, and enforce a consistent allowlist.
  Fix: show per-file upload errors in the UI rather than only logging to console.
  Fix: reject executable extensions and sanitize filenames at the API layer.

- **Context “delete” only removes the item in UI**; the file stays on disk and returns on resync. See [frontend/src/app/components/ContextDropzone.tsx](frontend/src/app/components/ContextDropzone.tsx#L256).
  Fix: add a `DELETE /workspace/shared/{relative_path}` endpoint and call it on delete.
  Fix: confirm destructive actions and show a toast on success/failure.
  Fix: update the list by refetching after deletion to keep UI and disk in sync.

- **Per-session spend is averaged across all sessions** rather than calculated. See [frontend/src/app/lib/loadSessions.ts](frontend/src/app/lib/loadSessions.ts#L46).
  Fix: extend backend analytics to return spend/tokens per session (by session_id).
  Fix: update the list UI to use real values, not averages.
  Fix: keep a fallback only when analytics are unavailable.

- **Bob CLI is excluded from the real app and never gets a command mapping**. The main app filters out `bob` as infra, and there is no task command case for it. See [frontend/src/app/App.tsx](frontend/src/app/App.tsx#L63) and [frontend/src/app/components/TerminalCard.tsx](frontend/src/app/components/TerminalCard.tsx#L72).
  Fix: if Bob CLI should be a real feature, add it to the default provider list and remove it from infra exclusions.
  Fix: add a concrete command mapping for the Bob CLI in `commandForAssignedTask`.
  Fix: align backend provider config and installer registry so Bob is installed and enabled consistently.
