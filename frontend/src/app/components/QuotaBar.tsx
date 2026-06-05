import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export type QuotaState = {
  used: number;
  limit: number;
  pct: number;
  status: "ok" | "warn" | "preempt" | "exhausted";
};

export type QuotaMap = Record<string, QuotaState>;

/** Fetch quota state from GET /orchestrator/quota. Returns an empty map if the endpoint is down or returns no data. */
export async function fetchQuota(): Promise<QuotaMap> {
  try {
    const res = await apiFetch("/orchestrator/quota", { timeoutMs: 6_000 });
    if (!res.ok) return {};
    const data = await res.json();
    // Defensive: backend may return null, empty, or a different shape
    if (!data || typeof data !== "object") return {};
    return data as QuotaMap;
  } catch {
    return {};
  }
}

/** Color classes based on quota status / percentage */
function barColor(pct: number): string {
  if (pct >= 100) return "bg-red-500";
  if (pct >= 90) return "bg-orange-500";
  if (pct >= 85) return "bg-amber-400";
  return "bg-emerald-500";
}

function labelColor(pct: number): string {
  if (pct >= 100) return "text-red-600 dark:text-red-400";
  if (pct >= 90) return "text-orange-600 dark:text-orange-400";
  if (pct >= 85) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function statusLabel(status: QuotaState["status"], pct: number): string {
  if (status === "exhausted" || pct >= 100) return "exhausted";
  if (status === "preempt" || pct >= 90) return "preempt";
  if (status === "warn" || pct >= 85) return "warn";
  return "ok";
}

/**
 * A small inline quota usage bar for a single provider/agent.
 * Shows nothing if quota data is unavailable.
 */
export function QuotaBar({
  providerId,
  quota,
  showHandedOff,
}: {
  providerId: string;
  quota: QuotaMap;
  showHandedOff?: boolean;
}) {
  const qs = quota[providerId];
  if (!qs) return null;

  const pct = Math.min(100, Math.max(0, qs.pct ?? 0));
  const sl = statusLabel(qs.status, pct);

  return (
    <div className="mt-2 flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-[9px] uppercase tracking-wider ${labelColor(pct)}`}>
          quota {sl}
        </span>
        <div className="flex items-center gap-1.5">
          {showHandedOff && (
            <span className="rounded-md border border-amber-300/50 bg-amber-50 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/[0.08] dark:text-amber-300">
              handed off
            </span>
          )}
          <span className={`font-mono text-[9px] ${labelColor(pct)}`}>
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-200/70 dark:bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {qs.limit > 0 && (
        <div className="font-mono text-[8.5px] text-zinc-400">
          {qs.used.toLocaleString()} / {qs.limit.toLocaleString()} tokens
        </div>
      )}
    </div>
  );
}

/**
 * Hook that polls GET /orchestrator/quota on mount and optionally on an interval.
 */
export function useQuota(pollMs = 30_000): QuotaMap {
  const [quota, setQuota] = useState<QuotaMap>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const q = await fetchQuota();
      if (!cancelled) setQuota(q);
    };

    void load();
    const id = pollMs > 0 ? window.setInterval(load, pollMs) : null;

    return () => {
      cancelled = true;
      if (id !== null) window.clearInterval(id);
    };
  }, [pollMs]);

  return quota;
}
