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

// Mirror all main-process output to userData/logs/main.log so packaged-app
// startup failures are diagnosable (a double-clicked GUI app has no console).
const logFile = path.join(app.getPath("userData"), "logs", "main.log");
function flog(line: string): void {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    /* logging must never break the app */
  }
}
for (const level of ["log", "warn", "error"] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    flog(args.map(String).join(" "));
    original(...args);
  };
}
process.on("uncaughtException", (err) => {
  flog(`uncaughtException: ${err.stack ?? err}`);
});
process.on("unhandledRejection", (reason) => {
  flog(`unhandledRejection: ${reason}`);
});
flog(`--- app start pid=${process.pid} version=${app.getVersion()} packaged=${app.isPackaged} ---`);

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
          // Height matches the renderer's h-14 top bar so the native
          // window controls sit inside that row instead of above it.
          titleBarOverlay: {
            color: "#09090b",
            symbolColor: "#e4e4e7",
            height: 56,
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
  console.log("[app] bootstrap: starting backend…");
  backend = new BackendManager();
  try {
    await backend.start();
    console.log(`[app] backend healthy at ${backend.baseUrl}`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to start backend";
    console.error(`[app] backend failed to start: ${message}`);
    dialog.showErrorBox(
      "AI Orchestrator — Backend",
      `${message}\n\nEnsure Python 3.8+ is installed and restart the app.\nLog: ${logFile}`,
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

// Keep the native window-control overlay in sync with the app theme so it
// doesn't render as a dark block on a light UI.
ipcMain.on("titlebar-theme", (_event, dark: boolean) => {
  if (process.platform !== "win32") return;
  try {
    mainWindow?.setTitleBarOverlay({
      color: dark ? "#09090b" : "#fafafa",
      symbolColor: dark ? "#e4e4e7" : "#3f3f46",
      height: 56,
    });
  } catch {
    /* window may be closing */
  }
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
  flog("another instance holds the single-instance lock — quitting");
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    flog("app ready");
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
