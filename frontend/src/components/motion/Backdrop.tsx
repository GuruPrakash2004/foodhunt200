import { useEffect } from "react";
import { ScrollTrigger } from "@/lib/gsap";

/** [selector, colour]: while a section fills the middle of the screen, the page glow takes its colour. */
const SCENES: [string, string][] = [
  ["#top", "#007ba7"],
  [".live", "#1fbf75"],
  ["#deals", "#ff2d95"],
  ["#insights", "#6a4cff"],
  ["#alerts", "#ff8a1f"],
];

/** Fixed layer behind the page: drifting colour blobs, film grain, vignette. The glow colour fades between sections. */
export default function Backdrop() {
  useEffect(() => {
    const root = document.documentElement;
    const triggers = SCENES.flatMap(([sel, colour]) => {
      const el = document.querySelector(sel);
      if (!el) return [];
      const set = () => root.style.setProperty("--glow", colour);
      return [ScrollTrigger.create({ trigger: el, start: "top 55%", end: "bottom 55%", onEnter: set, onEnterBack: set })];
    });
    return () => triggers.forEach((t) => t.kill());
  }, []);
  return (
    <div className="backdrop" aria-hidden="true">
      <i className="blob b1" /><i className="blob b2" /><i className="blob b3" />
      <svg className="grain"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch" /></filter><rect width="100%" height="100%" filter="url(#grain)" /></svg>
    </div>
  );
}
