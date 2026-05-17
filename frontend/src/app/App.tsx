import { Component, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader } from "./components/Loader";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ChatView, INITIAL_MSGS, type Division, type Msg } from "./components/ChatView";
import { ProcessesView } from "./components/ProcessesView";
import { ThemeProvider } from "./components/theme";
import { StoreProvider, useStore } from "./components/store";
import { Onboarding } from "./components/Onboarding";
import { Settings } from "./components/Settings";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalChatBar } from "./components/GlobalChatBar";
import { type CliRuntime } from "./components/TerminalCard";
import { type CtxFile } from "./components/ContextDropzone";
import { apiFetch, apiPath, isAbortError } from "./lib/api";
import { parseApiError } from "./lib/apiErrors";
import {
  mapSharedFilesToCtx,
  type SharedContextResponse,
} from "./lib/workspaceContext";

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
  bob:      { glyph: "∎", color: "text-blue-500",    accent: "linear-gradient(to right,#3b82f6,#6366f1)" },
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

function applyDivisionsToAgents(clis: CliRuntime[], divisions: Division[]): CliRuntime[] {
  if (!divisions.length) return clis;
  return clis.map((cli) => {
    const division = divisions.find(
      (d) =>
        d.short === cli.id ||
        d.agent.toLowerCase() === cli.name.toLowerCase()
    );
    if (!division) return { ...cli, task: undefined, state: cli.runtimeId ? "executing" : "idle" };
    return {
      ...cli,
      task: division.task,
      state: division.status === "done" ? "idle" : "executing",
    };
  });
}

function Shell() {
  const { onboarded, setOnboarded, providers: prefProviders } = useStore();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("chat");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [clis, setClis] = useState<CliRuntime[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>(INITIAL_MSGS);
  const [chatInput, setChatInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [ctxFiles, setCtxFiles] = useState<CtxFile[]>([]);

  async function loadMessagesForSession(sid: number) {
    try {
      const msgRes = await fetch(apiPath(`/sessions/${sid}/messages`));
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
        const res = await fetch(apiPath("/sessions?limit=1"));
        if (res.ok) {
          const data = await res.json();
          if (data.sessions && data.sessions.length > 0) {
            const sid = data.sessions[0].id;
            setActiveSessionId(sid);
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
    if (!v) return;
    if (view !== "chat") setView("chat");
    const ts = new Date().toTimeString().slice(0, 5);
    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", content: v, ts };
    setMsgs((m) => [...m, userMsg]);
    setChatInput("");
    try {
      const res = await apiFetch("/orchestrator/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: activeSessionId,
          message: v
        }),
        timeoutMs: 60_000,
      });
      if (res.ok) {
        const data = await res.json();
        if (!activeSessionId) {
          setActiveSessionId(data.session_id);
        }
        const reply: Msg = {
          id: data.message_id.toString(),
          role: "orchestrator",
          ts: new Date().toTimeString().slice(0, 5),
          content: data.content,
          thinking: data.metadata?.thinking || [],
          divisions: data.metadata?.divisions || [],
          artifacts: data.metadata?.artifacts || [],
          model: data.metadata?.model,
        };
        const divisions = (data.metadata?.divisions || []) as Division[];
        if (divisions.length > 0) {
          setClis((prev) => applyDivisionsToAgents(prev, divisions));
          setView("processes");
        }
        setMsgs((m) => [...m, reply]);
      } else {
        const detail = await parseApiError(res);
        const errReply: Msg = {
          id: `err-${Date.now()}`,
          role: "orchestrator",
          ts: new Date().toTimeString().slice(0, 5),
          content: `Orchestrator error: ${detail}`,
        };
        setMsgs((m) => [...m, errReply]);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      const timedOut = isAbortError(err);
      const errReply: Msg = {
        id: `err-${Date.now()}`,
        role: "orchestrator",
        ts: new Date().toTimeString().slice(0, 5),
        content: timedOut
          ? "Backend timed out. Press Ctrl+C in the terminal running `python run.py`, then start it again."
          : "Network error: Failed to reach the backend. Is `python run.py` running?",
      };
      setMsgs((m) => [...m, errReply]);
    }
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
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setView((v) => (v === "processes" ? "chat" : "processes"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1300);
    return () => clearTimeout(t);
  }, []);

  // Load the providers the user enabled during onboarding from the backend,
  // then build CliRuntime[] for the Parallel Terminals page.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const provRes = await fetch(apiPath("/providers?enabled_only=true"));
        const activeRes = await apiFetch("/runtimes/live").catch((err) => {
          console.warn("Failed to load live runtimes:", err);
          return null;
        });
        const usageRes = await fetch(apiPath("/analytics/usage?days=1")).catch((err) => {
          console.warn("Failed to load usage analytics:", err);
          return null;
        });
        if (cancelled) return;
        const provJson = provRes.ok ? await provRes.json() : { providers: [] };
        const activeJson = activeRes?.ok ? await activeRes.json() : { runtimes: [] };
        const usageJson = usageRes && usageRes.ok ? await usageRes.json() : null;

        const activeByProvider = new Map<number, any>();
        for (const r of activeJson.runtimes ?? []) {
          if (r.provider_id != null) activeByProvider.set(r.provider_id, r);
        }
        const costByProvider = new Map<string, number>();
        if (usageJson?.providers) {
          for (const [name, info] of Object.entries<any>(usageJson.providers)) {
            costByProvider.set(name, Number(info?.cost ?? 0));
          }
        }

        const next: CliRuntime[] = (provJson.providers ?? [])
          .filter((p: any) => p.is_enabled && p.provider_type === "llm")
          .map((p: any) => {
            const look = providerLook(p.name);
            const liveRuntime = activeByProvider.get(p.id);
            const cap =
              prefProviders.find((pr) => pr.id === p.name)?.dailyCap ?? 20;
            return {
              id: p.name,
              providerId: p.id,
              runtimeId: liveRuntime?.runtime_id,
              name: p.display_name,
              glyph: look.glyph,
              color: look.color,
              accent: look.accent,
              model: p.default_model ?? "",
              models: p.default_model ? [p.default_model] : [],
              authMethod: "api_key" as const,
              state: liveRuntime ? "executing" : "idle",
              used: costByProvider.get(p.display_name) ?? 0,
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
        setClis([]);
      }
    };
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [onboarded, prefProviders]);

  const loadSharedContext = async () => {
    try {
      const res = await fetch(apiPath("/workspace/shared"), { cache: "no-store" });
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

  if (!loading && !onboarded) {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-[#fafafa] font-sans text-zinc-900 antialiased dark:bg-[#070709] dark:text-zinc-100">
        <Onboarding onDone={() => setOnboarded(true)} />
      </div>
    );
  }

  const showChatBar = true;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#fafafa] font-sans text-zinc-900 antialiased dark:bg-[#070709] dark:text-zinc-100">
      <Loader visible={loading} />

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
            setView("chat");
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
                    onOpenProcesses={() => setView("processes")}
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
                    clis={clis}
                    files={ctxFiles}
                    setFiles={setCtxFiles}
                    onResyncShared={() => void loadSharedContext()}
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
              />
            )}
          </div>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onView={setView}
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
                try {
                  Object.keys(localStorage)
                    .filter((k) => k.startsWith("orch."))
                    .forEach((k) => localStorage.removeItem(k));
                } catch {}
                location.reload();
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
          <Shell />
        </StoreProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
