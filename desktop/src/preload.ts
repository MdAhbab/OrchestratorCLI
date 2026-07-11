import { contextBridge, ipcRenderer } from "electron";

// Wrap an IPC subscribe so renderer-side throws can't kill the bus, and
// return an `off()` handle for clean teardown on HMR remounts. Without this,
// Vite HMR re-evaluating the renderer would leave every previous listener
// attached, causing update events to fire 2x, then 3x, etc.
const subscribe = (
  channel: string,
  cb: (...args: unknown[]) => void,
): (() => void) => {
  const handler = (_evt: unknown, ...args: unknown[]) => {
    try {
      cb(...args);
    } catch (err) {
      // Swallow renderer errors so a bad callback doesn't break IPC for the
      // rest of the app — the error still surfaces in the devtools console.
      // eslint-disable-next-line no-console
      console.error(`[preload] listener for "${channel}" threw:`, err);
    }
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("electronAPI", {
  /** Auto-update: called when a new version is found */
  onUpdateAvailable: (cb: (info: { version: string }) => void) =>
    subscribe("update-available", (info) => cb(info as { version: string })),
  /** Auto-update: downloaded and ready to install */
  onUpdateDownloaded: (cb: (info: { version: string }) => void) =>
    subscribe("update-downloaded", (info) => cb(info as { version: string })),
  /** Auto-update: download progress */
  onUpdateProgress: (cb: (p: { percent: number }) => void) =>
    subscribe("update-download-progress", (p) =>
      cb(p as { percent: number }),
    ),
  /** Auto-update: no update available */
  onUpdateNotAvailable: (cb: () => void) =>
    subscribe("update-not-available", () => cb()),
  /** Tell the main process to quit-and-install */
  installUpdate: () => ipcRenderer.send("update-install-now"),
  /** Ask the main process to check GitHub Releases for a newer version */
  checkForUpdates: () => ipcRenderer.send("update-check"),
  selectWorkspaceFolder: () => ipcRenderer.invoke("workspace-select-folder"),
  /** Sync the Windows title-bar overlay colors with the app theme. */
  setTitleBarTheme: (dark: boolean) => ipcRenderer.send("titlebar-theme", dark),
  /**
   * Current app version — retrieved synchronously from the main process via IPC
   * because process.env.npm_package_version is not available in packaged apps.
   */
  appVersion: (() => {
    try {
      const v = ipcRenderer.sendSync("app-version") as string;
      return typeof v === "string" && v ? v : "0.9.1";
    } catch {
      return "0.9.1";
    }
  })(),
});

// Lightweight desktop-detection bridge (WS-1): lets the renderer reliably tell
// desktop from browser and branch native features (folder picker, etc.).
contextBridge.exposeInMainWorld("orchestratorDesktop", {
  isDesktop: true,
  platform: process.platform,
});
