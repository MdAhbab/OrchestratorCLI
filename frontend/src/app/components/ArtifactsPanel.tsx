import { useEffect, useState } from "react";
import { FileText, Download, User, Folder } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, apiPath } from "../lib/api";
import { usePolling } from "../lib/usePolling";

type ArtifactFile = {
  name: string;
  relative_path: string;
  size_bytes: number;
  modified_at: string;
  owner_agent?: string | null;
};

type ArtifactsResponse = {
  session_id: number;
  artifact_dir?: string;
  exists: boolean;
  files: ArtifactFile[];
  total: number;
};

export function ArtifactsPanel({ activeSessionId }: { activeSessionId?: number | null }) {
  const [artifacts, setArtifacts] = useState<ArtifactFile[]>([]);
  const [artifactDir, setArtifactDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Don't carry the previous session's artifact list into the next one.
  useEffect(() => {
    setArtifacts([]);
    setArtifactDir(null);
    setLoading(Boolean(activeSessionId));
  }, [activeSessionId]);

  usePolling(
    async (signal) => {
      if (!activeSessionId) {
        setLoading(false);
        return;
      }
      try {
        const res = await apiFetch(`/workspace/artifacts/session/${activeSessionId}`, { signal });
        if (!res.ok) return;
        const data: ArtifactsResponse = await res.json();
        if (!signal.aborted) {
          setArtifacts(data.exists ? data.files ?? [] : []);
          setArtifactDir(data.exists ? data.artifact_dir ?? null : null);
        }
      } catch {
        /* backend unreachable — keep last known artifacts */
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    10_000,
    true,
    activeSessionId,
  );

  if (loading) {
    return <p className="text-[11px] text-zinc-500">Loading artifacts…</p>;
  }

  if (!artifacts.length) {
    return (
      <p className="text-[11px] text-zinc-500">
        No session artifacts yet. They appear when agents write outputs to the workspace.
      </p>
    );
  }

  // Group by owner agent
  const grouped: Record<string, ArtifactFile[]> = {};
  const unowned: ArtifactFile[] = [];

  for (const f of artifacts) {
    if (f.owner_agent) {
      if (!grouped[f.owner_agent]) grouped[f.owner_agent] = [];
      grouped[f.owner_agent].push(f);
    } else {
      unowned.push(f);
    }
  }

  const handleOpenFolder = async () => {
    if (!artifactDir) return;
    try {
      await navigator.clipboard.writeText(artifactDir);
      toast.success("Artifact folder path copied to clipboard.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  return (
    <div className="space-y-4">
      {artifactDir && (
        <div className="flex items-center justify-between border-b border-zinc-200/50 pb-2 dark:border-white/[0.05]">
          <span className="font-mono text-[10px] text-zinc-500 truncate max-w-[70%]">
            Dir: {artifactDir}
          </span>
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.04]"
          >
            <Folder className="h-3 w-3" />
            Copy Path
          </button>
        </div>
      )}

      {Object.entries(grouped).map(([agent, files]) => (
        <div key={agent} className="space-y-1.5 rounded-xl border border-zinc-200/60 bg-zinc-50/50 p-3 dark:border-white/[0.05] dark:bg-white/[0.01]">
          <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-500">
            <User className="h-3 w-3 text-indigo-500" />
            <span>Agent: {agent}</span>
          </div>
          <ul className="space-y-1">
            {files.map((a) => (
              <li
                key={a.relative_path}
                className="flex items-center justify-between rounded-md bg-white px-2 py-1 text-[11px] border border-zinc-100 dark:bg-zinc-900/50 dark:border-white/[0.03]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                  <span className="truncate font-mono">{a.name}</span>
                </span>
                <a
                  href={apiPath(`/workspace/artifacts/session/${activeSessionId}/${a.relative_path}`)}
                  download={a.name}
                  className="flex shrink-0 items-center gap-0.5 text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  title="Download artifact"
                >
                  <Download className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {unowned.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-500">
            <FileText className="h-3 w-3" />
            <span>Shared / Unassigned</span>
          </div>
          <ul className="space-y-1">
            {unowned.map((a) => (
              <li
                key={a.relative_path}
                className="flex items-center justify-between rounded-md border border-zinc-200/60 px-2 py-1 text-[11px] dark:border-white/[0.06]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                  <span className="truncate font-mono">{a.name}</span>
                </span>
                <a
                  href={apiPath(`/workspace/artifacts/session/${activeSessionId}/${a.relative_path}`)}
                  download={a.name}
                  className="flex shrink-0 items-center gap-0.5 text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  title="Download artifact"
                >
                  <Download className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
