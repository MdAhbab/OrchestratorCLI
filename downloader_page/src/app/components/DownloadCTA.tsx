import { motion } from "motion/react";
import { Download, Apple, Terminal, Github, ShieldAlert } from "lucide-react";

// ─── Release config ──────────────────────────────────────────────────────────
// Update RELEASE_VERSION when cutting a new release; asset filenames must match
// the artifactName patterns in desktop/package.json.
const RELEASE_VERSION = "0.9.1";
const RELEASES_BASE = `https://github.com/MdAhbab/IBMbob/releases/download/v${RELEASE_VERSION}`;

// Asset names must match the `artifactName` patterns in desktop/package.json.
const DOWNLOAD_LINKS: Record<string, string> = {
  Windows: `${RELEASES_BASE}/AI-Orchestrator-Setup-${RELEASE_VERSION}.exe`,
  macOS:   `${RELEASES_BASE}/AI-Orchestrator-${RELEASE_VERSION}-arm64.dmg`,
  Linux:   `${RELEASES_BASE}/AI-Orchestrator-${RELEASE_VERSION}-x64.AppImage`,
};

// ─── OS detection ────────────────────────────────────────────────────────────
function detectOS(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "Windows";
  if (ua.includes("mac")) return "macOS";
  if (ua.includes("linux") || ua.includes("x11")) return "Linux";
  return "";
}

// ─── Component ───────────────────────────────────────────────────────────────
export function DownloadCTA() {
  const detectedOS = detectOS();

  const platforms = [
    { name: "Windows", icon: Download, sub: "Windows 10 · 11 · x64" },
    { name: "macOS",   icon: Apple,    sub: "Apple Silicon · Intel" },
    { name: "Linux",   icon: Terminal, sub: "AppImage · amd64" },
  ];

  return (
    <section id="download" className="relative py-32 px-4">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full bg-violet-600/20 blur-[140px]" />
      </div>

      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="relative rounded-[2rem] overflow-hidden border border-white/10 bg-gradient-to-br from-neutral-900 via-black to-neutral-900 p-10 md:p-16"
        >
          {/* Glow border */}
          <div className="absolute -inset-px rounded-[2rem] bg-gradient-to-r from-violet-500/40 via-fuchsia-500/40 to-blue-500/40 opacity-50 blur-md -z-10" />

          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
              maskImage:
                "radial-gradient(ellipse at center, black 0%, transparent 60%)",
            }}
          />

          <div className="relative text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-neutral-300 mb-6">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-400" />
              </span>
              <span>Free during beta</span>
            </div>

            <h2
              className="text-white tracking-[-0.03em] leading-tight"
              style={{ fontSize: "clamp(2rem, 5vw, 3.75rem)", fontWeight: 600 }}
            >
              Stop juggling.{" "}
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-rose-400 bg-clip-text text-transparent">
                Start orchestrating.
              </span>
            </h2>
            <p className="mt-5 text-neutral-400 text-xl mb-8">
              Install in seconds. Auto‑detects every AI CLI on your machine.
            </p>

            {/* Platform downloads */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {platforms.map((p, i) => {
                const isDetected = detectedOS === p.name;
                return (
                  <motion.a
                    key={p.name}
                    href={DOWNLOAD_LINKS[p.name]}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
                    className={[
                      "group relative flex items-center gap-3 px-4 py-3.5 rounded-xl border backdrop-blur-md transition-all text-left cursor-pointer",
                      isDetected
                        ? "border-violet-500/60 bg-violet-500/10 ring-1 ring-violet-500/40 hover:bg-violet-500/15"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/20",
                    ].join(" ")}
                  >
                    {isDetected && (
                      <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full bg-violet-500 text-white text-[10px] font-semibold tracking-wide uppercase">
                        Recommended
                      </span>
                    )}
                    <div className={[
                      "w-9 h-9 rounded-lg border flex items-center justify-center transition-colors",
                      isDetected
                        ? "bg-violet-500/20 border-violet-500/40 group-hover:bg-violet-500/30"
                        : "bg-white/5 border-white/10 group-hover:bg-white/10",
                    ].join(" ")}>
                      <p.icon className="w-4 h-4 text-neutral-200" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-base" style={{ fontWeight: 500 }}>
                        Download for {p.name}
                      </div>
                      <div className="text-sm text-neutral-500 truncate">
                        {p.sub}
                      </div>
                    </div>
                    <Download className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors" />
                  </motion.a>
                );
              })}
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-left text-sm text-amber-100">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p>
                Windows beta builds are currently unsigned, so Edge or Chrome may show a
                "not commonly downloaded" warning. The installer is published from the
                project GitHub release; signed builds will remove this warning after the
                app gains Windows reputation.
              </p>
            </div>

            {/* Footer note */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-base text-neutral-500">
              <a
                href="https://github.com/MdAhbab/IBMbob"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
              >
                <Github className="w-4 h-4" />
                <span>View source on GitHub</span>
              </a>
              <span className="hidden sm:inline text-neutral-700">·</span>
              <span>MIT licensed · v{RELEASE_VERSION}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/5 px-4 py-10 mt-10">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-base text-neutral-500">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Terminal className="w-3 h-3 text-white" strokeWidth={2.5} />
          </div>
          <span>© 2026 AI CLI Orchestrator. Built by devs, for devs.</span>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/MdAhbab/IBMbob/blob/main/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            Docs
          </a>
          <a
            href="https://github.com/MdAhbab/IBMbob"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://github.com/MdAhbab/IBMbob/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            Discussions
          </a>
          <a
            href="https://github.com/MdAhbab/IBMbob/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            License
          </a>
        </div>
      </div>
    </footer>
  );
}
