import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  ArrowRight,
  ArrowLeft,
  AtSign,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  Globe2,
  KeyRound,
  Mail,
  Moon,
  Plug,
  Rocket,
  Sun,
  Terminal,
  ShieldCheck,
  Clock3,
  UserCircle2,
} from "lucide-react";
import { useStore, type AuthMethod, type Provider } from "./store";
import { useTheme } from "./theme";
import { OrchestratorLogo } from "./OrchestratorLogo";
import { apiFetch, apiPath, isAbortError } from "../lib/api";
import { CliInstallHint } from "./CliInstallHint";
import { sortProvidersByHealth } from "../lib/providerSort";

type CliCfg = {
  method: AuthMethod;
  email: string;
  secret: string;
  endpoint: string;
  keyPath: string;
  model: string;
  override: boolean;
};

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { providers, setProviders, setWorkspace, setOnboarded } = useStore();
  const { theme, toggle } = useTheme();
  const [step, setStep] = useState(0);
  const [folderPath, setFolderPath] = useState("");
  const [pickedFolderName, setPickedFolderName] = useState("");
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>(
    providers.filter((p) => p.enabled).map((p) => p.id)
  );
  const [sharedEmail, setSharedEmail] = useState("");
  const [cliCfg, setCliCfg] = useState<Record<string, CliCfg>>({});
  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("orch.recent_workspaces");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecentFolders(parsed);
        }
      }
    } catch {}
  }, []);

  const cliList = useMemo(
    () => providers.filter((p) => selected.includes(p.id)),
    [providers, selected]
  );

  useEffect(() => {
    setCliCfg((prev) => {
      const next = { ...prev };
      for (const p of cliList) {
        if (!next[p.id]) {
          next[p.id] = {
            method: p.authMethod,
            email: "",
            secret: "",
            endpoint: p.endpoint || "",
            keyPath: "~/.ssh/id_ed25519",
            model: p.model,
            override: false,
          };
        }
      }
      return next;
    });
  }, [cliList]);

  const totalSteps = 6;
  const progress = Math.min(1, (step + 1) / totalSteps);

  const isDesktop = Boolean(window.orchestratorDesktop?.isDesktop);

  const pickFolder = async () => {
    const prevPath = folderPath;
    const selectWorkspaceFolder = window.electronAPI?.selectWorkspaceFolder;
    if (selectWorkspaceFolder) {
      const desktopPath = await selectWorkspaceFolder();
      if (desktopPath) {
        setFolderPath(desktopPath);
        setPickedFolderName("");
      } else {
        // User canceled native picker — keep previous value
        if (prevPath) toast.info("Workspace unchanged.");
      }
      return;
    }

    try {
      // @ts-ignore
      if (window.showDirectoryPicker) {
        // @ts-ignore
        const handle = await window.showDirectoryPicker();
        const name = handle?.name || "";
        setPickedFolderName(name);
        const value = window.prompt(
          name
            ? `Selected "${name}". Paste the full folder path so the backend can use it.`
            : "Paste the full workspace folder path.",
          folderPath,
        );
        if (value?.trim()) {
          setFolderPath(value.trim());
        }
        return;
      }
    } catch {}
    const value = window.prompt("Paste the full workspace folder path.", folderPath);
    if (value?.trim()) setFolderPath(value.trim());
  };

  const resolveWorkspacePath = () => {
    const trimmed = folderPath.trim();
    if (trimmed) return trimmed;
    return "";
  };

  const handleFolderPathChange = (value: string) => {
    setFolderPath(value);
    if (value.trim()) setPickedFolderName("");
  };

  const finish = async () => {
    if (saving) return;
    setFinishError(null);
    setSaving(true);

    const workspacePath = resolveWorkspacePath();
    if (!workspacePath) {
      setFinishError("Choose a workspace folder path first.");
      setSaving(false);
      return;
    }
    const workspaceName =
      workspacePath.split(/[/\\]/).filter(Boolean).pop() || "workspace";

    // Persist to the backend (encrypted credentials, enabled flags, prefs).
    try {
      const cli_configs: Record<string, any> = {};
      for (const id of selected) {
        const c = cliCfg[id];
        if (!c) continue;
        const effectiveEmail =
          c.method === "account"
            ? (c.override ? c.email.trim() : sharedEmail.trim())
            : undefined;
        const provider = providers.find((p) => p.id === id);
        const secret =
          c.method === "api_key" || c.method === "bearer"
            ? c.secret.trim()
            : "";
        cli_configs[id] = {
          method: c.method,
          email: effectiveEmail,
          accountEmail: effectiveEmail,
          accountProvider: provider?.accountProvider,
          accountPlan:
            c.method === "account"
              ? `${provider?.accountProvider || provider?.name || id} plan`
              : undefined,
          secret: secret || undefined,
          endpoint: c.method === "ssh" ? c.endpoint : provider?.endpoint,
          keyPath: c.method === "ssh" ? c.keyPath : undefined,
          model: c.model,
        };
      }

      const res = await apiFetch("/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 15_000,
        body: JSON.stringify({
          workspace: {
            path: workspacePath,
            name: workspaceName,
          },
          selected,
          cli_configs,
          shared_email: sharedEmail.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("onboarding persist failed", detail);
        let message = `Could not save setup (HTTP ${res.status}).`;
        try {
          const parsed = JSON.parse(detail) as { detail?: string | { msg?: string }[] };
          if (typeof parsed.detail === "string") message = parsed.detail;
          else if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
            message = parsed.detail.map((d) => d.msg).join("; ");
          }
        } catch {
          if (detail) message = detail.slice(0, 240);
        }
        setFinishError(
          `${message} Is the backend running? Start it with: python run.py`
        );
        return;
      }

      setWorkspace({ path: workspacePath, name: workspaceName });
      setProviders((prev) =>
        prev.map((p) => {
          if (!selected.includes(p.id)) return { ...p, enabled: false };
          const c = cliCfg[p.id];
          if (!c) return { ...p, enabled: true };
          const effectiveEmail =
            c.method === "account"
              ? c.override
                ? c.email.trim()
                : sharedEmail.trim()
              : undefined;
          return {
            ...p,
            enabled: true,
            configured: true,
            authMethod: c.method,
            endpoint: c.method === "ssh" ? c.endpoint : p.endpoint,
            model: c.model,
            accountEmail: effectiveEmail,
            accountPlan:
              c.method === "account"
                ? `${p.accountProvider || p.name} plan`
                : undefined,
          };
        })
      );
      try {
        const raw = localStorage.getItem("orch.recent_workspaces");
        const list = raw ? JSON.parse(raw) : [];
        const nextList = [workspacePath, ...list.filter((x: string) => x !== workspacePath)].slice(0, 5);
        localStorage.setItem("orch.recent_workspaces", JSON.stringify(nextList));
      } catch {}
      setOnboarded(true);
      onDone();
    } catch (err) {
      console.error("onboarding persist failed:", err);
      setFinishError(
        isAbortError(err)
          ? "Saving timed out. The backend did not answer within 15 seconds. Restart it with: python run.py --no-reload"
          : "Could not reach the backend. Start it with: python run.py (backend should listen on port 8000)."
      );
      return;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#fafafa] dark:bg-[#070709]">
      <div className="pointer-events-none absolute inset-0 bg-grid-light" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 0%, rgba(99,102,241,0.12), transparent 40%), radial-gradient(circle at 85% 100%, rgba(168,85,247,0.10), transparent 45%)",
        }}
      />

      <div className="relative z-10 w-full max-w-3xl px-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <OrchestratorLogo size={36} className="drop-shadow-[0_0_14px_rgba(139,92,246,0.5)]" />
            <div className="leading-tight">
              <div className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-[14px] tracking-tight text-transparent">
                Orchestrator
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                first-time setup
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="rounded-lg border border-zinc-200/70 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => {
                setOnboarded(true);
                onDone();
              }}
              disabled={saving}
              className="rounded-lg border border-zinc-200/70 bg-white px-3 py-1.5 text-[11px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300"
            >
              Skip setup
            </button>
          </div>
        </div>

        <div className="mb-5 flex items-center gap-2">
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-white/[0.06]">
            <motion.div
              animate={{ width: `${progress * 100}%` }}
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-violet-500"
            />
          </div>
          <span className="font-mono text-[10px] text-zinc-500">
            step {Math.min(step + 1, totalSteps)} / {totalSteps}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/80 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)] backdrop-blur dark:border-white/[0.07] dark:bg-zinc-950/60">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.22 }}
            >
              {step === 0 && (
                <StepWelcome
                  onNext={() => setStep(1)}
                  theme={theme}
                  toggleTheme={toggle}
                />
              )}
              {step === 1 && (
                <StepWorkspace
                  folderPath={folderPath}
                  setFolderPath={handleFolderPathChange}
                  pickFolder={pickFolder}
                  pickedFolderName={pickedFolderName}
                  recentFolders={recentFolders}
                  isDesktop={isDesktop}
                  onBack={() => setStep(0)}
                  onNext={() => setStep(2)}
                />
              )}
              {step === 2 && (
                <StepSelectClis
                  providers={providers}
                  selected={selected}
                  setSelected={setSelected}
                  onBack={() => setStep(1)}
                  onNext={() => setStep(3)}
                />
              )}
              {step === 3 && (
                <StepSharedAccount
                  providers={cliList}
                  sharedEmail={sharedEmail}
                  setSharedEmail={setSharedEmail}
                  onBack={() => setStep(2)}
                  onNext={() => setStep(4)}
                />
              )}
              {step === 4 && (
                <StepConfigureAll
                  providers={cliList}
                  cliCfg={cliCfg}
                  setCliCfg={setCliCfg}
                  sharedEmail={sharedEmail}
                  onBack={() => setStep(3)}
                  onNext={() => setStep(5)}
                />
              )}
              {step === 5 && (
                <StepReview
                  workspace={resolveWorkspacePath()}
                  enabled={selected.map((id) => providers.find((p) => p.id === id)!)}
                  cliCfg={cliCfg}
                  sharedEmail={sharedEmail}
                  saving={saving}
                  error={finishError}
                  onBack={() => setStep(4)}
                  onFinish={finish}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-3 text-center font-mono text-[10px] text-zinc-400">
          your workspace + credentials live on-device · nothing leaves your machine
        </div>
      </div>
    </div>
  );
}

function StepWelcome({
  onNext,
  theme,
  toggleTheme,
}: {
  onNext: () => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
}) {
  return (
    <div className="px-8 py-10">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-indigo-500">
        <Rocket className="h-3 w-3" />
        Welcome
      </div>
      <h1 className="mt-3 text-[34px] leading-[1.05] tracking-[-0.03em] text-zinc-900 dark:text-white">
        Let's orchestrate every AI <br className="hidden md:block" />
        CLI you use.
      </h1>
      <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-zinc-500">
        We'll pick a workspace folder, choose which CLIs you want to use, and walk you
        through authentication for the ones that aren't set up yet. Takes ~2 minutes.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-2">
        {[
          { i: Plug, t: "Connect CLIs", s: "OAuth · API · SSH" },
          { i: ShieldCheck, t: "Local-only", s: "Zero telemetry" },
          { i: Clock3, t: "Fast switch", s: "<5s failover" },
        ].map(({ i: I, t, s }) => (
          <div
            key={t}
            className="rounded-xl border border-zinc-200/70 bg-zinc-50/60 px-3 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]"
          >
            <I className="h-3.5 w-3.5 text-zinc-500" />
            <div className="mt-2 text-[12px] text-zinc-900 dark:text-white">{t}</div>
            <div className="font-mono text-[10px] text-zinc-500">{s}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-xl border border-zinc-200/70 bg-zinc-50/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div className="flex items-center gap-2">
          {theme === "dark" ? (
            <Moon className="h-3.5 w-3.5 text-indigo-400" />
          ) : (
            <Sun className="h-3.5 w-3.5 text-amber-500" />
          )}
          <span className="text-[12px] text-zinc-700 dark:text-zinc-300">
            Appearance · {theme === "dark" ? "Dark" : "Light"}
          </span>
        </div>
        <button
          onClick={toggleTheme}
          className="rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300"
        >
          Switch
        </button>
      </div>

      <div className="mt-8 flex justify-end">
        <PrimaryBtn onClick={onNext}>
          Get started <ArrowRight className="h-3.5 w-3.5" />
        </PrimaryBtn>
      </div>
    </div>
  );
}

function StepWorkspace({
  folderPath,
  setFolderPath,
  pickFolder,
  pickedFolderName,
  recentFolders,
  isDesktop,
  onBack,
  onNext,
}: {
  folderPath: string;
  setFolderPath: (v: string) => void;
  pickFolder: () => void;
  pickedFolderName: string;
  recentFolders: string[];
  isDesktop: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const [isValidating, setIsValidating] = useState(false);
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Manual-validate button state (for browser mode or manual entry)
  const [manualValidating, setManualValidating] = useState(false);

  const looksLikeFullPath = (value: string) =>
    /^(~[\\/]|~$|[a-zA-Z]:[\\/]|\\\\|\/)/.test(value.trim());

  useEffect(() => {
    const trimmed = folderPath.trim();
    if (!trimmed) {
      setPathValid(null);
      setValidationError(null);
      return;
    }

    if (!looksLikeFullPath(trimmed)) {
      setPathValid(false);
      setValidationError("Paste a full path, for example C:\\Projects\\my-app or ~/projects/app.");
      return;
    }

    setIsValidating(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/workspace/validate-path?path=${encodeURIComponent(trimmed)}`,
          { timeoutMs: 10_000 },
        );
        if (res.ok) {
          const data = await res.json();
          setPathValid(!!data.valid);
          setValidationError(data.error || null);
        } else {
          setPathValid(false);
          setValidationError("Failed to communicate with validation service.");
        }
      } catch (err) {
        setPathValid(false);
        setValidationError("Validation service offline.");
      } finally {
        setIsValidating(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [folderPath]);

  const handleManualValidate = async () => {
    const trimmed = folderPath.trim();
    if (!trimmed) return;
    setManualValidating(true);
    try {
      const res = await apiFetch(
        `/workspace/validate-path?path=${encodeURIComponent(trimmed)}`,
        { timeoutMs: 10_000 },
      );
      if (res.ok) {
        const data = await res.json();
        setPathValid(!!data.valid);
        setValidationError(data.error || null);
        if (data.valid) {
          toast.success("Workspace path is valid.");
        } else {
          toast.error(data.error || "Invalid path.");
        }
      } else {
        setPathValid(false);
        setValidationError("Failed to communicate with validation service.");
        toast.error("Validation service error.");
      }
    } catch {
      setPathValid(false);
      setValidationError("Validation service offline.");
      toast.error("Validation service offline.");
    } finally {
      setManualValidating(false);
    }
  };

  return (
    <div className="px-8 py-10">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-indigo-500">
        <Folder className="h-3 w-3" /> Workspace folder
      </div>
      <h2 className="mt-3 text-[26px] leading-tight tracking-tight text-zinc-900 dark:text-white">
        Where should orchestra live?
      </h2>
      <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-zinc-500">
        Pick the project folder. Orchestrator reads <span className="font-mono">skill.md</span>,
        <span className="font-mono"> plan.md</span>, and writes
        <span className="font-mono"> divisions.md</span> here so every CLI shares the same
        context.
      </p>

      {/* Desktop: show native folder picker button */}
      {isDesktop && (
        <button
          onClick={pickFolder}
          className="mt-6 flex w-full items-center gap-3 rounded-xl border border-dashed border-zinc-300/80 bg-zinc-50/40 px-4 py-5 transition hover:border-indigo-400 hover:bg-indigo-50/30 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-indigo-400/50 dark:hover:bg-indigo-400/[0.05]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-zinc-900">
            <FolderOpen className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-[13px] text-zinc-900 dark:text-white">
              {folderPath
                ? folderPath
                : pickedFolderName
                ? `Selected: ${pickedFolderName}`
                : "Choose folder…"}
            </div>
            <div className="font-mono text-[10px] text-zinc-500">
              {folderPath
                ? "ready"
                : pickedFolderName
                ? "paste the full path below"
                : "click to open native picker"}
            </div>
          </div>
          {folderPath && pathValid === true && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        </button>
      )}

      <div className="mt-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Recent
        </div>
        {recentFolders.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {recentFolders.map((p) => (
              <button
                key={p}
                onClick={() => setFolderPath(p)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                  folderPath === p
                    ? "border-indigo-300 bg-indigo-50 dark:border-indigo-400/30 dark:bg-indigo-400/[0.08]"
                    : "border-zinc-200/70 bg-white hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.015] dark:hover:bg-white/[0.04]"
                }`}
              >
                <span className="font-mono text-[11.5px] text-zinc-700 dark:text-zinc-200">{p}</span>
                {folderPath === p && <Check className="h-3.5 w-3.5 text-indigo-500" />}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-1.5 rounded-lg border border-dashed border-zinc-200 p-3 text-center text-[11px] text-zinc-400 dark:border-white/10 dark:text-zinc-500">
            No recent workspaces yet. Choose a folder or type a path to get started.
          </div>
        )}
      </div>

      <div className="mt-4">
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
          {isDesktop ? "or type a path" : "Workspace path"}
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            value={folderPath}
            onChange={(e) => {
              setFolderPath(e.target.value);
            }}
            placeholder="~/projects/your-app"
            className="flex-1 rounded-lg border border-zinc-200/70 bg-white px-3 py-2 font-mono text-[12px] text-zinc-800 outline-none focus:border-indigo-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200"
          />
          <button
            type="button"
            onClick={() => void handleManualValidate()}
            disabled={!folderPath.trim() || manualValidating}
            className="shrink-0 rounded-lg border border-zinc-200/70 bg-white px-3 py-2 text-[12px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200 dark:hover:bg-white/[0.05]"
          >
            {manualValidating ? "Checking…" : "Validate"}
          </button>
        </div>
        {isValidating && !manualValidating && (
          <p className="mt-1 font-mono text-[10px] text-indigo-500 animate-pulse">Validating workspace path...</p>
        )}
        {!isValidating && !manualValidating && pathValid === true && (
          <p className="mt-1 font-mono text-[10px] text-emerald-500">
            Active workspace: {folderPath.trim()}
          </p>
        )}
        {!isValidating && !manualValidating && pathValid === false && (
          <p className="mt-1 font-mono text-[10px] text-rose-500">
            ✗ Invalid path: {validationError || "Directory parent does not exist or path format is incorrect."}
          </p>
        )}
      </div>

      <div className="mt-8 flex justify-between">
        <GhostBtn onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </GhostBtn>
        <PrimaryBtn onClick={onNext} disabled={!folderPath.trim() || pathValid === false || isValidating}>
          Continue <ArrowRight className="h-3.5 w-3.5" />
        </PrimaryBtn>
      </div>
    </div>
  );
}

function StepSelectClis({
  providers,
  selected,
  setSelected,
  onBack,
  onNext,
}: {
  providers: Provider[];
  selected: string[];
  setSelected: (s: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const sortedProviders = useMemo(() => sortProvidersByHealth(providers), [providers]);
  const unconfigured = sortedProviders.filter((p) => selected.includes(p.id) && !p.configured).length;

  return (
    <div className="px-8 py-10">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-indigo-500">
        <Plug className="h-3 w-3" /> Choose CLIs
      </div>
      <h2 className="mt-3 text-[26px] leading-tight tracking-tight text-zinc-900 dark:text-white">
        Which agents do you want?
      </h2>
      <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-zinc-500">
        Pick everything you plan to use. We'll walk through auth for{" "}
        <span className="text-zinc-900 dark:text-white">{unconfigured}</span> that aren't set up
        yet. You can add more later from Settings.
      </p>

      <div className="mt-6 grid max-h-[340px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 scrollbar-thin">
        {sortedProviders.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                on
                  ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-400/30 dark:bg-indigo-400/[0.06]"
                  : "border-zinc-200/70 bg-white hover:border-zinc-300 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-white/[0.15]"
              }`}
            >
              <span className={`${p.color} font-mono text-[18px] leading-none`}>{p.glyph}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] text-zinc-900 dark:text-white">{p.name}</span>
                  {p.configured && (
                    <span className="rounded-md border border-emerald-300/40 bg-emerald-50 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.08] dark:text-emerald-300">
                      configured
                    </span>
                  )}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
                  {p.description}
                </div>
              </div>
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  on
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : "border-zinc-300 dark:border-white/15"
                }`}
              >
                {on && <Check className="h-3 w-3" />}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <GhostBtn onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </GhostBtn>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span>{selected.length} selected</span>
          <PrimaryBtn onClick={onNext} disabled={selected.length === 0}>
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

function StepSharedAccount({
  providers,
  sharedEmail,
  setSharedEmail,
  onBack,
  onNext,
}: {
  providers: Provider[];
  sharedEmail: string;
  setSharedEmail: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const accountClis = providers.filter((p) => p.authMethods.includes("account"));
  const apiOnlyClis = providers.filter((p) => !p.authMethods.includes("account"));
  const emailValid = /.+@.+\..+/.test(sharedEmail.trim());

  return (
    <div className="px-8 py-10">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-indigo-500">
        <AtSign className="h-3 w-3" /> Shared account
      </div>
      <h2 className="mt-3 text-[26px] leading-tight tracking-tight text-zinc-900 dark:text-white">
        Add one email to map your account-based CLIs.
      </h2>
      <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-zinc-500">
        Account CLIs still open their own sign-in flows. We only store an email label for
        display and routing context. Any CLI that needs an API key or SSH gets its own row
        on the next step.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            Email (optional)
          </label>
          <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-zinc-200/70 bg-white px-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <Mail className="h-4 w-4 text-zinc-400" />
            <input
              type="email"
              value={sharedEmail}
              onChange={(e) => setSharedEmail(e.target.value)}
              placeholder="you@gmail.com"
              className="w-full bg-transparent py-2.5 text-[13px] text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
            />
            {emailValid && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          </div>
        </div>
      </div>
      <p className="mt-2 font-mono text-[9.5px] text-zinc-500">
        Account logins happen in the CLI itself. We never collect your password.
      </p>

      {accountClis.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Will reuse this account ({accountClis.length})
            </span>
            <span className="font-mono text-[9.5px] text-zinc-400">
              override per-CLI on next step
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {accountClis.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[10.5px] text-zinc-700 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-300"
              >
                <span className={`${p.color} font-mono text-[12px] leading-none`}>
                  {p.glyph}
                </span>
                {p.name}
                <span className="font-mono text-[9px] text-zinc-500">
                  · {p.accountProvider || "account"}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {apiOnlyClis.length > 0 && (
        <div className="mt-4 rounded-lg border border-zinc-200/70 bg-zinc-50/60 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-zinc-500">
            Needs its own credentials ({apiOnlyClis.length})
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {apiOnlyClis.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200/70 bg-white px-1.5 py-0.5 text-[10.5px] text-zinc-700 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-300"
              >
                <span className={`${p.color} font-mono text-[12px] leading-none`}>
                  {p.glyph}
                </span>
                {p.name}
                <span className="font-mono text-[9px] text-zinc-500">
                  · {p.authMethod.replace("_", " ")}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <GhostBtn onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </GhostBtn>
        <div className="flex items-center gap-2">
          <GhostBtn onClick={onNext}>Skip for now</GhostBtn>
          <PrimaryBtn
            onClick={onNext}
            disabled={accountClis.length > 0 && sharedEmail.trim().length > 0 && !emailValid}
          >
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

function StepConfigureAll({
  providers,
  cliCfg,
  setCliCfg,
  sharedEmail,
  onBack,
  onNext,
}: {
  providers: Provider[];
  cliCfg: Record<string, CliCfg>;
  setCliCfg: React.Dispatch<React.SetStateAction<Record<string, CliCfg>>>;
  sharedEmail: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(
    providers.find((p) => !p.authMethods.includes("account"))?.id ||
      providers[0]?.id ||
      null
  );

  const patch = (id: string, p: Partial<CliCfg>) =>
    setCliCfg((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));

  const sortedProviders = useMemo(() => sortProvidersByHealth(providers), [providers]);

  return (
    <div className="px-8 py-10">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-indigo-500">
        <KeyRound className="h-3 w-3" /> Authenticate CLIs
      </div>
      <h2 className="mt-3 text-[26px] leading-tight tracking-tight text-zinc-900 dark:text-white">
        One page, every CLI.
      </h2>
      <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-zinc-500">
        Account CLIs already inherit your shared email
        {sharedEmail && (
          <>
            {" "}
            (<span className="font-mono text-zinc-700 dark:text-zinc-300">{sharedEmail}</span>)
          </>
        )}
        . Expand any row to use a different email, paste an API key, or set SSH
        details.
      </p>

      <div className="mt-6 max-h-[420px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
        {sortedProviders.map((p) => {
          const c = cliCfg[p.id];
          if (!c) return null;
          const isOpen = expanded === p.id;
          const summary = rowSummary(p, c, sharedEmail);
          return (
            <div
              key={p.id}
              className={`rounded-xl border transition ${
                isOpen
                  ? "border-indigo-300 bg-indigo-50/40 dark:border-indigo-400/30 dark:bg-indigo-400/[0.04]"
                  : "border-zinc-200/70 bg-white dark:border-white/[0.06] dark:bg-white/[0.02]"
              }`}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : p.id)}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
              >
                <span className={`${p.color} font-mono text-[18px] leading-none`}>{p.glyph}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] text-zinc-900 dark:text-white">{p.name}</span>
                    <span className="rounded-md border border-zinc-200/70 bg-zinc-50 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-zinc-500 dark:border-white/[0.06] dark:bg-white/[0.04]">
                      {c.method.replace("_", " ")}
                    </span>
                    {isValid(c) && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-zinc-500">
                    {summary}
                  </div>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                )}
              </button>

              {isOpen && (
                <div className="border-t border-zinc-200/70 px-3.5 py-3 dark:border-white/[0.06]">
                  <ConfigureRow
                    provider={p}
                    cfg={c}
                    onChange={(patchObj) => patch(p.id, patchObj)}
                    sharedEmail={sharedEmail}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <GhostBtn onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </GhostBtn>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] text-zinc-500">
            {providers.filter((p) => isValid(cliCfg[p.id])).length}/{providers.length} ready
          </span>
          <PrimaryBtn onClick={onNext}>
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

function ConfigureRow({
  provider,
  cfg,
  onChange,
  sharedEmail,
}: {
  provider: Provider;
  cfg: CliCfg;
  onChange: (patch: Partial<CliCfg>) => void;
  sharedEmail: string;
}) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
          Auth method
        </label>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {provider.authMethods.map((m) => {
            const Icons: Record<AuthMethod, typeof KeyRound> = {
              api_key: KeyRound,
              oauth: Globe2,
              ssh: Terminal,
              bearer: KeyRound,
              account: UserCircle2,
            };
            const Labels: Record<AuthMethod, string> = {
              api_key: "api key",
              oauth: "oauth",
              ssh: "ssh",
              bearer: "bearer",
              account: "account",
            };
            const I = Icons[m];
            const active = cfg.method === m;
            return (
              <button
                key={m}
                onClick={() => onChange({ method: m })}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] transition ${
                  active
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-400/[0.08] dark:text-indigo-300"
                    : "border-zinc-200/70 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                }`}
              >
                <I className="h-3 w-3" />
                {Labels[m]}
              </button>
            );
          })}
        </div>
      </div>

      {cfg.method === "account" && (
        <>
          {!cfg.override && sharedEmail ? (
            <div className="flex items-center justify-between rounded-lg border border-indigo-300/40 bg-indigo-50/60 px-3 py-2 dark:border-indigo-400/30 dark:bg-indigo-400/[0.06]">
              <div className="flex min-w-0 items-center gap-2">
                <UserCircle2 className="h-4 w-4 shrink-0 text-indigo-500" />
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] text-zinc-900 dark:text-white">
                    {sharedEmail}
                  </div>
                  <div className="font-mono text-[9.5px] uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                    shared account
                  </div>
                </div>
              </div>
              <button
                onClick={() => onChange({ override: true, email: "" })}
                className="shrink-0 rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[10.5px] text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300"
              >
                Use different
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label={`${provider.accountProvider || provider.name} email`}>
                <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200/70 bg-white px-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <Mail className="h-3.5 w-3.5 text-zinc-400" />
                  <input
                    type="email"
                    value={cfg.email}
                    onChange={(e) => onChange({ email: e.target.value })}
                    placeholder={`you@${(provider.accountProvider || "example").toLowerCase()}.com`}
                    className="w-full bg-transparent py-2 text-[12.5px] text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
                  />
                </div>
              </Field>
              {sharedEmail && (
                <button
                  onClick={() => onChange({ override: false, email: "" })}
                  className="col-span-full justify-self-start rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[10.5px] text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300"
                >
                  ← back to shared account
                </button>
              )}
            </div>
          )}
        </>
      )}

      {cfg.method === "oauth" && (
        <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200/70 bg-white py-2.5 text-[12.5px] text-zinc-700 transition hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200 dark:hover:bg-white/[0.05]">
          <Globe2 className="h-3.5 w-3.5" />
          Sign in with {provider.name}
        </button>
      )}

      {cfg.method === "ssh" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Host (user@host:port)">
            <input
              value={cfg.endpoint}
              onChange={(e) => onChange({ endpoint: e.target.value })}
              placeholder="user@host:22"
              className={inputCls}
            />
          </Field>
          <Field label="Private key path">
            <input
              value={cfg.keyPath}
              onChange={(e) => onChange({ keyPath: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {(cfg.method === "api_key" || cfg.method === "bearer") && (
        <Field label={cfg.method === "api_key" ? "API key" : "Bearer token"}>
          <div className="flex items-center gap-1">
            <input
              type={showSecret ? "text" : "password"}
              value={cfg.secret}
              onChange={(e) => onChange({ secret: e.target.value })}
              placeholder="sk-…"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setShowSecret((s) => !s)}
              className="rounded-md border border-zinc-200/70 bg-white p-2 text-zinc-500 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-300"
            >
              {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </Field>
      )}

      <Field label="Default model">
        <Select value={cfg.model} onValueChange={(v) => onChange({ model: v })}>
          <SelectTrigger className="w-full font-mono text-[12.5px] dark:bg-white/[0.02] dark:border-white/[0.06] dark:text-zinc-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="font-mono text-[12.5px]">
            {provider.models.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <CliInstallHint providerId={provider.id} />
    </div>
  );
}

function rowSummary(p: Provider, c: CliCfg, sharedEmail: string) {
  if (c.method === "account") {
    const email = c.override ? c.email : sharedEmail;
    return email ? `${email} · ${c.model}` : `no email · ${c.model}`;
  }
  if (c.method === "ssh") return `${c.endpoint || "no host"} · ${c.model}`;
  if (c.method === "oauth") return `oauth · ${c.model}`;
  return `${c.secret ? "•••• " + c.secret.slice(-4) : "no key"} · ${c.model}`;
}

function isValid(c?: CliCfg) {
  if (!c) return false;
  if (c.method === "oauth") return true;
  if (c.method === "ssh") return c.endpoint.trim().length > 0;
  if (c.method === "account") return true;
  return c.secret.trim().length > 8;
}

function StepReview({
  workspace,
  enabled,
  cliCfg,
  sharedEmail,
  saving,
  error,
  onBack,
  onFinish,
}: {
  workspace: string;
  enabled: Provider[];
  cliCfg: Record<string, CliCfg>;
  sharedEmail: string;
  saving?: boolean;
  error?: string | null;
  onBack: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="px-8 py-10">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Ready
      </div>
      <h2 className="mt-3 text-[28px] leading-tight tracking-tight text-zinc-900 dark:text-white">
        You're all set.
      </h2>
      <p className="mt-2 max-w-lg text-[13px] text-zinc-500">
        Review your setup. You can always change everything later from Settings.
      </p>

      <div className="mt-6 space-y-3">
        <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Workspace
          </div>
          <div className="mt-1 font-mono text-[12.5px] text-zinc-900 dark:text-white">
            {workspace}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Enabled agents · {enabled.length}
          </div>
          <div className="mt-2 space-y-1.5">
            {enabled.map((p) => {
              const c = cliCfg[p.id];
              const summary = c ? rowSummary(p, c, sharedEmail) : p.model;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-md border border-zinc-200/70 bg-white px-2 py-1.5 text-[11.5px] dark:border-white/[0.06] dark:bg-white/[0.02]"
                >
                  <span className={`${p.color} font-mono text-[13px] leading-none`}>{p.glyph}</span>
                  <span className="text-zinc-800 dark:text-zinc-200">{p.name}</span>
                  <span className="font-mono text-[9.5px] text-zinc-500">
                    · {c?.method.replace("_", " ") || p.authMethod.replace("_", " ")}
                  </span>
                  <span className="ml-auto truncate font-mono text-[9.5px] text-zinc-500">
                    {summary}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <motion.div className="mt-4 rounded-lg border border-rose-300/60 bg-rose-50/80 px-3 py-2.5 text-[12px] leading-relaxed text-rose-800 dark:border-rose-400/30 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </motion.div>
      )}

      <div className="mt-8 flex justify-between">
        <GhostBtn onClick={onBack} disabled={saving}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </GhostBtn>
        <PrimaryBtn onClick={onFinish} disabled={saving}>
          {saving ? "Saving…" : "Launch Orchestrator"}{" "}
          {!saving && <Rocket className="h-3.5 w-3.5" />}
        </PrimaryBtn>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-200/70 bg-white px-3 py-2 text-[12.5px] text-zinc-800 outline-none focus:border-indigo-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-[12.5px] text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {children}
    </button>
  );
}

function GhostBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-lg border border-zinc-200/70 bg-white px-3 py-2 text-[12px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
    >
      {children}
    </button>
  );
}
