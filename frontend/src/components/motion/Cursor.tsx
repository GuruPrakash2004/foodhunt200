import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";

const HOT = "a, button, input, select, label, .lane, .row, .chip, .tab";

/** A soft ring that trails the pointer and swells over anything clickable. The system cursor stays. Mouse only. */
export default function Cursor() {
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const el = ring.current!;
    const x = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3" });
    const y = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3" });
    const move = (e: PointerEvent) => {
      el.dataset.on = "1"; x(e.clientX); y(e.clientY);
      el.dataset.hot = (e.target as Element).closest?.(HOT) ? "1" : "";
    };
    const leave = () => { el.dataset.on = ""; };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => { window.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); };
  }, []);
  return <div ref={ring} className="cursor" aria-hidden="true" />;
}
