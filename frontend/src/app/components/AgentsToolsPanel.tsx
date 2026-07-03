import { useState } from "react";
import { apiFetch } from "../lib/api";
import { usePolling } from "../lib/usePolling";

type AgentRow = {
  agent_id: string;
  display_name: string;
  status: string;
  runtime_id?: number | null;
};

type ToolRow = {
  name: string;
  description?: string;
};

export function AgentsToolsPanel() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  usePolling(async (signal) => {
    try {
      const [aRes, tRes] = await Promise.all([
        apiFetch("/agents?limit=20", { signal }),
        apiFetch("/tools/mcp", { signal }),
      ]);
      if (signal.aborted) return;
      if (aRes.ok) setAgents(await aRes.json());
      if (tRes.ok) setTools(await tRes.json());
      setErr(null);
    } catch (e) {
      if (!signal.aborted) setErr(String(e));
    }
  }, 20000);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-zinc-200/70 bg-white/60 p-3 dark:border-white/[0.07] dark:bg-zinc-950/40">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          A2A agents
        </div>
        <ul className="mt-2 space-y-1.5">
          {agents.map((a) => (
            <li
              key={a.agent_id}
              className="flex items-center justify-between rounded-md border border-zinc-200/60 px-2 py-1.5 text-[11px] dark:border-white/[0.06]"
            >
              <span>{a.display_name}</span>
              <span className="font-mono text-[9px] text-zinc-500">{a.status}</span>
            </li>
          ))}
          {agents.length === 0 && (
            <li className="text-[11px] text-zinc-500">No agents registered.</li>
          )}
        </ul>
      </div>
      <div className="rounded-xl border border-zinc-200/70 bg-white/60 p-3 dark:border-white/[0.07] dark:bg-zinc-950/40">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          MCP tools
        </div>
        <ul className="mt-2 space-y-1.5">
          {tools.map((t) => (
            <li
              key={t.name}
              className="rounded-md border border-zinc-200/60 px-2 py-1.5 text-[11px] dark:border-white/[0.06]"
            >
              <div className="font-mono text-zinc-800 dark:text-zinc-200">{t.name}</div>
              {t.description && (
                <div className="mt-0.5 text-[10px] text-zinc-500">{t.description}</div>
              )}
            </li>
          ))}
          {tools.length === 0 && (
            <li className="text-[11px] text-zinc-500">No MCP tools exposed.</li>
          )}
        </ul>
      </div>
      {err && <p className="col-span-full text-[11px] text-rose-500">{err}</p>}
    </div>
  );
}
