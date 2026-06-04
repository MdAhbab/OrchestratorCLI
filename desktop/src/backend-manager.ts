import { ChildProcess, spawn, spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import http from "http";
import net from "net";
import path from "path";
import {
  getCacheDir,
  getDataDir,
  getProjectRoot,
  getTempDir,
  getUserDataDir,
  resolvePythonExecutable,
} from "./paths";

const DEFAULT_BACKEND_PORT = 8000;
const HEALTH_TIMEOUT_MS = 60_000; // extended for first-launch venv install

function readOrCreateSecret(fileName: string, byteLength = 32): string {
  const dir = path.join(getUserDataDir(), "secrets");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8").trim();
  }

  const value = crypto
    .randomBytes(byteLength)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  fs.writeFileSync(filePath, `${value}\n`, { encoding: "utf-8", mode: 0o600 });
  return value;
}

/**
 * Resolve the system Python executable (not a venv).
 * Used only during venv bootstrap.
 */
function resolveSystemPython(): string | null {
  const candidates =
    process.platform === "win32"
      ? ["py", "python", "python3"]
      : ["python3", "python"];

  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ["--version"], { timeout: 5000 });
      if (r.status === 0) return cmd;
    } catch {
      // not found
    }
  }
  return null;
}

/**
 * Create backend/venv and pip-install requirements if the venv is missing.
 * Returns true on success, throws on failure.
 */
export function ensureBackendVenv(
  backendDir: string,
  onProgress?: (msg: string) => void,
): boolean {
  const log = onProgress ?? ((m: string) => console.log(`[venv] ${m}`));

  const venvDir =
    process.platform === "win32"
      ? path.join(backendDir, "venv", "Scripts")
      : path.join(backendDir, "venv", "bin");

  const venvPython =
    process.platform === "win32"
      ? path.join(venvDir, "python.exe")
      : path.join(venvDir, "python");

  // Already installed — nothing to do.
  if (fs.existsSync(venvPython)) {
    log("venv already present, skipping setup.");
    return true;
  }

  log("venv not found — running first-launch setup…");

  const sysPython = resolveSystemPython();
  if (!sysPython) {
    throw new Error(
      "Python 3.8+ not found. Install Python from https://python.org and restart.",
    );
  }

  log(`Using system Python: ${sysPython}`);

  // Create venv
  log("Creating virtual environment…");
  const createResult = spawnSync(
    sysPython === "py" ? sysPython : sysPython,
    sysPython === "py"
      ? ["-3", "-m", "venv", path.join(backendDir, "venv")]
      : ["-m", "venv", path.join(backendDir, "venv")],
    { cwd: backendDir, stdio: "pipe", timeout: 60_000 },
  );

  if (createResult.status !== 0) {
    const stderr = createResult.stderr?.toString() ?? "";
    throw new Error(`venv creation failed:\n${stderr}`);
  }
  log("Virtual environment created.");

  // Install requirements
  const reqFile = path.join(backendDir, "requirements.txt");
  if (!fs.existsSync(reqFile)) {
    log("No requirements.txt found — skipping pip install.");
    return true;
  }

  log("Installing backend dependencies (this may take a minute)…");
  const pipResult = spawnSync(
    venvPython,
    ["-m", "pip", "install", "--upgrade", "pip", "-q"],
    { cwd: backendDir, stdio: "pipe", timeout: 120_000 },
  );
  if (pipResult.status !== 0) {
    log("Warning: pip upgrade failed (non-fatal).");
  }

  const installResult = spawnSync(
    venvPython,
    ["-m", "pip", "install", "-r", reqFile],
    { cwd: backendDir, stdio: ["ignore", "pipe", "pipe"], timeout: 300_000 },
  );

  if (installResult.status !== 0) {
    const stderr = installResult.stderr?.toString() ?? "";
    throw new Error(`pip install failed:\n${stderr}`);
  }

  log("Backend dependencies installed successfully.");
  return true;
}

function checkPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, host);
  });
}

async function findFreePort(startPort: number, host: string): Promise<number> {
  let port = startPort;
  while (true) {
    if (await checkPortFree(port, host)) {
      return port;
    }
    port++;
  }
}

export class BackendManager {
  private process: ChildProcess | null = null;
  port: number;
  private readonly host = "127.0.0.1";

  constructor(port = DEFAULT_BACKEND_PORT) {
    this.port = port;
  }

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  async start(): Promise<void> {
    if (this.process && this.process.exitCode === null) {
      return;
    }

    this.port = await findFreePort(this.port, this.host);

    const projectRoot = getProjectRoot();
    const backendDir = path.join(projectRoot, "backend");

    // ------------------------------------------------------------------
    // Ensure backend venv exists (first-launch auto-installer).
    // ------------------------------------------------------------------
    try {
      ensureBackendVenv(backendDir, (msg) =>
        console.log(`[backend-setup] ${msg}`),
      );
    } catch (err) {
      throw new Error(
        `Failed to set up Python environment:\n${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const python = resolvePythonExecutable();
    if (!python) {
      throw new Error(
        "Python not found after venv setup. Create backend/venv manually (see README).",
      );
    }

    const userDataDir = getUserDataDir();
    const dbPath = path.join(getDataDir(), "bob.db");
    const dbAbs = path.resolve(dbPath);
    fs.mkdirSync(path.dirname(dbAbs), { recursive: true });
    getCacheDir();
    getTempDir();

    const corsOrigins = [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ].join(",");

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_PATH: dbAbs,
      DATABASE_URL: `sqlite+aiosqlite:///${dbAbs.replace(/\\/g, "/")}`,
      CORS_ORIGINS: corsOrigins,
      API_HOST: this.host,
      API_PORT: String(this.port),
      DEBUG: "false",
      ENCRYPTION_KEY:
        process.env.ENCRYPTION_KEY || readOrCreateSecret("encryption.key"),
      SECRET_KEY:
        process.env.SECRET_KEY || readOrCreateSecret("secret.key"),
      ORCHESTRATOR_USER_DATA: userDataDir,
      IBMBOB_USER_DATA: userDataDir,
    };

    const debugValue = env.DEBUG?.trim().toLowerCase();
    if (debugValue && !["true", "false", "1", "0"].includes(debugValue)) {
      delete env.DEBUG;
    }

    const uvicornTail = [
      "uvicorn",
      "backend.main:app",
      "--host",
      this.host,
      "--port",
      String(this.port),
    ];
    const args =
      python === "py" ? ["-3", "-m", ...uvicornTail] : ["-m", ...uvicornTail];

    this.process = spawn(python, args, {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    this.process.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(`[backend] ${chunk.toString()}`);
    });
    this.process.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`[backend] ${chunk.toString()}`);
    });

    this.process.on("exit", (code, signal) => {
      if (code !== null && code !== 0) {
        console.error(`[backend] exited code=${code} signal=${signal}`);
      }
      this.process = null;
    });

    await this.waitForHealth(this.process);
  }

  private waitForHealth(proc: ChildProcess): Promise<void> {
    const url = `${this.baseUrl}/health`;
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      const attempt = () => {
        if (proc.exitCode != null || proc.signalCode != null) {
          reject(new Error("Backend process exited before becoming healthy"));
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error(`Backend health check timed out (${url})`));
          return;
        }

        const req = http.get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve();
          } else {
            setTimeout(attempt, 300);
          }
        });
        req.on("error", () => setTimeout(attempt, 300));
        req.setTimeout(2000, () => {
          req.destroy();
          setTimeout(attempt, 300);
        });
      };
      attempt();
    });
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    const proc = this.process;
    this.process = null;
    proc.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        resolve();
      }, 5000);
      proc.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
