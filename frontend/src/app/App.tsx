import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { Loader } from "./components/Loader";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ChatView, INITIAL_MSGS, type Division, type Msg } from "./components/ChatView";
import { ProcessesView } from "./components/ProcessesView";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { ThemeProvider } from "./components/theme";
import { StoreProvider, useStore } from "./components/store";
import { Onboarding } from "./components/Onboarding";
import { Settings } from "./components/Settings";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalChatBar } from "./components/GlobalChatBar";
import { TerminalFullscreen } from "./components/TerminalFullscreen";
import { type CliRuntime } from "./components/TerminalCard";
import { type CtxFile } from "./components/ContextDropzone";
import { apiFetch, apiPath, healthCheckUrl, isAbortError, readSseJsonStream } from "./lib/api";
import { routingStrategyToBackend } from "./lib/orchestratorConfig";
import { parseApiError } from "./lib/apiErrors";
import {
  mapSharedFilesToCtx,
  type SharedContextResponse,
} from "./lib/workspaceContext";
import { trackAnalyticsEvent } from "./lib/analyticsClient";
import { notifyUser } from "./lib/notifications";
import {
  loadLastSessionId,
  notifySessionsChanged,
  saveLastSessionId,
  SESSIONS_CHANGED,
} from "./lib/sessionsBus";

type View = "chat" | "processes" | "settings";

/**
 * Visual presentation hints (glyph / color / accent) keyed by provider short id.
 * Everything else comes from the backend's `/api/providers?enabled_only=true`.
 */
const PROVIDER_LOOK: Record<string, { glyph: string; color: string; accent: string }> = {
  claude:   { glyph: "✻", color: "text-amber-500",   accent: "linear-gradient(to right,#f59e0b,#f97316)" },
  gemini:   { glyph: "✦", color: "text-indigo-500",  accent: "linear-gradient(to right,#6366f1,#a78bfa)" },
  codex:    { glyph: "◆", color: "text-emerald-500", accent: "linear-gradient(to right,#10b981,#14b8a6)" },
  deepseek: { glyph: "▲", color: "text-violet-500",  accent: "linear-gradient(to right,#a855f7,#e879f9)" },
  copilot:  { glyph: "❍", color: "text-zinc-500 dark:text-zinc-300", accent: "linear-gradient(to right,#a1a1aa,#71717a)" },
  kimi:     { glyph: "✺", color: "text-rose-500",    accent: "linear-gradient(to right,#f43f5e,#ec4899)" },
  cline:    { glyph: "◈", color: "text-cyan-500",    accent: "linear-gradient(to right,#06b6d4,#0ea5e9)" },
  grok:     { glyph: "𝕏", color: "text-red-500",     accent: "linear-gradient(to right,#ef4444,#f97316)" },
};

function providerLook(id: string) {
  return (
    PROVIDER_LOOK[id] ?? {
      glyph: "◉",
      color: "text-zinc-500",
      accent: "linear-gradient(to right,#71717a,#52525b)",
    }
  );
}

const ORCHESTRATOR_LLM_NAMES = new Set(["grok", "gemini-api", "deepseek-api"]);
const INFRA_LLM_NAMES = new Set(["openai", "anthropic", "google", "ollama", "bob"]);

function isCliAgentProvider(p: {
  is_enabled?: boolean | number;
  provider_type?: string;
  name?: string;
  config_schema?: { role?: string } | null;
}) {
  if (!p.is_enabled || p.provider_type !== "llm") return false;
  if (p.config_schema?.role === "orchestrator") return false;
  if (p.name && ORCHESTRATOR_LLM_NAMES.has(p.name)) return false;
  if (p.name && INFRA_LLM_NAMES.has(p.name)) return false;
  return true;
}

function applyDivisionsToAgents(clis: CliRuntime[], divisions: Division[]): CliRuntime[] {
  if (!divisions.length) return clis;

  const bySlug = new Map<string, Division[]>();
  for (const division of divisions) {
    const key = division.short.toLowerCase();
    const bucket = bySlug.get(key) ?? [];
    bucket.push(division);
    bySlug.set(key, bucket);
  }

  return clis.map((cli) => {
    const slug = cli.id.toLowerCase();
    let matched =
      bySlug.get(slug) ??
      divisions.filter(
        (d) =>
          d.short.toLowerCase() === slug ||
          d.agent.toLowerCase() === cli.name.toLowerCase() ||
          d.agent.toLowerCase().includes(slug),
      );

    if (!matched.length) {
      return cli;
    }

    const task = matched.map((d) => d.task).join(" · ");
    const allDone = matched.every((d) => d.status === "done");
    return {
      ...cli,
      task,
      state: allDone ? "idle" : "executing",
    };
  });
}

function Shell() {
  const { onboarded, backendHydrated, setOnboarded, orchestrator, providers: prefProviders, createSession, prefs } =
    useStore();
  const prefProvidersRef = useRef(prefProviders);
  useEffect(() => {
    prefProvidersRef.current = prefProviders;
  }, [prefProviders]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("chat");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [clis, setClis] = useState<CliRuntime[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>(INITIAL_MSGS);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [ctxFiles, setCtxFiles] = useState<CtxFile[]>([]);
  const [contextFilePaths, setContextFilePaths] = useState<string[]>([]);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatSessionRef = useRef<number | null>(null);
  const processesRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [providerDegraded, setProviderDegraded] = useState(false);
  const [highlightAgentId, setHighlightAgentId] = useState<string | null>(null);
  const enabledAgentIds = useMemo(
    () => new Set(clis.map((c) => c.id.toLowerCase())),
    [clis],
  );

  async function loadMessagesForSession(sid: number) {
    try {
      const msgRes = await apiFetch(`/sessions/${sid}/messages`, { timeoutMs: 8000 });
      if (!msgRes.ok) return;
      const msgData = await msgRes.json();
      const raw = msgData.messages ?? [];
      if (raw.length === 0) {
        setMsgs([]);
        return;
      }
      const mapped: Msg[] = raw.map((m: any) => {
        const createdDate = new Date(m.created_at);
        const ts = createdDate.toTimeString().slice(0, 5);
        let meta = m.metadata;
        if (meta && typeof meta === "string") {
          try {
            meta = JSON.parse(meta);
          } catch {
            meta = {};
          }
        }
        return {
          id: m.id.toString(),
          role: m.role === "user" ? "user" : "orchestrator",
          content: m.content,
          ts,
          thinking: meta?.thinking || [],
          divisions: meta?.divisions || [],
          artifacts: meta?.artifacts || [],
          model: meta?.model,
        };
      });
      setMsgs(mapped);
    } catch (err) {
      console.error("Failed to load session messages:", err);
    }
  }

  useEffect(() => {
    const initSession = async () => {
      try {
        const preferred = loadLastSessionId();
        if (preferred != null) {
          setActiveSessionId(preferred);
          await loadMessagesForSession(preferred);
          return;
        }
        const res = await apiFetch("/sessions?limit=1&sort_by=created_at&sort_order=desc");
        if (res.ok) {
          const data = await res.json();
          if (data.sessions && data.sessions.length > 0) {
            const sid = data.sessions[0].id;
            setActiveSessionId(sid);
            saveLastSessionId(sid);
            await loadMessagesForSession(sid);
          }
        }
      } catch (err) {
        console.error("Failed to load active session:", err);
      }
    };
    void initSession();
  }, []);

  const send = async (text: string) => {
    const v = text.trim();
    if (!v || chatSending) return;
    if (view !== "chat") setView("chat");
    const ts = new Date().toTimeString().slice(0, 5);
    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", content: v, ts };
    const sessionAtSend = activeSessionId;
    chatSessionRef.current = sessionAtSend;
    setMsgs((m) => [...m, userMsg]);
    setChatInput("");
    setChatSending(true);

    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      const res = await apiFetch("/orchestrator/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionAtSend,
          message: v,
          model_name: orchestrator.model,
          stream: true,
          context_files: contextFilePaths.length ? contextFilePaths : undefined,
        }),
        timeoutMs: 120_000,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (chatSessionRef.current !== sessionAtSend && sessionAtSend != null) return;

      const isStream =
        res.ok &&
        (res.headers.get("content-type")?.includes("text/event-stream") ?? false);

      if (res.ok && isStream) {
        const streamMsgId = `stream-${Date.now()}`;
        setMsgs((m) => [
          ...m,
          {
            id: streamMsgId,
            role: "orchestrator",
            ts: new Date().toTimeString().slice(0, 5),
            content: "",
            thinking: [],
            divisions: [],
            artifacts: [],
          },
        ]);

        let finalSessionId = sessionAtSend;
        let finalMetadata: Record<string, unknown> = {};
        let finalMessageId = streamMsgId;
        let tokensUsed = 0;
        let streamError: string | null = null;

        await readSseJsonStream(res, (event) => {
          if (event.type === "start" && typeof event.session_id === "number") {
            finalSessionId = event.session_id;
            if (!activeSessionId) {
              setActiveSessionId(event.session_id);
              chatSessionRef.current = event.session_id;
              saveLastSessionId(event.session_id);
            }
          } else if (event.type === "token" && typeof event.content === "string") {
            setMsgs((m) =>
              m.map((row) =>
                row.id === streamMsgId
                  ? { ...row, content: row.content + event.content }
                  : row,
              ),
            );
          } else if (event.type === "error" && typeof event.message === "string") {
            streamError = event.message;
          } else if (event.type === "done") {
            if (typeof event.session_id === "number") finalSessionId = event.session_id;
            if (typeof event.message_id === "number") finalMessageId = String(event.message_id);
            if (typeof event.tokens_used === "number") tokensUsed = event.tokens_used;
            if (event.metadata && typeof event.metadata === "object") {
              finalMetadata = event.metadata as Record<string, unknown>;
            }
          }
        });

        if (streamError) {
          toast.error(`Stream error: ${streamError}`);
          setMsgs((m) =>
            m.map((row) =>
              row.id === streamMsgId
                ? {
                    ...row,
                    id: `err-${Date.now()}`,
                    content: `[Error] ${streamError}`,
                  }
                : row,
            ),
          );
        } else {
          notifySessionsChanged();
          const meta = finalMetadata as {
            thinking?: string[];
            divisions?: Division[];
            artifacts?: Msg["artifacts"];
            model?: string;
            plan_quality?: string;
            plan_quality_reason?: string;
          };
          const divisions = (meta.divisions || []) as Division[];
          setMsgs((m) =>
            m.map((row) =>
              row.id === streamMsgId
                ? {
                    ...row,
                    id: finalMessageId,
                    thinking: meta.thinking || [],
                    divisions,
                    artifacts: meta.artifacts || [],
                    model: meta.model,
                    plan_quality: meta.plan_quality,
                    plan_quality_reason: meta.plan_quality_reason,
                  }
                : row,
            ),
          );
          if (divisions.length > 0) {
            setClis((prev) => applyDivisionsToAgents(prev, divisions));
            setView("processes");
            requestAnimationFrame(() => {
              processesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }
          void trackAnalyticsEvent("message_received", {
            sessionId: finalSessionId,
            tokensUsed,
          });
          if (divisions.length > 0) {
            notifyUser("Orchestrator", "Task plan ready — agents dispatched.", prefs);
          }
        }
      } else if (res.ok) {
        const data = await res.json();
        if (!activeSessionId) {
          setActiveSessionId(data.session_id);
          chatSessionRef.current = data.session_id;
          saveLastSessionId(data.session_id);
        }
        notifySessionsChanged();
        const reply: Msg = {
          id: data.message_id.toString(),
          role: "orchestrator",
          ts: new Date().toTimeString().slice(0, 5),
          content: data.content,
          thinking: data.metadata?.thinking || [],
          divisions: data.metadata?.divisions || [],
          artifacts: data.metadata?.artifacts || [],
          model: data.metadata?.model,
          plan_quality: data.metadata?.plan_quality,
          plan_quality_reason: data.metadata?.plan_quality_reason,
        };
        const divisions = (data.metadata?.divisions || []) as Division[];
        if (divisions.length > 0) {
          setClis((prev) => applyDivisionsToAgents(prev, divisions));
          setView("processes");
          requestAnimationFrame(() => {
            processesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
        setMsgs((m) => [...m, reply]);
        void trackAnalyticsEvent("message_received", {
          sessionId: data.session_id,
          tokensUsed: data.tokens_used,
        });
        if (divisions.length > 0) {
          notifyUser("Orchestrator", "Task plan ready — agents dispatched.", prefs);
        }
      } else {
        const detail = await parseApiError(res);
        toast.error(`Orchestrator error: ${detail}`);
        const errReply: Msg = {
          id: `err-${Date.now()}`,
          role: "orchestrator",
          ts: new Date().toTimeString().slice(0, 5),
          content: `Orchestrator error: ${detail}`,
        };
        setMsgs((m) => [...m, errReply]);
        setChatInput(v);
        void trackAnalyticsEvent("error_occurred", {
          sessionId: sessionAtSend,
          metadata: { detail },
        });
      }
    } catch (err) {
      if (isAbortError(err)) {
        setMsgs((m) => m.filter((row) => !row.id.startsWith("stream-")));
        return;
      }
      console.error("Failed to send message:", err);
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      const errMsg = timedOut
        ? "Backend timed out. Press Ctrl+C in the terminal running `python run.py`, then start it again."
        : "Network error: Failed to reach the backend. Is `python run.py` running?";
      
      toast.error(errMsg);
      setMsgs((m) => {
        const hasStream = m.some((row) => row.id.startsWith("stream-"));
        if (hasStream) {
          return m.map((row) =>
            row.id.startsWith("stream-")
              ? {
                  ...row,
                  id: `err-${Date.now()}`,
                  content: `[Error] ${errMsg}`,
                }
              : row
          );
        } else {
          return [
            ...m,
            {
              id: `err-${Date.now()}`,
              role: "orchestrator",
              ts: new Date().toTimeString().slice(0, 5),
              content: errMsg,
            },
          ];
        }
      });
      setChatInput(v);
    } finally {
      setChatSending(false);
    }
  };

  const handleReroute = async (msg: Msg) => {
    if (!msg.divisions?.length) return;
    const strategy = routingStrategyToBackend(orchestrator.routingStrategy);
    for (const div of msg.divisions) {
      try {
        await apiFetch("/orchestrator/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task: div.task,
            session_id: activeSessionId,
            routing_strategy: strategy,
          }),
        });
        void trackAnalyticsEvent("command_executed", {
          sessionId: activeSessionId,
          metadata: { division: div.short, strategy },
        });
      } catch (err) {
        console.warn("Re-route dispatch failed:", err);
      }
    }
    setClis((prev) => applyDivisionsToAgents(prev, msg.divisions!));
    setView("processes");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setView("settings");
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void (async () => {
          const sid = await createSession();
          if (sid == null) return;
          setActiveSessionId(sid);
          saveLastSessionId(sid);
          setMsgs([]);
          setChatInput("");
          setView("chat");
          notifySessionsChanged();
        })();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setView((v) => (v === "processes" ? "chat" : "processes"));
      } else if (mod && e.key === "/") {
        e.preventDefault();
        chatInputRef.current?.focus();
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createSession]);

  useEffect(() => {
    const onDivision = (e: Event) => {
      const detail = (e as CustomEvent).detail as { short?: string; status?: string };
      if (!detail?.short) return;
      const slug = detail.short.toLowerCase();
      setMsgs((prev) =>
        prev.map((m) =>
          m.divisions?.length
            ? {
                ...m,
                divisions: m.divisions.map((d) =>
                  d.short.toLowerCase() === slug ||
                  slug.includes(d.short.toLowerCase()) ||
                  d.short.toLowerCase().includes(slug)
                    ? { ...d, status: (detail.status as Division["status"]) ?? "done" }
                    : d,
                ),
              }
            : m,
        ),
      );
      setClis((prev) =>
        prev.map((c) =>
          c.id.toLowerCase() === slug ? { ...c, state: "idle", task: undefined } : c,
        ),
      );
      if (detail.status === "done") {
        notifyUser("Agent finished", `${detail.short} completed its task.`, prefs);
      }
    };
    window.addEventListener("orch:division-status", onDivision);
    return () => window.removeEventListener("orch:division-status", onDivision);
  }, [prefs]);

  useEffect(() => {
    if (!backendHydrated) return;
    let cancelled = false;
    const boot = async () => {
      try {
        const res = await apiFetch(healthCheckUrl(), { cache: "no-store" });
        if (!res.ok) throw new Error("health check failed");
      } catch {
        /* still dismiss loader after hydration */
      }
      if (!cancelled) setLoading(false);
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [backendHydrated]);

  // Load the providers the user enabled during onboarding from the backend,
  // then build CliRuntime[] for the Parallel Terminals page.
  useEffect(() => {
    if (!onboarded) return;
    let cancelled = false;
    const load = async () => {
      try {
        const provRes = await apiFetch("/providers?enabled_only=true");
        const activeRes = await apiFetch("/runtimes/live").catch((err) => {
          console.warn("Failed to load live runtimes:", err);
          return null;
        });
        const usageRes = await apiFetch("/analytics/usage?days=1").catch((err) => {
          console.warn("Failed to load usage analytics:", err);
          return null;
        });
        if (cancelled) return;
        if (!provRes.ok) {
          setProviderDegraded(true);
          return;
        }
        setProviderDegraded(false);
        const provJson = provRes.ok ? await provRes.json() : { providers: [] };
        const activeJson = activeRes?.ok ? await activeRes.json() : { runtimes: [] };
        const usageJson = usageRes && usageRes.ok ? await usageRes.json() : null;

        const activeByProvider = new Map<number, any>();
        for (const r of activeJson.runtimes ?? []) {
          if (r.provider_id != null) activeByProvider.set(r.provider_id, r);
        }
        const costByProvider = new Map<string, number>();
        if (usageJson?.providers) {
          for (const p of provJson.providers ?? []) {
            const info =
              usageJson.providers[p.name] ??
              usageJson.providers[p.display_name];
            if (info) {
              costByProvider.set(p.name, Number(info?.cost ?? 0));
            }
          }
          for (const [name, info] of Object.entries<any>(usageJson.providers)) {
            if (!costByProvider.has(name)) {
              costByProvider.set(name, Number(info?.cost ?? 0));
            }
          }
        }

        const next: CliRuntime[] = (provJson.providers ?? [])
          .filter((p: any) => isCliAgentProvider(p))
          .map((p: any) => {
            const look = providerLook(p.name);
            const liveRuntime = activeByProvider.get(p.id);
            const cap =
              prefProvidersRef.current.find((pr) => pr.id === p.name)?.dailyCap ?? 20;
            return {
              id: p.name,
              providerId: p.id,
              runtimeId: liveRuntime?.runtime_id,
              wsUrl: liveRuntime?.ws_url,
              name: p.display_name,
              glyph: look.glyph,
              color: look.color,
              accent: look.accent,
              model: p.default_model ?? "",
              models: p.default_model ? [p.default_model] : [],
              authMethod: "api_key" as const,
              state: liveRuntime ? "executing" : "idle",
              used: costByProvider.get(p.name) ?? costByProvider.get(p.display_name) ?? 0,
              cap,
            };
          });
        setClis((prev) =>
          next.map((cli) => {
            const existing = prev.find((c) => c.id === cli.id);
            if (!existing?.task) return cli;
            return {
              ...cli,
              task: existing.task,
              state: cli.runtimeId || existing.state === "executing" ? "executing" : cli.state,
            };
          })
        );
      } catch (err) {
        console.error("Failed to load enabled providers:", err);
        if (!cancelled) setProviderDegraded(true);
      }
    };
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [onboarded]);

  const loadSharedContext = async () => {
    try {
      const res = await apiFetch("/workspace/shared", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SharedContextResponse;
      const agentCount = Math.max(1, clis.length);
      setCtxFiles(mapSharedFilesToCtx(data.files ?? [], agentCount));
    } catch (err) {
      console.error("Failed to load workspace shared context:", err);
    }
  };

  useEffect(() => {
    if (!onboarded) return;
    void loadSharedContext();
  }, [onboarded, clis.length]);

  const activeAgents = clis.filter((c) => c.runtimeId != null).length;

  if (backendHydrated && !loading && !onboarded) {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-[#fafafa] font-sans text-zinc-900 antialiased dark:bg-[#070709] dark:text-zinc-100">
        <Onboarding onDone={() => setOnboarded(true)} />
      </div>
    );
  }

  const showChatBar = true;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#fafafa] font-sans text-zinc-900 antialiased dark:bg-[#070709] dark:text-zinc-100">
      <Loader visible={loading || !backendHydrated} />

      <div
        className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-[0.4]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 0%, rgba(99,102,241,0.10), transparent 40%), radial-gradient(circle at 85% 100%, rgba(168,85,247,0.08), transparent 45%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px,transparent 1px),linear-gradient(90deg,currentColor 1px,transparent 1px)",
          backgroundSize: "48px 48px",
          color: "currentColor",
        }}
      />

      <div className="relative z-10 flex h-full">
        <Sidebar
          view={view}
          onView={(v) => {
            setView(v);
            setSidebarOpen(false);
          }}
          onOpenSettings={() => {
            setView("settings");
            setSidebarOpen(false);
          }}
          mobileOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
          onSelectSession={(sid) => {
            setActiveSessionId(sid);
            saveLastSessionId(sid);
            setView("chat");
            setChatInput("");
            void loadMessagesForSession(sid);
          }}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <TopBar
            view={view}
            onView={setView}
            activeAgents={activeAgents}
            onOpenPalette={() => setPaletteOpen(true)}
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
          />

          {providerDegraded && (
            <div className="border-b border-amber-300/40 bg-amber-50 px-4 py-1.5 text-center font-mono text-[10px] text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
              Provider sync degraded — showing last-known agent cards. Retrying in background…
            </div>
          )}

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {view === "chat" && (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0"
                >
                  <ChatView
                    msgs={msgs}
                    onSuggest={(t) => send(t)}
                    onOpenProcesses={(divisions) => {
                      const first = divisions?.[0]?.short;
                      if (first) setHighlightAgentId(first.toLowerCase());
                      setView("processes");
                      requestAnimationFrame(() => {
                        processesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      });
                    }}
                    onReroute={handleReroute}
                    enabledAgentIds={enabledAgentIds}
                  />
                </motion.div>
              )}
              {view === "processes" && (
                <motion.div
                  key="processes"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0"
                >
                  <ProcessesView
                    ref={processesRef}
                    clis={clis}
                    parallelism={orchestrator.parallelism}
                    highlightAgentId={highlightAgentId}
                    files={ctxFiles}
                    setFiles={setCtxFiles}
                    onResyncShared={() => void loadSharedContext()}
                    activeSessionId={activeSessionId}
                    onRuntime={(pid, rid) =>
                      setClis((prev) =>
                        prev.map((c) =>
                          c.providerId === pid
                            ? { ...c, runtimeId: rid, state: rid != null ? "executing" : "idle" }
                            : c
                        )
                      )
                    }
                  />
                </motion.div>
              )}
              {view === "settings" && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0"
                >
                  <Settings onClose={() => setView("chat")} clis={clis} />
                </motion.div>
              )}
            </AnimatePresence>

            {showChatBar && (
              <GlobalChatBar
                value={chatInput}
                onChange={setChatInput}
                onSubmit={() => send(chatInput)}
                onVoice={(t) => send(t)}
                onPartial={(t) => setChatInput(t)}
                sessionId={activeSessionId}
                disabled={chatSending}
                onAttached={(paths) =>
                  setContextFilePaths((prev) => [...new Set([...prev, ...paths])])
                }
              />
            )}
          </div>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onView={setView}
        onNewChat={async () => {
          const sid = await createSession();
          if (sid == null) return;
          setActiveSessionId(sid);
          saveLastSessionId(sid);
          setMsgs([]);
          setChatInput("");
          setView("chat");
          notifySessionsChanged();
        }}
      />
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error) {
    console.error("App crashed:", err);
  }
  render() {
    if (this.state.err) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-[#fafafa] p-8 text-zinc-800 dark:bg-[#070709] dark:text-zinc-100">
          <div className="max-w-lg rounded-2xl border border-rose-300/40 bg-white p-6 shadow-lg dark:border-rose-400/20 dark:bg-zinc-950">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-rose-500">
              orchestrator · render error
            </div>
            <h1 className="mt-2 text-[18px] tracking-tight">Something crashed during render.</h1>
            <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-mono text-[11px] text-rose-600 dark:bg-black/40 dark:text-rose-300">
              {String(this.state.err?.stack || this.state.err)}
            </pre>
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to clear your local state and reload the application? All unsaved settings and history will be lost.")) {
                  try {
                    Object.keys(localStorage)
                      .filter((k) => k.startsWith("orch."))
                      .forEach((k) => localStorage.removeItem(k));
                  } catch {}
                  location.reload();
                }
              }}
              className="mt-4 rounded-md bg-zinc-900 px-3 py-1.5 text-[12px] text-white dark:bg-white dark:text-zinc-900"
            >
              Reset state & reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <StoreProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/terminal/:id" element={<TerminalFullscreen />} />
              <Route path="/*" element={<Shell />} />
            </Routes>
          </BrowserRouter>
          <Toaster richColors position="top-right" />
        </StoreProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
