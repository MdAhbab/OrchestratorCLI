import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  /** Auto-update: called when a new version is found */
  onUpdateAvailable: (cb: (info: { version: string }) => void) => {
    ipcRenderer.on("update-available", (_evt, info) => cb(info));
  },
  /** Auto-update: downloaded and ready to install */
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => {
    ipcRenderer.on("update-downloaded", (_evt, info) => cb(info));
  },
  /** Auto-update: download progress */
  onUpdateProgress: (cb: (p: { percent: number }) => void) => {
    ipcRenderer.on("update-download-progress", (_evt, p) => cb(p));
  },
  /** Auto-update: no update available */
  onUpdateNotAvailable: (cb: () => void) => {
    ipcRenderer.on("update-not-available", () => cb());
  },
  /** Tell the main process to quit-and-install */
  installUpdate: () => ipcRenderer.send("update-install-now"),
  selectWorkspaceFolder: () => ipcRenderer.invoke("workspace-select-folder"),
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
