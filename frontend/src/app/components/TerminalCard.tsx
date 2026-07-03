import { motion } from "motion/react";
import {
  Maximize2,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  Send,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { Dropdown } from "./Sidebar";
import { apiPath, apiFetch, wsPath } from "../lib/api";
import { trackAnalyticsEvent } from "../lib/analyticsClient";
import { cliInstallForProvider } from "../lib/cliInstall";

type AuthMethod = "api_key" | "oauth" | "ssh" | "bearer" | "account";

export type CliRuntime = {
  /** Provider short id (claude, gemini, bob, ...). Used as React key + UI label. */
  id: string;
  /** Provider numeric DB id, when known. Required for spawning a PTY. */
  providerId?: number;
  /** Live PTY runtime id (created by POST /api/runtimes/spawn). */
  runtimeId?: number;
  wsUrl?: string;
  /** Human-readable shell label from the backend (e.g. 'PowerShell', 'bash'). */
  shellLabel?: string;
  name: string;
  glyph: string;
  model: string;
  models: string[];
  color: string;
  accent: string;
  authMethod: AuthMethod;
  state: "executing" | "idle" | "limited" | "permission";
  used: number;
  cap: number;
  resetsIn?: string;
  pendingCmd?: string;
  task?: string;
};

const stateMap = {
  executing: {
    label: "Executing",
    cls: "border-emerald-300/40 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  idle: {
    label: "Idle",
    cls: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-400/20 dark:bg-zinc-400/10 dark:text-zinc-400",
  },
  limited: {
    label: "Rate Limited",
    cls: "border-rose-300/40 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",
  },
  permission: {
    label: "Awaiting Permission",
    cls: "border-amber-300/40 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
  },
};

type WsStatus = "connecting" | "open" | "closed" | "error" | "spawning";

/**
 * Quote a value for the spawned shell. PowerShell escapes single quotes by
 * doubling them; POSIX shells (zsh/bash) need the `'\''` dance — the
 * PowerShell style silently eats apostrophes there.
 */
function shellQuote(value: string, isPowerShell: boolean) {
  const flat = value.replace(/\r?\n/g, " ");
  return isPowerShell
    ? `'${flat.replace(/'/g, "''")}'`
    : `'${flat.replace(/'/g, `'\\''`)}'`;
}

function commandForAssignedTask(cli: CliRuntime, isPowerShell: boolean) {
  const task = shellQuote(cli.task ?? "", isPowerShell);
  switch (cli.id) {
    case "claude":
      return `claude -p ${task}\r`;
    case "gemini":
      return `gemini -p ${task}\r`;
    case "codex":
      return `codex exec ${task}\r`;
    case "copilot":
      return `gh copilot suggest ${task}\r`;
    case "deepseek":
      return `deepseek ${task}\r`;
    case "kimi":
      return `kimi ${task}\r`;
    case "cline":
      return `cline ${task}\r`;
    default: {
      const note = shellQuote(`[orch] Assigned task: ${cli.task ?? ""}`, isPowerShell);
      return `${isPowerShell ? "Write-Host" : "echo"} ${note}\r`;
    }
  }
}

export function TerminalCard({
  cli,
  defaultMenuOpen = false,
  onRuntime,
  lazyConnect = false,
  spawnAllowed = true,
  highlighted = false,
}: {
  cli: CliRuntime;
  defaultMenuOpen?: boolean;
  /** Notify the parent when the runtime id materialises (post-spawn). */
  onRuntime?: (providerId: number | undefined, runtimeId: number | undefined) => void;
  /** When true, defer spawn until user clicks Connect (HIGH-008). */
  lazyConnect?: boolean;
  /** Respect orchestrator parallelism cap (HIGH-008). */
  spawnAllowed?: boolean;
  /** Highlight card when user clicks Watch processes (HIGH-045). */
  highlighted?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen);
  const [model, setModel] = useState(cli.model);
  const [wsStatus, setWsStatus] = useState<WsStatus>("spawning");
  const [askPrompt, setAskPrompt] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [connectRequested, setConnectRequested] = useState(!lazyConnect);
  const [runtimeId, setRuntimeId] = useState<number | undefined>(cli.runtimeId);
  const [shellLabel, setShellLabel] = useState<string>(cli.shellLabel ?? "Terminal");
  // Kept in a ref, not state: each attach mints a fresh single-use token URL,
  // and putting that in effect deps would close/reopen the socket in a loop.
  const wsUrlRef = useRef<string | undefined>(cli.wsUrl);
  const spawnInProgressRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setRuntimeId(cli.runtimeId);
    wsUrlRef.current = cli.wsUrl;
  }, [cli.runtimeId, cli.wsUrl]);


  const termContainer = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onDataDisposeRef = useRef<(() => void) | null>(null);
  const sendBufRef = useRef<string>("");
  const assignedTaskSentRef = useRef<string | null>(null);
  const lastRuntimeIdRef = useRef<number | undefined>(undefined);
  const cardInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const nextRuntimeId = runtimeId ?? cli.runtimeId;
    if (nextRuntimeId !== lastRuntimeIdRef.current) {
      assignedTaskSentRef.current = null;
      lastRuntimeIdRef.current = nextRuntimeId;
    }
  }, [runtimeId, cli.runtimeId]);

  const s = stateMap[cli.state];
  const pct = Math.min(100, (cli.used / cli.cap) * 100);
  const overBudget = pct > 85;

  // -------- xterm.js + WebSocket lifecycle ----------------------------------
  useEffect(() => {
    if (!termContainer.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Consolas, "Cascadia Mono", monospace',
      fontSize: 11.5,
      lineHeight: 1.25,
      scrollback: 4000,
      theme: {
        background: "#0a0a0d",
        foreground: "#e4e4e7",
        cursor: "#a78bfa",
        selectionBackground: "rgba(99,102,241,0.30)",
      },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termContainer.current);
    termRef.current = term;
    fitRef.current = fit;

    // Initial fit after layout
    queueMicrotask(() => {
      try {
        fit.fit();
      } catch {}
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })
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
  }, []);

  useEffect(() => {
    if (cli.task && lazyConnect) setConnectRequested(true);
  }, [cli.task, lazyConnect]);

  // Spawn a runtime if we don't have one yet, then attach WS.
  useEffect(() => {
    if (!connectRequested && runtimeId == null && cli.runtimeId == null) {
      setWsStatus("closed");
      return;
    }
    if (!spawnAllowed && runtimeId == null && cli.runtimeId == null) {
      setWsStatus("closed");
      return;
    }
    let cancelled = false;

    const ensureRuntimeAndConnect = async () => {
      let rid = runtimeId ?? cli.runtimeId;
      let currentWsUrl = wsUrlRef.current ?? cli.wsUrl;
      try {
        if (rid == null) {
          if (spawnInProgressRef.current) {
            console.log("Spawn already in progress, skipping duplicate spawn call.");
            return;
          }
          spawnInProgressRef.current = true;
          setWsStatus("spawning");
          const res = await apiFetch("/runtimes/spawn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider_id: cli.providerId,
              provider_name: cli.name,
              cols: termRef.current?.cols ?? 120,
              rows: termRef.current?.rows ?? 30,
            }),
            timeoutMs: 30_000,
          });
          spawnInProgressRef.current = false;
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`spawn failed (${res.status}): ${body}`);
          }
          const data = await res.json();
          rid = data.runtime_id as number;
          currentWsUrl = data.ws_url as string;
          if (data.shell_label) setShellLabel(data.shell_label as string);
          if (cancelled) return;
          setRuntimeId(rid);
          wsUrlRef.current = currentWsUrl;
          onRuntime?.(cli.providerId, rid);
        }
      } catch (e) {
        spawnInProgressRef.current = false;
        console.error("Failed to spawn runtime:", e);
        void trackAnalyticsEvent("error_occurred", {
          metadata: { provider: cli.id, error: String(e) },
        });
        termRef.current?.writeln(`\x1b[31m[orch] failed to start terminal: ${e}\x1b[0m`);
        const install = cliInstallForProvider(cli.id);
        if (install) {
          termRef.current?.writeln(`\x1b[33m[orch] install CLI:\x1b[0m ${install.install}`);
          termRef.current?.writeln(`\x1b[33m[orch] verify:\x1b[0m ${install.verify}`);
        }
        setWsStatus("error");
        return;
      }

      if (cancelled || rid == null) return;

      // Single-use WS tokens are consumed on connect; refresh before each attach.
      try {
        const refreshRes = await apiFetch(`/runtimes/${rid}/ws-token`, {
          method: "POST",
          timeoutMs: 10_000,
        });
        if (refreshRes.ok) {
          const refreshed = (await refreshRes.json()) as { ws_url?: string };
          if (refreshed.ws_url) {
            currentWsUrl = refreshed.ws_url;
            if (!cancelled) wsUrlRef.current = currentWsUrl;
          }
        }
      } catch (e) {
        console.warn("Failed to refresh WebSocket token:", e);
      }

      const path = currentWsUrl || `/ws/terminals/${rid}`;
      const url = wsPath(path);
      setWsStatus("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setWsStatus("open");
        onDataDisposeRef.current?.();
        const disposable = termRef.current?.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "input", data }));
          }
          if (data === "\r") {
            sendBufRef.current = "";
          } else if (data === "\u007f") {
            sendBufRef.current = sendBufRef.current.slice(0, -1);
          } else if (!data.startsWith("\x1b")) {
            sendBufRef.current += data;
          }
        });
        onDataDisposeRef.current = () => {
          try {
            disposable?.dispose();
          } catch {}
        };
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "hello") {
            termRef.current?.writeln(
              `\r\n\x1b[36m[orch] connected · ${msg.provider_name ?? cli.name} · pid ${msg.pid ?? "?"}\x1b[0m`,
            );
            if (msg.status === "exited") {
              termRef.current?.writeln(`\r\n\x1b[33m[orch] runtime already exited\x1b[0m`);
            }
          } else if (msg.type === "division.status") {
            window.dispatchEvent(
              new CustomEvent("orch:division-status", {
                detail: { short: msg.short, status: msg.status ?? "done" },
              }),
            );
          } else if (msg.type === "output" || msg.type === "ask.token") {
            const colored =
              msg.type === "ask.token"
                ? `\x1b[35m${msg.text ?? msg.data ?? ""}\x1b[0m`
                : (msg.data ?? msg.text ?? "");
            termRef.current?.write(colored);
          } else if (msg.type === "status") {
            termRef.current?.writeln(`\r\n\x1b[33m[orch] status: ${msg.state}\x1b[0m`);
          } else if (msg.type === "ask.done") {
            termRef.current?.write(`\r\n\x1b[35m[orch] (llm) ✓\x1b[0m\r\n`);
          } else if (msg.type === "ask.error") {
            termRef.current?.writeln(`\r\n\x1b[31m[orch] ask error: ${msg.error}\x1b[0m`);
          } else if (msg.type === "error") {
            termRef.current?.writeln(`\r\n\x1b[31m[orch] error: ${msg.error}\x1b[0m`);
          }
        } catch {
          // Ignore non-JSON frames
        }
      };
      ws.onerror = () => setWsStatus("error");
      ws.onclose = () => {
        setWsStatus("closed");
        if (cancelled) return;

        // Automatic reconnection with exponential backoff
        const maxAttempts = 3;
        if (reconnectAttemptsRef.current < maxAttempts) {
          const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000;
          console.log(`WebSocket closed. Retrying connection in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxAttempts})`);
          reconnectAttemptsRef.current += 1;

          if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = window.setTimeout(() => {
            if (!cancelled) {
              void ensureRuntimeAndConnect();
            }
          }, delay);
        }
      };
    };

    void ensureRuntimeAndConnect();

    return () => {
      cancelled = true;
      onDataDisposeRef.current?.();
      onDataDisposeRef.current = null;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
  }, [cli.providerId, cli.runtimeId, connectRequested, runtimeId, lazyConnect, spawnAllowed]);

  const sendInput = (text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "input", data: text }));
  };

  const dispatchAssignedTask = (force = false) => {
    const task = cli.task?.trim();
    if (!task) return;
    if (!force && assignedTaskSentRef.current === task) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    assignedTaskSentRef.current = task;
    const label = shellLabel.toLowerCase();
    const isPowerShell =
      label.includes("powershell") ||
      // Before the spawn response names the shell, fall back to the platform.
      (label === "terminal" &&
        (window.orchestratorDesktop?.platform === "win32" ||
          navigator.userAgent.toLowerCase().includes("windows")));
    const command = commandForAssignedTask(cli, isPowerShell);
    termRef.current?.writeln(`\r\n\x1b[36m[orch] dispatching assigned task to ${cli.name}\x1b[0m`);
    sendInput(command);
  };

  useEffect(() => {
    if (wsStatus === "open") {
      dispatchAssignedTask(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cli.task, wsStatus]);

  const handleSendButton = () => {
    const v = (cardInputRef.current?.value ?? "").trim();
    if (!v) return;
    sendInput(v + "\r");
    if (cardInputRef.current) cardInputRef.current.value = "";
    sendBufRef.current = "";
  };

  const handleReload = async () => {
    if (runtimeId != null) {
      try {
        await apiFetch(`/runtimes/${runtimeId}`, { method: "DELETE" });
      } catch {}
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
      setRuntimeId(undefined);
      onRuntime?.(cli.providerId, undefined);
      termRef.current?.clear();
    }
  };

  const handlePause = async () => {
    if (runtimeId == null) return;
    try {
      await apiFetch(`/runtimes/${runtimeId}/${paused ? "resume" : "pause"}`, {
        method: "POST",
      });
      setPaused((p) => !p);
    } catch (e) {
      console.error("pause failed", e);
    }
  };

  const handleFullscreen = async () => {
    if (runtimeId == null) return;
    const qs = new URLSearchParams({ name: cli.name });
    try {
      const res = await apiFetch(`/runtimes/${runtimeId}/ws-token`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { ws_url?: string };
        if (data.ws_url) {
          const token = new URL(data.ws_url, window.location.origin).searchParams.get("token");
          if (token) qs.set("token", token);
        }
      }
    } catch (e) {
      console.warn("Failed to refresh token for fullscreen:", e);
    }
    window.open(
      `/terminal/${runtimeId}?${qs.toString()}`,
      "_blank",
      "noopener,noreferrer,width=1100,height=720",
    );
  };

  const handleApprove = async (approved: boolean) => {
    if (runtimeId == null) return;
    try {
      await apiFetch(`/runtimes/${runtimeId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, reason: approved ? "user approved" : "user denied" }),
      });
    } catch (e) {
      console.error("approve failed", e);
    }
  };

  const handleAskOrchestrator = () => {
    const ws = wsRef.current;
    const q = askPrompt.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN || !q) return;
    ws.send(JSON.stringify({ type: "ask", prompt: q, model }));
    termRef.current?.write(`\r\n\x1b[35m[orch] > ${q}\x1b[0m\r\n`);
    setAskPrompt("");
  };

  const statusBadge = useMemo(() => {
    const label =
      wsStatus === "spawning"
        ? "Spawning"
        : wsStatus === "connecting"
        ? "Connecting"
        : wsStatus === "open"
        ? paused
          ? "Paused"
          : s.label
        : wsStatus === "error"
        ? "Error"
        : "Disconnected";
    const cls =
      wsStatus === "open" && !paused
        ? s.cls
        : wsStatus === "error"
        ? "border-rose-300/40 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"
        : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-400/20 dark:bg-zinc-400/10 dark:text-zinc-400";
    return { label, cls };
  }, [wsStatus, paused, s.cls, s.label]);

  return (
    <div className={`group relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-xl border bg-white/80 transition dark:bg-zinc-950/70 ${
      highlighted
        ? "border-indigo-400 ring-2 ring-indigo-400/40 dark:border-indigo-400/60"
        : "border-zinc-200/70 hover:border-zinc-300 dark:border-white/[0.07] dark:hover:border-white/[0.14]"
    }`}>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200/70 px-4 py-2.5 dark:border-white/[0.05]">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`${cli.color} shrink-0 font-mono text-[18px] leading-none`}>
            {cli.glyph}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[12.5px] text-zinc-900 dark:text-white">{cli.name}</div>
            <div className="truncate font-mono text-[9.5px] text-zinc-500">{model}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              Model
            </span>
            <Dropdown
              value={model}
              options={cli.models}
              onChange={setModel}
              className="w-[140px]"
            />
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${statusBadge.cls}`}
          >
            {wsStatus === "open" && !paused && (
              <span className="relative flex h-1 w-1">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1 w-1 rounded-full bg-emerald-500" />
              </span>
            )}
            {statusBadge.label}
          </span>
          <button
            onClick={() => setAskOpen((o) => !o)}
            title="Ask orchestrator"
            className={`rounded p-1 ${askOpen ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300" : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5"}`}
          >
            <Sparkles className="h-3 w-3" />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={`rounded p-1 ${menuOpen ? "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200" : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5"}`}
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute right-0 top-full z-30 mt-1 w-[260px] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-950"
              >
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    void handlePause();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11.5px] text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/5"
                >
                  {paused ? <Play className="h-3 w-3 text-zinc-500" /> : <Pause className="h-3 w-3 text-zinc-500" />}
                  <span>{paused ? "Resume" : "Pause"}</span>
                  <span className="ml-auto font-mono text-[9px] text-zinc-400">⌘P</span>
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    void handleReload();
                  }}
                  className="flex w-full items-center gap-2 border-t border-zinc-200/70 px-3 py-2 text-left text-[11.5px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/5"
                >
                  <RefreshCw className="h-3 w-3 text-zinc-500" />
                  <span>Reload</span>
                  <span className="ml-auto font-mono text-[9px] text-zinc-400">⌘R</span>
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    handleFullscreen();
                  }}
                  className="flex w-full items-start gap-2 border-t border-zinc-200/70 px-3 py-2 text-left text-[11.5px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/5"
                >
                  <Maximize2 className="mt-0.5 h-3 w-3 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <div>Full-screen</div>
                    <div className="mt-0.5 font-mono text-[9.5px] leading-snug text-zinc-500">
                      Pops out this CLI terminal as a separate, native PC window.
                    </div>
                  </div>
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {cli.task && (
        <div className="border-b border-zinc-200/70 bg-indigo-50/30 px-4 py-1.5 dark:border-white/[0.05] dark:bg-indigo-400/[0.04]">
          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span className="shrink-0 text-zinc-500">assigned:</span>
            <span className="min-w-0 flex-1 truncate text-indigo-700 dark:text-indigo-300">{cli.task}</span>
            <button
              onClick={() => dispatchAssignedTask(true)}
              disabled={wsStatus !== "open"}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-200/70 bg-white px-1.5 py-0.5 text-[9.5px] text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-indigo-400/20 dark:bg-white/[0.03] dark:text-indigo-300 dark:hover:bg-indigo-400/10"
              title="Send assigned task to this terminal"
            >
              <Send className="h-2.5 w-2.5" />
              Dispatch
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5 px-4 pt-3">
        <div className="flex items-center justify-between font-mono text-[10px]">
          <span className="text-zinc-500">Daily quota</span>
          <span className={overBudget ? "text-rose-600 dark:text-rose-300" : "text-zinc-700 dark:text-zinc-200"}>
            ${cli.used.toFixed(2)}
            <span className="text-zinc-400 dark:text-zinc-600"> / ${cli.cap.toFixed(2)}</span>
          </span>
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.05]">
          <motion.div
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8 }}
            className="h-full"
            style={{
              background: overBudget ? "linear-gradient(to right,#fb7185,#f43f5e)" : cli.accent,
            }}
          />
          <div className="absolute top-0 h-full w-px bg-rose-400/40" style={{ left: "85%" }} />
        </div>
        <div className="flex items-center justify-between font-mono text-[9px] text-zinc-500">
          <span>pid {runtimeId ?? "—"} · ws {wsStatus}</span>
          {cli.resetsIn ? (
            <span className="text-rose-600 dark:text-rose-300">resets in {cli.resetsIn}</span>
          ) : (
            <span>{cli.id}.session</span>
          )}
        </div>
      </div>

      <div className="m-3 mt-3 flex flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200/70 bg-[#0a0a0d] dark:border-white/[0.05]">
        <div className="flex items-center justify-between border-b border-white/[0.04] px-3 py-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">
          {cli.id}.session · {shellLabel}
          </span>
        </div>
        <div className="relative flex-1">
          {((lazyConnect && !connectRequested && runtimeId == null) || wsStatus === "closed" || wsStatus === "error") && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0a0a0d]/90">
              <p className="font-mono text-[10px] text-zinc-400">
                {wsStatus === "error" ? "Terminal connection error" : wsStatus === "closed" ? "Terminal disconnected" : "PTY not connected"}
              </p>
              <button
                type="button"
                onClick={() => {
                  reconnectAttemptsRef.current = 0;
                  setConnectRequested(false);
                  queueMicrotask(() => {
                    setConnectRequested(true);
                  });
                }}
                className="rounded-md bg-indigo-600 px-3 py-1 font-mono text-[10px] text-white hover:bg-indigo-500"
              >
                {wsStatus === "error" || wsStatus === "closed" ? "Reconnect terminal" : "Connect terminal"}
              </button>
            </div>
          )}
          <div ref={termContainer} className="h-full px-2 py-1" />
        </div>

        {askOpen && (
          <div className="border-t border-indigo-500/20 bg-indigo-500/[0.08] px-2 py-1.5">
            <div className="mb-1 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-indigo-300" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-indigo-300">
                Ask orchestrator · {model}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <input
                value={askPrompt}
                onChange={(e) => setAskPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAskOrchestrator();
                  }
                }}
                placeholder="ask the orchestrator about this terminal…"
                className="flex-1 rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-indigo-100 outline-none placeholder:text-indigo-300/40"
              />
              <button
                onClick={handleAskOrchestrator}
                className="rounded bg-indigo-500/30 px-2 py-1 text-[11px] text-indigo-200 hover:bg-indigo-500/50"
              >
                Ask
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 border-t border-white/[0.04] bg-black/30 px-2 py-1">
          <span className="font-mono text-[11px] text-zinc-400">$</span>
          <input
            ref={cardInputRef}
            placeholder={`send command to ${cli.id}…`}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSendButton();
              }
            }}
            className="flex-1 bg-transparent font-mono text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500"
          />
          <button
            onClick={handleSendButton}
            className="rounded p-0.5 text-zinc-400 hover:text-zinc-200"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>

      {cli.state === "permission" && cli.pendingCmd && (
        <div className="border-t border-amber-300/40 bg-amber-50/70 px-4 py-2.5 dark:border-amber-400/15 dark:bg-amber-400/[0.04]">
          <div className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-200">
            <ShieldAlert className="h-3 w-3" />
            Approval required for destructive command
          </div>
          <pre className="mt-1.5 rounded border border-amber-300/40 bg-white px-2 py-1 font-mono text-[10px] text-amber-800 dark:border-amber-400/15 dark:bg-black/40 dark:text-amber-100">
            {cli.pendingCmd}
          </pre>
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <button
              onClick={() => void handleApprove(false)}
              className="rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[10px] text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.08]"
            >
              Deny
            </button>
            <button
              onClick={() => void handleApprove(true)}
              className="rounded-md bg-emerald-500 px-2 py-1 text-[10px] text-white hover:bg-emerald-600"
            >
              Approve once
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
