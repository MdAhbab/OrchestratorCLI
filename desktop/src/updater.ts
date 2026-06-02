/**
 * Auto-update integration using electron-updater.
 * Checks GitHub Releases for new versions and notifies the renderer.
 */

import { BrowserWindow, ipcMain } from "electron";
import { autoUpdater, UpdateInfo } from "electron-updater";

let mainWindow: BrowserWindow | null = null;

function notify(event: string, payload?: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(event, payload);
  }
}

export function setupAutoUpdater(win: BrowserWindow): void {
  mainWindow = win;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Silence update errors in development (no publish config)
  autoUpdater.on("error", (err: Error) => {
    console.warn("[updater] error:", err.message);
  });

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] checking for update…");
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    console.log(`[updater] update available: v${info.version}`);
    notify("update-available", { version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] up to date.");
    notify("update-not-available");
  });

  autoUpdater.on("download-progress", (progress) => {
    notify("update-download-progress", {
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    console.log(`[updater] update downloaded: v${info.version}`);
    notify("update-downloaded", { version: info.version });
  });

  // Handle renderer request to install now
  ipcMain.on("update-install-now", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Delay check slightly so the window is ready
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      console.warn("[updater] check failed:", err.message);
    });
  }, 5000);
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
    console.warn("[updater] manual check failed:", err.message);
  });
}
