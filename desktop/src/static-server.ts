import http from "http";
import fs from "fs";
import path from "path";
import httpProxy from "http-proxy";
import { getFrontendDistDir } from "./paths";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

export const DESKTOP_UI_PORT = 5174;
const DESKTOP_UI_HOST = "127.0.0.1";
const MAX_PORT_ATTEMPTS = 20;

export function getStaticServerPort(server: http.Server): number {
  const address = server.address();
  if (address && typeof address === "object") {
    return address.port;
  }
  return DESKTOP_UI_PORT;
}

/**
 * Serves the Vite production build and proxies /api, /health, and /ws to the backend
 * (same paths as frontend/vite.config.ts dev proxy).
 */
export function startStaticServer(
  backendBaseUrl: string,
  port = DESKTOP_UI_PORT,
): Promise<http.Server> {
  const distDir = getFrontendDistDir();
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    throw new Error(
      `Frontend build not found at ${distDir}. Run: npm run build --prefix ../frontend`,
    );
  }

  return listenWithPortFallback(() => createStaticServer(distDir, backendBaseUrl), port);
}

function createStaticServer(distDir: string, backendBaseUrl: string): http.Server {
  const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });
  const backendWs = backendBaseUrl.replace(/^http/, "ws");

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";

    if (
      url.startsWith("/api") ||
      url === "/health" ||
      url.startsWith("/health?") ||
      url.startsWith("/ws")
    ) {
      proxy.web(req, res, { target: backendBaseUrl }, (err) => {
        if (!res.headersSent) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              detail: err?.message ?? "Backend unavailable",
            }),
          );
        }
      });
      return;
    }

    serveFile(distDir, url, res);
  });

  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    // An unhandled 'error' on the proxy or raw socket would crash the main
    // process; terminal reconnects while the backend restarts hit this path.
    socket.on("error", () => socket.destroy());
    if (url.startsWith("/ws")) {
      proxy.ws(req, socket, head, { target: backendWs }, (err) => {
        console.warn(`[ui] ws proxy error: ${err?.message ?? err}`);
        socket.destroy();
      });
      return;
    }
    socket.destroy();
  });

  return server;
}

async function listenWithPortFallback(
  createServer: () => http.Server,
  startPort: number,
): Promise<http.Server> {
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset++) {
    const port = startPort + offset;
    const server = createServer();

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, DESKTOP_UI_HOST, () => {
          server.off("error", reject);
          resolve();
        });
      });
      console.log(`[ui] http://${DESKTOP_UI_HOST}:${port}`);
      return server;
    } catch (err) {
      server.close();
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") {
        throw err;
      }
      console.warn(`[ui] port ${port} is busy, trying ${port + 1}`);
    }
  }

  throw new Error(
    `No free UI port found from ${startPort} to ${startPort + MAX_PORT_ATTEMPTS - 1}`,
  );
}

function serveFile(distDir: string, url: string, res: http.ServerResponse): void {
  let rel: string;
  try {
    rel = decodeURIComponent(url.split("?")[0] ?? "/");
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (rel === "/") rel = "/index.html";

  const distRoot = path.resolve(distDir);
  const relWithoutSlash = rel.replace(/^[/\\]+/, "");
  const filePath = path.resolve(path.join(distRoot, relWithoutSlash));
  const rootRelative = path.relative(distRoot, filePath);
  if (rootRelative.startsWith("..") || path.isAbsolute(rootRelative)) {
    res.writeHead(403);
    res.end();
    return;
  }

  const tryPaths = [filePath];
  if (!path.extname(filePath)) {
    tryPaths.push(`${filePath}.html`);
  }

  const send = (target: string) => {
    const ext = path.extname(target);
    const type = MIME[ext] ?? "application/octet-stream";
    fs.createReadStream(target)
      .on("error", () => {
        if (!res.headersSent) {
          res.writeHead(404);
          res.end("Not found");
        }
      })
      .on("open", () => {
        res.writeHead(200, { "Content-Type": type });
      })
      .pipe(res);
  };

  for (const candidate of tryPaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      send(candidate);
      return;
    }
  }

  const spaFallback = path.join(distDir, "index.html");
  if (fs.existsSync(spaFallback)) {
    send(spaFallback);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}
