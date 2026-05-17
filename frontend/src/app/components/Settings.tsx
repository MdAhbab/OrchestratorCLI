import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Bell,
  Check,
  CircleAlert,
  Cpu,
  Eye,
  EyeOff,
  Folder,
  Info,
  Keyboard,
  Layers,
  Moon,
  Plug,
  Save,
  ShieldCheck,
  Sun,
  Terminal as TerminalIcon,
  Trash2,
  Type,
} from "lucide-react";
import { useStore, type AuthMethod, type Provider } from "./store";
import { OrchestratorLogo } from "./OrchestratorLogo";
import { useTheme } from "./theme";
import { Dropdown } from "./Sidebar";
import { TerminalCard, type CliRuntime } from "./TerminalCard";
import { ContextDropzone, INITIAL_CTX, type CtxFile } from "./ContextDropzone";
import { apiPath } from "../lib/api";

type Tab =
  | "general"
  | "providers"
  | "terminals"
  | "orchestrator"
  | "context"
  | "notifications"
  | "shortcuts"
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
        on ? "bg-indigo-500" : "bg-zinc-300 dark:bg-white/15"
      }`}
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
              try {
                // @ts-ignore
                if (window.showDirectoryPicker) {
                  // @ts-ignore
                  const h = await window.showDirectoryPicker();
                  setWorkspace({ path: `~/${h.name}`, name: h.name });
                }
              } catch {}
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
            {["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#a855f7"].map((c) => (
              <button
                key={c}
                className="h-5 w-5 rounded-full ring-2 ring-transparent transition hover:ring-zinc-300 dark:hover:ring-white/30"
                style={{ background: c }}
              />
            ))}
          </div>
        </Row>
      </div>
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !p.dbId) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(apiPath(`/providers/${p.dbId}/credentials`));
        if (r.ok && !cancelled) {
          const j = await r.json();
          setSecret((j.api_key as string) || "");
        }
      } catch {
        if (!cancelled) setSecret("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, p.dbId]);

  const persistEnabled = (v: boolean) => {
    onChange({ ...p, enabled: v });
    if (p.dbId) {
      void fetch(apiPath(`/providers/${p.dbId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: v }),
      });
    }
  };

  const save = async () => {
    if (!p.dbId) return;
    setBusy(true);
    try {
      await fetch(apiPath(`/providers/${p.dbId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: p.enabled, default_model: p.model }),
      });
      if ((p.authMethod === "api_key" || p.authMethod === "bearer") && secret.trim()) {
        const r = await fetch(apiPath(`/providers/${p.dbId}/credentials`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credential_name: "default",
            api_key: secret.trim(),
          }),
        });
        if (!r.ok) {
          console.warn("credential save failed", await r.text());
        }
      }
      onChange({ ...p, configured: !!(p.authMethod === "account" ? p.accountEmail : secret) });
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!p.dbId) return;
    setBusy(true);
    try {
      await fetch(apiPath(`/providers/${p.dbId}/credentials`), { method: "DELETE" });
      setSecret("");
      onChange({ ...p, configured: false });
    } catch (e) {
      console.error(e);
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

const ORCH_MODELS = ["granite-3.2-instruct", "granite-3.2-code", "granite-3.1-instruct"] as const;
const ROUTING = ["specialty", "round_robin", "cheapest", "fastest"] as const;
const ROUTING_LABELS: Record<string, string> = {
  specialty: "Specialty-based (recommended)",
  round_robin: "Round-robin",
  cheapest: "Cheapest first",
  fastest: "Fastest p95",
};

function OrchestratorPanel() {
  const { orchestrator, setOrchestrator } = useStore();
  return (
    <>
      <SectionTitle title="Orchestrator" sub="The IBM Cloud agent that divides tasks across your CLIs." />
      <div className="rounded-xl border border-zinc-200/70 bg-white/60 px-4 dark:border-white/[0.06] dark:bg-zinc-950/40">
        <Row title="Orchestrator model" desc="Custom agent built on IBM Granite via IBM Cloud">
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
      </div>
    </>
  );
}

function ContextPanel() {
  const { prefs, setPrefs } = useStore();
  const [files, setFiles] = useState<CtxFile[]>(INITIAL_CTX);
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
        <ContextDropzone files={files} setFiles={setFiles} />
      </div>
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

function PrivacyPanel() {
  const { reset } = useStore();
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
        <Row title="Reset everything" desc="Wipe local state and walk through onboarding again">
          <button
            onClick={() => {
              if (confirm("Reset Orchestrator to defaults? This will re-run onboarding.")) reset();
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
              v1.0.0-beta · commit 9c8b3a2
            </div>
          </div>
        </div>
        <p className="mt-4 max-w-md text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          MIT licensed. Built with React, Tailwind, and a tiny IBM-Cloud-powered routing agent
          that orchestrates Claude, Gemini, Codex, Copilot, DeepSeek, Kimi, Cline, and BOB.
        </p>
        <div className="mt-4 flex gap-2">
          <a className="rounded-md border border-zinc-200/70 bg-white px-2.5 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200">
            Docs
          </a>
          <a className="rounded-md border border-zinc-200/70 bg-white px-2.5 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200">
            GitHub
          </a>
          <a className="rounded-md border border-zinc-200/70 bg-white px-2.5 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200">
            Changelog
          </a>
        </div>
      </div>
    </>
  );
}

const inp =
  "rounded-md border border-zinc-200/70 bg-white px-2 py-1.5 text-[12px] text-zinc-800 outline-none focus:border-indigo-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200";
