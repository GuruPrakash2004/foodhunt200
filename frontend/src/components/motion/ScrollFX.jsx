import { useEffect } from "react";

/** A thin progress bar across the top, and `--scroll` (px) on <html> for the parallax photos. One rAF-throttled listener. */
export default function ScrollFX() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = root.scrollHeight - window.innerHeight;
      root.style.setProperty("--scroll", String(window.scrollY));
      root.style.setProperty("--progress", max > 0 ? String(window.scrollY / max) : "0");
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, []);
  return <div className="scroll-bar" aria-hidden="true" />;
}
