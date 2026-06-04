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
  /**
   * Current app version — retrieved synchronously from the main process via IPC
   * because process.env.npm_package_version is not available in packaged apps.
   */
  appVersion: (() => {
    try {
      const v = ipcRenderer.sendSync("app-version") as string;
      return typeof v === "string" && v ? v : "0.8.1";
    } catch {
      return "0.8.1";
    }
  })(),
});
