import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { usePolling } from "../lib/usePolling";

export function AnalyticsStrip({
  totalUsed,
  totalCap,
  activeAgents,
  totalAgents,
}: {
  totalUsed: number;
  totalCap: number;
  activeAgents: number;
  totalAgents: number;
}) {
  const [tasksShipped, setTasksShipped] = useState<number | null>(null);
  const [routesDemo, setRoutesDemo] = useState(true);

  usePolling(
    async (signal) => {
      try {
        const res = await apiFetch("/analytics/routes?limit=100", {
          cache: "no-store",
          signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const total = Number(data.total ?? data.routes?.length ?? 0);
        setTasksShipped(total);
        setRoutesDemo(!Array.isArray(data.routes) || data.routes.length === 0);
      } catch {
        setTasksShipped(null);
        setRoutesDemo(true);
      }
    },
    30_000,
  );

  const loadPct =
    totalAgents > 0 ? Math.round((activeAgents / totalAgents) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="Spend today"
        value={`$${totalUsed.toFixed(2)}`}
        sub={`of $${totalCap.toFixed(0)} cap`}
      />
      <Stat label="Active agents" value={`${activeAgents}`} sub="parallel sessions" />
      <Stat
        label="Agent load"
        value={`${loadPct}%`}
        sub={`${activeAgents} of ${totalAgents} agents live`}
      />
      <Stat
        label="Routes logged"
        value={tasksShipped == null ? "—" : String(tasksShipped)}
        sub={routesDemo ? "no routing history yet" : "from routing history"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-white/60 px-4 py-3 backdrop-blur dark:border-white/[0.07] dark:bg-zinc-950/40">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1.5 text-[20px] tracking-tight text-zinc-900 dark:text-white">
        {value}
      </div>
      <div className="font-mono text-[10px] text-zinc-500">{sub}</div>
    </div>
  );
}
