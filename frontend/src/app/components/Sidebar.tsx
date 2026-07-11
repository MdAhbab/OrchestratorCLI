import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  Loader2,
  Menu,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from "lucide-react";
import { OrchestratorLogo } from "./OrchestratorLogo";
import { useStore, type Status, type SessionEntry } from "./store";
import { apiFetch, healthCheckUrl } from "../lib/api";
import { gitStatusPoller, sessionsPoller } from "../lib/appPollers";
import { useSharedPoller } from "../lib/sharedPoller";
import { usePolling } from "../lib/usePolling";

const STATUS_MAP: Record<Status, { dot: string; label: string; text: string }> = {
  online: { dot: "bg-emerald-500", label: "online", text: "text-emerald-600 dark:text-emerald-400" },
  offline: { dot: "bg-zinc-400", label: "offline", text: "text-zinc-500" },
  limited: { dot: "bg-rose-500", label: "rate-limited", text: "text-rose-600 dark:text-rose-400" },
};

const fmtWhen = (t: number) => {
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const STATUS_ICON: Record<SessionEntry["status"], { Icon: typeof CircleCheck; cls: string }> = {
  completed: { Icon: CircleCheck, cls: "text-emerald-500" },
  active: { Icon: Loader2, cls: "text-indigo-500 animate-spin" },
  paused: { Icon: Clock, cls: "text-amber-500" },
  archived: { Icon: CircleX, cls: "text-zinc-400" },
};

function HistoryItem({
  s,
  onSelect,
}: {
  s: SessionEntry;
  onSelect?: () => void;
}) {
  const { Icon, cls } = STATUS_ICON[s.status];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className="group flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-2 py-1.5 transition hover:border-zinc-200/70 hover:bg-white dark:hover:border-white/[0.06] dark:hover:bg-white/[0.03]"
    >
      <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${cls}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] leading-snug text-zinc-800 dark:text-zinc-200">
          {s.prompt}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] text-zinc-500">
          <span>{fmtWhen(s.startedAt)}</span>
          <span>·</span>
          <span>{s.agents.length} agents</span>
          <span>·</span>
          <span>${s.spend.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({
  view,
  onView,
  onOpenSettings,
  mobileOpen = false,
  onCloseMobile,
  onSelectSession,
}: {
  view?: string;
  onView?: (v: "chat" | "processes" | "settings") => void;
  onOpenSettings?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  /** Load a session's messages in the main chat view */
  onSelectSession?: (sessionId: number) => void;
}) {
  const { providers } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [gitOpen, setGitOpen] = useState(true);
  const [q, setQ] = useState("");
  const [backendHealthy, setBackendHealthy] = useState(false);
  const [backendLatencyMs, setBackendLatencyMs] = useState<number | null>(null);
  const [gitCmd, setGitCmd] = useState("");
  const [gitOutput, setGitOutput] = useState<string>("");

  const gitWriteCommands = new Set([
    "pull",
    "switch",
    "add",
    "stash",
    "push",
    "commit",
    "checkout",
  ]);

  // Session list + git status come from pollers shared with TopBar/SessionHistory.
  const remoteSessions = useSharedPoller(sessionsPoller);
  const gitStatus = useSharedPoller(gitStatusPoller);
  const git: any = backendHealthy ? gitStatus.snap : null;

  const runGit = async () => {
    if (!gitCmd.trim()) return;
    const raw = gitCmd.trim();
    const cleaned = raw.startsWith("git ") ? raw.slice(4) : raw;
    const subcmd = cleaned.split(/\s+/)[0] || "";
    const needsConfirm = gitWriteCommands.has(subcmd);
    if (needsConfirm && !confirm(`Run git ${subcmd}? This can modify your repo.`)) {
      return;
    }
    try {
      const r = await apiFetch("/workspace/git/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: gitCmd, confirm: needsConfirm }),
      });
      if (!r.ok) {
        const detail = await r.text();
        setGitOutput(`error (${r.status}): ${detail}`);
        return;
      }
      const j = await r.json();
      const stdout = j.stdout || "";
      const stderr = j.stderr || j.detail || "";
      setGitOutput(`$ ${j.command || `git ${gitCmd}`}\n${stdout}${stderr ? "\n" + stderr : ""}`);
      setGitCmd("");
    } catch (err) {
      setGitOutput(`error: ${err}`);
    }
  };

  const sessions = remoteSessions ?? [];

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => setCollapsed(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  usePolling(async (signal) => {
    const startedAt = performance.now();
    try {
      const response = await apiFetch(healthCheckUrl(), {
        cache: "no-store",
        timeoutMs: 8000,
        signal,
      });
      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }
      await response.json();
      setBackendHealthy(true);
      setBackendLatencyMs(Math.max(1, Math.round(performance.now() - startedAt)));
    } catch {
      if (!signal.aborted) {
        setBackendHealthy(false);
        setBackendLatencyMs(null);
      }
    }
  }, 15000);

  const filtered = sessions.filter((s) =>
    s.prompt.toLowerCase().includes(q.toLowerCase())
  );

  const content = (
    <>
      <div className="flex items-center gap-2.5 border-b border-zinc-200/70 px-4 py-4 dark:border-white/[0.06]">
        <OrchestratorLogo size={32} className="drop-shadow-[0_0_14px_rgba(139,92,246,0.5)]" />
        <span className="flex-1 bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-[14px] leading-none tracking-tight text-transparent">
          Orchestrator
        </span>
        <button
          onClick={() => (mobileOpen ? onCloseMobile?.() : setCollapsed(true))}
          title="Collapse sidebar"
          className="rounded-md border border-zinc-200/70 bg-white p-1.5 text-zinc-500 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-400 dark:hover:bg-white/[0.06]"
        >
          {mobileOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="border-b border-zinc-200/70 px-3 py-3 dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            <Clock className="h-2.5 w-2.5" /> History
          </span>
          <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
            {sessions.length} sessions
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 rounded-md border border-zinc-200/70 bg-white px-2 dark:border-white/[0.06] dark:bg-black/30">
          <Search className="h-3 w-3 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search history"
            className="w-full bg-transparent py-1.5 text-[11.5px] text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
          />
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        <div className="overflow-hidden rounded-lg border border-zinc-200/70 bg-white/40 dark:border-white/[0.07] dark:bg-white/[0.015]">
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text font-mono text-[10.5px] uppercase tracking-[0.22em] text-transparent">
                Recent Sessions
              </span>
              <span className="rounded-md border border-zinc-200/70 bg-white px-1.5 py-0.5 font-mono text-[9px] text-zinc-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300">
                {filtered.length}
              </span>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 text-zinc-400 transition ${historyOpen ? "rotate-0" : "-rotate-90"}`}
            />
          </button>
          <AnimatePresence initial={false}>
            {historyOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-0.5 border-t border-zinc-200/70 p-1.5 dark:border-white/[0.06]">
                  {filtered.length === 0 ? (
                    <div className="px-2 py-6 text-center">
                      <Clock className="mx-auto h-4 w-4 text-zinc-400" />
                      <p className="mt-2 text-[10.5px] text-zinc-500">
                        {sessions.length === 0
                          ? "No sessions yet — dispatch a task to start."
                          : `No matches for "${q}".`}
                      </p>
                    </div>
                  ) : (
                    filtered.map((s) => (
                      <HistoryItem
                        key={s.id}
                        s={s}
                        onSelect={() => {
                          const n = Number(s.id);
                          if (!Number.isNaN(n)) {
                            onSelectSession?.(n);
                            onCloseMobile?.();
                          }
                        }}
                      />
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200/70 bg-white/40 dark:border-white/[0.07] dark:bg-white/[0.015]">
          <button
            onClick={() => setGitOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text font-mono text-[10.5px] uppercase tracking-[0.22em] text-transparent">
                Git Handling
              </span>
              <span
                className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] ${
                  !git?.is_repo
                    ? "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-white/[0.04]"
                    : (git?.files_changed ?? 0) === 0
                    ? "border-emerald-300/40 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
                    : "border-amber-300/40 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300"
                }`}
              >
                {!backendHealthy
                  ? "offline"
                  : git?.error
                  ? "no workspace"
                  : !git?.is_repo
                  ? "no repo"
                  : (git?.files_changed ?? 0) === 0
                  ? "clean"
                  : `${git.files_changed} dirty`}
              </span>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 text-zinc-400 transition ${gitOpen ? "rotate-0" : "-rotate-90"}`}
            />
          </button>
          <AnimatePresence initial={false}>
            {gitOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {backendHealthy && git?.error ? (
                  <div className="space-y-2 border-t border-zinc-200/70 p-3 dark:border-white/[0.06]">
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      No workspace folder configured — git tracking, artifacts, and
                      shared context need one.
                    </p>
                    <button
                      onClick={onOpenSettings}
                      className="w-full rounded-md border border-amber-300/50 bg-amber-50 px-2 py-1.5 text-[11.5px] text-amber-800 transition hover:bg-amber-100 dark:border-amber-400/25 dark:bg-amber-400/[0.08] dark:text-amber-300 dark:hover:bg-amber-400/[0.15]"
                    >
                      Set workspace folder
                    </button>
                  </div>
                ) : (
                <div className="space-y-2 border-t border-zinc-200/70 p-3 dark:border-white/[0.06]">
                  <GitField label="Branch" value={git?.branch ?? "—"} mono />
                  <GitField
                    label="Status"
                    value={
                      !backendHealthy
                        ? "waiting for backend…"
                        : !git?.is_repo
                        ? "not a git repo"
                        : (git?.files_changed ?? 0) === 0
                        ? "working tree clean"
                        : `${git.files_changed} file${git.files_changed === 1 ? "" : "s"} changed`
                    }
                    valueClass={
                      (git?.files_changed ?? 0) === 0
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-amber-600 dark:text-amber-300"
                    }
                  />
                  <GitField label="HEAD" value={git?.head_short ?? "—"} mono />
                  {git?.head_subject && (
                    <GitField label="Last" value={git.head_subject} truncate />
                  )}
                  {git?.workspace_path && (
                    <GitField label="Path" value={git.workspace_path} mono truncate />
                  )}

                  <div className="mt-2 flex items-center gap-1 rounded-md border border-zinc-200/70 bg-white px-2 dark:border-white/[0.07] dark:bg-black/40">
                    <span className="font-mono text-[11px] text-indigo-500">›</span>
                    <input
                      value={gitCmd}
                      onChange={(e) => setGitCmd(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void runGit();
                        }
                      }}
                      placeholder="git status / log / branch / diff…"
                      className="flex-1 bg-transparent py-1.5 font-mono text-[10.5px] text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
                    />
                  </div>
                  {gitOutput && (
                    <pre className="max-h-32 overflow-auto rounded border border-zinc-200/70 bg-black/80 px-2 py-1.5 font-mono text-[10px] leading-snug text-zinc-200 dark:border-white/[0.05]">
                      {gitOutput}
                    </pre>
                  )}
                </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Watch Live Processes Button */}
        <button
          onClick={() => onView?.(view === "processes" ? "chat" : "processes")}
          className={`group relative flex w-full items-center justify-between overflow-hidden rounded-lg border px-3.5 py-3 transition-all duration-300 ${
            view === "processes"
              ? "border-indigo-500/50 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 shadow-[0_0_14px_rgba(99,102,241,0.12)]"
              : "border-zinc-200/70 bg-white/40 hover:border-indigo-500/30 hover:bg-white/60 dark:border-white/[0.07] dark:bg-white/[0.015] dark:hover:bg-white/[0.03]"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className={`relative flex h-5 w-5 items-center justify-center rounded-md transition-colors ${
              view === "processes"
                ? "bg-indigo-500 text-white"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-indigo-50 group-hover:text-indigo-500 dark:bg-white/[0.04] dark:text-zinc-400 dark:group-hover:bg-indigo-500/10"
            }`}>
              <Activity className={`h-3 w-3 ${view === "processes" ? "animate-pulse" : ""}`} />
            </span>
            <div className="text-left">
              <span className="block font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
                System Monitor
              </span>
              <span className="block text-[11.5px] font-semibold text-zinc-800 dark:text-zinc-200">
                Watch Live Processes
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {view === "processes" ? (
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 font-mono text-[9px] font-semibold text-indigo-500 animate-pulse dark:bg-indigo-500/20">
                ACTIVE
              </span>
            ) : (
              <span className="font-mono text-[9px] text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
                Open ›
              </span>
            )}
          </div>
        </button>
      </div>

      <div className="border-t border-zinc-200/70 px-3 py-3 pb-32 dark:border-white/[0.06]">
        <div className={`rounded-lg border px-3 py-2 ${
          backendHealthy
            ? "border-emerald-300/40 bg-emerald-50 dark:border-emerald-400/15 dark:bg-emerald-400/[0.04]"
            : "border-rose-300/40 bg-rose-50 dark:border-rose-400/15 dark:bg-rose-400/[0.04]"
        }`}>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                backendHealthy ? "bg-emerald-400" : "bg-rose-400"
              }`} />
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                backendHealthy ? "bg-emerald-500" : "bg-rose-500"
              }`} />
            </span>
            <span className="text-[11px] text-zinc-900 dark:text-white">
              {backendHealthy ? "Backend healthy" : "Backend unreachable"}
            </span>
          </div>
          <div className="mt-1 font-mono text-[9px] text-zinc-500 dark:text-zinc-400">
            {healthCheckUrl().replace(/^https?:\/\//, "")} · {backendLatencyMs ? `${backendLatencyMs}ms` : "offline"}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 360, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col border-r border-zinc-200/70 bg-zinc-50 backdrop-blur dark:border-white/[0.06] dark:bg-zinc-950 md:hidden"
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {collapsed ? (
        <aside className="hidden h-full w-[64px] shrink-0 flex-col items-center gap-2 border-r border-zinc-200/70 bg-zinc-50/40 py-3 backdrop-blur dark:border-white/[0.06] dark:bg-zinc-950/40 md:flex">
          <OrchestratorLogo size={36} className="drop-shadow-[0_0_14px_rgba(139,92,246,0.45)]" />
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            className="rounded-md border border-zinc-200/70 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
          >
            <Menu className="h-3.5 w-3.5" />
          </button>
          <div className="mt-2 flex flex-1 flex-col items-center gap-2 overflow-y-auto">
            {providers.map((p) => {
              const s = STATUS_MAP[p.status];
              return (
                <div
                  key={p.id}
                  title={`${p.name} · ${s.label}`}
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200/70 bg-white/60 dark:border-white/[0.07] dark:bg-white/[0.02]"
                >
                  <span className={`${p.color} font-mono text-[15px] leading-none`}>{p.glyph}</span>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-zinc-50 dark:ring-zinc-950 ${s.dot}`}
                  />
                </div>
              );
            })}
          </div>
          <button
            onClick={() => onView?.(view === "processes" ? "chat" : "processes")}
            title="Watch Live Processes"
            className={`mb-1 rounded-md border p-1.5 transition ${
              view === "processes"
                ? "border-indigo-500 bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20"
                : "border-zinc-200/70 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-400 dark:hover:bg-white/[0.06]"
            }`}
          >
            <Activity className={`h-3.5 w-3.5 ${view === "processes" ? "animate-pulse" : ""}`} />
          </button>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="mb-1 rounded-md border border-zinc-200/70 bg-white p-1.5 text-zinc-500 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-400"
              title="Settings"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </aside>
      ) : (
        <aside className="hidden h-full w-[320px] shrink-0 flex-col border-r border-zinc-200/70 bg-zinc-50/40 backdrop-blur dark:border-white/[0.06] dark:bg-zinc-950/40 md:flex">
          {content}
        </aside>
      )}
    </>
  );
}

function GitField({
  label,
  value,
  mono,
  truncate,
  valueClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span
        className={`flex-1 ${truncate ? "truncate" : ""} ${mono ? "font-mono" : ""} text-[11px] ${
          valueClass || "text-zinc-800 dark:text-zinc-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// Re-export Dropdown for other components that import it from Sidebar (Settings, TerminalCard).
export { Dropdown } from "./Dropdown";
