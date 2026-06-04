import { ArrowUp, CornerDownLeft, Paperclip } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { VoiceButton } from "./VoiceButton";
import { apiFetch } from "../lib/api";

const MAX_CHAT_CHARS = 32_000;

export function GlobalChatBar({
  value,
  onChange,
  onSubmit,
  onVoice,
  onPartial,
  sessionId,
  disabled = false,
  onAttached,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onVoice: (t: string) => void;
  onPartial: (t: string) => void;
  sessionId?: number | null;
  disabled?: boolean;
  onAttached?: (relativePaths: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const attachFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const uploaded: string[] = [];
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const path = sessionId != null ? "/workspace/context" : "/workspace/shared";
        if (sessionId != null) {
          fd.append("session_id", String(sessionId));
        }
        const res = await apiFetch(path, { method: "POST", body: fd, timeoutMs: 30_000 });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          failed.push(file.name);
          toast.error(
            `Failed to upload "${file.name}"${detail ? `: ${detail.slice(0, 120)}` : ""}`,
            { id: `upload-fail-${file.name}` },
          );
          continue;
        }
        const body = await res.json();
        const rel = (body.relative_path as string) || (body.filename as string) || file.name;
        uploaded.push(rel);
      } catch (e) {
        failed.push(file.name);
        toast.error(
          `Upload error for "${file.name}" — backend unreachable.`,
          { id: `upload-err-${file.name}` },
        );
      }
    }
    setUploading(false);
    if (uploaded.length) {
      onAttached?.(uploaded);
      if (failed.length === 0) {
        toast.success(
          `${uploaded.length} file${uploaded.length > 1 ? "s" : ""} attached`,
          { duration: 2500 },
        );
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };


  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-6 sm:pb-5">
      <div className="pointer-events-auto mx-auto w-full max-w-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.length > MAX_CHAT_CHARS) {
              alert(`Message exceeds ${MAX_CHAT_CHARS} characters.`);
              return;
            }
            onSubmit();
          }}
          className="relative flex items-end gap-2"
        >
          <div className="relative flex-1 overflow-hidden rounded-2xl border border-zinc-300/60 bg-white/95 shadow-[0_10px_36px_-12px_rgba(0,0,0,0.25)] backdrop-blur focus-within:border-indigo-400 dark:border-white/10 dark:bg-zinc-950/85 dark:shadow-[0_10px_36px_-10px_rgba(0,0,0,0.6)] dark:focus-within:border-indigo-400/60">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="Describe a task. The orchestrator will divide it across your AIs…"
              rows={2}
              disabled={disabled}
              className="scrollbar-hide block max-h-40 w-full resize-none bg-transparent px-4 pt-3 text-[14px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-60 dark:text-zinc-100"
            />
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => void attachFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  title={
                    uploading
                      ? "Uploading…"
                      : sessionId == null
                      ? "Attach to workspace/shared"
                      : "Attach files to session"
                  }
                  className="flex items-center gap-1 rounded-md border border-zinc-200/70 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                >
                  <Paperclip className={`h-3 w-3 ${uploading ? "animate-spin" : ""}`} />
                  {uploading ? "Uploading…" : "Attach"}
                </button>
                <span className="ml-1 hidden items-center gap-1 font-mono text-[10px] text-zinc-400 md:flex">
                  <CornerDownLeft className="h-2.5 w-2.5" /> send · ⇧↵ newline
                </span>
              </div>
              <button
                type="submit"
                disabled={!value.trim() || disabled || uploading}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <ArrowUp className="h-3.5 w-3.5" />
                {uploading ? "Uploading…" : disabled ? "Sending…" : "Dispatch"}
              </button>
            </div>
          </div>
          <div className="pb-2">
            <VoiceButton
              onTranscript={(t) => {
                onChange("");
                onVoice(t);
              }}
              onPartial={onPartial}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
