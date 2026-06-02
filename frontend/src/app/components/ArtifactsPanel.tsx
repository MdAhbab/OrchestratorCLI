import { useEffect, useState } from "react";
import { FileText, Download } from "lucide-react";
import { apiFetch, apiPath } from "../lib/api";

type Artifact = {
  id: number;
  name: string;
  artifact_type?: string;
  session_id?: number;
};

export function ArtifactsPanel() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch("/workspace/artifacts?limit=30");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setArtifacts(data.artifacts ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

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

  return (
    <ul className="space-y-1.5">
      {artifacts.map((a) => (
        <li
          key={a.id}
          className="flex items-center justify-between rounded-md border border-zinc-200/60 px-2 py-1.5 text-[11px] dark:border-white/[0.06]"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <FileText className="h-3 w-3 shrink-0 text-indigo-500" />
            <span className="truncate font-mono">{a.name || "artifact"}</span>
          </span>
          <a
            href={apiPath(`/workspace/artifacts/${a.id}/download`)}
            download={a.name || undefined}
            className="flex shrink-0 items-center gap-0.5 text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            title="Download artifact"
          >
            <Download className="h-3 w-3" />
          </a>
        </li>
      ))}
    </ul>
  );
}
