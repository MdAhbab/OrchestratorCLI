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

/** Health check URL — prefers /api/health (same proxy as other API calls). */
export function healthCheckUrl(): string {
  return apiPath("/health");
}

/** @deprecated use healthCheckUrl() */
export const healthPath = healthCheckUrl();
