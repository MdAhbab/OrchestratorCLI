import { ArrowUp, CornerDownLeft, Paperclip } from "lucide-react";
import { useRef } from "react";
import { VoiceButton } from "./VoiceButton";
import { apiPath } from "../lib/api";

export function GlobalChatBar({
  value,
  onChange,
  onSubmit,
  onVoice,
  onPartial,
  sessionId,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onVoice: (t: string) => void;
  onPartial: (t: string) => void;
  sessionId?: number | null;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const attachFiles = async (files: FileList | null) => {
    if (!files?.length || sessionId == null) return;
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("session_id", String(sessionId));
        const res = await fetch(apiPath("/workspace/context"), { method: "POST", body: fd });
        if (!res.ok) {
          console.warn("attach failed", await res.text());
        }
      } catch (e) {
        console.warn("attach error", e);
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
              className="scrollbar-hide block max-h-40 w-full resize-none bg-transparent px-4 pt-3 text-[14px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
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
                  disabled={sessionId == null}
                  title={sessionId == null ? "Start chatting to attach files to a session" : "Attach files"}
                  className="flex items-center gap-1 rounded-md border border-zinc-200/70 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                >
                  <Paperclip className="h-3 w-3" /> Attach
                </button>
                <span className="ml-1 hidden items-center gap-1 font-mono text-[10px] text-zinc-400 md:flex">
                  <CornerDownLeft className="h-2.5 w-2.5" /> send · ⇧↵ newline
                </span>
              </div>
              <button
                type="submit"
                disabled={!value.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <ArrowUp className="h-3.5 w-3.5" />
                Dispatch
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
