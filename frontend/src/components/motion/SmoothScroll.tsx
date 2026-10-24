import Lenis from "lenis";
import { useEffect } from "react";
import { gsap, prefersReducedMotion, ScrollTrigger } from "@/lib/gsap";

/** Inertial scrolling, driven by GSAP's ticker so ScrollTrigger stays in step. Off under reduced motion. */
export default function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const lenis = new Lenis({ lerp: 0.1, anchors: true });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => { gsap.ticker.remove(tick); lenis.destroy(); };
  }, []);
  return null;
}
