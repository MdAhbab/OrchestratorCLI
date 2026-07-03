import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { apiFetch, wsPath } from "../lib/api";

export function TerminalFullscreen() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const name = search.get("name") ?? "terminal";
  const wsToken = search.get("token");
  const runtimeId = Number(id);
  const [status, setStatus] = useState<"connecting" | "open" | "error" | "closed">(
    "connecting",
  );
  const [resolvedToken, setResolvedToken] = useState<string | null>(wsToken);
  const [tokenReady, setTokenReady] = useState(false);

  const termContainer = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!termContainer.current || Number.isNaN(runtimeId)) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Consolas, "Cascadia Mono", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      scrollback: 8000,
      theme: {
        background: "#0a0a0d",
        foreground: "#e4e4e7",
        cursor: "#a78bfa",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termContainer.current);
    termRef.current = term;
    fitRef.current = fit;
    queueMicrotask(() => {
      try {
        fit.fit();
      } catch {}
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
          );
        }
      } catch {}
    });
    ro.observe(termContainer.current);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [runtimeId]);

  useEffect(() => {
    let cancelled = false;
    const resolveToken = async () => {
      setTokenReady(false);
      if (Number.isNaN(runtimeId)) {
        setStatus("error");
        setTokenReady(true);
        return;
      }
      setResolvedToken(wsToken);
      try {
        const res = await apiFetch(`/runtimes/${runtimeId}/ws-token`, {
          method: "POST",
          timeoutMs: 10_000,
        });
        if (res.ok) {
          const data = (await res.json()) as { ws_url?: string };
          const token = data.ws_url
            ? new URL(data.ws_url, window.location.origin).searchParams.get("token")
            : null;
          if (!cancelled && token) setResolvedToken(token);
        }
      } catch (e) {
        console.warn("Failed to refresh token for fullscreen:", e);
      } finally {
        if (!cancelled) setTokenReady(true);
      }
    };
    void resolveToken();
    return () => {
      cancelled = true;
    };
  }, [runtimeId, wsToken]);

  useEffect(() => {
    if (!tokenReady) return;
    if (Number.isNaN(runtimeId)) {
      setStatus("error");
      return;
    }

    const wsRelPath = resolvedToken
      ? `/ws/terminals/${runtimeId}?token=${encodeURIComponent(resolvedToken)}`
      : `/ws/terminals/${runtimeId}`;
    const url = wsPath(wsRelPath);
    setStatus("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    const onDataHandler = (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    };

    // The terminal instance outlives this effect; dispose the input hook on
    // cleanup or every reconnect would stack another handler (doubled keys).
    let onDataDisposable: { dispose: () => void } | null = null;

    ws.onopen = () => {
      setStatus("open");
      onDataDisposable?.dispose();
      onDataDisposable = termRef.current?.onData(onDataHandler) ?? null;
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "output" || msg.type === "ask.token") {
          termRef.current?.write(msg.data ?? msg.text ?? "");
        } else if (msg.type === "status") {
          termRef.current?.writeln(`\r\n[orch] status: ${msg.state}`);
        } else if (msg.type === "error") {
          termRef.current?.writeln(`\r\n[orch] error: ${msg.error}`);
        }
      } catch {}
    };

    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus("closed");

    return () => {
      try {
        onDataDisposable?.dispose();
      } catch {}
      onDataDisposable = null;
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
  }, [runtimeId, resolvedToken, tokenReady]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0a0a0d] text-zinc-100">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <div>
          <div className="text-[13px] text-white">{name}</div>
          <div className="font-mono text-[10px] text-zinc-500">
            runtime {id} · {status}
          </div>
        </div>
      </header>
      <div ref={termContainer} className="min-h-0 flex-1 p-2" />
    </div>
  );
}
