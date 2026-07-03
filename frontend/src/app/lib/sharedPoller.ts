import { useEffect, useState } from "react";

/**
 * A module-level poller shared by any number of components. One interval and
 * one in-flight request serve every subscriber, so sibling components (e.g.
 * TopBar + Sidebar both showing git status) don't issue duplicate requests.
 *
 * Polling only runs while at least one subscriber is mounted and the document
 * is visible; it resumes (with an immediate refresh if stale) when the window
 * becomes visible again.
 */
export type SharedPoller<T> = {
  subscribe: (listener: (value: T) => void) => () => void;
  /** Force an immediate refresh (e.g. after a mutation). */
  refresh: () => void;
  getSnapshot: () => T;
};

export function createSharedPoller<T>(
  fetcher: () => Promise<T>,
  ms: number,
  initial: T,
): SharedPoller<T> {
  let value = initial;
  let timer: number | null = null;
  let inFlight = false;
  let lastRun = 0;
  const listeners = new Set<(value: T) => void>();

  const run = async () => {
    if (inFlight) return;
    inFlight = true;
    lastRun = Date.now();
    try {
      value = await fetcher();
      listeners.forEach((l) => l(value));
    } catch {
      // fetcher is expected to swallow its own errors and return a fallback
    } finally {
      inFlight = false;
    }
  };

  const onVisibility = () => {
    if (!document.hidden && listeners.size > 0 && Date.now() - lastRun >= ms) {
      void run();
    }
  };

  const start = () => {
    if (timer !== null) return;
    timer = window.setInterval(() => {
      if (!document.hidden) void run();
    }, ms);
    document.addEventListener("visibilitychange", onVisibility);
  };

  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    document.removeEventListener("visibilitychange", onVisibility);
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(value);
      if (listeners.size === 1) {
        void run();
        start();
      } else if (Date.now() - lastRun >= ms) {
        void run();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    refresh() {
      void run();
    },
    getSnapshot: () => value,
  };
}

export function useSharedPoller<T>(poller: SharedPoller<T>): T {
  const [value, setValue] = useState<T>(poller.getSnapshot);
  useEffect(() => poller.subscribe(setValue), [poller]);
  return value;
}
