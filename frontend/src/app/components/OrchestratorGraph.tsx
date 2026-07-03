import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Activity, Pause, Play, Send, Sparkles, User } from "lucide-react";
import { OrchestratorLogo } from "./OrchestratorLogo";
import { apiFetch } from "../lib/api";
import { usePolling } from "../lib/usePolling";

type Route = {
  id: string;
  task: string;
  target: string;
  short: string;
  color: string;
  type: string;
  confidence: number;
};

type AgentNode = {
  id: string;
  name: string;
  status: string;
  parallelGroup: number;
  task: string;
  dependsOn: string[];
  ownsFiles: string[];
  readsFiles: string[];
  color: string;
};

const AGENT_COLORS: Record<string, string> = {
  "claude": "#f59e0b",
  "claude-code": "#f59e0b",
  "gemini": "#6366f1",
  "gemini-cli": "#6366f1",
  "codex": "#10b981",
  "codex-cli": "#10b981",
  "copilot": "#71717a",
  "copilot-cli": "#71717a",
  "deepseek": "#a855f7",
  "cline": "#06b6d4",
  "grok": "#ef4444",
};

const DEMO_ROUTES: Route[] = [
  { id: "r1", task: "Frontend hero section", target: "Gemini 3 Pro", short: "Gemini", color: "#6366f1", type: "ui", confidence: 96 },
  { id: "r2", task: "Backend auth refactor", target: "Claude Sonnet 4.6", short: "Claude", color: "#f59e0b", type: "logic", confidence: 94 },
  { id: "r3", task: "Schema migration", target: "Codex / gpt-codex", short: "Codex", color: "#10b981", type: "db", confidence: 91 },
  { id: "r4", task: "Build profiling", target: "DeepSeek v3", short: "DeepSeek", color: "#a855f7", type: "perf", confidence: 88 },
  { id: "r5", task: "Test generation", target: "Copilot CLI", short: "Copilot", color: "#64748b", type: "qa", confidence: 92 },
  { id: "r6", task: "Doc translation", target: "Kimi K2", short: "Kimi", color: "#ec4899", type: "i18n", confidence: 90 },
];

const ROUTE_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#a855f7", "#64748b", "#ec4899"];

function mapApiRoute(row: Record<string, unknown>, index: number): Route {
  const provider = String(row.provider_name ?? "agent");
  const short = provider.split(/\s+/)[0] ?? provider;
  const reason = String(row.routing_reason ?? row.routing_strategy ?? "route");
  return {
    id: String(row.id ?? index),
    task: reason,
    target: provider,
    short,
    color: ROUTE_COLORS[index % ROUTE_COLORS.length],
    type: String(row.routing_strategy ?? "task").slice(0, 8),
    confidence: Math.min(99, 70 + (Number(row.latency_ms ?? 0) > 0 ? 10 : 0)),
  };
}

function parseDivisionsMd(text: string): AgentNode[] {
  const lines = text.split("\n");
  const agents: AgentNode[] = [];
  let current: Partial<AgentNode> | null = null;

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith("## ")) {
      if (current && current.id) {
        agents.push(current as AgentNode);
      }
      const name = line.substring(3).trim();
      current = {
        name,
        dependsOn: [],
        ownsFiles: [],
        readsFiles: [],
        parallelGroup: 0,
        status: "queued",
        task: "",
        color: AGENT_COLORS[name.toLowerCase()] || "#6366f1",
      };
    } else if (current && line.startsWith("- ")) {
      const rest = line.substring(2).trim();
      if (rest.startsWith("**Agent ID**:")) {
        const m = rest.match(/`([^`]+)`/);
        if (m) {
          current.id = m[1];
          current.color = AGENT_COLORS[m[1]] || current.color;
        }
      } else if (rest.startsWith("**Status**:")) {
        current.status = rest.split(":")[1].trim();
      } else if (rest.startsWith("**Parallel group**:")) {
        current.parallelGroup = parseInt(rest.split(":")[1].trim()) || 0;
      } else if (rest.startsWith("**Assignment**:")) {
        current.task = rest.split(":")[1].trim();
      } else if (rest.startsWith("**Depends on**:")) {
        current.dependsOn = rest.split(":")[1].split(",").map(x => x.trim()).filter(Boolean);
      } else if (rest.startsWith("**Owns files**:")) {
        const items = rest.match(/`([^`]+)`/g) || [];
        current.ownsFiles = items.map(x => x.replace(/`/g, ""));
      } else if (rest.startsWith("**Reads files**:")) {
        const items = rest.match(/`([^`]+)`/g) || [];
        current.readsFiles = items.map(x => x.replace(/`/g, ""));
      }
    }
  }
  if (current && current.id) {
    agents.push(current as AgentNode);
  }
  return agents;
}

export function OrchestratorGraph({ activeSessionId }: { activeSessionId?: number | null }) {
  const [routes, setRoutes] = useState<Route[]>(DEMO_ROUTES);
  const [isDemo, setIsDemo] = useState(true);
  const [active, setActive] = useState(0);
  const [running, setRunning] = useState(true);
  const [logs, setLogs] = useState<string[]>([
    "[00:00:01] orchestrator awake",
    "[00:00:02] waiting for routing history…",
  ]);

  // Actual plan state
  const [agents, setAgents] = useState<AgentNode[]>([]);
  const [hasPlan, setHasPlan] = useState(false);
  const [hoveredAgent, setHoveredAgent] = useState<AgentNode | null>(null);

  // Fetch divisions plan if activeSessionId is present
  useEffect(() => {
    if (!activeSessionId) setHasPlan(false);
  }, [activeSessionId]);

  usePolling(
    async (signal) => {
      if (!activeSessionId) return;
      try {
        const res = await apiFetch(
          `/workspace/artifacts/session/${activeSessionId}/divisions.md`,
          { signal },
        );
        if (!res.ok) {
          if (!signal.aborted) setHasPlan(false);
          return;
        }
        const text = await res.text();
        if (signal.aborted) return;
        const parsed = parseDivisionsMd(text);
        if (parsed.length > 0) {
          setAgents(parsed);
          setHasPlan(true);
        } else {
          setHasPlan(false);
        }
      } catch {
        if (!signal.aborted) setHasPlan(false);
      }
    },
    8000,
    Boolean(activeSessionId),
    activeSessionId,
  );

  usePolling(async (signal) => {
    try {
      const res = await apiFetch("/analytics/routes?limit=12", {
        cache: "no-store",
        signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data.routes) ? data.routes : [];
      if (signal.aborted) return;
      if (rows.length === 0) {
        setRoutes(DEMO_ROUTES);
        setIsDemo(true);
        return;
      }
      setRoutes(rows.map((row: Record<string, unknown>, i: number) => mapApiRoute(row, i)));
      setIsDemo(false);
      setLogs(
        rows.slice(0, 6).map((row: Record<string, unknown>) => {
          const ts = String(row.created_at ?? "").slice(11, 19) || "00:00:00";
          return `[${ts}] route → ${row.provider_name} (${row.routing_strategy})`;
        }),
      );
    } catch {
      if (!signal.aborted) {
        setRoutes(DEMO_ROUTES);
        setIsDemo(true);
      }
    }
  }, 20000);

  // Cycle the highlighted route for visual context. Log lines only come from
  // real routing history above — the cycler no longer fabricates dispatch logs.
  useEffect(() => {
    if (!running || routes.length === 0) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      setActive((a) => (a + 1) % routes.length);
    }, 3000);
    return () => clearInterval(id);
  }, [running, routes.length]);

  // Compute layout coordinates for actual plan graph
  const width = 420;
  const height = 320;
  const coords: Record<string, { x: number; y: number }> = {};
  
  if (hasPlan) {
    const groups: Record<number, AgentNode[]> = {};
    for (const a of agents) {
      if (!groups[a.parallelGroup]) groups[a.parallelGroup] = [];
      groups[a.parallelGroup].push(a);
    }
    
    const sortedGroups = Object.keys(groups).map(Number).sort((a, b) => a - b);
    const numGroups = sortedGroups.length;
    
    sortedGroups.forEach((groupVal, yIdx) => {
      const groupAgents = groups[groupVal];
      const n = groupAgents.length;
      const y = numGroups > 1 
        ? 60 + yIdx * ((height - 120) / (numGroups - 1)) 
        : height / 2;
        
      groupAgents.forEach((a, xIdx) => {
        const x = n > 1 
          ? 60 + xIdx * ((width - 120) / (n - 1)) 
          : width / 2;
        coords[a.id] = { x, y };
      });
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200/70 bg-white/60 backdrop-blur dark:border-white/[0.07] dark:bg-gradient-to-br dark:from-zinc-950/80 dark:via-zinc-950/40 dark:to-indigo-950/20">
      <div className="flex items-center justify-between border-b border-zinc-200/70 px-4 py-3 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <OrchestratorLogo size={28} className="drop-shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
          <div className="leading-tight">
            <div className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-[12.5px] text-transparent">
              {hasPlan ? "Active Session Plan Graph" : "Orchestrator routing"}
            </div>
            <div className="font-mono text-[9.5px] text-zinc-500">
              {hasPlan 
                ? "visualized task dependencies & parallel groups" 
                : isDemo 
                  ? "demo data · no routing history yet" 
                  : "live · /api/analytics/routes"}
            </div>
          </div>
          <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-emerald-300/40 bg-emerald-50 px-1.5 py-0.5 font-mono text-[9px] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
            <Activity className="h-2.5 w-2.5" />
            {hasPlan ? "Active Plan" : isDemo ? "demo" : "live"}
          </span>
        </div>
        {!hasPlan && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setRunning((r) => !r)}
              className="flex items-center gap-1 rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[10px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
            >
              {running ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
              {running ? "Pause" : "Resume"}
            </button>
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-4 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative min-h-[320px] rounded-lg border border-zinc-200/70 bg-gradient-to-br from-zinc-50 to-white dark:border-white/[0.05] dark:from-zinc-950/60 dark:to-black/40">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
            <defs>
              <radialGradient id="hub-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </radialGradient>
              <filter id="soft-glow">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
              <marker 
                id="arrow" 
                viewBox="0 0 10 10" 
                refX="22" 
                refY="5" 
                markerWidth="6" 
                markerHeight="6" 
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#8b5cf6" />
              </marker>
            </defs>

            {hasPlan ? (
              <>
                {/* Connection lines (edges) */}
                {agents.map((a) =>
                  a.dependsOn.map((depId) => {
                    const start = coords[depId];
                    const end = coords[a.id];
                    if (!start || !end) return null;
                    return (
                      <line
                        key={`${depId}-${a.id}`}
                        x1={start.x}
                        y1={start.y}
                        x2={end.x}
                        y2={end.y}
                        stroke="#8b5cf6"
                        strokeWidth={1.8}
                        strokeDasharray="4 4"
                        markerEnd="url(#arrow)"
                        opacity={0.7}
                      />
                    );
                  })
                )}

                {/* Nodes */}
                {agents.map((a) => {
                  const pos = coords[a.id];
                  if (!pos) return null;
                  const isRunning = a.status === "running";
                  const isDone = a.status === "done";
                  
                  return (
                    <g 
                      key={a.id}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredAgent(a)}
                      onMouseLeave={() => setHoveredAgent(null)}
                    >
                      {isRunning && (
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={20}
                          fill="none"
                          stroke={a.color}
                          strokeWidth={1.5}
                          className="animate-ping"
                          opacity={0.4}
                        />
                      )}
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={14}
                        fill={isDone ? "#10b981" : isRunning ? a.color : "#27272a"}
                        stroke={a.color}
                        strokeWidth={2}
                      />
                      <text
                        x={pos.x}
                        y={pos.y + 4}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="8.5"
                        fontWeight="700"
                        fontFamily="Geist Mono, monospace"
                      >
                        {a.id.substring(0, 3).toUpperCase()}
                      </text>
                      {/* Name Label */}
                      <text
                        x={pos.x}
                        y={pos.y - 20}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="600"
                        className="fill-zinc-800 dark:fill-zinc-200"
                      >
                        {a.name}
                      </text>
                      {/* Status Label */}
                      <text
                        x={pos.x}
                        y={pos.y + 28}
                        textAnchor="middle"
                        fontSize="8"
                        className="fill-zinc-500 font-mono"
                      >
                        {a.status.toUpperCase()}
                      </text>
                    </g>
                  );
                })}
              </>
            ) : (
              <>
                {/* Fallback Mock routing view */}
                {routes.map((r, i) => {
                  const angle = (i / routes.length) * Math.PI * 2 - Math.PI / 2;
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
                  router
                </text>
              </>
            )}
          </svg>

          {/* Details tooltip panel */}
          <div className="absolute inset-x-3 bottom-3 rounded-lg border border-zinc-200/80 bg-white/80 px-3 py-2 backdrop-blur dark:border-white/[0.06] dark:bg-black/50">
            {hasPlan ? (
              <div className="font-mono text-[10.5px]">
                {hoveredAgent ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span style={{ color: hoveredAgent.color }}>{hoveredAgent.name}</span>
                      <span className="text-[9px] uppercase border px-1 rounded dark:border-white/10">{hoveredAgent.status}</span>
                      <span className="text-zinc-500">Group {hoveredAgent.parallelGroup}</span>
                    </div>
                    <div className="text-zinc-600 dark:text-zinc-300 truncate">{hoveredAgent.task}</div>
                    {hoveredAgent.ownsFiles.length > 0 && (
                      <div className="text-[9.5px] text-zinc-500 truncate">
                        Owns: {hoveredAgent.ownsFiles.join(", ")}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-zinc-500 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-indigo-500" />
                    Hover an agent to view task assignment & file ownership.
                  </div>
                )}
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-center justify-between gap-2 font-mono text-[10.5px]"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Sparkles className="h-3 w-3 shrink-0 text-indigo-500" />
                    <span className="truncate text-zinc-700 dark:text-zinc-300">
                      {routes[active]?.task}
                    </span>
                    <span className="text-zinc-400">→</span>
                    <span style={{ color: routes[active]?.color }} className="font-semibold">
                      {routes[active]?.target}
                    </span>
                  </div>
                  <span className="shrink-0 rounded border border-zinc-200/70 px-1.5 py-0.5 text-[9px] text-zinc-500 dark:border-white/10">
                    {isDemo ? "demo" : "live"}
                  </span>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-lg border border-zinc-200/70 bg-zinc-50/50 dark:border-white/[0.06] dark:bg-black/40">
          <div className="flex items-center justify-between border-b border-zinc-200/70 px-3 py-2 dark:border-white/[0.04]">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">
              orchestrator.log
            </span>
            <span className="font-mono text-[9px] text-zinc-500">{logs.length} events</span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[10.5px] leading-[1.65]">
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
                [`[${ts}] master prompt accepted`, `[${ts}] "${v}"`, ...p].slice(0, 22),
              );
              void apiFetch("/orchestrator/dispatch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ task: v }),
              }).then((res) => {
                const ts2 = new Date().toISOString().slice(11, 19);
                setLogs((p) =>
                  [
                    `[${ts2}] dispatch ${res.ok ? "ok" : `failed (${res.status})`}`,
                    ...p,
                  ].slice(0, 22),
                );
              });
              (e.currentTarget as HTMLFormElement).reset();
            }}
            className="flex items-center gap-1.5 border-t border-zinc-200/70 bg-white/60 p-2 dark:border-white/[0.04] dark:bg-black/30"
          >
            <span className="font-mono text-[11px] text-indigo-500">›</span>
            <input
              name="prompt"
              placeholder="dispatch a master prompt to orchestrator…"
              className="flex-1 bg-transparent font-mono text-[11px] text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
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
