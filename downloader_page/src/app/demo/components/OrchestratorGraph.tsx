import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Activity, Pause, Play, Send, Sparkles } from "lucide-react";
import { OrchestratorLogo } from "./OrchestratorLogo";

type Route = {
  id: string;
  task: string;
  target: string;
  short: string;
  color: string;
  type: string;
  confidence: number;
};

const ROUTES: Route[] = [
  { id: "r1", task: "Frontend hero section", target: "Gemini 3 Pro", short: "Gemini", color: "#6366f1", type: "ui", confidence: 96 },
  { id: "r2", task: "Backend auth refactor", target: "Claude Sonnet 4.6", short: "Claude", color: "#f59e0b", type: "logic", confidence: 94 },
  { id: "r3", task: "Schema migration", target: "Codex / gpt-codex", short: "Codex", color: "#10b981", type: "db", confidence: 91 },
  { id: "r4", task: "Build profiling", target: "DeepSeek v3", short: "DeepSeek", color: "#a855f7", type: "perf", confidence: 88 },
  { id: "r5", task: "Test generation", target: "Copilot CLI", short: "Copilot", color: "#64748b", type: "qa", confidence: 92 },
  { id: "r6", task: "Doc translation", target: "Kimi K2", short: "Kimi", color: "#ec4899", type: "i18n", confidence: 90 },
];

export function OrchestratorGraph() {
  const [active, setActive] = useState(0);
  const [running, setRunning] = useState(true);
  const [logs, setLogs] = useState<string[]>([
    "[00:00:01] orchestrator awake · grok-3/routing-v2",
    "[00:00:02] received master prompt (1,284 tokens)",
    "[00:00:02] decomposed into 6 subtasks",
    "[00:00:03] wrote divisions.md · 6 agents notified",
  ]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setActive((a) => {
        const next = (a + 1) % ROUTES.length;
        const r = ROUTES[next];
        const ts = new Date().toISOString().slice(11, 19);
        setLogs((prev) =>
          [
            `[${ts}] route → ${r.target} (conf ${r.confidence}%)`,
            `[${ts}] dispatch "${r.task}"`,
            ...prev,
          ].slice(0, 22)
        );
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200/70 bg-white/60 backdrop-blur dark:border-white/[0.07] dark:bg-gradient-to-br dark:from-zinc-950/80 dark:via-zinc-950/40 dark:to-indigo-950/20">
      <div className="flex items-center justify-between border-b border-zinc-200/70 px-4 py-3 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <OrchestratorLogo size={28} className="drop-shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
          <div className="leading-tight">
            <div className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-[15.5px] text-transparent">
              Orchestrator grok-3 (demo)
            </div>
            <div className="font-mono text-[12.5px] text-zinc-500">
              planner llm · quota-aware · routing-v2
            </div>
          </div>
          <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-emerald-300/40 bg-emerald-50 px-1.5 py-0.5 font-mono text-[12px] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
            <Activity className="h-2.5 w-2.5" />
            live
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setRunning((r) => !r)}
            className="flex items-center gap-1 rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[13px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
          >
            {running ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
            {running ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-4 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative min-h-[320px] rounded-lg border border-zinc-200/70 bg-gradient-to-br from-zinc-50 to-white dark:border-white/[0.05] dark:from-zinc-950/60 dark:to-black/40">
          <svg viewBox="0 0 420 320" className="h-full w-full">
            <defs>
              <radialGradient id="hub-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </radialGradient>
              <filter id="soft-glow">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
            </defs>

            {ROUTES.map((r, i) => {
              const angle = (i / ROUTES.length) * Math.PI * 2 - Math.PI / 2;
              const x = 210 + Math.cos(angle) * 150;
              const y = 160 + Math.sin(angle) * 110;
              const isActive = i === active;
              return (
                <g key={r.id}>
                  <line
                    x1={210}
                    y1={160}
                    x2={x}
                    y2={y}
                    stroke={isActive ? r.color : "currentColor"}
                    strokeOpacity={isActive ? 0.9 : 0.15}
                    strokeWidth={isActive ? 1.8 : 1}
                    strokeDasharray={isActive ? "0" : "4 5"}
                    className="text-zinc-300 dark:text-zinc-700"
                  />
                  {isActive && (
                    <motion.circle
                      r={4}
                      fill={r.color}
                      initial={{ cx: 210, cy: 160 }}
                      animate={{ cx: x, cy: y }}
                      transition={{ duration: 1.6, ease: "easeOut" }}
                      style={{ filter: "url(#soft-glow)" }}
                    />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={26}
                    fill="currentColor"
                    className="fill-white dark:fill-zinc-950"
                    stroke={isActive ? r.color : "currentColor"}
                    strokeOpacity={isActive ? 1 : 0.18}
                    strokeWidth={isActive ? 1.8 : 1.2}
                  />
                  <text
                    x={x}
                    y={y - 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isActive ? r.color : "currentColor"}
                    fontSize="9"
                    fontFamily="Geist Mono, monospace"
                    fontWeight="600"
                    className={isActive ? "" : "fill-zinc-500 dark:fill-zinc-500"}
                    style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
                  >
                    {r.type}
                  </text>
                  <text
                    x={x}
                    y={y + 9}
                    textAnchor="middle"
                    fill={isActive ? r.color : "currentColor"}
                    fillOpacity={isActive ? 0.8 : 0.55}
                    fontSize="7.5"
                    fontFamily="Geist Mono, monospace"
                    className="fill-zinc-500 dark:fill-zinc-500"
                  >
                    {r.short}
                  </text>
                </g>
              );
            })}

            <circle cx={210} cy={160} r={60} fill="url(#hub-glow)" />
            <circle
              cx={210}
              cy={160}
              r={32}
              className="fill-white stroke-indigo-300 dark:fill-zinc-950 dark:stroke-indigo-400/50"
              strokeWidth={1.5}
            />
            <text
              x={210}
              y={154}
              textAnchor="middle"
              fontSize="10"
              fontFamily="Geist, sans-serif"
              fontWeight="600"
              className="fill-zinc-900 dark:fill-white"
            >
              Orchestrator
            </text>
            <text
              x={210}
              y={167}
              textAnchor="middle"
              fontSize="8"
              fontFamily="Geist Mono, monospace"
              className="fill-indigo-600 dark:fill-indigo-300"
            >
              grok-3
            </text>
            <text
              x={210}
              y={177}
              textAnchor="middle"
              fontSize="7"
              fontFamily="Geist Mono, monospace"
              className="fill-zinc-500"
            >
              planner
            </text>
          </svg>

          <div className="absolute inset-x-3 bottom-3 rounded-lg border border-zinc-200/80 bg-white/80 px-3 py-2 backdrop-blur dark:border-white/[0.06] dark:bg-black/50">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center justify-between gap-2 font-mono text-[13.5px]"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <Sparkles className="h-3 w-3 shrink-0 text-indigo-500" />
                  <span className="truncate text-zinc-700 dark:text-zinc-300">
                    {ROUTES[active].task}
                  </span>
                  <span className="text-zinc-400">→</span>
                  <span style={{ color: ROUTES[active].color }} className="font-semibold">
                    {ROUTES[active].target}
                  </span>
                </div>
                <span className="shrink-0 rounded border border-zinc-200/70 px-1.5 py-0.5 text-[12px] text-zinc-500 dark:border-white/10">
                  conf {ROUTES[active].confidence}%
                </span>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-lg border border-zinc-200/70 bg-zinc-50/50 dark:border-white/[0.06] dark:bg-black/40">
          <div className="flex items-center justify-between border-b border-zinc-200/70 px-3 py-2 dark:border-white/[0.04]">
            <span className="font-mono text-[12px] uppercase tracking-[0.2em] text-zinc-500">
              orchestrator.log
            </span>
            <span className="font-mono text-[12px] text-zinc-500">{logs.length} events</span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[13.5px] leading-[1.65]">
            {logs.map((l, i) => (
              <div
                key={i}
                className={i === 0 ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}
                style={{ opacity: Math.max(0.35, 1 - i * 0.045) }}
              >
                {l}
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const v = String(fd.get("prompt") || "").trim();
              if (!v) return;
              const ts = new Date().toISOString().slice(11, 19);
              setLogs((p) =>
                [
                  `[${ts}] master prompt accepted`,
                  `[${ts}] "${v}"`,
                  ...p,
                ].slice(0, 22)
              );
              (e.currentTarget as HTMLFormElement).reset();
            }}
            className="flex items-center gap-1.5 border-t border-zinc-200/70 bg-white/60 p-2 dark:border-white/[0.04] dark:bg-black/30"
          >
            <span className="font-mono text-[14px] text-indigo-500">›</span>
            <input
              name="prompt"
              placeholder="dispatch a master prompt to orchestrator…"
              className="flex-1 bg-transparent font-mono text-[14px] text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
            />
            <button className="rounded-md bg-indigo-500 p-1 text-white hover:bg-indigo-600">
              <Send className="h-3 w-3" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
