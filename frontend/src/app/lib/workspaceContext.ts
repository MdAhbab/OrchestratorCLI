import type { CtxFile } from "../components/ContextDropzone";

export type SharedContextFileDto = {
  name: string;
  relative_path: string;
  size_bytes: number;
  modified_at: string;
  source: string;
};

export type SharedContextResponse = {
  workspace_path?: string | null;
  shared_dir?: string | null;
  exists: boolean;
  files: SharedContextFileDto[];
  total: number;
};

const PINNED = new Set(["skill.md", "plan.md", "divisions.md"]);

export function formatCtxSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} b`;
  return `${(bytes / 1024).toFixed(1)} kb`;
}

export function mapSharedFilesToCtx(
  files: SharedContextFileDto[],
  agentCount: number
): CtxFile[] {
  return files.map((f) => ({
    id: f.relative_path,
    name: f.name,
    size: formatCtxSize(f.size_bytes),
    status: "synced" as const,
    agents: agentCount,
    source: f.source === "orchestrator" ? "orchestrator" : "user",
    pinned: PINNED.has(f.name.toLowerCase()),
  }));
}
