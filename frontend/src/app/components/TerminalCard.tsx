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
import { apiPath, wsPath } from "../lib/api";

type AuthMethod = "api_key" | "oauth" | "ssh" | "bearer" | "account";

export type CliRuntime = {
  /** Provider short id (claude, gemini, bob, ...). Used as React key + UI label. */
  id: string;
  /** Provider numeric DB id, when known. Required for spawning a PTY. */
  providerId?: number;
  /** Live PTY runtime id (created by POST /api/runtimes/spawn). */
  runtimeId?: number;
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

export function TerminalCard({
  cli,
  defaultMenuOpen = false,
  onRuntime,
}: {
  cli: CliRuntime;
  defaultMenuOpen?: boolean;
  /** Notify the parent when the runtime id materialises (post-spawn). */
  onRuntime?: (providerId: number | undefined, runtimeId: number | undefined) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen);
  const [model, setModel] = useState(cli.model);
  const [wsStatus, setWsStatus] = useState<WsStatus>("spawning");
  const [askPrompt, setAskPrompt] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [runtimeId, setRuntimeId] = useState<number | undefined>(cli.runtimeId);

  useEffect(() => {
    setRuntimeId(cli.runtimeId);
  }, [cli.runtimeId]);

  const termContainer = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendBufRef = useRef<string>(""); // input line buffer for the Send button
  const cardInputRef = useRef<HTMLInputElement | null>(null);

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

  // Spawn a runtime if we don't have one yet, then attach WS.
  useEffect(() => {
    let cancelled = false;

    const ensureRuntimeAndConnect = async () => {
      let rid = runtimeId ?? cli.runtimeId;
      try {
        if (rid == null) {
          setWsStatus("spawning");
          const res = await fetch(apiPath("/runtimes/spawn"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider_id: cli.providerId,
              provider_name: cli.name,
              cols: termRef.current?.cols ?? 120,
              rows: termRef.current?.rows ?? 30,
            }),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`spawn failed (${res.status}): ${body}`);
          }
          const data = await res.json();
          rid = data.runtime_id as number;
          if (cancelled) return;
          setRuntimeId(rid);
          onRuntime?.(cli.providerId, rid);
        }
      } catch (e) {
        console.error("Failed to spawn runtime:", e);
        termRef.current?.writeln(`\x1b[31m[bob] failed to start terminal: ${e}\x1b[0m`);
        setWsStatus("error");
        return;
      }

      if (cancelled || rid == null) return;

      const url = wsPath(`/ws/terminals/${rid}`);
      setWsStatus("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("open");
        // Hand the user's keystrokes through.
        termRef.current?.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "input", data }));
          }
          // Track current line so the explicit Send button can flush it.
          if (data === "\r") {
            sendBufRef.current = "";
          } else if (data === "\u007f") {
            sendBufRef.current = sendBufRef.current.slice(0, -1);
          } else if (!data.startsWith("\x1b")) {
            sendBufRef.current += data;
          }
        });
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "output" || msg.type === "ask.token") {
            const colored =
              msg.type === "ask.token"
                ? `\x1b[35m${msg.text ?? msg.data ?? ""}\x1b[0m`
                : (msg.data ?? msg.text ?? "");
            termRef.current?.write(colored);
          } else if (msg.type === "status") {
            termRef.current?.writeln(`\r\n\x1b[33m[bob] status: ${msg.state}\x1b[0m`);
          } else if (msg.type === "ask.done") {
            termRef.current?.write(`\r\n\x1b[35m[bob] (granite) ✓\x1b[0m\r\n`);
          } else if (msg.type === "ask.error") {
            termRef.current?.writeln(`\r\n\x1b[31m[bob] ask error: ${msg.error}\x1b[0m`);
          } else if (msg.type === "error") {
            termRef.current?.writeln(`\r\n\x1b[31m[bob] error: ${msg.error}\x1b[0m`);
          }
        } catch {
          // Ignore non-JSON frames
        }
      };
      ws.onerror = () => setWsStatus("error");
      ws.onclose = () => setWsStatus("closed");
    };

    void ensureRuntimeAndConnect();

    return () => {
      cancelled = true;
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cli.providerId, cli.runtimeId]);

  const sendInput = (text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "input", data: text }));
  };

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
        await fetch(apiPath(`/runtimes/${runtimeId}`), { method: "DELETE" });
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
      await fetch(apiPath(`/runtimes/${runtimeId}/${paused ? "resume" : "pause"}`), {
        method: "POST",
      });
      setPaused((p) => !p);
    } catch (e) {
      console.error("pause failed", e);
    }
  };

  const handleFullscreen = () => {
    if (runtimeId == null) return;
    window.open(
      `/terminal/${runtimeId}?name=${encodeURIComponent(cli.name)}`,
      "_blank",
      "noopener,noreferrer,width=1100,height=720"
    );
  };

  const handleApprove = async (approved: boolean) => {
    if (runtimeId == null) return;
    try {
      await fetch(apiPath(`/runtimes/${runtimeId}/approve`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, reason: approved ? "user approved" : "user denied" }),
      });
    } catch (e) {
      console.error("approve failed", e);
    }
  };

  const handleAskBob = () => {
    const ws = wsRef.current;
    const q = askPrompt.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN || !q) return;
    ws.send(JSON.stringify({ type: "ask", prompt: q, model }));
    termRef.current?.write(`\r\n\x1b[35m[bob] > ${q}\x1b[0m\r\n`);
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
    <div className="group relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-xl border border-zinc-200/70 bg-white/80 transition hover:border-zinc-300 dark:border-white/[0.07] dark:bg-zinc-950/70 dark:hover:border-white/[0.14]">
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
              listWidth="w-[180px] right-0"
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
            title="Ask BOB (IBM Granite)"
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
          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            <span className="text-zinc-500">assigned:</span>
            <span className="truncate text-indigo-700 dark:text-indigo-300">{cli.task}</span>
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
            {cli.id}.session · powershell
          </span>
        </div>
        <div ref={termContainer} className="flex-1 px-2 py-1" />

        {askOpen && (
          <div className="border-t border-indigo-500/20 bg-indigo-500/[0.08] px-2 py-1.5">
            <div className="mb-1 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-indigo-300" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-indigo-300">
                Ask BOB · {model}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <input
                value={askPrompt}
                onChange={(e) => setAskPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAskBob();
                  }
                }}
                placeholder="ask Granite anything about this terminal…"
                className="flex-1 rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-indigo-100 outline-none placeholder:text-indigo-300/40"
              />
              <button
                onClick={handleAskBob}
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
