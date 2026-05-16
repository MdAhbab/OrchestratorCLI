import { motion } from "motion/react";
import {
  Activity,
  GitBranch,
  Route,
  Save,
  LineChart,
  Layers3,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";

export function Features() {
  return (
    <section id="features" className="relative py-32 px-4">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] rounded-full bg-violet-500/10 blur-[140px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[140px]" />
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300 mb-6">
            <Sparkles className="w-3 h-3" />
            <span className="uppercase tracking-wider">The Solution</span>
          </div>
          <h2
            className="text-white tracking-[-0.03em] leading-tight"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 600 }}
          >
            One control plane for{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
              every AI CLI.
            </span>
          </h2>
          <p className="mt-5 text-neutral-400 text-lg">
            Auto‑failover, shared context, intelligent routing, and parallel execution —
            all from a single config file.
          </p>
        </motion.div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 auto-rows-[minmax(180px,auto)]">
          {/* Large: Auto Rate Limit Management */}
          <BentoCard className="sm:col-span-2 md:col-span-4 md:row-span-2" delay={0}>
            <div className="absolute -top-32 -right-32 w-72 h-72 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="relative h-full flex flex-col">
              <FeatureIcon icon={Activity} color="emerald" />
              <h3 className="mt-5 text-white tracking-tight" style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                Automatic Rate Limit Management
              </h3>
              <p className="mt-2 text-neutral-400 leading-relaxed max-w-md">
                Real‑time quota tracking across every CLI. Predictive switching with{" "}
                <span className="text-white">90%+ accuracy</span> and seamless failover in{" "}
                <span className="text-white">under 5 seconds.</span>
              </p>

              {/* Live mini-dash */}
              <div className="mt-6 flex-1 rounded-xl border border-white/5 bg-black/50 p-4 space-y-2.5">
                {[
                  { name: "claude-code", pct: 92, color: "from-orange-400 to-red-500", state: "rerouting" },
                  { name: "gemini-cli", pct: 38, color: "from-blue-400 to-indigo-500", state: "active" },
                  { name: "codex-cli", pct: 64, color: "from-emerald-400 to-teal-500", state: "active" },
                  { name: "deepseek", pct: 12, color: "from-pink-400 to-rose-500", state: "idle" },
                ].map((row, i) => (
                  <motion.div
                    key={row.name}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.1 * i }}
                    className="flex items-center gap-3 text-xs font-mono"
                  >
                    <span className="text-neutral-400 w-24 truncate">{row.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${row.pct}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: 0.2 + 0.1 * i, ease: "easeOut" }}
                        className={`h-full bg-gradient-to-r ${row.color} rounded-full`}
                      />
                    </div>
                    <span
                      className={`w-20 text-right ${
                        row.state === "rerouting"
                          ? "text-orange-400"
                          : row.state === "idle"
                          ? "text-neutral-500"
                          : "text-emerald-400"
                      }`}
                    >
                      {row.pct}%
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* Tall: Unified Context */}
          <BentoCard className="sm:col-span-2 md:col-span-2 md:row-span-2" delay={0.1}>
            <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="relative h-full flex flex-col">
              <FeatureIcon icon={GitBranch} color="violet" />
              <h3 className="mt-5 text-white tracking-tight" style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                Unified Context
              </h3>
              <p className="mt-2 text-neutral-400 text-sm leading-relaxed">
                One source of truth via{" "}
                <code className="px-1 py-0.5 rounded bg-white/5 text-violet-300 text-xs">skill.md</code> and{" "}
                <code className="px-1 py-0.5 rounded bg-white/5 text-violet-300 text-xs">plan.md</code>.
                Syncs to every CLI in &lt; 2s.
              </p>

              <div className="mt-auto pt-6 space-y-2">
                {["claude", "gemini", "codex", "copilot", "cline"].map((cli, i) => (
                  <motion.div
                    key={cli}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    className="flex items-center gap-2 text-xs font-mono text-neutral-500"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
                    <span>→ {cli}</span>
                    <span className="ml-auto text-emerald-400">synced</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* Intelligent Routing */}
          <BentoCard className="sm:col-span-1 md:col-span-3" delay={0.15}>
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <div className="relative">
              <FeatureIcon icon={Route} color="fuchsia" />
              <h3 className="mt-5 text-white tracking-tight" style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                Intelligent Task Routing
              </h3>
              <p className="mt-2 text-neutral-400 text-sm leading-relaxed">
                NLP‑based classification routes each task to the right CLI — frontend → Gemini, backend → Codex.
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-mono">
                {[
                  { from: "frontend", to: "gemini" },
                  { from: "backend", to: "codex" },
                  { from: "refactor", to: "claude" },
                ].map((r) => (
                  <span
                    key={r.from}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-neutral-300"
                  >
                    {r.from}
                    <ArrowUpRight className="w-3 h-3 text-fuchsia-400" />
                    <span className="text-fuchsia-300">{r.to}</span>
                  </span>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* Session Persistence */}
          <BentoCard className="sm:col-span-1 md:col-span-3" delay={0.2}>
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="relative">
              <FeatureIcon icon={Save} color="blue" />
              <h3 className="mt-5 text-white tracking-tight" style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                Session Persistence
              </h3>
              <p className="mt-2 text-neutral-400 text-sm leading-relaxed">
                YAML‑backed state. Crash, reboot, switch machines — pick up exactly where you left off.
              </p>

              <div className="mt-4 rounded-lg border border-white/5 bg-black/50 p-3 font-mono text-xs">
                <div className="text-neutral-500">session.yaml</div>
                <div className="mt-1 text-neutral-300">
                  <span className="text-blue-400">project:</span> orchestrator-web
                </div>
                <div className="text-neutral-300">
                  <span className="text-blue-400">active_cli:</span> gemini
                </div>
                <div className="text-neutral-300">
                  <span className="text-blue-400">checkpoint:</span> 2026-05-15T14:22:08Z
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Real-time Monitoring */}
          <BentoCard className="sm:col-span-1 md:col-span-3" delay={0.25}>
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="relative">
              <FeatureIcon icon={LineChart} color="cyan" />
              <h3 className="mt-5 text-white tracking-tight" style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                Real‑time Monitoring
              </h3>
              <p className="mt-2 text-neutral-400 text-sm leading-relaxed">
                Live terminal output, usage analytics, and performance graphs from every connected CLI.
              </p>

              {/* Sparkline */}
              <div className="mt-4 h-16 flex items-end gap-1">
                {[40, 60, 35, 80, 55, 90, 70, 95, 65, 85, 75, 100, 80, 92].map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    whileInView={{ height: `${h}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.05 * i }}
                    className="flex-1 bg-gradient-to-t from-cyan-500/40 to-cyan-400 rounded-sm"
                  />
                ))}
              </div>
            </div>
          </BentoCard>

          {/* Parallel Execution */}
          <BentoCard className="sm:col-span-1 md:col-span-3" delay={0.3}>
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-rose-500/20 blur-3xl" />
            <div className="relative">
              <FeatureIcon icon={Layers3} color="rose" />
              <h3 className="mt-5 text-white tracking-tight" style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                Parallel Execution
              </h3>
              <p className="mt-2 text-neutral-400 text-sm leading-relaxed">
                Fan tasks out across multiple CLIs simultaneously. Shared context keeps them aligned.{" "}
                <span className="text-white">2–3× faster</span> on multi‑domain work.
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[10px]">
                {["claude", "gemini", "codex"].map((cli, i) => (
                  <motion.div
                    key={cli}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                    className="rounded-lg border border-white/5 bg-black/50 p-2"
                  >
                    <div className="flex items-center gap-1.5 text-neutral-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                      {cli}
                    </div>
                    <div className="mt-1 text-emerald-400">running</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

function BentoCard({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative rounded-3xl border border-white/10 bg-gradient-to-br from-neutral-900/80 to-black/90 p-6 overflow-hidden hover:border-white/20 transition-colors ${className}`}
    >
      {children}
    </motion.div>
  );
}

function FeatureIcon({
  icon: Icon,
  color,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: "emerald" | "violet" | "fuchsia" | "blue" | "cyan" | "rose";
}) {
  const colorMap = {
    emerald: "from-emerald-500/30 to-teal-500/20 border-emerald-500/40 text-emerald-300",
    violet: "from-violet-500/30 to-purple-500/20 border-violet-500/40 text-violet-300",
    fuchsia: "from-fuchsia-500/30 to-pink-500/20 border-fuchsia-500/40 text-fuchsia-300",
    blue: "from-blue-500/30 to-indigo-500/20 border-blue-500/40 text-blue-300",
    cyan: "from-cyan-500/30 to-sky-500/20 border-cyan-500/40 text-cyan-300",
    rose: "from-rose-500/30 to-pink-500/20 border-rose-500/40 text-rose-300",
  };

  return (
    <div
      className={`w-11 h-11 rounded-xl bg-gradient-to-br border flex items-center justify-center ${colorMap[color]}`}
    >
      <Icon className="w-5 h-5" strokeWidth={2} />
    </div>
  );
}
