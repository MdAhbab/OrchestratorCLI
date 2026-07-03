import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  OpenDialogOptions,
  shell,
} from "electron";
import fs from "fs";
import path from "path";
import http from "http";
import { BackendManager } from "./backend-manager";
import {
  DESKTOP_UI_PORT,
  getStaticServerPort,
  startStaticServer,
} from "./static-server";
import { getFrontendDistDir, getProjectRoot } from "./paths";
import { setupAutoUpdater } from "./updater";

const isDev = process.env.ORCHESTRATOR_DEV === "1";
const VITE_DEV_URL = process.env.ORCHESTRATOR_VITE_URL ?? "http://127.0.0.1:5173";

let mainWindow: BrowserWindow | null = null;
let backend: BackendManager | null = null;
let uiServer: http.Server | null = null;
let lastLoadUrl: string | null = null;
let shuttingDown = false;

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

  const allowedOrigin = new URL(loadUrl).origin;
  const openExternally = (url: string) => {
    try {
      const proto = new URL(url).protocol;
      if (proto === "http:" || proto === "https:" || proto === "mailto:") {
        void shell.openExternal(url);
      }
    } catch {
      /* invalid URL — drop it */
    }
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: "deny" };
  });

  // Keep the window pinned to the app's own origin; anything else goes to the
  // system browser instead of replacing the UI.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    let origin: string | null = null;
    try {
      origin = new URL(url).origin;
    } catch {
      /* fallthrough to block */
    }
    if (origin !== allowedOrigin) {
      event.preventDefault();
      openExternally(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
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
      loadUrl = `http://127.0.0.1:${getStaticServerPort(uiServer)}`;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start UI server";
      dialog.showErrorBox("AI Orchestrator — UI", message);
      app.quit();
      return;
    }
  }

  lastLoadUrl = loadUrl;
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

ipcMain.handle("workspace-select-folder", async () => {
  const options: OpenDialogOptions = {
    title: "Select workspace folder",
    properties: ["openDirectory", "createDirectory"],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
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
      app.quit();
    }
  });

  // Hold the quit until the backend and UI server have actually stopped so
  // no orphaned uvicorn process is left behind.
  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    shuttingDown = true;
    void shutdown().finally(() => app.quit());
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // macOS dock re-activation: the backend is still running, so only the
      // window needs recreating — a full bootstrap would spawn a second one.
      if (backend && lastLoadUrl) {
        void createWindow(lastLoadUrl);
      } else {
        void bootstrap();
      }
    }
  });
}
