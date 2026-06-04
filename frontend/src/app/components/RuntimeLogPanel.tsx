import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type RuntimeRow = {
  id: number;
  provider_id?: number;
  status?: string;
  command?: string;
};

export function RuntimeLogPanel({ runtimeId }: { runtimeId?: number }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [runtimes, setRuntimes] = useState<RuntimeRow[]>([]);
  const [selected, setSelected] = useState<number | undefined>(runtimeId);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch("/runtimes?limit=10");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const rows = (data.runtimes ?? data.items ?? []) as RuntimeRow[];
        setRuntimes(rows);
        if (!selected && rows.length) setSelected(rows[0].id);
      } catch {
        /* ignore */
      }
    };
    void load();
  }, [selected]);

  useEffect(() => {
    if (selected == null) return;
    let cancelled = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await apiFetch(`/runtimes/${selected}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const lines = (data.logs ?? []).map(
          (l: { content?: string; log_type?: string }) =>
            `[${l.log_type ?? "log"}] ${l.content ?? ""}`,
        );
        setLogs(lines.slice(-40));
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(load, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [selected]);

  return (
    <div className="space-y-2">
      {runtimes.length > 1 && (
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(Number(e.target.value))}
          className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 font-mono text-[10px] dark:border-white/[0.08] dark:bg-zinc-950"
        >
          {runtimes.map((r) => (
            <option key={r.id} value={r.id}>
              runtime #{r.id} · {r.status ?? "unknown"}
            </option>
          ))}
        </select>
      )}
      <pre className="max-h-48 overflow-auto rounded-md border border-zinc-200/60 bg-zinc-950 p-2 font-mono text-[10px] text-zinc-300 dark:border-white/[0.06]">
        {logs.length ? logs.join("\n") : "No runtime logs yet."}
      </pre>
    </div>
  );
}
