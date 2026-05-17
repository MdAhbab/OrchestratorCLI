import {
  Bell,
  Command,
  Cpu,
  FolderGit2,
  Menu,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "./theme";
import { useStore } from "./store";
import { apiPath } from "../lib/api";

type View = "chat" | "processes" | "settings";

type GitSnap = {
  branch?: string | null;
  files_changed?: number;
  is_repo?: boolean;
};

type NotifRow = { id: number; event_type: string; created_at: string; cost_estimate?: number | null };

export function TopBar({
  view,
  onView,
  activeAgents,
  onOpenPalette,
  onToggleSidebar,
}: {
  view: View;
  onView: (v: View) => void;
  activeAgents: number;
  onOpenPalette: () => void;
  onToggleSidebar?: () => void;
}) {
  const { theme, toggle } = useTheme();
  const { workspace } = useStore();
  const [git, setGit] = useState<GitSnap | null>(null);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let c = false;
    const load = async () => {
      try {
        const r = await fetch(apiPath("/workspace/git"));
        if (r.ok && !c) setGit(await r.json());
      } catch {}
      try {
        const r2 = await fetch(apiPath("/analytics/events/recent?limit=15"));
        if (r2.ok && !c) setNotifs(await r2.json());
      } catch {}
    };
    void load();
    const id = window.setInterval(load, 20000);
    return () => {
      c = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const branch = git?.branch || "main";
  const dirty = git?.is_repo && (git.files_changed ?? 0) > 0;

  return (
    <div className="flex h-14 items-center justify-between gap-2 border-b border-zinc-200/70 bg-white/60 px-3 backdrop-blur dark:border-white/[0.06] dark:bg-zinc-950/40 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="rounded-md border border-zinc-200/70 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.06] md:hidden"
            title="Toggle sidebar"
          >
            <Menu className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="hidden min-w-0 items-center gap-1.5 text-[12.5px] text-zinc-600 dark:text-zinc-400 sm:flex">
          <FolderGit2 className="h-3.5 w-3.5 text-zinc-400" />
          <span className="truncate text-zinc-800 dark:text-zinc-200">
            {workspace?.name || "no workspace"}
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <span>{branch}</span>
          <span
            className={`ml-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] ${
              !git?.is_repo
                ? "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-white/[0.04]"
                : dirty
                ? "border-amber-300/40 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/[0.08] dark:text-amber-200"
                : "border-emerald-300/40 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-emerald-300"
            }`}
          >
            {!git?.is_repo ? "no repo" : dirty ? `${git.files_changed} dirty` : "clean"}
          </span>
        </div>
      </div>

      <div className="flex flex-1 justify-center">
        <button
          onClick={onOpenPalette}
          className="flex w-full max-w-[560px] items-center gap-2 rounded-lg border border-zinc-200/70 bg-white px-3 py-2 text-[12.5px] text-zinc-500 shadow-sm transition hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:shadow-none dark:hover:bg-white/[0.05]"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="truncate">Search prompts, sessions, files…</span>
          <span className="ml-auto hidden items-center gap-0.5 font-mono text-[10px] text-zinc-400 sm:flex">
            <Command className="h-3 w-3" />K
          </span>
        </button>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="hidden items-center gap-1.5 rounded-md border border-zinc-200/70 bg-white px-2 py-1.5 font-mono text-[10px] text-zinc-600 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-400 lg:flex">
          <Cpu className="h-3 w-3 text-emerald-500" />
          {activeAgents} active
        </div>
        <button
          onClick={() => onView("settings")}
          className={`rounded-md border p-1.5 transition ${
            view === "settings"
              ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-300"
              : "border-zinc-200/70 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
          }`}
          title="Settings (⌘,)"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={toggle}
          className="rounded-md border border-zinc-200/70 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
        <div className="relative hidden sm:block" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((o) => !o)}
            className="relative rounded-md border border-zinc-200/70 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
          >
            <Bell className="h-3.5 w-3.5" />
            {notifs.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 z-50 mt-1 w-[320px] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-950">
              <div className="border-b border-zinc-200/70 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:border-white/[0.06]">
                Recent events
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifs.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[11px] text-zinc-500">No analytics events yet.</div>
                ) : (
                  notifs.map((n) => (
                    <div key={n.id} className="border-b border-zinc-100 px-3 py-2 text-[11px] dark:border-white/[0.04]">
                      <div className="font-mono text-[10px] text-zinc-500">{n.event_type}</div>
                      <div className="text-zinc-700 dark:text-zinc-200">
                        {new Date(n.created_at).toLocaleString()}
                        {n.cost_estimate != null && n.cost_estimate > 0 ? ` · ~$${Number(n.cost_estimate).toFixed(4)}` : ""}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
