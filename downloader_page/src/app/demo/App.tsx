import { Component, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader } from "./components/Loader";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ChatView, INITIAL_MSGS, type Msg } from "./components/ChatView";
import { ProcessesView } from "./components/ProcessesView";
import { ThemeProvider } from "./components/theme";
import { StoreProvider, useStore } from "./components/store";
import { Onboarding } from "./components/Onboarding";
import { Settings } from "./components/Settings";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalChatBar } from "./components/GlobalChatBar";
import { type CliRuntime } from "./components/TerminalCard";

type View = "chat" | "processes" | "settings";

const SEED: CliRuntime[] = [
  {
    id: "claude",
    name: "Claude Code",
    glyph: "✻",
    color: "text-amber-500",
    accent: "linear-gradient(to right,#f59e0b,#f97316)",
    model: "claude-sonnet-4-6",
    models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    authMethod: "account",
    state: "executing",
    used: 12.5,
    cap: 20,
    task: "Refactor src/middleware/auth.ts",
    log: [
      { kind: "sys", text: "session resumed from yaml · 3 turns" },
      { kind: "cmd", text: "refactor src/middleware/auth.ts" },
      { kind: "out", text: "analyzing 14 files, 1,820 LoC…" },
      { kind: "out", text: "extracting session token validator" },
      { kind: "ok", text: "wrote tests/auth.middleware.test.ts" },
      { kind: "out", text: "running typecheck…" },
    ],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    glyph: "✦",
    color: "text-indigo-500",
    accent: "linear-gradient(to right,#6366f1,#a78bfa)",
    model: "gemini-3-pro",
    models: ["gemini-3-pro", "gemini-3-flash", "gemini-2.5-pro"],
    authMethod: "account",
    state: "executing",
    used: 4.82,
    cap: 15,
    task: "Generate Login.tsx with design tokens",
    log: [
      { kind: "cmd", text: "generate components/Login.tsx --tokens" },
      { kind: "out", text: "scaffolding…" },
      { kind: "out", text: "applying theme tokens from skill.md" },
      { kind: "ok", text: "added 3 components, 0 warnings" },
    ],
  },
  {
    id: "codex",
    name: "Codex CLI",
    glyph: "◆",
    color: "text-emerald-500",
    accent: "linear-gradient(to right,#10b981,#14b8a6)",
    model: "gpt-codex-mini",
    models: ["gpt-codex", "gpt-codex-mini", "o4-mini"],
    authMethod: "account",
    state: "permission",
    used: 7.12,
    cap: 10,
    task: "Update session schema migration",
    log: [
      { kind: "cmd", text: "migrate schema → drizzle" },
      { kind: "out", text: "diff: 4 tables added, 2 renamed" },
      { kind: "warn", text: "destructive op detected" },
    ],
    pendingCmd: "drizzle-kit drop --table=users_old --confirm",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    glyph: "▲",
    color: "text-violet-500",
    accent: "linear-gradient(to right,#a855f7,#e879f9)",
    model: "deepseek-coder-v3",
    models: ["deepseek-coder-v3", "deepseek-chat-v3", "deepseek-r1"],
    authMethod: "api_key",
    state: "limited",
    used: 9.6,
    cap: 10,
    resetsIn: "04:12",
    task: "Profile build pipeline (paused)",
    log: [
      { kind: "cmd", text: "profile build pipeline" },
      { kind: "out", text: "captured 14k samples" },
      { kind: "err", text: "429 daily quota exhausted" },
      { kind: "sys", text: "failover → Claude Sonnet 4.6" },
    ],
  },
  {
    id: "copilot",
    name: "Copilot CLI",
    glyph: "❍",
    color: "text-zinc-500 dark:text-zinc-300",
    accent: "linear-gradient(to right,#a1a1aa,#71717a)",
    model: "copilot-chat",
    models: ["copilot-chat", "copilot-claude", "copilot-gpt5"],
    authMethod: "account",
    state: "idle",
    used: 1.2,
    cap: 12,
    log: [
      { kind: "sys", text: "ready · 0 jobs in queue" },
      { kind: "out", text: "context synced · 7 files" },
    ],
  },
  {
    id: "kimi",
    name: "Kimi Code",
    glyph: "✺",
    color: "text-rose-500",
    accent: "linear-gradient(to right,#f43f5e,#ec4899)",
    model: "kimi-k2",
    models: ["kimi-k2", "kimi-k1.5"],
    authMethod: "api_key",
    state: "executing",
    used: 2.4,
    cap: 8,
    task: "Translate docs/* → ja",
    log: [
      { kind: "cmd", text: "translate docs/* --to ja" },
      { kind: "out", text: "processing 24 markdown files" },
      { kind: "ok", text: "12/24 translated" },
    ],
  },
  {
    id: "cline",
    name: "Cline CLI",
    glyph: "◈",
    color: "text-cyan-500",
    accent: "linear-gradient(to right,#06b6d4,#0ea5e9)",
    model: "cline-claude",
    models: ["cline-default", "cline-claude", "cline-gpt5"],
    authMethod: "api_key",
    state: "idle",
    used: 0.6,
    cap: 10,
    log: [
      { kind: "sys", text: "watching repo for change events" },
      { kind: "out", text: "0 pending jobs" },
    ],
  },
];

function Shell() {
  const { onboarded, setOnboarded } = useStore();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("chat");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [clis, setClis] = useState(SEED);
  const [msgs, setMsgs] = useState<Msg[]>(INITIAL_MSGS);
  const [chatInput, setChatInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer

  const send = (text: string) => {
    const v = text.trim();
    if (!v) return;
    if (view !== "chat") setView("chat");
    const ts = new Date().toTimeString().slice(0, 5);
    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", content: v, ts };
    setMsgs((m) => [...m, userMsg]);
    setChatInput("");
    setTimeout(() => {
      const reply: Msg = {
        id: `o${Date.now()}`,
        role: "orchestrator",
        ts: new Date().toTimeString().slice(0, 5),
        content: "Parsed your request. Routing subtasks now and updating divisions.md so every agent stays aligned.",
        thinking: [
          "tokenize prompt · 412 tokens",
          "classify domains · ui+logic+qa detected",
          "match specialties · 3 agents selected",
          "verify quotas · 3/3 within budget",
          "write divisions.md → context bus",
        ],
        divisions: [
          { agent: "Claude Sonnet 4.6", short: "claude", color: "#f59e0b", task: "Implement core logic", status: "running" },
          { agent: "Gemini 3 Pro", short: "gemini", color: "#6366f1", task: "Build UI layer", status: "queued" },
          { agent: "Copilot CLI", short: "copilot", color: "#64748b", task: "Generate tests", status: "queued" },
        ],
        artifacts: [{ name: "divisions.md", kind: "md" }],
      };
      setMsgs((m) => [...m, reply]);
    }, 900);
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

  useEffect(() => {
    const id = setInterval(() => {
      setClis((prev) =>
        prev.map((c) => {
          if (c.state !== "executing") return c;
          const next = Math.min(c.cap, c.used + Math.random() * 0.08);
          return { ...c, used: next };
        })
      );
    }, 1200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const lines = [
        { kind: "out" as const, text: "streaming chunk… 1.2kb" },
        { kind: "out" as const, text: "tool: read_file(src/app/App.tsx)" },
        { kind: "ok" as const, text: "applied patch · 6 lines" },
        { kind: "out" as const, text: "linter: 0 errors, 1 warning" },
      ];
      setClis((prev) =>
        prev.map((c) => {
          if (c.state !== "executing") return c;
          const l = lines[Math.floor(Math.random() * lines.length)];
          return { ...c, log: [...c.log.slice(-9), l] };
        })
      );
    }, 1900);
    return () => clearInterval(id);
  }, []);

  const activeAgents = clis.filter((c) => c.state === "executing").length;

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
          onOpenSettings={() => {
            setView("settings");
            setSidebarOpen(false);
          }}
          onOpenProcesses={() => {
            setView("processes");
            setSidebarOpen(false);
          }}
          mobileOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
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
                  <ProcessesView clis={clis} />
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
            <div className="font-mono text-[13px] uppercase tracking-[0.22em] text-rose-500">
              orchestrator · render error
            </div>
            <h1 className="mt-2 text-[21px] tracking-tight">Something crashed during render.</h1>
            <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-mono text-[14px] text-rose-600 dark:bg-black/40 dark:text-rose-300">
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
              className="mt-4 rounded-md bg-zinc-900 px-3 py-1.5 text-[15px] text-white dark:bg-white dark:text-zinc-900"
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
