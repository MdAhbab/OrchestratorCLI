import { apiFetch } from "./api";
import { createSharedPoller, type SharedPoller } from "./sharedPoller";
import { fetchSessionEntries } from "./loadSessions";
import { SESSIONS_CHANGED } from "./sessionsBus";
import type { SessionEntry } from "../components/store";

export type GitSnap = {
  branch?: string | null;
  files_changed?: number;
  is_repo?: boolean;
  [key: string]: unknown;
};

export type GitStatusState = {
  snap: GitSnap | null;
  /** True when the last poll could not reach the backend at all. */
  offline: boolean;
};

/** Git status shared by TopBar and Sidebar — one request instead of two. */
export const gitStatusPoller = createSharedPoller<GitStatusState>(
  async () => {
    try {
      const res = await apiFetch("/workspace/git", { timeoutMs: 12_000 });
      if (!res.ok) return { snap: null, offline: true };
      return { snap: (await res.json()) as GitSnap, offline: false };
    } catch {
      return { snap: null, offline: true };
    }
  },
  20_000,
  { snap: null, offline: false },
);

/** Session list shared by Sidebar and SessionHistory. `null` = not loaded yet. */
export const sessionsPoller: SharedPoller<SessionEntry[] | null> = createSharedPoller<
  SessionEntry[] | null
>(
  async () => {
    try {
      return await fetchSessionEntries(50);
    } catch {
      return sessionsPoller.getSnapshot() ?? [];
    }
  },
  20_000,
  null,
);

// Refresh immediately whenever the app mutates sessions (new chat, clear, …).
if (typeof window !== "undefined") {
  window.addEventListener(SESSIONS_CHANGED, () => sessionsPoller.refresh());
}
