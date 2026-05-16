import { useEffect } from "react";
import Lenis from "lenis";
import { Navbar } from "./components/Navbar";
import { Hero } from "./components/Hero";
import { PainPoints } from "./components/PainPoints";
import { Features } from "./components/Features";
import { DownloadCTA, Footer } from "./components/DownloadCTA";

export default function App() {
  useEffect(() => {
    // Detect if device is mobile/touch-enabled
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Only enable Lenis on desktop devices
    if (isMobile || isTouchDevice) {
      return; // Use native scrolling on mobile
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 0, // Disable touch scrolling
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    const id = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(id);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-black text-white antialiased overflow-x-hidden selection:bg-violet-500/30 selection:text-white">
      {/* Global noise / ambient overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 0%, rgba(139,92,246,0.15), transparent 40%), radial-gradient(circle at 80% 100%, rgba(236,72,153,0.1), transparent 40%)",
        }}
      />

      <div className="relative z-10">
        <Navbar />
        <main>
          <Hero />
          <PainPoints />
          <Features />
          <DownloadCTA />
        </main>
        <Footer />
      </div>
    </div>
  );
}
