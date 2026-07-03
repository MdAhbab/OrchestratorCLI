import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  Coins,
  FileText,
  Loader2,
  Pause,
  Search,
  Trash2,
} from "lucide-react";
import { useStore, type SessionEntry } from "./store";
import { apiFetch } from "../lib/api";
import { sessionsPoller } from "../lib/appPollers";
import { useSharedPoller } from "../lib/sharedPoller";

const fmtDate = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toTimeString().slice(0, 5)
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " · " +
        d.toTimeString().slice(0, 5);
};

const fmtDuration = (s: SessionEntry) => {
  if (!s.endedAt) return s.status === "paused" ? "paused" : "active";
  const ms = s.endedAt - s.startedAt;
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const StatusBadge = ({ s }: { s: SessionEntry["status"] }) => {
  const map = {
    completed: {
      cls: "border-emerald-300/40 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
      Icon: CircleCheck,
    },
    active: {
      cls: "border-indigo-300/40 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300",
      Icon: Loader2,
    },
    paused: {
      cls: "border-amber-300/40 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
      Icon: Pause,
    },
    archived: {
      cls: "border-zinc-300/40 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400",
      Icon: CircleX,
    },
  }[s];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${map.cls}`}
    >
      <map.Icon className={`h-2.5 w-2.5 ${s === "active" ? "animate-spin" : ""}`} />
      {s}
    </span>
  );
};

export function SessionHistory() {
  const { clearSessions } = useStore();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, { summary: string; artifacts: string[] }>>(
    {},
  );

  const remoteSessions = useSharedPoller(sessionsPoller);
  const sessions = remoteSessions ?? [];
  const isLoading = remoteSessions === null;

  const loadDetails = async (sessionId: string) => {
    if (details[sessionId]) return;
    try {
      const res = await apiFetch(`/sessions/${sessionId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      const messages = data.messages ?? [];
      const lastAssistant = [...messages].reverse().find((m: any) => m.role !== "user");
      let summary = "";
      let artifacts: string[] = [];
      if (lastAssistant) {
        summary = String(lastAssistant.content ?? "").slice(0, 400);
        let meta = lastAssistant.metadata;
        if (meta && typeof meta === "string") {
          try {
            meta = JSON.parse(meta);
          } catch {
            meta = {};
          }
        }
        artifacts = (meta?.artifacts ?? []).map((a: any) => a.name ?? String(a));
      }
      setDetails((prev) => ({ ...prev, [sessionId]: { summary, artifacts } }));
    } catch (err) {
      console.warn("Failed to load session messages", err);
    }
  };

  const filtered = sessions.filter(
    (s) =>
      s.prompt.toLowerCase().includes(q.toLowerCase()) ||
      s.agents.some((a) => a.toLowerCase().includes(q.toLowerCase())),
  );

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-zinc-200/70 bg-white/60 p-3 dark:border-white/[0.06] dark:bg-zinc-950/40"
          >
            <div className="h-4 w-12 rounded bg-zinc-200 dark:bg-white/[0.06]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-2/3 rounded bg-zinc-200 dark:bg-white/[0.06]" />
              <div className="h-2.5 w-1/2 rounded bg-zinc-200 dark:bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300/70 bg-zinc-50/40 px-6 py-12 text-center dark:border-white/10 dark:bg-white/[0.02]">
        <Clock className="mx-auto h-5 w-5 text-zinc-400" />
        <div className="mt-3 text-[13px] text-zinc-700 dark:text-zinc-200">No sessions yet</div>
        <p className="mt-1 text-[11.5px] text-zinc-500">
          When you dispatch tasks to the orchestrator, completed runs land here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-1.5 rounded-md border border-zinc-200/70 bg-white/60 px-2 dark:border-white/[0.07] dark:bg-white/[0.02]">
          <Search className="h-3 w-3 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search prompts, agents…"
            className="w-full bg-transparent py-1.5 text-[12px] text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
          />
        </div>
        <button
          onClick={() => {
            if (confirm("Clear all session history?")) {
              void clearSessions().then((ok) => {
                if (ok) sessionsPoller.refresh();
              });
            }
          }}
          className="flex items-center gap-1 rounded-md border border-zinc-200/70 bg-white px-2 py-1.5 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>

      <div className="space-y-1.5">
        {filtered.map((s) => {
          const open = openId === s.id;
          const detail = details[s.id];
          return (
            <div
              key={s.id}
              className="overflow-hidden rounded-xl border border-zinc-200/70 bg-white/60 dark:border-white/[0.06] dark:bg-zinc-950/40"
            >
              <button
                onClick={() => {
                  const next = open ? null : s.id;
                  setOpenId(next);
                  if (next) void loadDetails(next);
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <StatusBadge s={s.status} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-zinc-900 dark:text-zinc-100">
                    {s.prompt}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-zinc-500">
                    <span>{fmtDate(s.startedAt)}</span>
                    <span>·</span>
                    <span>{fmtDuration(s)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Coins className="h-2.5 w-2.5" />${s.spend.toFixed(2)}
                    </span>
                    <span>·</span>
                    <span>{(s.tokens / 1000).toFixed(1)}k tok</span>
                  </div>
                </div>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition ${open ? "rotate-180" : ""}`}
                />
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 border-t border-zinc-200/70 px-4 py-3 text-[12px] text-zinc-700 dark:border-white/[0.05] dark:text-zinc-300">
                      <div>
                        <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                          Summary
                        </div>
                        <p className="leading-relaxed">
                          {detail?.summary || s.summary || "Loading…"}
                        </p>
                      </div>
                      {(detail?.artifacts ?? s.artifacts).length > 0 && (
                        <div>
                          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                            Artifacts
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(detail?.artifacts ?? s.artifacts).map((a) => (
                              <span
                                key={a}
                                className="inline-flex items-center gap-1 rounded-md border border-indigo-200/70 bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300"
                              >
                                <FileText className="h-2.5 w-2.5" />
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300/70 bg-zinc-50/40 px-6 py-8 text-center text-[12px] text-zinc-500 dark:border-white/10 dark:bg-white/[0.02]">
            No sessions match "{q}".
          </div>
        )}
      </div>
    </div>
  );
}
