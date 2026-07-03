/**
 * Dev launcher: Vite (frontend) + Electron shell.
 * Backend is started by Electron main process.
 */
const { spawn } = require("child_process");
const path = require("path");
const waitOn = require("wait-on");

const root = path.resolve(__dirname, "..", "..");
const frontendDir = path.join(root, "frontend");
const desktopDir = path.join(root, "desktop");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const vite = spawn(npm, ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], {
  cwd: frontendDir,
  env: {
    ...process.env,
    VITE_BACKEND_TARGET: "http://127.0.0.1:8000",
    VITE_API_BASE: "/api",
  },
  stdio: "inherit",
  shell: false,
});

const cleanup = () => {
  try {
    vite.kill("SIGTERM");
  } catch {
    /* ignore */
  }
};

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", cleanup);

waitOn({
  resources: ["http://127.0.0.1:5173"],
  timeout: 120_000,
  validateStatus: (status) => status >= 200 && status < 500,
})
  .then(() => {
    const electronCmd =
      process.platform === "win32"
        ? path.join(desktopDir, "node_modules", ".bin", "electron.cmd")
        : path.join(desktopDir, "node_modules", ".bin", "electron");
    const electron = spawn(electronCmd, ["."], {
      cwd: desktopDir,
      env: {
        ...process.env,
        ORCHESTRATOR_DEV: "1",
        ORCHESTRATOR_VITE_URL: "http://127.0.0.1:5173",
      },
      stdio: "inherit",
      shell: false,
    });
    electron.on("exit", (code) => {
      cleanup();
      process.exit(code ?? 0);
    });
  })
  .catch((err) => {
    console.error(err);
    cleanup();
    process.exit(1);
  });
