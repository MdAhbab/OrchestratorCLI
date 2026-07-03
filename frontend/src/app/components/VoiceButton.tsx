import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Square, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  onTranscript: (text: string) => void;
  onPartial?: (text: string) => void;
};

export function VoiceButton({ onTranscript, onPartial }: Props) {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const [partial, setPartial] = useState("");
  const recRef = useRef<any>(null);
  const partialRef = useRef("");
  const startedAt = useRef<number>(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
    }
  }, []);

  useEffect(() => {
    if (!recording) return;
    startedAt.current = Date.now();
    const id = setInterval(() => setDuration((Date.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(id);
  }, [recording]);

  const start = () => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      toast.error("Voice dictation is not supported in this environment.");
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      const text = (final + " " + interim).trim();
      partialRef.current = text;
      setPartial(text);
      onPartial?.(text);
    };
    rec.onend = () => {
      setRecording(false);
      const transcript = partialRef.current.trim();
      if (transcript) onTranscript(transcript);
      partialRef.current = "";
      setPartial("");
    };
    rec.onerror = (e: any) => {
      setRecording(false);
      let errorMsg = "Speech recognition error occurred.";
      if (e.error === "not-allowed") {
        errorMsg = "Microphone access denied. Please check your browser/system microphone permissions.";
      } else if (e.error === "no-speech") {
        errorMsg = "No speech detected. Please try speaking again.";
      } else if (e.error === "audio-capture") {
        errorMsg = "No microphone found or audio capture failed.";
      } else if (e.error === "network") {
        errorMsg = "Network communication error. Check your connection.";
      } else if (e.error) {
        errorMsg = `Speech recognition failed: ${e.error}`;
      }
      toast.error(errorMsg);
    };
    rec.start();
    recRef.current = rec;
    setRecording(true);
  };

  const stop = () => {
    try {
      recRef.current?.stop();
    } catch {}
    setRecording(false);
  };

  return (
    <>
      <button
        type="button"
        title={supported ? "Voice dictation (⌘ ⇧ V)" : "Voice dictation not supported in this browser"}
        onClick={supported ? (recording ? stop : start) : undefined}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition ${
          recording
            ? "border-rose-400/60 bg-rose-500 text-white shadow-[0_0_18px_-3px_rgba(244,63,94,0.7)]"
            : !supported
            ? "border-zinc-200/50 bg-zinc-50/40 text-zinc-400 cursor-not-allowed dark:border-white/[0.04] dark:bg-white/[0.01] dark:text-zinc-500"
            : "border-zinc-200/70 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
        }`}
      >
        {recording ? (
          <Square className="h-3.5 w-3.5 fill-current" />
        ) : supported ? (
          <Mic className="h-4 w-4" />
        ) : (
          <MicOff className="h-4 w-4" />
        )}
        {recording && (
          <span className="absolute -inset-1 rounded-lg border border-rose-400/40 animate-ping" />
        )}
      </button>

      <AnimatePresence>
        {recording && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="fixed bottom-32 left-1/2 z-40 w-[min(560px,calc(100vw-3rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/95 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.3)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/90"
          >
            <div className="flex items-center justify-between border-b border-zinc-200/70 px-4 py-2.5 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-rose-600 dark:text-rose-400">
                  recording
                </span>
                <span className="font-mono text-[10px] text-zinc-500">
                  {duration.toFixed(1)}s
                </span>
              </div>
              <button
                onClick={stop}
                className="rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-300"
              >
                <X className="inline h-3 w-3" /> Cancel
              </button>
            </div>
            <div className="flex items-center gap-1 px-6 py-5">
              {Array.from({ length: 36 }).map((_, i) => (
                <span
                  key={i}
                  className="block w-1 rounded-full bg-gradient-to-t from-indigo-500 to-violet-500"
                  style={{
                    height: `${20 + Math.abs(Math.sin((Date.now() / 120 + i) * 0.6)) * 28}px`,
                    animation: `wave 0.${4 + (i % 6)}s ease-in-out ${i * 0.04}s infinite`,
                    transformOrigin: "center",
                  }}
                />
              ))}
            </div>
            <div className="border-t border-zinc-200/70 px-4 py-3 dark:border-white/[0.06]">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                transcript
              </div>
              <div className="mt-1 min-h-[24px] text-[13px] text-zinc-900 dark:text-zinc-100">
                {partial || (
                  <span className="text-zinc-400">listening…</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200/70 bg-zinc-50/60 px-4 py-2 dark:border-white/[0.06] dark:bg-black/30">
              <button
                onClick={() => {
                  if (partial.trim()) onTranscript(partial.trim());
                  stop();
                }}
                disabled={!partial.trim()}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-[11.5px] text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-zinc-900"
              >
                Send transcript
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
