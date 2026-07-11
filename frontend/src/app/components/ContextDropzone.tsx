import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  FileText,
  Lock,
  RefreshCw,
  Upload,
  X,
  Sparkles,
  Check,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { toast } from "sonner";

export type CtxFile = {
  id: string;
  name: string;
  size: string;
  status: "synced" | "syncing" | "stale";
  agents: number;
  source: "user" | "orchestrator";
  pinned?: boolean;
};

async function uploadSharedFile(file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/workspace/shared", { method: "POST", body: form, timeoutMs: 30_000 });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }
}

async function uploadSharedFiles(
  fileList: FileList | File[],
  setFiles: React.Dispatch<React.SetStateAction<CtxFile[]>>,
  agentCount: number,
  onResync?: () => void,
) {
  const files = Array.from(fileList);
  const placeholders: CtxFile[] = files.map((f, i) => ({
    id: `${Date.now()}-${i}`,
    name: f.name,
    size: `${(f.size / 1024).toFixed(1)} kb`,
    status: "syncing",
    agents: agentCount,
    source: "user",
  }));
  setFiles((p) => [...placeholders, ...p]);
  for (let i = 0; i < files.length; i++) {
    try {
      await uploadSharedFile(files[i]);
      const id = placeholders[i].id;
      setFiles((p) =>
        p.map((f) => (f.id === id ? { ...f, status: "synced" as const } : f)),
      );
    } catch (e: any) {
      const id = placeholders[i].id;
      setFiles((p) =>
        p.map((f) => (f.id === id ? { ...f, status: "stale" as const } : f)),
      );
      toast.error(`Failed to upload file "${files[i].name}".`);
    }
  }
  onResync?.();
}

export function ContextDropzone({
  files,
  setFiles,
  collapsed,
  onToggle,
  agentCount = 0,
  onResync,
  onDeleteFile,
}: {
  files: CtxFile[];
  setFiles: React.Dispatch<React.SetStateAction<CtxFile[]>>;
  collapsed?: boolean;
  onToggle?: () => void;
  agentCount?: number;
  onResync?: () => void;
  onDeleteFile?: (file: CtxFile) => Promise<boolean> | boolean;
}) {
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState<"all" | "user" | "orch">("all");

  const visible = files.filter((f) =>
    filter === "all" ? true : filter === "user" ? f.source === "user" : f.source === "orchestrator"
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200/70 bg-white/60 backdrop-blur dark:border-white/[0.07] dark:bg-zinc-950/40">
      <button
        onClick={onToggle}
        className="flex items-center justify-between border-b border-zinc-200/70 px-4 py-3 text-left dark:border-white/[0.06]"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Workspace Context
          </span>
          <span className="rounded-md border border-emerald-300/40 bg-emerald-50 px-1.5 py-0.5 font-mono text-[9px] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
            shared · {agentCount > 0 ? `${agentCount} agents` : "workspace folder"}
          </span>
        </div>
        {onToggle && (
          <ChevronDown
            className={`h-3.5 w-3.5 text-zinc-400 transition ${collapsed ? "" : "rotate-180"}`}
          />
        )}
      </button>

      {!collapsed && (
        <>
          <div className="flex items-center gap-1 border-b border-zinc-200/70 px-3 py-2 dark:border-white/[0.06]">
            {(
              [
                ["all", "All"],
                ["user", "User"],
                ["orch", "Orchestrator"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-md px-2 py-0.5 font-mono text-[10px] transition ${
                  filter === k
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5"
                }`}
              >
                {l}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onResync?.()}
              className="ml-auto flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <RefreshCw className="h-3 w-3" />
              Resync
            </button>
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void uploadSharedFiles(e.dataTransfer.files, setFiles, agentCount, onResync);
            }}
            className={`m-3 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-6 transition ${
              drag
                ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-400/[0.06]"
                : "border-zinc-300/70 bg-zinc-50/50 hover:border-zinc-400 dark:border-white/[0.08] dark:bg-white/[0.015] dark:hover:border-white/[0.18]"
            }`}
          >
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void uploadSharedFiles(e.target.files, setFiles, agentCount, onResync);
                  e.target.value = "";
                }
              }}
            />
            <Upload className="h-4 w-4 text-zinc-400" />
            <div className="text-[12px] text-zinc-700 dark:text-zinc-300">Drop context files</div>
            <div className="font-mono text-[9px] text-zinc-500">
              skill.md · plan.md · code snippets
            </div>
          </label>

          <div className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
            {visible.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-300/70 px-4 py-8 text-center text-[11px] text-zinc-500 dark:border-white/10">
                No files in <span className="font-mono">shared/</span> yet. Add{" "}
                <span className="font-mono">skill.md</span>,{" "}
                <span className="font-mono">plan.md</span>, etc. under your workspace.
              </div>
            )}
            <AnimatePresence>
              {visible.map((f) => (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`group flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                    f.source === "orchestrator"
                      ? "border-indigo-200/70 bg-indigo-50/50 dark:border-indigo-400/15 dark:bg-indigo-400/[0.03]"
                      : "border-zinc-200/70 bg-white dark:border-white/[0.05] dark:bg-white/[0.02]"
                  }`}
                >
                  {f.source === "orchestrator" ? (
                    <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-zinc-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-[11px] text-zinc-800 dark:text-zinc-200">
                        {f.name}
                      </span>
                      {f.pinned && <Lock className="h-2.5 w-2.5 text-zinc-400" />}
                      <span className="font-mono text-[9px] text-zinc-500">{f.size}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {f.status === "synced" && (
                        <>
                          <Check className="h-2.5 w-2.5 text-emerald-500" />
                          <span className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400">
                            synced · {f.agents} agents
                          </span>
                        </>
                      )}
                      {f.status === "syncing" && (
                        <>
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                          <span className="font-mono text-[9px] text-amber-600 dark:text-amber-300">
                            propagating…
                          </span>
                        </>
                      )}
                      {f.status === "stale" && (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                          <span className="font-mono text-[9px] text-rose-600 dark:text-rose-300">
                            stale · resync
                          </span>
                        </>
                      )}
                      {f.source === "orchestrator" && (
                        <span className="ml-auto rounded border border-indigo-200/70 bg-white/60 px-1 font-mono text-[8px] uppercase tracking-wider text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">
                          auto
                        </span>
                      )}
                    </div>
                  </div>
                  {!f.pinned && (
                    <button
                      onClick={async () => {
                        if (onDeleteFile) {
                          const ok = await Promise.resolve(onDeleteFile(f)).catch(() => false);
                          if (!ok) {
                            toast.error("Failed to delete file.");
                            return;
                          }
                        }
                        setFiles((p) => p.filter((x) => x.id !== f.id));
                      }}
                      className="rounded p-1 text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-700 group-hover:opacity-100 dark:hover:bg-white/5 dark:hover:text-zinc-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
