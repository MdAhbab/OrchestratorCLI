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
  /** Current app version */
  appVersion: process.env.npm_package_version ?? "0.8.0",
});
