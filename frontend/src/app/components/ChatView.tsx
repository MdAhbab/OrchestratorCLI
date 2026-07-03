import { memo, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { OrchestratorLogo } from "./OrchestratorLogo";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  GitBranch,
  Layers,
  Sparkles,
  Terminal,
  Wand2,
  Workflow,
  Zap,
} from "lucide-react";

export type Division = {
  agent: string;
  short: string;
  color: string;
  task: string;
  status: "queued" | "running" | "done";
  parallel_group?: number;
};

export type Msg = {
  id: string;
  role: "user" | "orchestrator";
  content: string;
  ts: string;
  thinking?: string[];
  divisions?: Division[];
  artifacts?: { name: string; kind: string }[];
  model?: string;
  plan_quality?: string;
  plan_quality_reason?: string;
};

export const INITIAL_MSGS: Msg[] = [];

const SUGGESTIONS = [
  { icon: Workflow, label: "Refactor the auth flow across api + web" },
  { icon: Sparkles, label: "Build a landing page using our design tokens" },
  { icon: Terminal, label: "Audit the build for dead code & flaky tests" },
  { icon: GitBranch, label: "Migrate prisma schema to drizzle in parallel" },
];

function StatusPill({ s }: { s: Division["status"] }) {
  const m = {
    queued: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400",
    running: "border-emerald-300/40 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
    done: "border-indigo-300/40 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300",
  }[s];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${m}`}>
      {s === "running" && (
        <span className="relative flex h-1 w-1">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-1 w-1 rounded-full bg-emerald-500" />
        </span>
      )}
      {s}
    </span>
  );
}

function DivisionsPanel({
  divs,
  enabledAgentIds,
}: {
  divs: Division[];
  enabledAgentIds?: Set<string>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-zinc-50/60 dark:border-white/[0.06] dark:bg-black/30">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3.5 py-2.5"
      >
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-indigo-500" />
          <span className="text-[12px] text-zinc-900 dark:text-white">Task divisions</span>
          <span className="font-mono text-[9.5px] text-zinc-500">
            divisions.md · {divs.length} agents
          </span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-zinc-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 border-t border-zinc-200/70 px-3 py-3 dark:border-white/[0.05]">
              {divs.map((d, i) => {
                const slug = d.short.toLowerCase();
                const disabled =
                  enabledAgentIds != null &&
                  enabledAgentIds.size > 0 &&
                  !enabledAgentIds.has(slug) &&
                  !Array.from(enabledAgentIds).some(
                    (id) => slug.includes(id) || id.includes(slug),
                  );
                return (
                <div
                  key={`${d.short}-${i}`}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 dark:border-white/[0.05] ${
                    disabled
                      ? "border-zinc-200/40 bg-zinc-100/50 opacity-50 dark:bg-white/[0.01]"
                      : "border-zinc-200/70 bg-white dark:bg-white/[0.02]"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: d.color, boxShadow: `0 0 10px ${d.color}` }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] text-zinc-900 dark:text-zinc-100" style={{ color: d.color }}>
                        {d.agent}
                      </span>
                    </div>
                    <div className="truncate font-mono text-[10.5px] text-zinc-500">
                      {d.task}
                    </div>
                    {d.parallel_group != null && (
                      <div className="mt-0.5 font-mono text-[9px] text-indigo-500/80">
                        ∥ group {d.parallel_group}
                      </div>
                    )}
                  </div>
                  <StatusPill s={disabled ? "queued" : d.status} />
                  {disabled && (
                    <span className="font-mono text-[9px] text-zinc-400">agent off</span>
                  )}
                </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThinkingPanel({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-zinc-50/40 dark:border-white/[0.06] dark:bg-black/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3.5 py-2"
      >
        <div className="flex items-center gap-2">
          <Wand2 className="h-3 w-3 text-zinc-500" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            reasoning · {items.length} steps
          </span>
        </div>
        <ChevronRight className={`h-3 w-3 text-zinc-400 transition ${open ? "rotate-90" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-1 overflow-hidden border-t border-zinc-200/70 px-4 py-2.5 font-mono text-[10.5px] text-zinc-500 dark:border-white/[0.05]"
          >
            {items.map((it, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-zinc-400">{String(i + 1).padStart(2, "0")}</span>
                <span>{it}</span>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}

function ArtifactChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200/70 bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">
      <FileText className="h-2.5 w-2.5" />
      {name}
    </span>
  );
}

export function ChatView({
  msgs,
  onSuggest,
  onOpenProcesses,
  onReroute,
  enabledAgentIds,
}: {
  msgs: Msg[];
  onSuggest: (text: string) => void;
  onOpenProcesses: (divisions?: Division[]) => void;
  onReroute?: (msg: Msg) => void;
  enabledAgentIds?: Set<string>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Smooth-scroll when a message is added; during token streaming (same count,
  // growing content) jump instantly, and only if the user is already near the
  // bottom so scrolling back to read history isn't hijacked.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNewMessage = msgs.length !== prevCountRef.current;
    prevCountRef.current = msgs.length;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (isNewMessage || nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: isNewMessage ? "smooth" : "auto" });
    }
  }, [msgs]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        className="scrollbar-hide mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-44 pt-6 sm:px-6 sm:pb-48 sm:pt-8"
      >
        {msgs.length === 0 ? (
          <>
            <EmptyState />
            <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => onSuggest(s.label)}
                  className="group flex items-center gap-2 rounded-lg border border-zinc-200/70 bg-white px-3 py-2 text-left text-[12px] text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                >
                  <s.icon className="h-3.5 w-3.5 text-indigo-500" />
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-6">
            {msgs.map((m) => (
              <MessageBubble
                key={m.id}
                m={m}
                onOpenProcesses={onOpenProcesses}
                onReroute={onReroute}
                enabledAgentIds={enabledAgentIds}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center pt-10 text-center">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_40px_-10px_rgba(99,102,241,0.7)]">
        <Sparkles className="h-6 w-6 text-white" />
      </div>
      <h1 className="mt-6 text-[28px] tracking-tight text-zinc-900 dark:text-white">
        What should we build today?
      </h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-zinc-500">
        Describe the task in plain language. The orchestrator divides it across Claude,
        Gemini, Codex, Copilot, DeepSeek, Kimi & more — and keeps them aligned via
        <span className="font-mono"> divisions.md</span>.
      </p>
    </div>
  );
}

// Memoized: during token streaming only the streaming row's object identity
// changes, so earlier bubbles skip re-rendering entirely.
const MessageBubble = memo(function MessageBubble({
  m,
  onOpenProcesses,
  onReroute,
  enabledAgentIds,
}: {
  m: Msg;
  onOpenProcesses: (divisions?: Division[]) => void;
  onReroute?: (msg: Msg) => void;
  enabledAgentIds?: Set<string>;
}) {
  if (m.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-zinc-200/70 bg-white px-4 py-2.5 text-[13.5px] leading-relaxed text-zinc-900 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-zinc-100">
          {m.content}
          <div className="mt-1 text-right font-mono text-[9px] text-zinc-400">{m.ts}</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3"
    >
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        <OrchestratorLogo size={32} className="drop-shadow-[0_0_14px_rgba(139,92,246,0.5)]" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[12.5px] text-zinc-900 dark:text-white">Orchestrator</span>
          <span className="font-mono text-[9.5px] text-zinc-500">
            {m.model ?? "orchestrator"}
          </span>
          <span className="font-mono text-[9.5px] text-zinc-400">{m.ts}</span>
          {m.plan_quality === "degraded" && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/40 bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
              ⚠️ Degraded Heuristic Plan ({m.plan_quality_reason || "offline fallback"})
            </span>
          )}
        </div>
        <div className="text-[13.5px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {m.content}
        </div>

        {m.thinking && <ThinkingPanel items={m.thinking} />}
        {m.divisions && m.divisions.length > 0 && (
          <DivisionsPanel divs={m.divisions} enabledAgentIds={enabledAgentIds} />
        )}

        {m.artifacts && m.artifacts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] text-zinc-500">wrote →</span>
            {m.artifacts.map((a) => (
              <ArtifactChip key={a.name} name={a.name} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onOpenProcesses(m.divisions)}
            className="flex items-center gap-1 rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[11px] text-zinc-700 transition hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
          >
            <Workflow className="h-3 w-3" />
            Watch processes
          </button>
          <button
            onClick={() => onReroute?.(m)}
            disabled={!m.divisions?.length}
            className="flex items-center gap-1 rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[11px] text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
          >
            <Zap className="h-3 w-3" />
            Re-route
          </button>
        </div>
      </div>
    </motion.div>
  );
});
