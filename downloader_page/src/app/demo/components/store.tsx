import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type Status = "online" | "offline" | "limited";
export type AuthMethod = "api_key" | "oauth" | "ssh" | "bearer" | "account";

export type Provider = {
  id: string;
  name: string;
  glyph: string;
  color: string;
  description: string;
  status: Status;
  enabled: boolean;
  configured: boolean;
  authMethod: AuthMethod;
  authMethods: AuthMethod[];
  model: string;
  models: string[];
  endpoint?: string;
  dailyCap: number;
  /** Email associated with an `account` or `oauth` login (e.g. ChatGPT plan email). */
  accountEmail?: string;
  /** Provider name shown when collecting an account email ("ChatGPT", "Google", "GitHub"...). */
  accountProvider?: string;
  /** Plan label resolved from the account email (e.g. "ChatGPT Plus"). */
  accountPlan?: string;
};

/**
 * Auth methods reflect real-world CLI authentication:
 * - Claude Code: account (Claude Pro/Max console login) OR api_key (Anthropic console).
 * - Gemini CLI: account (Google login) OR api_key (AI Studio GEMINI_API_KEY).
 * - Codex CLI: account ("Sign in with ChatGPT") OR api_key (OpenAI platform).
 * - Copilot CLI: account (GitHub OAuth via `gh auth`). No API key path.
 * - DeepSeek: api_key only (platform.deepseek.com).
 * - Kimi Code: api_key only (Moonshot platform).
 * - Cline: api_key (BYOK — Anthropic/OpenAI/etc. keys passed through) or bearer.
 */
export const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: "claude",
    name: "Claude Code",
    glyph: "✻",
    color: "text-amber-500",
    description: "Anthropic's flagship coding agent — best for complex logic, refactors, long context.",
    status: "online",
    enabled: true,
    configured: false,
    authMethod: "account",
    authMethods: ["account", "api_key"],
    accountProvider: "Anthropic",
    model: "claude-sonnet-4-6",
    models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"],
    dailyCap: 20,
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    glyph: "✦",
    color: "text-indigo-500",
    description: "Google's Gemini — strong on multimodal, UI generation, large context windows.",
    status: "online",
    enabled: true,
    configured: false,
    authMethod: "account",
    authMethods: ["account", "api_key"],
    accountProvider: "Google",
    model: "gemini-3-pro",
    models: ["gemini-3-pro", "gemini-3-flash", "gemini-2.5-pro"],
    dailyCap: 15,
  },
  {
    id: "codex",
    name: "Codex CLI",
    glyph: "◆",
    color: "text-emerald-500",
    description: "OpenAI Codex — excels at backend, schemas, migrations, and CLI scripting.",
    status: "online",
    enabled: true,
    configured: false,
    authMethod: "account",
    authMethods: ["account", "api_key"],
    accountProvider: "ChatGPT",
    model: "gpt-codex-mini",
    models: ["gpt-codex", "gpt-codex-mini", "o4-mini"],
    dailyCap: 10,
  },
  {
    id: "copilot",
    name: "Copilot CLI",
    glyph: "❍",
    color: "text-zinc-500 dark:text-zinc-300",
    description: "GitHub Copilot — fast inline completions and tests, tight GH integration.",
    status: "online",
    enabled: true,
    configured: false,
    authMethod: "account",
    authMethods: ["account"],
    accountProvider: "GitHub",
    model: "copilot-chat",
    models: ["copilot-chat", "copilot-claude", "copilot-gpt5"],
    dailyCap: 12,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    glyph: "▲",
    color: "text-violet-500",
    description: "DeepSeek-Coder — strong on perf profiling and lower-level optimisation.",
    status: "limited",
    enabled: true,
    configured: false,
    authMethod: "api_key",
    authMethods: ["api_key"],
    model: "deepseek-coder-v3",
    models: ["deepseek-coder-v3", "deepseek-chat-v3", "deepseek-r1"],
    dailyCap: 10,
  },
  {
    id: "kimi",
    name: "Kimi Code",
    glyph: "✺",
    color: "text-rose-500",
    description: "Moonshot's Kimi — long-context translations and documentation work.",
    status: "online",
    enabled: false,
    configured: false,
    authMethod: "api_key",
    authMethods: ["api_key"],
    model: "kimi-k2",
    models: ["kimi-k2", "kimi-k1.5"],
    dailyCap: 8,
  },
  {
    id: "cline",
    name: "Cline CLI",
    glyph: "◈",
    color: "text-cyan-500",
    description: "Cline — autonomous repo watcher with bring-your-own-key for any provider.",
    status: "online",
    enabled: false,
    configured: false,
    authMethod: "api_key",
    authMethods: ["api_key", "bearer"],
    model: "cline-claude",
    models: ["cline-default", "cline-claude", "cline-gpt5"],
    dailyCap: 10,
  },
];

export type Workspace = { path: string; name: string };

export type OrchestratorCfg = {
  model: string;
  routingStrategy: "specialty" | "round_robin" | "cheapest" | "fastest";
  parallelism: number;
  autoFailover: boolean;
  globalDailyCap: number;
};

export type SessionEntry = {
  id: string;
  startedAt: number;
  endedAt?: number;
  prompt: string;
  summary: string;
  agents: string[];
  artifacts: string[];
  status: "active" | "completed" | "failed";
  tokens: number;
  spend: number;
};

type Prefs = {
  sound: boolean;
  desktopNotifs: boolean;
  autoSync: boolean;
  fontSize: "sm" | "md" | "lg";
};

type AppState = {
  onboarded: boolean;
  workspace: Workspace | null;
  providers: Provider[];
  orchestrator: OrchestratorCfg;
  prefs: Prefs;
  sessions: SessionEntry[];
};

type Ctx = AppState & {
  setOnboarded: (v: boolean) => void;
  setWorkspace: (w: Workspace | null) => void;
  setProviders: React.Dispatch<React.SetStateAction<Provider[]>>;
  setOrchestrator: React.Dispatch<React.SetStateAction<OrchestratorCfg>>;
  setPrefs: React.Dispatch<React.SetStateAction<Prefs>>;
  pushSession: (s: SessionEntry) => void;
  clearSessions: () => void;
  reset: () => void;
};

const StoreCtx = createContext<Ctx | null>(null);

const KEY = "orch.state.v3";

const DEFAULT_STATE: AppState = {
  onboarded: false,
  workspace: null,
  providers: DEFAULT_PROVIDERS,
  orchestrator: {
    model: "grok-3",
    routingStrategy: "specialty",
    parallelism: 4,
    autoFailover: true,
    globalDailyCap: 80,
  },
  prefs: { sound: true, desktopNotifs: false, autoSync: true, fontSize: "md" },
  sessions: [
    {
      id: "demo-1",
      startedAt: Date.now() - 1000 * 60 * 60 * 26,
      endedAt: Date.now() - 1000 * 60 * 60 * 25,
      prompt: "Refactor the auth middleware and add tests, generate the new login screen.",
      summary: "Decomposed into 4 subtasks across 4 agents; all merged via divisions.md.",
      agents: ["claude", "gemini", "codex", "copilot"],
      artifacts: ["divisions.md", "task-graph.md", "Login.tsx", "auth.middleware.test.ts"],
      status: "completed",
      tokens: 124_500,
      spend: 1.84,
    },
    {
      id: "demo-2",
      startedAt: Date.now() - 1000 * 60 * 90,
      endedAt: Date.now() - 1000 * 60 * 12,
      prompt: "Migrate prisma schema to drizzle in parallel.",
      summary: "Schema diffed; 4 tables added, 2 renamed. Awaiting approval on destructive drop.",
      agents: ["codex", "claude"],
      artifacts: ["schema.drizzle.ts", "migration.sql"],
      status: "completed",
      tokens: 58_200,
      spend: 0.74,
    },
  ],
};

function loadInitial(): AppState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_STATE;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      providers:
        Array.isArray(parsed.providers) && parsed.providers.length
          ? mergeProviders(parsed.providers)
          : DEFAULT_PROVIDERS,
      orchestrator: { ...DEFAULT_STATE.orchestrator, ...(parsed.orchestrator || {}) },
      prefs: { ...DEFAULT_STATE.prefs, ...(parsed.prefs || {}) },
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : DEFAULT_STATE.sessions,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

/**
 * Merge persisted providers with defaults so newly added fields (like updated
 * authMethods or models) take effect after an upgrade without nuking user-set
 * credentials.
 */
function mergeProviders(stored: any[]): Provider[] {
  return DEFAULT_PROVIDERS.map((def) => {
    const s = stored.find((x) => x?.id === def.id);
    if (!s) return def;
    const authMethod: AuthMethod = def.authMethods.includes(s.authMethod)
      ? s.authMethod
      : def.authMethod;
    return {
      ...def,
      ...s,
      authMethod,
      authMethods: def.authMethods,
      models: def.models,
    } as Provider;
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadInitial);

  /* Debounced persistence — avoids thrashing localStorage on rapid updates. */
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {}
    }, 250);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [state]);

  return (
    <StoreCtx.Provider
      value={{
        ...state,
        setOnboarded: (v) => setState((s) => ({ ...s, onboarded: v })),
        setWorkspace: (w) => setState((s) => ({ ...s, workspace: w })),
        setProviders: (u) =>
          setState((s) => ({
            ...s,
            providers: typeof u === "function" ? (u as any)(s.providers) : u,
          })),
        setOrchestrator: (u) =>
          setState((s) => ({
            ...s,
            orchestrator: typeof u === "function" ? (u as any)(s.orchestrator) : u,
          })),
        setPrefs: (u) =>
          setState((s) => ({
            ...s,
            prefs: typeof u === "function" ? (u as any)(s.prefs) : u,
          })),
        pushSession: (entry) =>
          setState((s) => ({ ...s, sessions: [entry, ...s.sessions].slice(0, 100) })),
        clearSessions: () => setState((s) => ({ ...s, sessions: [] })),
        reset: () => {
          try {
            localStorage.removeItem(KEY);
          } catch {}
          setState({ ...DEFAULT_STATE, sessions: [] });
        },
      }}
    >
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreCtx missing");
  return c;
}
