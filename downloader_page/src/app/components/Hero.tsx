import { motion } from "motion/react";
import { Download, ArrowRight, Sparkles, Cpu, Layers, Network } from "lucide-react";

const cliLogos = [
  { name: "Claude Code", color: "from-orange-400 to-amber-500" },
  { name: "Gemini", color: "from-blue-400 to-indigo-500" },
  { name: "Codex", color: "from-emerald-400 to-teal-500" },
  { name: "Copilot", color: "from-purple-400 to-violet-500" },
  { name: "DeepSeek", color: "from-pink-400 to-rose-500" },
  { name: "Cline", color: "from-cyan-400 to-sky-500" },
];

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-32 pb-20 px-4 overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] rounded-full bg-fuchsia-500/10 blur-[100px]" />
        <div className="absolute top-1/2 right-1/4 w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      {/* Grid pattern */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
        }}
      />

      {/* Pill announcement */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-xs text-neutral-300"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
        </span>
        <span>v1.0 — Now in public beta</span>
        <ArrowRight className="w-3 h-3 text-neutral-500" />
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="max-w-5xl mx-auto text-center tracking-[-0.04em] leading-[0.95]"
        style={{
          fontSize: "clamp(2.5rem, 7vw, 5.5rem)",
          fontWeight: 600,
        }}
      >
        <span className="bg-gradient-to-b from-white via-white to-neutral-500 bg-clip-text text-transparent">
          One orchestrator for
        </span>
        <br />
        <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-rose-400 bg-clip-text text-transparent">
          every AI CLI you use.
        </span>
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="mt-7 max-w-2xl mx-auto text-center text-neutral-400 text-lg leading-relaxed"
      >
        Stop juggling Claude, Gemini, Copilot, Codex, and DeepSeek manually.
        Auto‑failover before rate limits hit, unified context across every CLI,
        and parallel execution that ships features 3× faster.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
        className="mt-10 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto px-4 sm:px-0"
      >
        <a
          href="#download"
          className="group relative inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white text-black hover:bg-neutral-100 transition-all shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_12px_50px_rgba(168,85,247,0.4)] w-full sm:w-auto"
        >
          <span
            className="absolute -inset-px rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 opacity-0 group-hover:opacity-100 blur-md transition-opacity -z-10"
          />
          <Download className="w-4 h-4" strokeWidth={2.5} />
          <span style={{ fontWeight: 500 }}>Download Installer</span>
          <span className="hidden md:inline text-neutral-500 text-sm ml-1">— macOS · Linux · Win</span>
        </a>

        <a
          href="#features"
          className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md text-neutral-200 hover:bg-white/10 transition-all w-full sm:w-auto"
        >
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span>See how it works</span>
        </a>
      </motion.div>

      {/* Trust strip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="mt-16 flex flex-col items-center gap-5"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">
          Orchestrates 8+ AI CLIs in parallel
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 px-4">
          {cliLogos.map((cli, i) => (
            <motion.div
              key={cli.name}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.6 + i * 0.05 }}
              className="group relative px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full bg-gradient-to-br ${cli.color} shadow-lg`} />
                <span className="text-sm text-neutral-400 group-hover:text-neutral-200 transition-colors">
                  {cli.name}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Floating dashboard preview */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mt-20 w-full max-w-5xl relative"
      >
        <div className="absolute -inset-4 bg-gradient-to-r from-violet-600/30 via-fuchsia-600/20 to-blue-600/30 blur-3xl -z-10" />
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-900/80 to-black/80 backdrop-blur-xl overflow-hidden shadow-2xl">
          {/* Window chrome */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/40">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/80" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <span className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="text-xs text-neutral-500 font-mono">orchestrator · dashboard</div>
            <div className="w-12" />
          </div>

          {/* Dashboard content */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/5">
            {[
              { icon: Cpu, label: "Active CLIs", value: "6 / 8", color: "text-emerald-400" },
              { icon: Layers, label: "Context Sync", value: "1.2s", color: "text-violet-400" },
              { icon: Network, label: "Tasks Routed", value: "1,284", color: "text-fuchsia-400" },
            ].map((stat) => (
              <div key={stat.label} className="bg-black/60 p-5">
                <div className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider">
                  <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                  {stat.label}
                </div>
                <div className="mt-2 text-2xl text-white tracking-tight" style={{ fontWeight: 500 }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          <div className="p-5 space-y-2 font-mono text-xs">
            {[
              { cli: "claude-code", status: "█████████░", pct: "92%", color: "bg-orange-500" },
              { cli: "gemini-cli", status: "███████░░░", pct: "71%", color: "bg-blue-500" },
              { cli: "codex-cli", status: "████░░░░░░", pct: "44%", color: "bg-emerald-500" },
              { cli: "deepseek", status: "██████████", pct: "100% · rerouting", color: "bg-red-500" },
            ].map((row) => (
              <div key={row.cli} className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full ${row.color} shadow-lg`} />
                  <span className="text-neutral-300 truncate">{row.cli}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-neutral-500 hidden sm:inline">{row.status}</span>
                  <span className="text-neutral-400 tabular-nums">{row.pct}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
