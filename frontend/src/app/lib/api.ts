const rawApiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || "/api";
const isAbsoluteApiBase = rawApiBase.startsWith("http://") || rawApiBase.startsWith("https://");
const normalizedApiBase = rawApiBase.endsWith("/") && rawApiBase.length > 1
  ? rawApiBase.slice(0, -1)
  : rawApiBase;

export function apiPath(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (isAbsoluteApiBase) {
    return `${normalizedApiBase}${path.startsWith("/") ? path : `/${path}`}`;
  }
  const prefixedApiBase = normalizedApiBase.startsWith("/") ? normalizedApiBase : `/${normalizedApiBase}`;
  return `${prefixedApiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Build a fully-qualified WebSocket URL for a given backend path
 * (e.g. wsPath("/ws/terminals/12") -> "ws://localhost:5173/ws/terminals/12").
 * Vite's dev proxy forwards /ws to the FastAPI server.
 */
export function wsPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (typeof window === "undefined") return p;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${p}`;
}

/** Health check URL — `/health` is proxied by Vite and always registered on FastAPI. */
export function healthCheckUrl(): string {
  return "/health";
}

/** @deprecated use healthCheckUrl() */
export const healthPath = healthCheckUrl();

const DEFAULT_FETCH_MS = 25_000;

/** fetch() with an AbortSignal timeout so hung backends surface errors in the UI. */
export function apiFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_MS, ...rest } = init ?? {};
  const signal =
    rest.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);
  return fetch(apiPath(path), { ...rest, signal });
}

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "AbortError" || err.name === "TimeoutError")
  );
}
