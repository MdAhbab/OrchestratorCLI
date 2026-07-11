import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Cpu,
  Layers,
  Moon,
  Plug,
  Search,
  Settings as SettingsIcon,
  Sun,
  Workflow,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, healthCheckUrl } from "../lib/api";
import { useTheme } from "./theme";

export type Cmd = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: typeof Plug;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
  onView,
  onNewChat,
}: {
  open: boolean;
  onClose: () => void;
  onView: (v: "chat" | "processes" | "settings") => void;
  onNewChat?: () => void | Promise<void>;
}) {
  const { theme, toggle } = useTheme();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: Cmd[] = useMemo(
    () => [
      { id: "chat", label: "Open chat", group: "Navigate", icon: MessageSquare, run: () => onView("chat") },
      { id: "new", label: "New chat", hint: "⌘⇧N", group: "Navigate", icon: MessageSquare, run: () => { void onNewChat?.(); onClose(); } },
      { id: "proc", label: "Open processes", hint: "⌘⇧P", group: "Navigate", icon: Workflow, run: () => onView("processes") },
      { id: "set", label: "Open settings", hint: "⌘,", group: "Navigate", icon: SettingsIcon, run: () => onView("settings") },
      { id: "theme", label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`, group: "Appearance", icon: theme === "dark" ? Sun : Moon, run: () => toggle() },
      { id: "health", label: "Check backend health", group: "Setup", icon: Plug, run: () => { void apiFetch(healthCheckUrl()).then((r) => (r.ok ? toast.success("Backend healthy") : toast.error(`Backend error (${r.status})`))).catch(() => toast.error("Backend unreachable")); onClose(); } },
      { id: "orch", label: "Orchestrator settings", group: "Setup", icon: Cpu, run: () => onView("settings") },
      { id: "ctx", label: "Workspace context", group: "Setup", icon: Layers, run: () => onView("processes") },
    ],
    [theme, toggle, onView, onNewChat, onClose]
  );

  useEffect(() => {
    if (open) {
      setQ("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const filtered = items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
  const groups = filtered.reduce<Record<string, Cmd[]>>((acc, c) => {
    (acc[c.group] ||= []).push(c);
    return acc;
  }, {});
  // Render order (grouped) so ArrowUp/Down matches what's on screen.
  const ordered = Object.values(groups).flat();

  useEffect(() => {
    setSelected(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, ordered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = ordered[selected];
        if (cmd) {
          cmd.run();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, ordered, selected]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[80] flex items-start justify-center bg-zinc-900/30 px-4 pt-[18vh] backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)] dark:border-white/10 dark:bg-zinc-950"
          >
            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 dark:border-white/[0.06]">
              <Search className="h-3.5 w-3.5 text-zinc-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type a command or search…"
                className="flex-1 bg-transparent py-3 text-[13.5px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
              />
              <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[9.5px] text-zinc-500 dark:border-white/10 dark:bg-white/[0.04]">
                esc
              </kbd>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
              {Object.entries(groups).map(([g, items]) => (
                <div key={g} className="mb-1">
                  <div className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-400">
                    {g}
                  </div>
                  {items.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        c.run();
                        onClose();
                      }}
                      onMouseEnter={() => setSelected(ordered.indexOf(c))}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] text-zinc-800 transition dark:text-zinc-200 ${
                        ordered.indexOf(c) === selected
                          ? "bg-zinc-100 dark:bg-white/[0.07]"
                          : "hover:bg-zinc-100 dark:hover:bg-white/[0.05]"
                      }`}
                    >
                      <c.icon className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="flex-1">{c.label}</span>
                      {c.hint && (
                        <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[9.5px] text-zinc-500 dark:border-white/10 dark:bg-white/[0.04]">
                          {c.hint}
                        </kbd>
                      )}
                      <ArrowRight className="h-3 w-3 text-zinc-400" />
                    </button>
                  ))}
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-8 text-center text-[12px] text-zinc-500">
                  No matches for “{q}”
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
