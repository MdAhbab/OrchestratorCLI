import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Filter } from "lucide-react";
import { OrchestratorGraph } from "./OrchestratorGraph";
import { TerminalCard, type CliRuntime } from "./TerminalCard";
import { ContextDropzone, INITIAL_CTX, type CtxFile } from "./ContextDropzone";
import { AnalyticsStrip } from "./AnalyticsStrip";

type Tab = "all" | "executing" | "idle" | "limited" | "permission";

export function ProcessesView({
  clis,
  files: filesProp,
  setFiles: setFilesProp,
}: {
  clis: CliRuntime[];
  files?: CtxFile[];
  setFiles?: React.Dispatch<React.SetStateAction<CtxFile[]>>;
}) {
  const [localFiles, setLocalFiles] = useState<CtxFile[]>(INITIAL_CTX);
  const files = filesProp ?? localFiles;
  const setFiles = setFilesProp ?? setLocalFiles;

  const [tab, setTab] = useState<Tab>("all");
  const [orchOpen, setOrchOpen] = useState(true);
  const [termsOpen, setTermsOpen] = useState(true);
  const [ctxOpen, setCtxOpen] = useState(false);

  const filtered = clis.filter((c) => (tab === "all" ? true : c.state === tab));
  const totalUsed = clis.reduce((s, c) => s + c.used, 0);
  const totalCap = clis.reduce((s, c) => s + c.cap, 0);
  const active = clis.filter((c) => c.state === "executing").length;

  return (
    <div className="h-full min-h-0 overflow-y-auto pb-44 sm:pb-48">
      <div className="mx-auto max-w-[1400px] space-y-3 p-3 sm:p-5">
        <AnalyticsStrip totalUsed={totalUsed} totalCap={totalCap} activeAgents={active} />

        <Section
          title="Orchestrator"
          sub="planner llm · live routing graph + log"
          open={orchOpen}
          onToggle={() => setOrchOpen((o) => !o)}
        >
          <div className="h-[360px] sm:h-[420px]">
            <OrchestratorGraph />
          </div>
        </Section>

        <Section
          title="Parallel Terminals"
          sub={`${clis.length} agents · ${active} executing`}
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
                  className={`rounded-md px-2 py-0.5 font-mono text-[13px] transition ${
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
            {filtered.map((c) => (
              <TerminalCard key={c.id} cli={c} defaultMenuOpen={c.id === "copilot"} />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-zinc-300/70 bg-zinc-50/50 px-6 py-10 text-center text-[15px] text-zinc-500 dark:border-white/10 dark:bg-white/[0.02]">
                No agents match this filter.
              </div>
            )}
          </div>
        </Section>

        <Section
          title="Workspace Context"
          sub="shared between every agent (incl. divisions.md authored by orchestrator)"
          open={ctxOpen}
          onToggle={() => setCtxOpen((o) => !o)}
        >
          <div className="h-[480px]">
            <ContextDropzone files={files} setFiles={setFiles} />
          </div>
        </Section>
      </div>
    </div>
  );
}

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
          <div className="text-[16px] tracking-tight text-zinc-900 dark:text-white">{title}</div>
          <div className="truncate font-mono text-[13px] text-zinc-500">{sub}</div>
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
