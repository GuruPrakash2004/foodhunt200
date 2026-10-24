import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/gsap";

const KEY = "foodhunt.curtain";
const seen = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };

/** First visit of a session: FOODHUNT counts 0 to 100, then the curtain lifts. Skipped on reload and under reduced motion. */
export default function Curtain() {
  const [phase, setPhase] = useState<"count" | "lift" | "done">(() => (prefersReducedMotion() || seen() ? "done" : "count"));
  const [n, setN] = useState(0);
  useEffect(() => {
    if (phase !== "count") return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1400);
      setN(Math.round(100 * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick); else setPhase("lift");
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);
  useEffect(() => {
    if (phase !== "lift") return;
    try { sessionStorage.setItem(KEY, "1"); } catch { /* storage unavailable */ }
    const id = setTimeout(() => setPhase("done"), 900);
    return () => clearTimeout(id);
  }, [phase]);
  if (phase === "done") return null;
  return (
    <div className={`curtain ${phase}`} aria-hidden="true">
      <span className="curtain-word">FOODHUNT<b>200</b></span>
      <span className="curtain-n">{String(n).padStart(3, "0")}</span>
    </div>
  );
}
