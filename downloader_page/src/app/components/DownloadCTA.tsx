import { motion } from "motion/react";
import { Download, Apple, Terminal, Github, Copy, Check } from "lucide-react";
import { useState, useEffect } from "react";
import config from "../../config";

interface PlatformDownload {
  name: string;
  icon: any;
  sub: string;
  file: string;
  available: boolean;
  url?: string;
  size?: number;
}

export function DownloadCTA() {
  const [copied, setCopied] = useState(false);
  const [platforms, setPlatforms] = useState<PlatformDownload[]>([
    { name: "Windows", icon: Download, sub: "Windows 10 · 11", file: "AI-CLI-Orchestrator-Setup.exe", available: false },
    { name: "macOS", icon: Apple, sub: "Apple Silicon · Intel", file: "AI-CLI-Orchestrator-Setup.dmg", available: false },
    { name: "Linux", icon: Terminal, sub: ".deb · .rpm · AppImage", file: "AI-CLI-Orchestrator-Setup.AppImage", available: false },
  ]);
  const [apiError, setApiError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const installCmd = "curl -fsSL https://orch.dev/install.sh | sh";

  const fetchVersionInfo = async () => {
    try {
      const res = await fetch(config.getApiUrl(config.endpoints.version));
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      setPlatforms(prev => prev.map(p => {
        const platformKey = p.name.toLowerCase();
        const downloadInfo = data.downloads[platformKey];
        
        if (downloadInfo && downloadInfo.available) {
          return {
            ...p,
            available: true,
            url: downloadInfo.url,
            size: downloadInfo.size
          };
        }
        return p;
      }));
      setApiError(false);
    } catch (err) {
      console.error('Failed to fetch version info:', err);
      setApiError(true);
      // Auto-retry up to 2 times with exponential backoff
      if (retryCount < 2) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
        }, delay);
      }
    }
  };

  useEffect(() => {
    fetchVersionInfo();
  }, [retryCount]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback: create temporary textarea
      const textarea = document.createElement('textarea');
      textarea.value = installCmd;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textarea);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return ` · ${mb.toFixed(1)} MB`;
  };

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
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-neutral-300 mb-6">
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
            <p className="mt-5 text-neutral-400 text-lg">
              Install in 30 seconds. Auto‑detects every AI CLI on your machine.
            </p>

            {/* Install command */}
            <div className="mt-8 max-w-xl mx-auto">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-black/60 backdrop-blur-md font-mono text-sm">
                <span className="text-neutral-500">$</span>
                <span className="flex-1 text-left text-neutral-200 truncate">{installCmd}</span>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md hover:bg-white/5 text-neutral-400 hover:text-white transition-colors"
                  aria-label="Copy install command"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Platform downloads */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {platforms.map((p, i) => (
                <motion.a
                  key={p.name}
                  href={p.available ? config.getDownloadUrl(p.url!) : '#'}
                  download={p.available ? p.file : undefined}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
                  className={`group relative flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/10 backdrop-blur-md transition-all text-left ${
                    p.available
                      ? 'bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/20 cursor-pointer'
                      : 'bg-white/[0.01] opacity-50 cursor-not-allowed'
                  }`}
                  onClick={(e) => {
                    if (!p.available) {
                      e.preventDefault();
                    }
                  }}
                >
                  <div className={`w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center transition-colors ${
                    p.available ? 'group-hover:bg-white/10' : ''
                  }`}>
                    <p.icon className="w-4 h-4 text-neutral-200" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm" style={{ fontWeight: 500 }}>
                      {p.available ? `Download for ${p.name}` : `${p.name} (Coming Soon)`}
                    </div>
                    <div className="text-xs text-neutral-500 truncate">
                      {p.sub}{p.available && formatFileSize(p.size)}
                    </div>
                  </div>
                  {p.available && (
                    <Download className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors" />
                  )}
                </motion.a>
              ))}
            </div>

            {/* Footer note */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-neutral-500">
              <a
                href="#"
                className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
              >
                <Github className="w-4 h-4" />
                <span>View source on GitHub</span>
              </a>
              <span className="hidden sm:inline text-neutral-700">·</span>
              <span>MIT licensed · v1.0.0‑beta.3</span>
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
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-neutral-500">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Terminal className="w-3 h-3 text-white" strokeWidth={2.5} />
          </div>
          <span>© 2026 AI CLI Orchestrator. Built by devs, for devs.</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-white transition-colors">Docs</a>
          <a href="#" className="hover:text-white transition-colors">GitHub</a>
          <a href="#" className="hover:text-white transition-colors">Discord</a>
          <a href="#" className="hover:text-white transition-colors">Privacy</a>
        </div>
      </div>
    </footer>
  );
}
