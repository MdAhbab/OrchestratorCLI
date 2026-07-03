import { useState } from "react";
import { apiFetch } from "../lib/api";
import { usePolling } from "../lib/usePolling";

export type QuotaState = {
  used: number;
  limit: number;
  pct: number;
  status: "ok" | "warn" | "preempt" | "exhausted";
};

export type QuotaMap = Record<string, QuotaState>;

type QuotaApiRow = {
  provider_id?: number;
  provider_name?: string;
  display_name?: string;
  used?: number;
  limit?: number | null;
  /** Backend reports a 0–1 fraction. */
  pct?: number;
  /** Backend reports ok | warn | exhausted | unlimited. */
  status?: string;
};

/**
 * Fetch quota state from GET /orchestrator/quota and normalize the backend's
 * list shape (0–1 pct fractions, ok/warn/exhausted/unlimited statuses) into a
 * slug-keyed map with 0–100 percentages and the UI's preempt tier.
 */
export async function fetchQuota(): Promise<QuotaMap> {
  try {
    const res = await apiFetch("/orchestrator/quota", { timeoutMs: 6_000 });
    if (!res.ok) return {};
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return {};

    const map: QuotaMap = {};
    for (const row of data as QuotaApiRow[]) {
      const slug = row.provider_name;
      const limit = row.limit ?? 0;
      if (!slug || !limit || row.status === "unlimited") continue;
      const pct = Math.min(100, Math.max(0, (row.pct ?? 0) * 100));
      let status: QuotaState["status"];
      if (row.status === "exhausted" || pct >= 100) status = "exhausted";
      else if (pct >= 90) status = "preempt";
      else if (row.status === "warn" || pct >= 85) status = "warn";
      else status = "ok";
      map[slug] = { used: row.used ?? 0, limit, pct, status };
    }
    return map;
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

  usePolling(
    async (signal) => {
      const q = await fetchQuota();
      if (!signal.aborted) setQuota(q);
    },
    pollMs,
    pollMs > 0,
  );

  return quota;
}
