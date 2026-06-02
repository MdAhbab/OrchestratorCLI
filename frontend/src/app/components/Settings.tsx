import { useState, useEffect } from "react";
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
} from "lucide-react";
import { ACCENT_COLORS, useStore, type AuthMethod, type Provider } from "./store";
import { OrchestratorLogo } from "./OrchestratorLogo";
import { useTheme } from "./theme";
import { Dropdown } from "./Sidebar";
import { TerminalCard, type CliRuntime } from "./TerminalCard";
import { ContextDropzone, INITIAL_CTX, type CtxFile } from "./ContextDropzone";
import { apiFetch, apiPath } from "../lib/api";
import { orchestratorToApiPayload } from "../lib/orchestratorConfig";
import { CliInstallHint } from "./CliInstallHint";
import { SessionHistory } from "./SessionHistory";

type Tab =
  | "general"
  | "providers"
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

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1200px] flex-col md:flex-row">
        {/* Mobile: horizontal scrollable tab bar */}
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-200/70 bg-white/40 px-3 py-2 backdrop-blur scrollbar-hide dark:border-white/[0.06] dark:bg-zinc-950/40 md:hidden">
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

        {/* Desktop sidebar */}
        <aside className="hidden w-[260px] shrink-0 border-r border-zinc-200/70 bg-white/40 px-3 py-5 backdrop-blur dark:border-white/[0.06] dark:bg-zinc-950/40 md:block">
          <button
            onClick={onClose}
            className="mb-5 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>
          <div className="px-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Settings
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
  return (
    <>
      <SectionTitle title="General" sub="Workspace location, appearance, and typography." />

      <div className="rounded-xl border border-zinc-200/70 bg-white/60 px-4 dark:border-white/[0.06] dark:bg-zinc-950/40">
        <Row title="Workspace folder" desc={workspace?.path || "Not set"}>
          <button
            onClick={async () => {
              const saveManualPath = (hint?: string) => {
                const value = window.prompt(
                  hint
                    ? `Selected "${hint}". Paste the full folder path so the backend can use it.`
                    : "Paste the full workspace folder path.",
                  workspace?.path || "",
                );
                const path = value?.trim();
                if (!path) return;
                const name = path.split(/[/\\]/).filter(Boolean).pop() || hint || "workspace";
                setWorkspace({ path, name });
              };
              try {
                // @ts-ignore
                if (window.showDirectoryPicker) {
                  // @ts-ignore
                  const h = await window.showDirectoryPicker();
                  saveManualPath(h?.name || "workspace");
                  return;
                }
              } catch {
                return;
              }
              saveManualPath();
            }}
            className="rounded-md border border-zinc-200/70 bg-white px-3 py-1.5 text-[11.5px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-200 dark:hover:bg-white/[0.06]"
          >
            Change…
          </button>
        </Row>
        <Row title="Theme" desc="Dark, light, or system">
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

function ProvidersPanel() {
  const { providers, setProviders } = useStore();
  return (
    <>
      <SectionTitle title="Providers" sub="Manage every CLI's credentials and default model." />
      <div className="space-y-2">
        {providers.map((p) => (
          <ProviderRow
            key={p.id}
            p={p}
            onChange={(np) =>
              setProviders((prev) => prev.map((x) => (x.id === p.id ? np : x)))
            }
          />
        ))}
      </div>
    </>
  );
}

function ProviderRow({ p, onChange }: { p: Provider; onChange: (p: Provider) => void }) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [secret, setSecret] = useState("");
  const [hasStoredCredential, setHasStoredCredential] = useState(p.configured);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHasStoredCredential(p.configured);
  }, [p.configured]);

  useEffect(() => {
    if (!open || !p.dbId) return;
    let cancelled = false;
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
          {p.authMethod === "ssh" ? (
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
            </div>
          )}
          <CliInstallHint providerId={p.id} />
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
          <TerminalCard key={c.id} cli={c} defaultMenuOpen={false} />
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
        <Row title="Auto-generated files" desc="Let the orchestrator write divisions.md & task-graph.md">
          <Toggle on={true} onChange={() => {}} />
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
        <Row title="Rate-limit warnings" desc="Notify at 85% quota burn">
          <Toggle on={true} onChange={() => {}} />
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
  { combo: "⌘ ⇧ V", action: "Voice dictation" },
  { combo: "⌘ ⇧ N", action: "New session" },
  { combo: "⌘ Enter", action: "Dispatch to orchestrator" },
  { combo: "Esc", action: "Cancel current job" },
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
        <Row title="Credential storage" desc="OS keychain (Keychain / Credential Vault / libsecret)">
          <span className="font-mono text-[10.5px] text-zinc-500">os keychain</span>
        </Row>
        <Row title="Session storage" desc="YAML files inside your workspace folder">
          <span className="font-mono text-[10.5px] text-zinc-500">.orchestrator/sessions/</span>
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

function AboutPanel() {
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "up-to-date" | "available"
  >("idle");
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI as
      | {
          onUpdateAvailable?: (cb: (info: { version: string }) => void) => void;
          onUpdateNotAvailable?: (cb: () => void) => void;
        }
      | undefined;
    if (!api) return;
    api.onUpdateAvailable?.((info) => {
      setAvailableVersion(info.version);
      setUpdateStatus("available");
    });
    api.onUpdateNotAvailable?.(() => setUpdateStatus("up-to-date"));
  }, []);

  const checkForUpdates = () => {
    setUpdateStatus("checking");
    setTimeout(() => {
      if (updateStatus === "checking") setUpdateStatus("up-to-date");
    }, 10_000);
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
              v0.8.0 · single-user desktop
            </div>
          </div>
        </div>
        <p className="mt-4 max-w-md text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          MIT licensed. Multi-agent orchestration platform that coordinates Claude, Gemini,
          Codex, Copilot, DeepSeek, Kimi, Cline, and Grok orchestrator routing.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={checkForUpdates}
            disabled={updateStatus === "checking"}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200/70 bg-white px-2.5 py-1.5 text-[11.5px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200"
          >
            <RefreshCw className={`h-3 w-3 ${updateStatus === "checking" ? "animate-spin" : ""}`} />
            {updateStatus === "checking" ? "Checking…" : "Check for updates"}
          </button>
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
            href="https://github.com/MdAhbab/IBMbob"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-zinc-200/70 bg-white px-2.5 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200"
          >
            GitHub
          </a>
          <a
            href="https://github.com/MdAhbab/IBMbob/blob/main/CHANGELOG.md"
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
