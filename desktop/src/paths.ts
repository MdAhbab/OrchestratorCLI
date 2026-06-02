import { app } from "electron";
import fs from "fs";
import path from "path";

/** Directory containing the `backend` Python package. */
export function getProjectRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.resolve(__dirname, "..", "..");
}

export function getBackendDir(): string {
  return path.join(getProjectRoot(), "backend");
}

/** Vite production build served in packaged desktop mode. */
export function getFrontendDistDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "frontend", "dist");
  }
  return path.join(getProjectRoot(), "frontend", "dist");
}

export function getUserDataDir(): string {
  const root = app.isPackaged ? app.getPath("userData") : getProjectRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function getDataDir(): string {
  const root = path.join(getUserDataDir(), "data");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function getCacheDir(): string {
  const root = path.join(getUserDataDir(), "cache");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function getTempDir(): string {
  const root = path.join(getUserDataDir(), "tmp");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function resolvePythonExecutable(): string | null {
  const backendDir = getBackendDir();
  const venvPython =
    process.platform === "win32"
      ? path.join(backendDir, "venv", "Scripts", "python.exe")
      : path.join(backendDir, "venv", "bin", "python");

  if (fs.existsSync(venvPython)) {
    return venvPython;
  }

  if (process.platform === "win32") {
    return "py";
  }
  return "python3";
}
