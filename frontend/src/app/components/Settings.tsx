import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  Check,
  CircleAlert,
  Cpu,
  Eye,
  EyeOff,
  Folder,
  History,
  Info,
  Keyboard,
  Layers,
  Moon,
  Plug,
  RefreshCw,
  Save,
  ShieldCheck,
  Sun,
  Terminal as TerminalIcon,
  Trash2,
  Type,
  Wrench,
} from "lucide-react";
import { ACCENT_COLORS, useStore, type AuthMethod, type Provider } from "./store";
import { OrchestratorLogo } from "./OrchestratorLogo";
import { useTheme } from "./theme";
import { Dropdown } from "./Sidebar";
import { TerminalCard, type CliRuntime } from "./TerminalCard";
import { ContextDropzone, type CtxFile } from "./ContextDropzone";
import { apiFetch, apiPath, readSseJsonStream } from "../lib/api";
import { orchestratorToApiPayload } from "../lib/orchestratorConfig";
import { CliInstallHint } from "./CliInstallHint";
import { SessionHistory } from "./SessionHistory";
import { CustomCliPanel } from "./CustomCliPanel";
import { listCustomClis } from "../lib/customCli";
import { sortProvidersByHealth } from "../lib/providerSort";

type Tab =
  | "general"
  | "providers"
  | "cli-setup"
  | "custom-cli"
  | "terminals"
  | "orchestrator"
  | "context"
  | "notifications"
  | "shortcuts"
  | "sessions"
  | "privacy"
  | "about";

const TABS: { id: Tab; label: string; icon: typeof Folder; desc: string }[] = [
  { id: "general", label: "General", icon: Folder, desc: "Workspace · appearance · font" },
  { id: "providers", label: "Providers", icon: Plug, desc: "All connected CLIs" },
  { id: "cli-setup", label: "Setup CLIs", icon: Wrench, desc: "Algorithmic installer" },
  { id: "custom-cli", label: "Custom CLIs", icon: TerminalIcon, desc: "User-registered executables" },
  { id: "terminals", label: "Terminals", icon: TerminalIcon, desc: "Live per-agent terminals" },
  { id: "orchestrator", label: "Orchestrator", icon: Cpu, desc: "Model · routing · caps" },
  { id: "context", label: "Context", icon: Layers, desc: "Sync · auto-generated files" },
  { id: "notifications", label: "Notifications", icon: Bell, desc: "Sound · desktop alerts" },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard, desc: "Keyboard map" },
  { id: "sessions", label: "Sessions", icon: History, desc: "History · spend · artifacts" },
  { id: "privacy", label: "Privacy", icon: ShieldCheck, desc: "Telemetry · local data" },
  { id: "about", label: "About", icon: Info, desc: "Version · license · credits" },
];

export function Settings({
  onClose,
  clis = [],
}: {
  onClose: () => void;
  clis?: CliRuntime[];
}) {
  const [tab, setTab] = useState<Tab>("general");
  const { syncState, retrySync } = useStore();

  const SyncIndicator = () => {
    if (syncState === "synced") {
      return (
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono normal-case tracking-normal flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Saved
        </span>
      );
    }
    if (syncState === "saving") {
      return (
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono normal-case tracking-normal flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          Saving...
        </span>
      );
    }
    return (
      <button
        onClick={retrySync}
        className="text-[10px] text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-mono normal-case tracking-normal flex items-center gap-1 hover:underline cursor-pointer"
        title="Settings sync failed. Click to retry."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
        Not saved — Retry
      </button>
    );
  };

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1200px] flex-col md:flex-row">
        {/* Mobile: horizontal scrollable tab bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200/70 bg-white/40 px-3 py-2 backdrop-blur dark:border-white/[0.06] dark:bg-zinc-950/40 md:hidden w-full">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            <button
              onClick={onClose}
              className="shrink-0 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.05]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] transition ${
                  tab === t.id
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                }`}
              >
                <t.icon className="h-3 w-3" />
                {t.label}
              </button>
            ))}
          </div>
          <div className="pl-2 shrink-0">
            <SyncIndicator />
          </div>
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden w-[260px] shrink-0 border-r border-zinc-200/70 bg-white/40 px-3 py-5 backdrop-blur dark:border-white/[0.06] dark:bg-zinc-950/40 md:block">
          <button
            onClick={onClose}
            className="mb-5 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>
          <div className="px-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 flex items-center justify-between">
            <span>Settings</span>
            <SyncIndicator />
          </div>
          <div className="mt-3 space-y-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                  tab === t.id
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                <div className="flex-1 leading-tight">
                  <div className="text-[12.5px]">{t.label}</div>
                  <div
                    className={`text-[10px] ${
                      tab === t.id
                        ? "text-zinc-300 dark:text-zinc-500"
                        : "text-zinc-500"
                    }`}
                  >
                    {t.desc}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-44 pt-5 sm:px-6 sm:pb-48 md:px-8 md:pt-7">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {tab === "general" && <GeneralPanel />}
            {tab === "providers" && <ProvidersPanel />}
            {tab === "cli-setup" && <CliSetupPanel />}
            {tab === "custom-cli" && <CustomCliPanel />}
            {tab === "terminals" && <TerminalsPanel clis={clis} />}
            {tab === "orchestrator" && <OrchestratorPanel />}
            {tab === "context" && <ContextPanel />}
            {tab === "notifications" && <NotificationsPanel />}
            {tab === "shortcuts" && <ShortcutsPanel />}
            {tab === "sessions" && <SessionsPanel />}
            {tab === "privacy" && <PrivacyPanel />}
            {tab === "about" && <AboutPanel />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-[22px] tracking-tight text-zinc-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-[12.5px] text-zinc-500">{sub}</p>
    </div>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 border-b border-zinc-200/70 px-1 py-4 dark:border-white/[0.05] sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0">
        <div className="text-[13px] text-zinc-900 dark:text-white">{title}</div>
        {desc && <div className="mt-0.5 text-[11.5px] text-zinc-500">{desc}</div>}
      </div>
      <div className="w-full shrink-0 sm:w-auto">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full transition ${
        on ? "" : "bg-zinc-300 dark:bg-white/15"
      }`}
      style={on ? { backgroundColor: "var(--app-accent)" } : undefined}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow ${
          on ? "right-0.5" : "left-0.5"
        }`}
      />
    </button>
  );
}

async function saveSettingsPreferences(
  preferences: Record<string, unknown>,
  successMessage: string,
) {
  try {
    const res = await apiFetch("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    });
    if (!res.ok) throw new Error(await res.text());
    toast.success(successMessage);
    return true;
  } catch (err) {
    console.error(err);
    toast.error("Could not save settings.");
    return false;
  }
}

function ApplyButton({
  onClick,
  label = "Apply changes",
}: {
  onClick: () => Promise<unknown> | unknown;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-4 flex justify-end">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onClick();
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] text-white shadow-sm transition disabled:opacity-50"
        style={{ backgroundColor: "var(--app-accent)" }}
      >
        <Save className="h-3 w-3" />
        {busy ? "Saving..." : label}
      </button>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function GeneralPanel() {
  const { workspace, setWorkspace, prefs, setPrefs } = useStore();
  const { theme, toggle } = useTheme();
  const isDesktop = Boolean(window.orchestratorDesktop?.isDesktop);

  // WS-2: workspace state for the inline editor
  const [editingPath, setEditingPath] = useState(workspace?.path || "");
  const [pathValid, setPathValid] = useState<boolean | null>(workspace?.path ? true : null);
  const [pathValidating, setPathValidating] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);

  const handleValidatePath = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) { setPathValid(null); setPathError(null); return; }
    setPathValidating(true);
    try {
      const res = await apiFetch(`/workspace/validate-path?path=${encodeURIComponent(trimmed)}`, { timeoutMs: 10_000 });
      if (res.ok) {
        const data = await res.json();
        setPathValid(!!data.valid);
        setPathError(data.error || null);
        if (data.valid) {
          toast.success("Workspace path is valid.");
        } else {
          toast.error(data.error || "Invalid workspace path.");
        }
      } else {
        setPathValid(false);
        setPathError("Validation service error.");
        toast.error("Validation service error.");
      }
    } catch {
      setPathValid(false);
      setPathError("Validation service offline.");
      toast.error("Validation service offline.");
    } finally {
      setPathValidating(false);
    }
  };

  const handlePickFolder = async () => {
    const prevPath = workspace?.path || "";
    const selectWorkspaceFolder = window.electronAPI?.selectWorkspaceFolder;
    if (selectWorkspaceFolder) {
      const path = await selectWorkspaceFolder();
      if (path) {
        const name = path.split(/[/\\]/).filter(Boolean).pop() || "workspace";
        setEditingPath(path);
        setPathValid(true);
        setPathError(null);
        setWorkspace({ path, name });
        toast.success("Workspace updated.");
      } else {
        // canceled
        if (prevPath) toast.info("Workspace unchanged.");
      }
      return;
    }
    try {
      // @ts-ignore
      if (window.showDirectoryPicker) {
        // @ts-ignore
        const h = await window.showDirectoryPicker();
        const hint = h?.name || "workspace";
        const value = window.prompt(
          `Selected "${hint}". Paste the full folder path so the backend can use it.`,
          workspace?.path || "",
        );
        if (value?.trim()) {
          const name = value.trim().split(/[/\\]/).filter(Boolean).pop() || hint;
          setEditingPath(value.trim());
          setWorkspace({ path: value.trim(), name });
          toast.success("Workspace updated.");
        }
        return;
      }
    } catch {}
    const value = window.prompt("Paste the full workspace folder path.", workspace?.path || "");
    if (value?.trim()) {
      const name = value.trim().split(/[/\\]/).filter(Boolean).pop() || "workspace";
      setEditingPath(value.trim());
      setWorkspace({ path: value.trim(), name });
      toast.success("Workspace updated.");
    }
  };

  const handleApplyPath = () => {
    const trimmed = editingPath.trim();
    if (!trimmed || pathValid !== true) return;
    const name = trimmed.split(/[/\\]/).filter(Boolean).pop() || "workspace";
    setWorkspace({ path: trimmed, name });
    toast.success("Workspace updated.");
  };

  return (
    <>
      <SectionTitle title="General" sub="Workspace location, appearance, and typography." />

      <div className="rounded-xl border border-zinc-200/70 bg-white/60 px-4 dark:border-white/[0.06] dark:bg-zinc-950/40">
        {/* WS-2: Full workspace row with text input + Validate + optional picker */}
        <div className="flex flex-col gap-3 border-b border-zinc-200/70 px-1 py-4 dark:border-white/[0.05]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[13px] text-zinc-900 dark:text-white">Workspace folder</div>
              {workspace?.path ? (
                <div className="mt-0.5 font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400">
                  Active workspace: {workspace.path}
                </div>
              ) : (
                <div className="mt-0.5 font-mono text-[10.5px] text-amber-600 dark:text-amber-400">
                  No active workspace configured.
                </div>
              )}
            </div>
            {isDesktop && (
              <button
                onClick={() => void handlePickFolder()}
                className="shrink-0 rounded-md border border-zinc-200/70 bg-white px-3 py-1.5 text-[11.5px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-200 dark:hover:bg-white/[0.06]"
              >
                Browse…
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                value={editingPath}
                onChange={(e) => {
                  setEditingPath(e.target.value);
                  setPathValid(null);
                  setPathError(null);
                }}
                placeholder="~/projects/your-app or C:\Projects\app"
                className="flex-1 rounded-lg border border-zinc-200/70 bg-white px-3 py-1.5 font-mono text-[11.5px] text-zinc-800 outline-none focus:border-indigo-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200"
              />
              <button
                type="button"
                disabled={!editingPath.trim() || pathValidating}
                onClick={() => void handleValidatePath(editingPath)}
                className="shrink-0 rounded-md border border-zinc-200/70 bg-white px-2.5 py-1.5 text-[11.5px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-200 dark:hover:bg-white/[0.06]"
              >
                {pathValidating ? "Checking…" : "Validate"}
              </button>
              <button
                type="button"
                disabled={pathValid !== true || !editingPath.trim()}
                onClick={handleApplyPath}
                className="shrink-0 rounded-md bg-zinc-900 px-2.5 py-1.5 text-[11.5px] text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
              >
                Apply
              </button>
            </div>
            {pathValid === true && (
              <p className="font-mono text-[10px] text-emerald-500">✓ Valid path</p>
            )}
            {pathValid === false && (
              <p className="font-mono text-[10px] text-rose-500">
                ✗ {pathError || "Invalid path."}
              </p>
            )}
          </div>
        </div>
        <Row title="Theme" desc="Dark or light">
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200/70 bg-white px-3 py-1.5 text-[11.5px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-200"
          >
            {theme === "dark" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
            {theme === "dark" ? "Dark" : "Light"}
          </button>
        </Row>
        <Row title="Font size" desc="Density of chat & terminal text">
          <div className="flex items-center gap-1">
            {(["sm", "md", "lg"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setPrefs((p) => ({ ...p, fontSize: s }))}
                className={`rounded-md px-2 py-1 font-mono text-[10px] uppercase ${
                  prefs.fontSize === s
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "border border-zinc-200/70 bg-white text-zinc-600 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-300"
                }`}
              >
                <Type className="mr-1 inline h-2.5 w-2.5" />
                {s}
              </button>
            ))}
          </div>
        </Row>
        <Row title="Editor accent" desc="Used for primary buttons & highlights">
          <div className="flex items-center gap-1.5">
            {ACCENT_COLORS.map((c) => {
              const active = prefs.accentColor === c;
              return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                title={`Use ${c} accent`}
                onClick={() => setPrefs((p) => ({ ...p, accentColor: c }))}
                className="flex h-5 w-5 items-center justify-center rounded-full ring-2 transition hover:ring-zinc-300 dark:hover:ring-white/30"
                style={{
                  background: c,
                  boxShadow: active ? `0 0 0 2px ${c}66` : undefined,
                }}
              >
                {active && <Check className="h-3 w-3 text-white drop-shadow" />}
              </button>
              );
            })}
          </div>
        </Row>
      </div>
      <ApplyButton
        onClick={() =>
          saveSettingsPreferences(
            {
              "ui.prefs.fontSize": prefs.fontSize,
              "ui.prefs.accentColor": prefs.accentColor,
              "ui.workspace.path": workspace?.path ?? "",
              "ui.workspace.name": workspace?.name ?? "",
            },
            "General settings saved.",
          )
        }
      />
    </>
  );
}

// Where to obtain an API key for each provider (shown inline next to the key field).
const KEY_HELP: Record<string, { url: string; label: string }> = {
  grok: { url: "https://console.x.ai/", label: "console.x.ai → API Keys" },
  gemini: { url: "https://aistudio.google.com/apikey", label: "aistudio.google.com → Get API key" },
  deepseek: { url: "https://platform.deepseek.com/api_keys", label: "platform.deepseek.com → API keys" },
  claude: { url: "https://console.anthropic.com/settings/keys", label: "console.anthropic.com → API keys" },
  codex: { url: "https://platform.openai.com/api-keys", label: "platform.openai.com → API keys" },
  kimi: { url: "https://platform.moonshot.ai/console/api-keys", label: "platform.moonshot.ai → API keys" },
  cline: { url: "https://console.anthropic.com/settings/keys", label: "BYOK — paste any Anthropic/OpenAI key" },
};

function ProvidersPanel() {
  const { providers, setProviders } = useStore();
  const [customCount, setCustomCount] = useState<number | null>(null);
  // Health-weighted ordering: healthy providers first so attention naturally
  // lands on actionable rows. Ties break alphabetically.
  const sortedProviders = useMemo(
    () => sortProvidersByHealth(providers),
    [providers],
  );

  useEffect(() => {
    let cancelled = false;
    listCustomClis()
      .then((rows) => {
        if (!cancelled) setCustomCount(rows.length);
      })
      .catch(() => {
        if (!cancelled) setCustomCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SectionTitle title="Providers" sub="Manage every CLI's credentials and default model." />
      <div className="space-y-2">
        {sortedProviders.map((p) => (
          <ProviderRow
            key={p.id}
            p={p}
            onChange={(np) =>
              setProviders((prev) => prev.map((x) => (x.id === p.id ? np : x)))
            }
          />
        ))}
      </div>

      {customCount !== null && customCount > 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-3 text-[12px] text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
          {customCount} custom {customCount === 1 ? "CLI is" : "CLIs are"} also available —
          registered executables that surface alongside the bundled providers.
          Manage them in the <span className="font-medium">Custom CLIs</span> tab.
        </div>
      )}
    </>
  );
}

function ProviderRow({ p, onChange }: { p: Provider; onChange: (p: Provider) => void }) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [secret, setSecret] = useState("");
  const [hasStoredCredential, setHasStoredCredential] = useState(p.configured);
  const [busy, setBusy] = useState(false);
  // B-HIGH-04: loading state while credentials are being fetched from backend.
  const [credLoading, setCredLoading] = useState(false);

  useEffect(() => {
    setHasStoredCredential(p.configured);
  }, [p.configured]);

  useEffect(() => {
    if (!open || !p.dbId) return;
    let cancelled = false;
    setCredLoading(true);
    void (async () => {
      try {
        const r = await apiFetch(`/providers/${p.dbId}/credentials`);
        if (r.ok && !cancelled) {
          const j = await r.json();
          const key = (j.api_key as string) || "";
          setSecret(key === "***" ? "" : key);
          setHasStoredCredential(Boolean(j.has_credentials));
        }
      } catch {
        if (!cancelled) {
          setSecret("");
          setHasStoredCredential(p.configured);
        }
      } finally {
        if (!cancelled) setCredLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, p.dbId]);


  const persistEnabled = async (v: boolean) => {
    // Optimistic update
    onChange({ ...p, enabled: v });
    if (p.dbId) {
      try {
        const r = await apiFetch(`/providers/${p.dbId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_enabled: v }),
        });
        if (!r.ok) {
          console.error("Failed to persist enabled state", await r.text());
          // Rollback on failure
          onChange({ ...p, enabled: !v });
        }
      } catch (e) {
        console.error("Network error persisting enabled state", e);
        onChange({ ...p, enabled: !v });
      }
    }
  };

  const save = async () => {
    if (!p.dbId) return;
    setBusy(true);
    try {
      const providerRes = await apiFetch(`/providers/${p.dbId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: p.enabled, default_model: p.model }),
      });
      if (!providerRes.ok) {
        throw new Error(await providerRes.text());
      }

      let nextConfigured = p.configured;
      if (
        (p.authMethod === "api_key" || p.authMethod === "bearer") &&
        secret.trim() &&
        secret !== "***" &&
        !secret.includes("***")
      ) {
        const r = await apiFetch(`/providers/${p.dbId}/credentials`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credential_name: "default",
            api_key: secret.trim(),
          }),
        });
        if (!r.ok) {
          throw new Error(await r.text());
        }
        nextConfigured = true;
        setHasStoredCredential(true);
      } else if (p.authMethod === "account" && p.accountEmail?.trim()) {
        const r = await apiFetch(`/providers/${p.dbId}/credentials`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credential_name: "default",
            api_key: p.accountEmail.trim(),
          }),
        });
        if (!r.ok) {
          throw new Error(await r.text());
        }
        nextConfigured = true;
        setHasStoredCredential(true);
      } else if (p.authMethod === "account") {
        nextConfigured = false;
      } else if (p.authMethod === "api_key" || p.authMethod === "bearer") {
        nextConfigured = hasStoredCredential || p.configured;
      } else if (p.authMethod === "ssh") {
        nextConfigured = Boolean(p.endpoint?.trim()) || p.configured;
      } else if (p.authMethod === "oauth") {
        nextConfigured = p.configured;
      }
      onChange({ ...p, configured: nextConfigured });
      toast.success(`${p.name} settings saved.`);
    } catch (e) {
      console.error(e);
      toast.error(`Could not save ${p.name} settings.`);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!p.dbId) return;
    if (!confirm(`Are you sure you want to revoke/delete the stored credentials for ${p.name}?`)) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/providers/${p.dbId}/credentials`, { method: "DELETE" });
      setSecret("");
      setHasStoredCredential(false);
      onChange({ ...p, configured: false });
      toast.success(`${p.name} credentials revoked.`);
    } catch (e) {
      console.error(e);
      toast.error(`Could not revoke ${p.name} credentials.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-white/60 dark:border-white/[0.06] dark:bg-zinc-950/40">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
      >
        <span className={`${p.color} font-mono text-[18px] leading-none`}>{p.glyph}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] text-zinc-900 dark:text-white">{p.name}</span>
            <span
              className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                p.configured
                  ? "border-emerald-300/40 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.08] dark:text-emerald-300"
                  : "border-amber-300/40 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/[0.08] dark:text-amber-300"
              }`}
            >
              {p.configured ? "configured" : "needs setup"}
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[10.5px] text-zinc-500">
            {p.authMethod} · {p.model} · ${p.dailyCap}/day cap
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle on={p.enabled} onChange={persistEnabled} />
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t border-zinc-200/70 bg-zinc-50/40 px-4 py-4 dark:border-white/[0.05] dark:bg-black/30">
          {/* B-HIGH-04: Show spinner while credentials are loading from backend */}
          {credLoading && (
            <div className="flex items-center gap-2 py-6 text-[12px] text-zinc-400">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-white/20 dark:border-t-white/60" />
              Loading credentials…
            </div>
          )}
          {!credLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Auth method
              </label>
              <Dropdown
                value={p.authMethod}
                options={p.authMethods}
                onChange={(v) => onChange({ ...p, authMethod: v as AuthMethod })}
                mono={false}
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Model
              </label>
              <Dropdown
                value={p.model}
                options={p.models}
                onChange={(m) => onChange({ ...p, model: m })}
              />
            </div>
          </div>
          )}
          {!credLoading && (p.authMethod === "ssh" ? (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Host
              </label>
              <input
                value={p.endpoint || ""}
                onChange={(e) => onChange({ ...p, endpoint: e.target.value })}
                className={inp + " font-mono w-full"}
              />
            </div>
          ) : p.authMethod === "oauth" ? (
            <button
              onClick={() => onChange({ ...p, configured: true })}
              className="w-full rounded-lg border border-zinc-200/70 bg-white py-2 text-[12px] text-zinc-700 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200"
            >
              Reconnect with OAuth
            </button>
          ) : p.authMethod === "account" ? (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                {p.accountProvider || "Account"} email
              </label>
              <input
                type="email"
                value={p.accountEmail || ""}
                onChange={(e) =>
                  onChange({ ...p, accountEmail: e.target.value, configured: !!e.target.value })
                }
                placeholder="you@example.com"
                className={inp + " font-mono w-full"}
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Secret
              </label>
              <div className="flex items-center gap-1">
                <input
                  type={show ? "text" : "password"}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={p.configured ? "••••••••••••••••" : "Enter API key"}
                  className={inp + " font-mono flex-1"}
                />
                <button
                  onClick={() => setShow((s) => !s)}
                  className="rounded-md border border-zinc-200/70 bg-white p-2 text-zinc-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-300"
                >
                  {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {KEY_HELP[p.id] && (
                <a
                  href={KEY_HELP[p.id].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Get an API key: {KEY_HELP[p.id].label} ↗
                </a>
              )}
            </div>
          ))}
          {!credLoading && <CliInstallHint providerId={p.id} />}
          {!credLoading && (
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Daily cap (USD)
            </label>
            <input
              type="number"
              min={0}
              value={p.dailyCap}
              onChange={(e) => onChange({ ...p, dailyCap: Math.max(0, Number(e.target.value) || 0) })}
              className={inp + " font-mono w-full"}
            />
          </div>
          )}
          {!credLoading && (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy || !p.dbId}
              onClick={() => void revoke()}
              className="flex items-center gap-1 rounded-md border border-rose-300/40 bg-rose-50 px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-100 disabled:opacity-40 dark:border-rose-400/20 dark:bg-rose-400/[0.08] dark:text-rose-300"
            >
              <Trash2 className="h-3 w-3" /> Revoke
            </button>
            <button
              type="button"
              disabled={busy || !p.dbId}
              onClick={() => void save()}
              className="flex items-center gap-1 rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
            >
              <Save className="h-3 w-3" /> Save
            </button>
          </div>
          )}
        </div>
      )}


    </div>
  );
}

function TerminalsPanel({ clis }: { clis: CliRuntime[] }) {
  const [filter, setFilter] = useState<"all" | "executing" | "idle" | "limited" | "permission">("all");
  const filtered = clis.filter((c) => (filter === "all" ? true : c.state === filter));

  return (
    <>
      <SectionTitle title="Terminals" sub="Live per-CLI terminals — output, quotas, and pending approvals." />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(
          [
            ["all", "All"],
            ["executing", "Active"],
            ["idle", "Idle"],
            ["limited", "Limited"],
            ["permission", "Approval"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-md px-2.5 py-1 font-mono text-[10.5px] transition ${
              filter === k
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "border border-zinc-200/70 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map((c) => (
          // lazyConnect: opening this tab must not spawn a PTY per provider —
          // each card offers "Connect terminal" on demand instead.
          <TerminalCard key={c.id} cli={c} defaultMenuOpen={false} lazyConnect />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-zinc-300/70 bg-zinc-50/50 px-6 py-10 text-center text-[12px] text-zinc-500 dark:border-white/10 dark:bg-white/[0.02]">
            No agents match this filter.
          </div>
        )}
      </div>
    </>
  );
}

const ORCH_MODELS = ["grok-3", "grok-3-mini", "gemini-2.5-pro", "deepseek-chat"] as const;
const ROUTING = ["specialty", "round_robin", "cheapest"] as const;
const ROUTING_LABELS: Record<string, string> = {
  specialty: "Specialty-based (recommended)",
  round_robin: "Round-robin",
  cheapest: "Cheapest first",
};

function OrchestratorPanel() {
  const { orchestrator, setOrchestrator } = useStore();
  const [health, setHealth] = useState<{ provider_id: string; status: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/orchestrator/providers/health")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!cancelled && Array.isArray(rows)) setHealth(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SectionTitle title="Orchestrator" sub="Central intelligence layer — plans tasks and routes work to your CLI agents." />
      <div className="mb-4 rounded-xl border border-violet-300/30 bg-violet-50/60 px-4 py-3 text-[12px] leading-relaxed text-zinc-700 dark:border-violet-400/20 dark:bg-violet-400/[0.06] dark:text-zinc-300">
        <div className="mb-1 font-medium text-zinc-900 dark:text-white">Set up your orchestrator API key</div>
        The orchestrator needs at least one API key to plan and route work. Grab a key from any provider
        below, then paste it in the <span className="font-medium">Providers</span> tab → <span className="font-medium">Save</span>:
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li><b>Grok (xAI)</b> — <a className="underline" href="https://console.x.ai/" target="_blank" rel="noopener noreferrer">console.x.ai</a> → API Keys</li>
          <li><b>Gemini (Google)</b> — <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com</a> → Get API key</li>
          <li><b>DeepSeek</b> — <a className="underline" href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">platform.deepseek.com</a> → API keys</li>
        </ul>
        Keys are encrypted and stored only on your machine. With more than one configured, the orchestrator
        falls back automatically if a provider is unavailable or out of quota.
      </div>
      <div className="rounded-xl border border-zinc-200/70 bg-white/60 px-4 dark:border-white/[0.06] dark:bg-zinc-950/40">
        <Row title="Orchestrator model" desc="LLM used for decomposition and routing (Grok, Gemini, or DeepSeek)">
          <div className="w-full sm:w-[240px]">
            <Dropdown
              value={orchestrator.model}
              options={ORCH_MODELS}
              onChange={(m) => setOrchestrator((o) => ({ ...o, model: m }))}
            />
          </div>
        </Row>
        <Row title="Routing strategy" desc="How subtasks are matched to CLIs">
          <div className="w-full sm:w-[240px]">
            <Dropdown
              value={orchestrator.routingStrategy}
              options={ROUTING}
              labels={ROUTING_LABELS}
              onChange={(v) => setOrchestrator((o) => ({ ...o, routingStrategy: v as any }))}
              mono={false}
            />
          </div>
        </Row>
        <Row title="Max parallelism" desc="Concurrent agents allowed (1-12)">
          <input
            type="number"
            min={1}
            max={12}
            value={orchestrator.parallelism}
            onChange={(e) => {
              const n = Number(e.target.value) || 1;
              setOrchestrator((o) => ({ ...o, parallelism: Math.min(12, Math.max(1, n)) }));
            }}
            className={inp + " w-full font-mono sm:w-[120px]"}
          />
        </Row>
        <Row title="Auto failover" desc="Re-route automatically before a CLI hits its wall">
          <Toggle
            on={orchestrator.autoFailover}
            onChange={(v) => setOrchestrator((o) => ({ ...o, autoFailover: v }))}
          />
        </Row>
        <Row title="Global daily cap" desc="USD across every CLI per day">
          <input
            type="number"
            min={0}
            value={orchestrator.globalDailyCap}
            onChange={(e) =>
              setOrchestrator((o) => ({
                ...o,
                globalDailyCap: Math.max(0, Number(e.target.value) || 0),
              }))
            }
            className={inp + " w-full font-mono sm:w-[120px]"}
          />
        </Row>
        {health.length > 0 && (
          <Row title="Provider health" desc="Live connectivity for orchestrator LLMs">
            <div className="flex flex-wrap gap-1.5">
              {health.map((h) => (
                <span
                  key={h.provider_id}
                  className={`rounded-md border px-2 py-0.5 font-mono text-[9px] ${
                    h.status === "healthy"
                      ? "border-emerald-300/40 text-emerald-700 dark:text-emerald-300"
                      : "border-rose-300/40 text-rose-700 dark:text-rose-300"
                  }`}
                >
                  {h.provider_id}: {h.status}
                </span>
              ))}
            </div>
          </Row>
        )}
        <Row title="Reset defaults" desc="Restore orchestrator routing configuration">
          <button
            type="button"
            onClick={() => {
              if (!confirm("Reset the orchestrator model, routing, and caps to defaults?")) return;
              void apiFetch("/orchestrator/config/reset", { method: "POST" }).then(() =>
                window.location.reload()
              );
            }}
            className="rounded-md border border-zinc-300 px-3 py-1 font-mono text-[10px] hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5"
          >
            Reset orchestrator
          </button>
        </Row>
      </div>
      <ApplyButton
        onClick={async () => {
          try {
            const res = await apiFetch("/orchestrator/config", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(orchestratorToApiPayload(orchestrator)),
            });
            if (!res.ok) throw new Error(await res.text());
            await saveSettingsPreferences(
              {
                "ui.orchestrator.model": orchestrator.model,
                "ui.orchestrator.routingStrategy": orchestrator.routingStrategy,
                "ui.orchestrator.parallelism": orchestrator.parallelism,
                "ui.orchestrator.autoFailover": orchestrator.autoFailover,
                "ui.orchestrator.globalDailyCap": orchestrator.globalDailyCap,
              },
              "Orchestrator settings saved.",
            );
          } catch (err) {
            console.error(err);
            toast.error("Could not save orchestrator settings.");
          }
        }}
      />
    </>
  );
}

function ContextPanel() {
  const { prefs, setPrefs } = useStore();
  const [files, setFiles] = useState<CtxFile[]>([]);

  const deleteContextFile = async (file: CtxFile) => {
    if (!/^\d+$/.test(file.id)) return false;
    const res = await apiFetch(`/workspace/context/${file.id}`, { method: "DELETE" });
    return res.ok;
  };

  useEffect(() => {
    void apiFetch("/workspace/context")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const rows = data?.files ?? [];
        if (Array.isArray(rows) && rows.length) {
          setFiles(
            rows.map((f: any, i: number) => ({
              id: String(f.id ?? i),
              name: f.filename ?? f.name ?? "file",
              size: f.size ? `${(f.size / 1024).toFixed(1)} kb` : "—",
              status: "synced" as const,
              agents: 0,
              source: (f.source === "orchestrator" ? "orchestrator" : "user") as "user" | "orchestrator",
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <SectionTitle title="Context" sub="How the workspace context bus behaves." />
      <div className="mb-4 rounded-xl border border-zinc-200/70 bg-white/60 px-4 dark:border-white/[0.06] dark:bg-zinc-950/40">
        <Row title="Auto-sync context" desc="Push changes to every agent within 2s">
          <Toggle
            on={prefs.autoSync}
            onChange={(v) => setPrefs((p) => ({ ...p, autoSync: v }))}
          />
        </Row>
        <Row title="Auto-generated files" desc="The orchestrator writes divisions.md into workspace/shared on every plan">
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/40 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.08] dark:text-emerald-300">
            <Check className="h-2.5 w-2.5" /> Always on
          </span>
        </Row>
      </div>
      <div className="h-[420px] overflow-hidden rounded-xl border border-zinc-200/70 bg-white/60 dark:border-white/[0.06] dark:bg-zinc-950/40">
        <ContextDropzone files={files} setFiles={setFiles} onDeleteFile={deleteContextFile} />
      </div>
      <ApplyButton
        onClick={() =>
          saveSettingsPreferences(
            {
              "ui.prefs.autoSync": prefs.autoSync,
            },
            "Context settings saved.",
          )
        }
      />
    </>
  );
}

function NotificationsPanel() {
  const { prefs, setPrefs } = useStore();
  return (
    <>
      <SectionTitle title="Notifications" sub="Stay in flow without losing alerts." />
      <div className="rounded-xl border border-zinc-200/70 bg-white/60 px-4 dark:border-white/[0.06] dark:bg-zinc-950/40">
        <Row title="Sound alerts" desc="Chime when a task completes or needs approval">
          <Toggle on={prefs.sound} onChange={(v) => setPrefs((p) => ({ ...p, sound: v }))} />
        </Row>
        <Row title="Desktop notifications" desc="OS-level toasts for permission requests">
          <Toggle
            on={prefs.desktopNotifs}
            onChange={(v) => {
              if (v && typeof Notification !== "undefined" && Notification.permission === "default") {
                Notification.requestPermission().catch(() => {});
              }
              setPrefs((p) => ({ ...p, desktopNotifs: v }));
            }}
          />
        </Row>
        <Row title="Rate-limit warnings" desc="Quota bars flag providers at 85% burn and reroute at 90%">
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/40 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.08] dark:text-emerald-300">
            <Check className="h-2.5 w-2.5" /> Always on
          </span>
        </Row>
      </div>
      <ApplyButton
        onClick={() =>
          saveSettingsPreferences(
            {
              "ui.prefs.sound": prefs.sound,
              "ui.prefs.desktopNotifs": prefs.desktopNotifs,
            },
            "Notification settings saved.",
          )
        }
      />
    </>
  );
}

const KEYS: { combo: string; action: string }[] = [
  { combo: "⌘ K", action: "Open command palette" },
  { combo: "⌘ ⇧ P", action: "Toggle Processes view" },
  { combo: "⌘ ,", action: "Open settings" },
  { combo: "⌘ /", action: "Focus chat input" },
  { combo: "⌘ ⇧ V", action: "Toggle voice dictation" },
  { combo: "⌘ ⇧ N", action: "New session" },
  { combo: "Enter", action: "Dispatch to orchestrator (⇧ Enter for newline)" },
  { combo: "Esc", action: "Close palette / dialogs" },
];

function ShortcutsPanel() {
  return (
    <>
      <SectionTitle title="Keyboard shortcuts" sub="Move faster. Configurable bindings coming soon." />
      <div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-white/60 dark:border-white/[0.06] dark:bg-zinc-950/40">
        {KEYS.map((k, i) => (
          <div
            key={k.combo}
            className={`flex items-center justify-between px-4 py-3 ${
              i !== KEYS.length - 1 ? "border-b border-zinc-200/70 dark:border-white/[0.05]" : ""
            }`}
          >
            <span className="text-[12.5px] text-zinc-800 dark:text-zinc-200">{k.action}</span>
            <kbd className="rounded-md border border-zinc-200/70 bg-zinc-50 px-2 py-0.5 font-mono text-[10.5px] text-zinc-700 dark:border-white/[0.07] dark:bg-white/[0.04] dark:text-zinc-200">
              {k.combo}
            </kbd>
          </div>
        ))}
      </div>
    </>
  );
}

function SessionsPanel() {
  return (
    <>
      <SectionTitle title="Session history" sub="Past orchestrator runs from the backend." />
      <SessionHistory />
    </>
  );
}

function PrivacyPanel() {
  const { reset } = useStore();
  const [storage, setStorage] = useState<{
    areas: { name: string; path: string; files: number; size_bytes: number; clearable: boolean }[];
  } | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadStorage = async () => {
    try {
      const res = await apiFetch("/settings/storage", { cache: "no-store" });
      if (res.ok) setStorage(await res.json());
    } catch {
      /* optional maintenance summary */
    }
  };

  useEffect(() => {
    void loadStorage();
  }, []);

  const clearableAreas = storage?.areas.filter((area) => area.clearable) ?? [];
  const clearableBytes = clearableAreas.reduce((sum, area) => sum + area.size_bytes, 0);
  const clearableFiles = clearableAreas.reduce((sum, area) => sum + area.files, 0);

  const clearCache = async () => {
    if (!confirm("Clear generated cache and temporary files? Sessions, settings, credentials, and the database will be kept.")) {
      return;
    }
    setClearing(true);
    try {
      const res = await apiFetch("/settings/storage/clear-cache?confirm=true", {
        method: "POST",
        timeoutMs: 30_000,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      toast.success(`Cleared ${formatBytes(data.cleared_bytes ?? 0)} from cache/temp.`);
      await loadStorage();
    } catch (err) {
      console.error(err);
      toast.error("Could not clear generated cache.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <SectionTitle title="Privacy" sub="Orchestrator runs entirely on your machine." />
      <div className="rounded-xl border border-zinc-200/70 bg-white/60 px-4 dark:border-white/[0.06] dark:bg-zinc-950/40">
        <Row title="Telemetry" desc="We never collect any usage data">
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/40 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.08] dark:text-emerald-300">
            <Check className="h-2.5 w-2.5" /> Disabled by design
          </span>
        </Row>
        <Row title="Credential storage" desc="Encrypted at rest (Fernet) in the local database; the key never leaves this device">
          <span className="font-mono text-[10.5px] text-zinc-500">encrypted · on-device</span>
        </Row>
        <Row title="Session storage" desc="Chat history and runs live in the local SQLite database">
          <span className="font-mono text-[10.5px] text-zinc-500">local sqlite</span>
        </Row>
        <Row
          title="Generated cache"
          desc={`${clearableFiles} files in cache/temp (${formatBytes(clearableBytes)})`}
        >
          <button
            type="button"
            disabled={clearing}
            onClick={() => void clearCache()}
            className="flex items-center gap-1 rounded-md border border-zinc-300/70 bg-white px-2.5 py-1.5 text-[11.5px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.07]"
          >
            <Trash2 className="h-3 w-3" /> {clearing ? "Clearing..." : "Clear cache"}
          </button>
        </Row>
        <Row title="Reset everything" desc="Wipe local state and walk through onboarding again">
          <button
            onClick={() => {
              if (confirm("Reset Orchestrator to defaults? This will re-run onboarding.")) void reset();
            }}
            className="flex items-center gap-1 rounded-md border border-rose-300/40 bg-rose-50 px-2.5 py-1.5 text-[11.5px] text-rose-700 hover:bg-rose-100 dark:border-rose-400/20 dark:bg-rose-400/[0.08] dark:text-rose-300"
          >
            <CircleAlert className="h-3 w-3" /> Reset
          </button>
        </Row>
      </div>
    </>
  );
}

function CliSetupPanel() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/installer/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        toast.error("Failed to load CLI status");
      }
    } catch (err) {
      toast.error("Failed to connect to installer API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  const runInstall = async (slug: string | null) => {
    setLogs([]);
    setProgress(0);
    setCurrentMessage(slug ? `Initializing install for ${slug}...` : "Initializing all CLI installs...");
    setInstallingSlug(slug || "all");
    setShowLogs(true);

    try {
      const url = slug ? `/installer/install/${slug}` : "/installer/install";
      const body = slug ? undefined : { slugs: null };
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        timeoutMs: 1200000,
      });

      if (!res.ok) {
        const text = await res.text();
        setLogs((prev) => [...prev, `[ERROR] Failed to start install: ${text}`]);
        setCurrentMessage("Installation failed to start.");
        return;
      }

      await readSseJsonStream(res, (event) => {
        const { slug: evSlug, status: evStatus, message, progress_pct } = event as any;
        if (evStatus === "stream_end") {
          return;
        }
        if (evStatus === "done") {
          toast.success(`${evSlug} installation completed!`);
        } else if (evStatus === "error") {
          toast.error(`${evSlug} installation failed: ${message}`);
        }
        setProgress(progress_pct || 0);
        setCurrentMessage(message || "");
        setLogs((prev) => [...prev, `[${evSlug.toUpperCase()}] ${message}`]);
      });
    } catch (err: any) {
      setLogs((prev) => [...prev, `[ERROR] ${err.message || err}`]);
      setCurrentMessage("Installation interrupted by an error.");
      toast.error("Install failed");
    } finally {
      setInstallingSlug(null);
      void fetchStatus();
    }
  };

  const runVerify = async (slug: string) => {
    try {
      const res = await apiFetch(`/installer/verify/${slug}`);
      if (res.ok) {
        const info = await res.json();
        toast.success(`${info.name} status: ${info.installed ? "Available (" + info.version + ")" : "Not found"}`);
        void fetchStatus();
      } else {
        toast.error(`Verification failed for ${slug}`);
      }
    } catch {
      toast.error("Network error verifying CLI");
    }
  };

  if (!status && loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  const isInstalling = installingSlug !== null;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <SectionTitle title="CLI Setup" sub="Check, install, and update local coding CLI tools." />
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchStatus()}
            disabled={loading || isInstalling}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200/70 bg-white px-2.5 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => void runInstall(null)}
            disabled={isInstalling || !status?.node?.installed}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            Install All
          </button>
        </div>
      </div>

      {status?.node && (
        <div className={`mb-6 rounded-2xl border p-4 ${status.node.installed && status.node.meets_requirement ? "border-zinc-200/70 bg-zinc-50/50 dark:border-white/[0.06] dark:bg-white/[0.01]" : "border-amber-300/40 bg-amber-500/[0.04] dark:border-amber-500/25 dark:bg-amber-500/[0.02]"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${status.node.installed && status.node.meets_requirement ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"}`}>
                <TerminalIcon className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">Node.js Runtime</h3>
                <p className="text-[11px] text-zinc-500">
                  {status.node.installed 
                    ? `Found version ${status.node.version} (npm ${status.node.npm_version})` 
                    : "Node.js 18+ is required to install and run CLI tools."}
                </p>
              </div>
            </div>
            {!status.node.installed && (
              <button
                onClick={() => void runInstall("node")}
                disabled={isInstalling}
                className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
              >
                Install Node.js
              </button>
            )}
          </div>
        </div>
      )}

      {showLogs && (
        <div className="mb-6 rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-zinc-950 p-4 font-mono text-[11px] text-zinc-300">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${isInstalling ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
              <span className="font-semibold text-zinc-400">Installation Console</span>
            </div>
            <button 
              onClick={() => setShowLogs(false)} 
              disabled={isInstalling}
              className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
            >
              Hide
            </button>
          </div>
          <div className="mb-2 text-zinc-400 font-medium">{currentMessage}</div>
          {isInstalling && (
            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mb-3">
              <div 
                className="bg-indigo-500 h-full transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
            {logs.map((log, index) => (
              <div key={index} className={log.includes("[ERROR]") ? "text-rose-400" : log.includes("[SYSTEM]") ? "text-indigo-400" : ""}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {status?.clis?.map((cli: any) => (
          <div 
            key={cli.slug} 
            className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-white p-4 transition hover:bg-zinc-50/50 dark:border-white/[0.06] dark:bg-white/[0.01] dark:hover:bg-white/[0.02]"
          >
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2.5">
                <span className="text-[12.5px] font-semibold text-zinc-800 dark:text-zinc-200">{cli.name}</span>
                {cli.api_only ? (
                  <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-400">
                    API-Key only
                  </span>
                ) : cli.installed ? (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    Installed {cli.version && `(${cli.version.substring(0, 10)})`}
                  </span>
                ) : (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
                    Not Installed
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11.5px] text-zinc-500 leading-normal">{cli.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cli.specialties?.map((tag: string) => (
                  <span 
                    key={tag} 
                    className="rounded-md border border-zinc-200/50 px-1.5 py-0.5 text-[9px] text-zinc-500 dark:border-white/[0.05]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {cli.fallback_doc_url && (
                <a
                  href={cli.fallback_doc_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-zinc-200/70 bg-white px-2.5 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200"
                >
                  Docs
                </a>
              )}
              {!cli.api_only && (
                <>
                  {cli.installed && (
                    <button
                      onClick={() => void runVerify(cli.slug)}
                      disabled={loading || isInstalling}
                      className="rounded-md border border-zinc-200/70 bg-white px-2.5 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200"
                    >
                      Verify
                    </button>
                  )}
                  <button
                    onClick={() => void runInstall(cli.slug)}
                    disabled={isInstalling || !status?.node?.installed}
                    className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${cli.installed ? "border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.06] dark:text-zinc-400" : "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"}`}
                  >
                    {cli.installed ? "Reinstall" : "Install"}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AboutPanel() {
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "up-to-date" | "available"
  >("idle");
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const isDesktop = Boolean(window.orchestratorDesktop?.isDesktop);
  const appVersion = window.electronAPI?.appVersion ?? "0.9.1";

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    // preload subscribe returns an off() handle — capture both so HMR
    // remounts and unmounts don't stack duplicate listeners (otherwise update
    // events would fire 2x, 3x, ... per actual emit).
    const offAvailable = api.onUpdateAvailable?.((info) => {
      setAvailableVersion(info.version);
      setUpdateStatus("available");
    });
    const offNotAvailable = api.onUpdateNotAvailable?.(() =>
      setUpdateStatus("up-to-date"),
    );
    return () => {
      offAvailable?.();
      offNotAvailable?.();
    };
  }, []);

  const checkForUpdates = () => {
    setUpdateStatus("checking");
    window.electronAPI?.checkForUpdates?.();
    // Fallback if the updater never answers (e.g. offline, unpacked build);
    // functional update so we read the CURRENT status, not a stale closure.
    window.setTimeout(
      () => setUpdateStatus((s) => (s === "checking" ? "up-to-date" : s)),
      15_000,
    );
  };

  return (
    <>
      <SectionTitle title="About" sub="Orchestrator · the local conductor for AI coding agents." />
      <div className="rounded-2xl border border-zinc-200/70 bg-gradient-to-br from-indigo-50 to-white px-6 py-6 dark:border-white/[0.06] dark:from-indigo-500/[0.06] dark:to-zinc-950/40">
        <div className="flex items-center gap-3">
          <OrchestratorLogo size={40} className="drop-shadow-[0_0_18px_rgba(139,92,246,0.55)]" />
          <div>
            <div className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-[15px] tracking-tight text-transparent">
              Orchestrator
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              v{appVersion} · single-user desktop
            </div>
          </div>
        </div>
        <p className="mt-4 max-w-md text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          MIT licensed. Multi-agent orchestration platform that coordinates Claude, Gemini,
          Codex, Copilot, DeepSeek, Kimi, Cline, and Grok orchestrator routing.
        </p>
        <div className="mt-4 flex items-center gap-3">
          {isDesktop ? (
            <button
              type="button"
              onClick={checkForUpdates}
              disabled={updateStatus === "checking"}
              className="flex items-center gap-1.5 rounded-md border border-zinc-200/70 bg-white px-2.5 py-1.5 text-[11.5px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200"
            >
              <RefreshCw className={`h-3 w-3 ${updateStatus === "checking" ? "animate-spin" : ""}`} />
              {updateStatus === "checking" ? "Checking…" : "Check for updates"}
            </button>
          ) : (
            <span className="font-mono text-[10.5px] text-zinc-500">
              auto-update available in the desktop app
            </span>
          )}
          {updateStatus === "up-to-date" && (
            <span className="flex items-center gap-1 rounded-md border border-emerald-300/40 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.08] dark:text-emerald-300">
              <Check className="h-2.5 w-2.5" /> Up to date
            </span>
          )}
          {updateStatus === "available" && availableVersion && (
            <span className="flex items-center gap-1 rounded-md border border-indigo-300/40 bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/[0.08] dark:text-indigo-300">
              v{availableVersion} available — downloading…
            </span>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <a
            href="https://github.com/MdAhbab/OrchestratorCLI"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-zinc-200/70 bg-white px-2.5 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200"
          >
            GitHub
          </a>
          <a
            href="https://github.com/MdAhbab/OrchestratorCLI/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-zinc-200/70 bg-white px-2.5 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200"
          >
            Changelog
          </a>
        </div>
      </div>
    </>
  );
}

const inp =
  "rounded-md border border-zinc-200/70 bg-white px-2 py-1.5 text-[12px] text-zinc-800 outline-none focus:border-indigo-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200";
