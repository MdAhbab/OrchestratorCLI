import { useEffect, useRef, useState } from "react";
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
};

export type Msg = {
  id: string;
  role: "user" | "orchestrator";
  content: string;
  ts: string;
  thinking?: string[];
  divisions?: Division[];
  artifacts?: { name: string; kind: string }[];
};

export const INITIAL_MSGS: Msg[] = [
  {
    id: "m1",
    role: "user",
    content: "Refactor the auth middleware and add tests, plus generate the new login screen — use our design tokens.",
    ts: "09:42",
  },
  {
    id: "m2",
    role: "orchestrator",
    ts: "09:42",
    content:
      "Decomposed into 4 subtasks across 4 agents. divisions.md written to workspace context — every agent now knows who is doing what.",
    thinking: [
      "classify tasks · NLP confidence 0.94",
      "match specialties (logic→Claude, ui→Gemini, db→Codex, qa→Copilot)",
      "check quotas: 4/6 agents have budget headroom",
      "emit divisions.md → shared context bus",
    ],
    divisions: [
      { agent: "Claude Sonnet 4.6", short: "claude", color: "#f59e0b", task: "Refactor src/middleware/auth.ts", status: "running" },
      { agent: "Gemini 3 Pro", short: "gemini", color: "#6366f1", task: "Generate Login.tsx with design tokens", status: "running" },
      { agent: "Codex CLI", short: "codex", color: "#10b981", task: "Update session schema migration", status: "queued" },
      { agent: "Copilot CLI", short: "copilot", color: "#64748b", task: "Add tests for auth middleware", status: "queued" },
    ],
    artifacts: [
      { name: "divisions.md", kind: "md" },
      { name: "task-graph.md", kind: "md" },
    ],
  },
];

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
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-wider ${m}`}>
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

function DivisionsPanel({ divs }: { divs: Division[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-zinc-50/60 dark:border-white/[0.06] dark:bg-black/30">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3.5 py-2.5"
      >
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-indigo-500" />
          <span className="text-[15px] text-zinc-900 dark:text-white">Task divisions</span>
          <span className="font-mono text-[12.5px] text-zinc-500">
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
              {divs.map((d, i) => (
                <div
                  key={`${d.short}-${i}`}
                  className="flex items-center gap-2.5 rounded-lg border border-zinc-200/70 bg-white px-3 py-2 dark:border-white/[0.05] dark:bg-white/[0.02]"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: d.color, boxShadow: `0 0 10px ${d.color}` }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] text-zinc-900 dark:text-zinc-100" style={{ color: d.color }}>
                        {d.agent}
                      </span>
                    </div>
                    <div className="truncate font-mono text-[13.5px] text-zinc-500">
                      {d.task}
                    </div>
                  </div>
                  <StatusPill s={d.status} />
                </div>
              ))}
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
          <span className="font-mono text-[13px] uppercase tracking-[0.2em] text-zinc-500">
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
            className="space-y-1 overflow-hidden border-t border-zinc-200/70 px-4 py-2.5 font-mono text-[13.5px] text-zinc-500 dark:border-white/[0.05]"
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
    <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200/70 bg-indigo-50 px-1.5 py-0.5 font-mono text-[13px] text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">
      <FileText className="h-2.5 w-2.5" />
      {name}
    </span>
  );
}

export function ChatView({
  msgs,
  onSuggest,
  onOpenProcesses,
}: {
  msgs: Msg[];
  onSuggest: (text: string) => void;
  onOpenProcesses: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
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
                  className="group flex items-center gap-2 rounded-lg border border-zinc-200/70 bg-white px-3 py-2 text-left text-[15px] text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
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
              <MessageBubble key={m.id} m={m} onOpenProcesses={onOpenProcesses} />
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
      <h1 className="mt-6 text-[31px] tracking-tight text-zinc-900 dark:text-white">
        What should we build today?
      </h1>
      <p className="mt-2 max-w-md text-[16px] leading-relaxed text-zinc-500">
        Describe the task in plain language. The orchestrator divides it across Claude,
        Gemini, Codex, Copilot, DeepSeek, Kimi & more — and keeps them aligned via
        <span className="font-mono"> divisions.md</span>.
      </p>
    </div>
  );
}

function MessageBubble({ m, onOpenProcesses }: { m: Msg; onOpenProcesses: () => void }) {
  if (m.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-zinc-200/70 bg-white px-4 py-2.5 text-[16.5px] leading-relaxed text-zinc-900 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-zinc-100">
          {m.content}
          <div className="mt-1 text-right font-mono text-[12px] text-zinc-400">{m.ts}</div>
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
        <div className="flex items-baseline gap-2">
          <span className="text-[15.5px] text-zinc-900 dark:text-white">Orchestrator</span>
          <span className="font-mono text-[12.5px] text-zinc-500">grok-3 · planner</span>
          <span className="font-mono text-[12.5px] text-zinc-400">{m.ts}</span>
        </div>
        <div className="text-[16.5px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {m.content}
        </div>

        {m.thinking && <ThinkingPanel items={m.thinking} />}
        {m.divisions && <DivisionsPanel divs={m.divisions} />}

        {m.artifacts && m.artifacts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[13px] text-zinc-500">wrote →</span>
            {m.artifacts.map((a) => (
              <ArtifactChip key={a.name} name={a.name} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onOpenProcesses}
            className="flex items-center gap-1 rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[14px] text-zinc-700 transition hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
          >
            <Workflow className="h-3 w-3" />
            Watch processes
          </button>
          <button className="flex items-center gap-1 rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[14px] text-zinc-700 transition hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.05]">
            <Zap className="h-3 w-3" />
            Re-route
          </button>
        </div>
      </div>
    </motion.div>
  );
}
