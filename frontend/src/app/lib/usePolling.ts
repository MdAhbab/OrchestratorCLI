import { useEffect, useRef } from "react";

/**
 * Run `fn` immediately and then every `ms` milliseconds while the document is
 * visible. Polling pauses entirely when the window is hidden (backgrounded
 * Electron/browser tab) and fires again as soon as it becomes visible, so a
 * long-running desktop session doesn't keep the CPU and backend busy for
 * nothing.
 *
 * The latest `fn` is always used (no need to memoize it), and the provided
 * AbortSignal is aborted on unmount so in-flight fetches can be cancelled.
 */
export function usePolling(
  fn: (signal: AbortSignal) => void | Promise<void>,
  ms: number,
  enabled = true,
  restartKey: unknown = undefined,
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled || ms <= 0) return;

    const controller = new AbortController();
    let timer: number | null = null;
    let lastRun = 0;

    const run = () => {
      if (controller.signal.aborted) return;
      lastRun = Date.now();
      void fnRef.current(controller.signal);
    };

    const schedule = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (!document.hidden) run();
      }, ms);
    };

    const onVisibility = () => {
      if (!document.hidden && Date.now() - lastRun >= ms) {
        run();
      }
    };

    run();
    schedule();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      controller.abort();
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms, enabled, restartKey]);
}
