/**
 * Stable health-weighted ordering for provider lists.
 *
 * Ranks healthier providers first so the operator's eyes land on actionable
 * state without having to scan. Ties are broken by display name (case-insensitive).
 */
import type { Provider, Status } from "../components/store";

const STATUS_RANK: Record<Status, number> = {
  online: 0,
  limited: 1,
  offline: 2,
};

/** Returns a comparator suitable for Array#sort that never mutates input. */
export function compareProviderHealth(
  a: Pick<Provider, "status" | "name">,
  b: Pick<Provider, "status" | "name">,
): number {
  const ra = STATUS_RANK[a.status] ?? 99;
  const rb = STATUS_RANK[b.status] ?? 99;
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** Returns a *new* array sorted by health then alphabetical name. */
export function sortProvidersByHealth<P extends Pick<Provider, "status" | "name">>(
  providers: P[],
): P[] {
  return [...providers].sort(compareProviderHealth);
}
