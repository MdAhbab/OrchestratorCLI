import { apiFetch } from "./api";
import type { SessionEntry } from "../components/store";

export function mapSessionStatus(raw: string): SessionEntry["status"] {
  if (raw === "completed") return "completed";
  if (raw === "paused") return "paused";
  if (raw === "archived") return "archived";
  return "active";
}

export async function fetchSessionEntries(limit = 20): Promise<SessionEntry[]> {
  const [sessionsRes, usageRes] = await Promise.all([
    apiFetch(`/sessions?limit=${limit}`),
    apiFetch("/analytics/usage?days=30"),
  ]);
  if (!sessionsRes.ok) return [];

  const j = await sessionsRes.json();
  let usageBySession: Record<string, { cost?: number; tokens?: number }> = {};
  if (usageRes.ok) {
    const usage = await usageRes.json();
    if (usage?.sessions && typeof usage.sessions === "object") {
      usageBySession = usage.sessions;
    }
  }

  return (j.sessions ?? []).map((s: any) => {
    let meta = s.metadata;
    if (meta && typeof meta === "string") {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = {};
      }
    }
    const usage = usageBySession[String(s.id)] ?? {};
    return {
      id: String(s.id),
      prompt: s.title ?? "(untitled session)",
      status: mapSessionStatus(String(s.status ?? "active")),
      startedAt: new Date(s.created_at).getTime(),
      endedAt: s.updated_at ? new Date(s.updated_at).getTime() : undefined,
      summary: s.description ?? "",
      agents: Array.isArray(meta?.delegated_agents) ? meta.delegated_agents : [],
      spend: Number(usage.cost ?? 0),
      tokens: Math.round(Number(usage.tokens ?? 0)),
      artifacts: Array.isArray(meta?.artifacts)
        ? meta.artifacts.map((a: any) => a.name ?? String(a))
        : [],
    };
  });
}
