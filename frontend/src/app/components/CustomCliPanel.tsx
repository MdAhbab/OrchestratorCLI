import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Loader2, Plus, Terminal as TerminalIcon, Trash2 } from "lucide-react";
import { useStore } from "./store";
import {
  type CustomCli,
  type CustomCliInput,
  deleteCustomCli,
  listCustomClis,
  registerCustomCli,
  validateCustomCliInput,
} from "../lib/customCli";

/**
 * Custom CLI panel — let users register any local executable as a CLI target
 * (e.g. `codex`, `aider`, `ollama-cli`, in-house tooling) and have it surfaced
 * in the agent picker. Backed by `/cli/custom` on the backend.
 */
export function CustomCliPanel() {
  const { customClis, setCustomClis } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state — kept controlled so users see validation feedback live.
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [command, setCommand] = useState("");
  const [argsTemplate, setArgsTemplate] = useState("{prompt}");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCustomClis()
      .then((rows) => {
        if (cancelled) return;
        setCustomClis(rows);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setCustomClis]);

  const sortedItems = useMemo(
    () => [...customClis].sort((a, b) => a.slug.localeCompare(b.slug)),
    [customClis],
  );

  function resetForm() {
    setSlug("");
    setDisplayName("");
    setCommand("");
    setArgsTemplate("{prompt}");
    setDescription("");
    setEnabled(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: CustomCliInput = {
      slug: slug.trim(),
      display_name: displayName.trim(),
      command: command.trim(),
      args_template: argsTemplate.trim() || undefined,
      description: description.trim() || undefined,
      enabled,
    };
    const validationError = validateCustomCliInput(payload);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const saved = await registerCustomCli(payload);
      setCustomClis((prev) => [
        ...prev.filter((p) => p.slug !== saved.slug),
        saved,
      ]);
      toast.success(`Registered ${saved.display_name}.`);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(target: CustomCli) {
    try {
      await deleteCustomCli(target.slug);
      setCustomClis((prev) => prev.filter((p) => p.slug !== target.slug));
      toast.success(`Removed ${target.display_name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[22px] tracking-tight text-zinc-900 dark:text-white">Custom CLIs</h2>
        <p className="mt-1 text-[12.5px] text-zinc-500">
          Register any local executable as a CLI target. Entries appear in the agent picker next to
          the bundled installer registry.
        </p>
      </div>

      {/* Registration form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-zinc-200/70 bg-white/60 p-4 dark:border-white/[0.06] dark:bg-white/[0.02] space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slug" hint="Identifier used internally. Lowercase, digits, '-'.">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-cli"
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
          </Field>
          <Field label="Display name" hint="What users see in the picker.">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Custom CLI"
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <Field
            label="Command"
            hint="Executable name or absolute path. No shell metacharacters."
          >
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="my-cli"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field
            label="Args template"
            hint="Use {prompt} where the user's message should land. Defaults to {prompt}."
          >
            <input
              value={argsTemplate}
              onChange={(e) => setArgsTemplate(e.target.value)}
              placeholder="{prompt}"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
          </Field>
        </div>
        <Field label="Description" hint="Optional. Plain text, up to 500 chars.">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What does this CLI do?"
            className={`${inputClass} resize-y`}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
            />
            Enabled
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {submitting ? "Saving…" : "Register CLI"}
          </button>
        </div>
      </form>

      {/* Registered CLIs list */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-[13px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            Registered
          </h3>
          {sortedItems.length > 0 && (
            <span className="text-[11px] text-zinc-400">
              {sortedItems.length} {sortedItems.length === 1 ? "entry" : "entries"}
            </span>
          )}
        </div>

        {loading ? (
          <Skeleton />
        ) : error ? (
          <ErrorState message={error} />
        ) : sortedItems.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-zinc-200/70 overflow-hidden rounded-xl border border-zinc-200/70 bg-white/60 dark:divide-white/[0.06] dark:border-white/[0.06] dark:bg-white/[0.02]">
            <AnimatePresence initial={false}>
              {sortedItems.map((item) => (
                <motion.li
                  key={item.slug}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      <span className="truncate text-[13px] font-medium text-zinc-900 dark:text-white">
                        {item.display_name}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
                        {item.slug}
                      </span>
                      {!item.enabled && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                          disabled
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[11.5px] text-zinc-500">
                      {item.command}
                      {item.args_template && item.args_template !== "{prompt}" ? (
                        <>
                          {" "}
                          <span className="text-zinc-400">{item.args_template}</span>
                        </>
                      ) : null}
                    </div>
                    {item.description && (
                      <div className="mt-1 text-[11.5px] text-zinc-500">{item.description}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11.5px] text-zinc-600 transition hover:bg-zinc-100 hover:text-red-600 dark:border-white/[0.08] dark:text-zinc-300 dark:hover:bg-white/[0.05] dark:hover:text-red-400"
                    title={`Remove ${item.display_name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-200 bg-white/80 px-2.5 py-1.5 text-[12.5px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/[0.08] dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white/20 dark:focus:ring-white/10";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] text-zinc-500">{hint}</span>}
    </label>
  );
}

function Skeleton() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-[12px] text-zinc-500 dark:border-white/[0.08]">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200/70 bg-white/30 px-4 py-8 text-center text-[12px] text-zinc-500 dark:border-white/[0.08] dark:bg-white/[0.02]">
      No custom CLIs registered yet. Add one above to make it appear in the agent picker.
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      {message}
    </div>
  );
}