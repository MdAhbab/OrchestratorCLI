import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
} from "electron";
import fs from "fs";
import path from "path";
import http from "http";
import { BackendManager } from "./backend-manager";
import { DESKTOP_UI_PORT, startStaticServer } from "./static-server";
import { getFrontendDistDir, getProjectRoot } from "./paths";
import { setupAutoUpdater } from "./updater";

const isDev = process.env.IBMBOB_DEV === "1";
const VITE_DEV_URL = process.env.IBMBOB_VITE_URL ?? "http://127.0.0.1:5173";

let mainWindow: BrowserWindow | null = null;
let backend: BackendManager | null = null;
let uiServer: http.Server | null = null;

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function getAppIcon() {
  const iconPath = path.join(__dirname, "..", "build", "icon.png");
  try {
    return nativeImage.createFromPath(iconPath);
  } catch {
    return undefined;
  }
}

async function createWindow(loadUrl: string): Promise<void> {
  const icon = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#09090b",
    title: "AI Orchestrator",
    icon,
    autoHideMenuBar: true,
    ...(process.platform === "win32"
      ? {
          frame: false,
          titleBarStyle: "hidden" as const,
          titleBarOverlay: {
            color: "#09090b",
            symbolColor: "#e4e4e7",
            height: 40,
          },
        }
      : { frame: true }),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    // Wire auto-updater after window is visible
    if (!isDev && mainWindow) {
      setupAutoUpdater(mainWindow);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(loadUrl);
}

async function bootstrap(): Promise<void> {
  backend = new BackendManager();
  try {
    await backend.start();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to start backend";
    dialog.showErrorBox(
      "AI Orchestrator — Backend",
      `${message}\n\nEnsure Python 3.8+ is installed and restart the app.\nSee README for details.`,
    );
    app.quit();
    return;
  }

  let loadUrl: string;
  if (isDev) {
    loadUrl = VITE_DEV_URL;
  } else {
    try {
      uiServer = await startStaticServer(backend.baseUrl, DESKTOP_UI_PORT);
      loadUrl = `http://127.0.0.1:${DESKTOP_UI_PORT}`;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start UI server";
      dialog.showErrorBox("AI Orchestrator — UI", message);
      app.quit();
      return;
    }
  }

  await createWindow(loadUrl);
}

async function shutdown(): Promise<void> {
  if (uiServer) {
    await new Promise<void>((resolve) => uiServer!.close(() => resolve()));
    uiServer = null;
  }
  if (backend) {
    await backend.stop();
    backend = null;
  }
}

const gotLock = app.requestSingleInstanceLock();

// Expose app version synchronously to preload via ipcRenderer.sendSync
ipcMain.on("app-version", (event) => {
  event.returnValue = app.getVersion();
});

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (!isDev && !fs.existsSync(path.join(getFrontendDistDir(), "index.html"))) {
      console.warn(
        `[ui] No production build at ${getFrontendDistDir()}; dev may use Vite.`,
      );
    }
    console.log(`[app] project root: ${getProjectRoot()}`);
    void bootstrap();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      void shutdown().finally(() => app.quit());
    }
  });

  app.on("before-quit", () => {
    void shutdown();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrap();
    }
  });
}
