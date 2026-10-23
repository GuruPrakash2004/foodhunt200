import { useEffect } from "react";

/** Nudges an element a little toward the pointer while it hovers over it. */
export function useMagnetic(ref, strength = 0.3) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${(e.clientX - (r.left + r.width / 2)) * strength}px`);
      el.style.setProperty("--my", `${(e.clientY - (r.top + r.height / 2)) * strength}px`);
    };
    const reset = () => { el.style.setProperty("--mx", "0px"); el.style.setProperty("--my", "0px"); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", reset);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", reset); };
  }, [ref, strength]);
}
