import { forwardRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Filter } from "lucide-react";
import { OrchestratorGraph } from "./OrchestratorGraph";
import { TerminalCard, type CliRuntime } from "./TerminalCard";
import { ContextDropzone, type CtxFile } from "./ContextDropzone";
import { AnalyticsStrip } from "./AnalyticsStrip";
import { AgentsToolsPanel } from "./AgentsToolsPanel";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { RuntimeLogPanel } from "./RuntimeLogPanel";
import { apiFetch } from "../lib/api";
import { QuotaBar, useQuota } from "./QuotaBar";

type Tab = "all" | "executing" | "idle" | "limited" | "permission";

export const ProcessesView = forwardRef<
  HTMLDivElement,
  {
    clis: CliRuntime[];
    parallelism?: number;
    highlightAgentId?: string | null;
    files?: CtxFile[];
    setFiles?: React.Dispatch<React.SetStateAction<CtxFile[]>>;
    onResyncShared?: () => void;
    onRuntime?: (providerId: number | undefined, runtimeId: number | undefined) => void;
    activeSessionId?: number | null;
  }
>(function ProcessesView(
  { clis, parallelism = 4, highlightAgentId = null, files: filesProp, setFiles: setFilesProp, onResyncShared, onRuntime, activeSessionId = null },
  ref,
) {
  const [localFiles, setLocalFiles] = useState<CtxFile[]>([]);
  const files = filesProp ?? localFiles;
  const setFiles = setFilesProp ?? setLocalFiles;

  const [tab, setTab] = useState<Tab>("all");
  const [orchOpen, setOrchOpen] = useState(true);
  const [termsOpen, setTermsOpen] = useState(true);
  const [ctxOpen, setCtxOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  // UI-5: per-agent quota bars — poll lightly (30 s); safe if endpoint is absent
  const quota = useQuota(30_000);

  const filtered = clis.filter((c) => (tab === "all" ? true : c.state === tab));
  const totalUsed = clis.reduce((s, c) => s + c.used, 0);
  const totalCap = clis.reduce((s, c) => s + c.cap, 0);
  const activeRuntimes = clis.filter((c) => c.runtimeId != null).length;

  const handleDeleteShared = async (file: CtxFile) => {
    if (!file.id) return false;
    const res = await apiFetch(`/workspace/shared?path=${encodeURIComponent(file.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) return false;
    onResyncShared?.();
    return true;
  };

  return (
    <div ref={ref} className="h-full min-h-0 overflow-y-auto pb-44 sm:pb-48">
      <div className="mx-auto max-w-[1400px] space-y-3 p-3 sm:p-5">
        <AnalyticsStrip
          totalUsed={totalUsed}
          totalCap={totalCap}
          activeAgents={activeRuntimes}
          totalAgents={clis.length}
        />

        <Section
          title="Orchestrator"
          sub="orchestrator · live routing graph + log"
          open={orchOpen}
          onToggle={() => setOrchOpen((o) => !o)}
        >
          <div className="h-[360px] sm:h-[420px]">
            <OrchestratorGraph activeSessionId={activeSessionId} />
          </div>
        </Section>

        <Section
          title="Parallel Terminals"
          sub={`${clis.length} agents · ${activeRuntimes} live · cap ${parallelism}`}
          open={termsOpen}
          onToggle={() => setTermsOpen((o) => !o)}
          right={
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-zinc-400" />
              {(
                [
                  ["all", "All"],
                  ["executing", "Active"],
                  ["idle", "Idle"],
                  ["limited", "Limited"],
                  ["permission", "Approval"],
                ] as [Tab, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTab(k);
                  }}
                  className={`rounded-md px-2 py-0.5 font-mono text-[10px] transition ${
                    tab === k
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((c) => {
              // Normalize provider id for quota lookup: try exact, then lowercase
              const qId = c.id in quota ? c.id : c.id.toLowerCase();
              const qs = quota[qId];
              const handedOff = qs?.status === "preempt" || qs?.status === "exhausted";
              return (
                <div key={c.id} className="flex flex-col gap-0">
                  <TerminalCard
                    cli={c}
                    onRuntime={onRuntime}
                    lazyConnect
                    spawnAllowed={activeRuntimes < parallelism || c.runtimeId != null}
                    highlighted={highlightAgentId === c.id.toLowerCase()}
                  />
                  {Object.keys(quota).length > 0 && (
                    <div className="rounded-b-xl border-x border-b border-zinc-200/70 bg-white/60 px-3 py-2 dark:border-white/[0.06] dark:bg-zinc-950/40">
                      <QuotaBar
                        providerId={qId}
                        quota={quota}
                        showHandedOff={handedOff}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-zinc-300/70 bg-zinc-50/50 px-6 py-10 text-center text-[12px] text-zinc-500 dark:border-white/10 dark:bg-white/[0.02]">
                {clis.length === 0
                  ? "No agents enabled yet. Pick CLIs in onboarding or Settings."
                  : "No agents match this filter."}
              </div>
            )}
          </div>
        </Section>

        <Section
          title="Agents & MCP"
          sub="A2A registry · MCP tool surface"
          open={agentsOpen}
          onToggle={() => setAgentsOpen((o) => !o)}
        >
          <AgentsToolsPanel />
        </Section>

        <Section
          title="Session artifacts"
          sub="outputs persisted under workspace/artifacts"
          open={artifactsOpen}
          onToggle={() => setArtifactsOpen((o) => !o)}
        >
          <ArtifactsPanel activeSessionId={activeSessionId} />
        </Section>

        <Section
          title="Runtime logs"
          sub="recent CLI runtime output (MED-051)"
          open={logsOpen}
          onToggle={() => setLogsOpen((o) => !o)}
        >
          <RuntimeLogPanel runtimeId={clis.find((c) => c.runtimeId)?.runtimeId} />
        </Section>

        <Section
          title="Workspace Context"
          sub="shared between every agent (incl. divisions.md authored by orchestrator)"
          open={ctxOpen}
          onToggle={() => setCtxOpen((o) => !o)}
        >
          <div className="h-[480px]">
            <ContextDropzone
              files={files}
              setFiles={setFiles}
              agentCount={clis.length}
              onResync={onResyncShared}
              onDeleteFile={handleDeleteShared}
            />
          </div>
        </Section>
      </div>
    </div>
  );
});

function Section({
  title,
  sub,
  open,
  onToggle,
  right,
  children,
}: {
  title: string;
  sub: string;
  open: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/40 backdrop-blur dark:border-white/[0.06] dark:bg-zinc-950/30">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
      >
        <div className="min-w-0">
          <div className="text-[13px] tracking-tight text-zinc-900 dark:text-white">{title}</div>
          <div className="truncate font-mono text-[10px] text-zinc-500">{sub}</div>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {right}
          <ChevronDown
            className={`h-3.5 w-3.5 text-zinc-400 transition ${open ? "rotate-180" : ""}`}
          />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-200/70 p-3 dark:border-white/[0.05] sm:p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
