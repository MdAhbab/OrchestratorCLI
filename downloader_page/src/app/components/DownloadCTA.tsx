import { motion } from "motion/react";
import { Download, Apple, Terminal, ShieldAlert } from "lucide-react";

// ─── Release config ──────────────────────────────────────────────────────────
const RELEASE_VERSION = "0.9.1";

// Per-OS installer downloads. Windows + macOS are live; Linux is coming soon.
// Direct-download assets published on the project's GitHub Release — these download
// the installer immediately (the page shows no GitHub link; this is only the href).
// Asset names must match the `artifactName` patterns in desktop/package.json:
//   win: AI-Orchestrator-Setup-${version}.exe   mac: AI-Orchestrator-${version}-arm64.dmg
// To publish: create a GitHub Release tagged v${RELEASE_VERSION} and upload the .exe/.dmg.
type Build = { status: "available"; url: string } | { status: "coming_soon" };

const RELEASES_BASE = `https://github.com/MdAhbab/OrchestratorCLI/releases/download/v${RELEASE_VERSION}`;
const DOWNLOADS: Record<"Windows" | "macOS" | "Linux", Build> = {
  Windows: { status: "available", url: `${RELEASES_BASE}/AI-Orchestrator-Setup-${RELEASE_VERSION}.exe` },
  macOS:   { status: "available", url: `${RELEASES_BASE}/AI-Orchestrator-${RELEASE_VERSION}-arm64.dmg` },
  Linux:   { status: "coming_soon" },
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
    { name: "Windows" as const, icon: Download, sub: "Windows 10 · 11 · x64" },
    { name: "macOS" as const,   icon: Apple,    sub: "Apple Silicon · Intel" },
    { name: "Linux" as const,   icon: Terminal, sub: "Coming soon" },
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
                const build = DOWNLOADS[p.name];
                const comingSoon = build.status === "coming_soon";
                const isDetected = detectedOS === p.name && !comingSoon;

                const baseClass = [
                  "group relative flex items-center gap-3 px-4 py-3.5 rounded-xl border backdrop-blur-md transition-all text-left",
                  comingSoon
                    ? "border-white/10 bg-white/[0.02] opacity-60 cursor-not-allowed"
                    : isDetected
                      ? "border-violet-500/60 bg-violet-500/10 ring-1 ring-violet-500/40 hover:bg-violet-500/15 cursor-pointer"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/20 cursor-pointer",
                ].join(" ");

                const inner = (
                  <>
                    {isDetected && (
                      <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full bg-violet-500 text-white text-[10px] font-semibold tracking-wide uppercase">
                        Recommended
                      </span>
                    )}
                    {comingSoon && (
                      <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full border border-white/15 bg-white/10 text-neutral-300 text-[10px] font-semibold tracking-wide uppercase">
                        Coming soon
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
                        {comingSoon ? p.name : `Download for ${p.name}`}
                      </div>
                      <div className="text-sm text-neutral-500 truncate">{p.sub}</div>
                    </div>
                    {!comingSoon && (
                      <Download className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors" />
                    )}
                  </>
                );

                const anim = {
                  initial: { opacity: 0, y: 20 },
                  whileInView: { opacity: 1, y: 0 },
                  viewport: { once: true },
                  transition: { duration: 0.5, delay: 0.1 + i * 0.08 },
                };

                return comingSoon ? (
                  <motion.div key={p.name} {...anim} aria-disabled="true" className={baseClass}>
                    {inner}
                  </motion.div>
                ) : (
                  <motion.a
                    key={p.name}
                    href={build.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    {...anim}
                    className={baseClass}
                  >
                    {inner}
                  </motion.a>
                );
              })}
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-left text-sm text-amber-100">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p>
                Beta builds are currently unsigned. Windows may show a "not commonly
                downloaded" warning, and macOS may say the app is from an unidentified
                developer — just open it via right‑click → Open (macOS) or "Keep / Run
                anyway" (Windows). This is normal for a free beta and is safe to allow.
              </p>
            </div>

            {/* Footer note */}
            <div className="mt-8 flex items-center justify-center gap-2 text-base text-neutral-500">
              <span>Free during beta · MIT licensed · v{RELEASE_VERSION}</span>
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
        <div className="flex items-center gap-4">
          <span>Free during beta</span>
          <span className="text-neutral-700">·</span>
          <span>MIT Licensed</span>
        </div>
      </div>
    </footer>
  );
}
