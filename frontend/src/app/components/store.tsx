import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { apiPath, apiFetch } from "../lib/api";
import {
  orchestratorFromApi,
  orchestratorToApiPayload,
  type OrchestratorConfigApi,
} from "../lib/orchestratorConfig";

export type Status = "online" | "offline" | "limited";
export type AuthMethod = "api_key" | "oauth" | "ssh" | "bearer" | "account";

export type Provider = {
  id: string;
  /** SQLite `providers.id` when synced from the backend */
  dbId?: number;
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
 * - Grok / DeepSeek / Gemini: api_key for orchestrator LLM routing.
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
    model: "claude-3-5-sonnet-latest",
    models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
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
    model: "gemini-1.5-flash",
    models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
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
    model: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "o1-mini"],
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
    model: "gpt-4o",
    models: ["gpt-4o", "claude-3.5-sonnet"],
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
    model: "deepseek-coder",
    models: ["deepseek-coder", "deepseek-chat"],
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
    model: "moonshot-v1-8k",
    models: ["moonshot-v1-8k", "moonshot-v1-32k"],
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
    model: "claude-3-5-sonnet-latest",
    models: ["claude-3-5-sonnet-latest", "gpt-4o", "gemini-1.5-pro"],
    dailyCap: 10,
  },
  {
    id: "grok",
    name: "Grok",
    glyph: "𝕏",
    color: "text-red-500",
    description: "xAI Grok — orchestrator LLM for planning, routing, and task decomposition.",
    status: "online",
    enabled: true,
    configured: false,
    authMethod: "api_key",
    authMethods: ["api_key"],
    model: "grok-2-1212",
    models: ["grok-2-1212", "grok-beta"],
    endpoint: "https://api.x.ai/v1",
    dailyCap: 20,
  },
  {
    id: "gemini-api",
    name: "Gemini API",
    glyph: "✦",
    color: "text-indigo-500",
    description: "Google Gemini orchestrator LLM — planning and routing via the Generative Language API.",
    status: "online",
    enabled: true,
    configured: false,
    authMethod: "api_key",
    authMethods: ["api_key"],
    model: "gemini-1.5-flash",
    models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    dailyCap: 20,
  },
  {
    id: "deepseek-api",
    name: "DeepSeek API",
    glyph: "▲",
    color: "text-violet-500",
    description: "DeepSeek orchestrator LLM — cost-efficient planning and task decomposition.",
    status: "online",
    enabled: true,
    configured: false,
    authMethod: "api_key",
    authMethods: ["api_key"],
    model: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    endpoint: "https://api.deepseek.com/v1",
    dailyCap: 15,
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
  status: "active" | "completed" | "paused" | "archived";
  tokens: number;
  spend: number;
};

type Prefs = {
  sound: boolean;
  desktopNotifs: boolean;
  autoSync: boolean;
  fontSize: "sm" | "md" | "lg";
  accentColor: string;
};

type AppState = {
  onboarded: boolean;
  workspace: Workspace | null;
  providers: Provider[];
  orchestrator: OrchestratorCfg;
  prefs: Prefs;
};

export type SyncState = "synced" | "saving" | "error";

type Ctx = AppState & {
  backendHydrated: boolean;
  syncState: SyncState;
  retrySync: () => void;
  setOnboarded: (v: boolean) => void;
  setWorkspace: (w: Workspace | null) => void;
  setProviders: React.Dispatch<React.SetStateAction<Provider[]>>;
  setOrchestrator: React.Dispatch<React.SetStateAction<OrchestratorCfg>>;
  setPrefs: React.Dispatch<React.SetStateAction<Prefs>>;
  clearSessions: () => Promise<boolean>;
  createSession: (title?: string) => Promise<number | null>;
  reset: () => Promise<void>;
};

const StoreCtx = createContext<Ctx | null>(null);

const KEY = "orch.state.v3";
export const ACCENT_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#a855f7"] as const;
const DEFAULT_ACCENT_COLOR = ACCENT_COLORS[0];

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function colorWithAlpha(color: string, alphaHex: string): string {
  return `${color}${alphaHex}`;
}

const DEFAULT_STATE: AppState = {
  onboarded: false,
  workspace: null,
  providers: DEFAULT_PROVIDERS,
  orchestrator: {
    model: "grok-2-1212",
    routingStrategy: "specialty",
    parallelism: 4,
    autoFailover: true,
    globalDailyCap: 80,
  },
  prefs: {
    sound: true,
    desktopNotifs: false,
    autoSync: true,
    fontSize: "md",
    accentColor: DEFAULT_ACCENT_COLOR,
  },
};

type SettingsApiResponse = {
  preferences?: Record<string, unknown>;
};

type CliRegistryEntry = {
  name?: string;
  slug?: string;
  description?: string;
  required?: boolean;
};

type CliRegistryApiResponse = {
  clis?: CliRegistryEntry[];
};

const PROVIDER_BY_CLI_SLUG: Record<string, string> = {
  "claude-code": "claude",
  "gemini-cli": "gemini",
  "codex-cli": "codex",
  "deepseek": "deepseek",
  "cline": "cline",
  "copilot-cli": "copilot",
  grok: "grok",
  "kimi-code": "kimi",
  kimi: "kimi",
};

const ROUTING_STRATEGIES: ReadonlyArray<OrchestratorCfg["routingStrategy"]> = [
  "specialty",
  "round_robin",
  "cheapest",
  "fastest",
];

const FONT_SIZES: ReadonlyArray<Prefs["fontSize"]> = ["sm", "md", "lg"];

function applyRemotePreferences(base: AppState, preferences: Record<string, unknown>): AppState {
  const nextProviders = base.providers.map((provider) => {
    const prefix = `cli.${provider.id}.`;
    const rawAuthMethod = preferences[`${prefix}authMethod`];
    const authMethod: AuthMethod =
      typeof rawAuthMethod === "string" && provider.authMethods.includes(rawAuthMethod as AuthMethod)
        ? (rawAuthMethod as AuthMethod)
        : provider.authMethod;
    const rawModel = preferences[`${prefix}model`];

    return {
      ...provider,
      enabled:
        typeof preferences[`${prefix}enabled`] === "boolean"
          ? (preferences[`${prefix}enabled`] as boolean)
          : provider.enabled,
      configured:
        typeof preferences[`${prefix}configured`] === "boolean"
          ? (preferences[`${prefix}configured`] as boolean)
          : provider.configured,
      authMethod,
      model:
        typeof rawModel === "string" && provider.models.includes(rawModel)
          ? rawModel
          : provider.model,
      endpoint:
        typeof preferences[`${prefix}endpoint`] === "string"
          ? (preferences[`${prefix}endpoint`] as string)
          : provider.endpoint,
      accountEmail:
        typeof preferences[`${prefix}accountEmail`] === "string"
          ? (preferences[`${prefix}accountEmail`] as string)
          : provider.accountEmail,
      accountProvider:
        typeof preferences[`${prefix}accountProvider`] === "string"
          ? (preferences[`${prefix}accountProvider`] as string)
          : provider.accountProvider,
      accountPlan:
        typeof preferences[`${prefix}accountPlan`] === "string"
          ? (preferences[`${prefix}accountPlan`] as string)
          : provider.accountPlan,
    };
  });

  const remoteRouting = preferences["ui.orchestrator.routingStrategy"];
  const remoteFontSize = preferences["ui.prefs.fontSize"];
  const remoteAccentColor = preferences["ui.prefs.accentColor"];
  const workspacePath = preferences["ui.workspace.path"];
  const workspaceName = preferences["ui.workspace.name"];

  return {
    ...base,
    onboarded:
      typeof preferences["ui.onboarded"] === "boolean"
        ? (preferences["ui.onboarded"] as boolean)
        : base.onboarded,
    workspace:
      typeof workspacePath === "string" && typeof workspaceName === "string"
        ? { path: workspacePath, name: workspaceName }
        : base.workspace,
    providers: nextProviders,
    orchestrator: {
      ...base.orchestrator,
      model:
        typeof preferences["ui.orchestrator.model"] === "string"
          ? (preferences["ui.orchestrator.model"] as string)
          : base.orchestrator.model,
      routingStrategy:
        typeof remoteRouting === "string" &&
        ROUTING_STRATEGIES.includes(remoteRouting as OrchestratorCfg["routingStrategy"])
          ? (remoteRouting as OrchestratorCfg["routingStrategy"])
          : base.orchestrator.routingStrategy,
      parallelism:
        typeof preferences["ui.orchestrator.parallelism"] === "number"
          ? (preferences["ui.orchestrator.parallelism"] as number)
          : base.orchestrator.parallelism,
      autoFailover:
        typeof preferences["ui.orchestrator.autoFailover"] === "boolean"
          ? (preferences["ui.orchestrator.autoFailover"] as boolean)
          : base.orchestrator.autoFailover,
      globalDailyCap:
        typeof preferences["ui.orchestrator.globalDailyCap"] === "number"
          ? (preferences["ui.orchestrator.globalDailyCap"] as number)
          : base.orchestrator.globalDailyCap,
    },
    prefs: {
      ...base.prefs,
      sound:
        typeof preferences["ui.prefs.sound"] === "boolean"
          ? (preferences["ui.prefs.sound"] as boolean)
          : base.prefs.sound,
      desktopNotifs:
        typeof preferences["ui.prefs.desktopNotifs"] === "boolean"
          ? (preferences["ui.prefs.desktopNotifs"] as boolean)
          : base.prefs.desktopNotifs,
      autoSync:
        typeof preferences["ui.prefs.autoSync"] === "boolean"
          ? (preferences["ui.prefs.autoSync"] as boolean)
          : base.prefs.autoSync,
      fontSize:
        typeof remoteFontSize === "string" && FONT_SIZES.includes(remoteFontSize as Prefs["fontSize"])
          ? (remoteFontSize as Prefs["fontSize"])
          : base.prefs.fontSize,
      accentColor: isHexColor(remoteAccentColor)
        ? remoteAccentColor
        : base.prefs.accentColor,
    },
  };
}

function applyCliRegistry(baseProviders: Provider[], registryEntries: CliRegistryEntry[]): Provider[] {
  const byProviderId = new Map<string, CliRegistryEntry>();
  for (const entry of registryEntries) {
    if (!entry.slug) continue;
    const providerId = PROVIDER_BY_CLI_SLUG[entry.slug];
    if (!providerId) continue;
    byProviderId.set(providerId, entry);
  }

  return baseProviders.map((provider) => {
    const entry = byProviderId.get(provider.id);
    if (!entry) return provider;
    return {
      ...provider,
      name: typeof entry.name === "string" ? entry.name : provider.name,
      description: typeof entry.description === "string" ? entry.description : provider.description,
      enabled: entry.required ? true : provider.enabled,
    };
  });
}

function toBackendPreferences(state: AppState): Record<string, unknown> {
  const preferences: Record<string, unknown> = {
    "ui.onboarded": state.onboarded,
    "ui.orchestrator.model": state.orchestrator.model,
    "ui.orchestrator.routingStrategy": state.orchestrator.routingStrategy,
    "ui.orchestrator.parallelism": state.orchestrator.parallelism,
    "ui.orchestrator.autoFailover": state.orchestrator.autoFailover,
    "ui.orchestrator.globalDailyCap": state.orchestrator.globalDailyCap,
    "ui.prefs.sound": state.prefs.sound,
    "ui.prefs.desktopNotifs": state.prefs.desktopNotifs,
    "ui.prefs.autoSync": state.prefs.autoSync,
    "ui.prefs.fontSize": state.prefs.fontSize,
    "ui.prefs.accentColor": isHexColor(state.prefs.accentColor)
      ? state.prefs.accentColor
      : DEFAULT_ACCENT_COLOR,
  };

  if (state.workspace) {
    preferences["ui.workspace.path"] = state.workspace.path;
    preferences["ui.workspace.name"] = state.workspace.name;
  }

  for (const provider of state.providers) {
    const prefix = `cli.${provider.id}.`;
    preferences[`${prefix}enabled`] = provider.enabled;
    preferences[`${prefix}configured`] = provider.configured;
    preferences[`${prefix}authMethod`] = provider.authMethod;
    preferences[`${prefix}model`] = provider.model;
    if (provider.endpoint) preferences[`${prefix}endpoint`] = provider.endpoint;
    if (provider.accountEmail) preferences[`${prefix}accountEmail`] = provider.accountEmail;
    if (provider.accountProvider) preferences[`${prefix}accountProvider`] = provider.accountProvider;
    if (provider.accountPlan) preferences[`${prefix}accountPlan`] = provider.accountPlan;
  }

  return preferences;
}

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
      prefs: {
        ...DEFAULT_STATE.prefs,
        ...(parsed.prefs || {}),
        accentColor: isHexColor(parsed.prefs?.accentColor)
          ? parsed.prefs.accentColor
          : DEFAULT_STATE.prefs.accentColor,
      },
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
      dbId: typeof s.dbId === "number" ? s.dbId : def.dbId,
      authMethod,
      authMethods: def.authMethods,
      models: def.models,
    } as Provider;
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadInitial);
  const [backendHydrated, setBackendHydrated] = useState(false);

  /* Debounced persistence — avoids thrashing localStorage on rapid updates. */
  const saveTimer = useRef<number | null>(null);
  const backendSyncTimer = useRef<number | null>(null);
  const orchestratorSyncTimer = useRef<number | null>(null);

  useEffect(() => {
    const accent = isHexColor(state.prefs.accentColor)
      ? state.prefs.accentColor
      : DEFAULT_ACCENT_COLOR;
    const root = document.documentElement;
    root.style.setProperty("--app-accent", accent);
    root.style.setProperty("--app-accent-soft", colorWithAlpha(accent, "1a"));
    root.style.setProperty("--app-accent-ring", colorWithAlpha(accent, "66"));
    root.style.setProperty("--ring", accent);
  }, [state.prefs.accentColor]);

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

  useEffect(() => {
    let cancelled = false;

    const hydrateFromBackend = async () => {
      try {
        const response = await apiFetch("/settings", { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as SettingsApiResponse;
          if (!cancelled && payload.preferences) {
            setState((prev) => applyRemotePreferences(prev, payload.preferences as Record<string, unknown>));
          }
        }
      } catch {
        // Local-first fallback: if backend is unavailable, local settings still work.
      }

      try {
        const provRes = await apiFetch("/providers?enabled_only=false", {
          cache: "no-store",
        });
        if (provRes.ok) {
          const body = await provRes.json();
          const rows: {
            id: number;
            name: string;
            display_name: string;
            is_enabled: boolean | number;
            default_model: string | null;
          }[] = body.providers ?? [];
          if (!cancelled && rows.length) {
            setState((prev) => ({
              ...prev,
              providers: prev.providers.map((p) => {
                const r = rows.find((x) => x.name === p.id);
                if (!r) return p;
                return {
                  ...p,
                  dbId: r.id,
                  name: r.display_name || p.name,
                  enabled: Boolean(r.is_enabled),
                  model: (r.default_model as string) || p.model,
                };
              }),
            }));
          }
        }
      } catch {
        /* optional */
      }

      try {
        const response = await apiFetch("/settings/cli-registry", { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as CliRegistryApiResponse;
          const clis = Array.isArray(payload.clis) ? payload.clis : [];
          if (!cancelled && clis.length > 0) {
            setState((prev) => ({
              ...prev,
              providers: applyCliRegistry(prev.providers, clis),
            }));
          }
        }
      } catch {
        // Registry sync is optional during local development.
      }

      try {
        const response = await apiFetch("/orchestrator/config", { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as OrchestratorConfigApi;
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              orchestrator: orchestratorFromApi(prev.orchestrator, payload),
            }));
          }
        }
      } catch {
        // Orchestrator config is optional until DB is initialized.
      }

      if (!cancelled) {
        setBackendHydrated(true);
      }
    };

    void hydrateFromBackend();
    return () => {
      cancelled = true;
    };
  }, []);

  const [syncState, setSyncState] = useState<SyncState>("synced");

  const settingsRetryCount = useRef(0);
  const settingsRetryTimer = useRef<number | null>(null);

  const orchestratorRetryCount = useRef(0);
  const orchestratorRetryTimer = useRef<number | null>(null);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const performSettingsSync = (retryAttempt = 0) => {
    if (!stateRef.current.prefs.autoSync) return;
    setSyncState("saving");
    if (settingsRetryTimer.current) window.clearTimeout(settingsRetryTimer.current);

    const payload = {
      preferences: toBackendPreferences(stateRef.current),
    };

    void apiFetch("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (res.ok) {
          settingsRetryCount.current = 0;
          setSyncState((curr) => (curr === "error" ? "error" : "synced"));
        } else {
          throw new Error("Settings sync failed");
        }
      })
      .catch(() => {
        setSyncState("error");
        if (retryAttempt < 5) {
          const delay = Math.pow(2, retryAttempt) * 1000;
          settingsRetryCount.current = retryAttempt + 1;
          settingsRetryTimer.current = window.setTimeout(() => {
            performSettingsSync(retryAttempt + 1);
          }, delay);
        } else {
          toast.error("Settings sync failed after multiple attempts.");
        }
      });
  };

  const performOrchestratorSync = (retryAttempt = 0) => {
    if (!stateRef.current.prefs.autoSync) return;
    setSyncState("saving");
    if (orchestratorRetryTimer.current) window.clearTimeout(orchestratorRetryTimer.current);

    void apiFetch("/orchestrator/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orchestratorToApiPayload(stateRef.current.orchestrator)),
    })
      .then((res) => {
        if (res.ok) {
          orchestratorRetryCount.current = 0;
          setSyncState((curr) => (curr === "error" ? "error" : "synced"));
        } else {
          throw new Error("Orchestrator config sync failed");
        }
      })
      .catch(() => {
        setSyncState("error");
        if (retryAttempt < 5) {
          const delay = Math.pow(2, retryAttempt) * 1000;
          orchestratorRetryCount.current = retryAttempt + 1;
          orchestratorRetryTimer.current = window.setTimeout(() => {
            performOrchestratorSync(retryAttempt + 1);
          }, delay);
        } else {
          toast.error("Orchestrator config sync failed after multiple attempts.");
        }
      });
  };

  const retrySync = () => {
    settingsRetryCount.current = 0;
    orchestratorRetryCount.current = 0;
    performSettingsSync(0);
    performOrchestratorSync(0);
  };

  useEffect(() => {
    if (!backendHydrated) return;
    if (!state.prefs.autoSync) {
      if (backendSyncTimer.current) window.clearTimeout(backendSyncTimer.current);
      if (settingsRetryTimer.current) window.clearTimeout(settingsRetryTimer.current);
      return;
    }
    if (backendSyncTimer.current) window.clearTimeout(backendSyncTimer.current);
    if (settingsRetryTimer.current) window.clearTimeout(settingsRetryTimer.current);

    backendSyncTimer.current = window.setTimeout(() => {
      performSettingsSync(0);
    }, 500);

    return () => {
      if (backendSyncTimer.current) window.clearTimeout(backendSyncTimer.current);
      if (settingsRetryTimer.current) window.clearTimeout(settingsRetryTimer.current);
    };
  }, [backendHydrated, state.onboarded, state.workspace, state.providers, state.prefs]);

  useEffect(() => {
    if (!backendHydrated) return;
    if (!state.prefs.autoSync) {
      if (orchestratorSyncTimer.current) window.clearTimeout(orchestratorSyncTimer.current);
      if (orchestratorRetryTimer.current) window.clearTimeout(orchestratorRetryTimer.current);
      return;
    }
    if (orchestratorSyncTimer.current) window.clearTimeout(orchestratorSyncTimer.current);
    if (orchestratorRetryTimer.current) window.clearTimeout(orchestratorRetryTimer.current);

    orchestratorSyncTimer.current = window.setTimeout(() => {
      performOrchestratorSync(0);
    }, 500);

    return () => {
      if (orchestratorSyncTimer.current) window.clearTimeout(orchestratorSyncTimer.current);
      if (orchestratorRetryTimer.current) window.clearTimeout(orchestratorRetryTimer.current);
    };
  }, [backendHydrated, state.orchestrator, state.prefs.autoSync]);

  return (
    <StoreCtx.Provider
      value={{
        ...state,
        backendHydrated,
        syncState,
        retrySync,
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
        createSession: async (title = "New chat") => {
          try {
            const res = await apiFetch("/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                user_id: 1,
                title,
                session_type: "chat",
                status: "active",
              }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            return typeof data.id === "number" ? data.id : null;
          } catch {
            return null;
          }
        },
        clearSessions: async () => {
          try {
            const res = await apiFetch("/sessions?confirm=true", { method: "DELETE" });
            if (!res.ok) {
              const detail = await res.text().catch(() => "");
              toast.error(detail ? detail.slice(0, 160) : "Failed to clear sessions.");
              return false;
            }
            return true;
          } catch (err) {
            toast.error("Failed to clear sessions — backend unreachable.");
            return false;
          }
        },
        reset: async () => {
          try {
            localStorage.removeItem(KEY);
          } catch {}
          const resetState = {
            ...DEFAULT_STATE,
            onboarded: false,
            workspace: null,
          };
          setState(resetState);
          try {
            await apiFetch("/settings/reset", { method: "POST" });
          } catch {
            // Local reset still works; backend will be overwritten on the next successful sync.
          }
          window.location.reload();
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
