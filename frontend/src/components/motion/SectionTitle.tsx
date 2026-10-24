import { type ReactNode, useLayoutEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

/** Huge outlined heading. As it scrolls through the viewport the outline fills with the section's colour. */
export default function SectionTitle({ id, children, glow = "var(--pink)" }: { id: string; children: string; glow?: string; }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (prefersReducedMotion() || !ref.current) return;
    const tween = gsap.fromTo(ref.current, { "--fill": 0 }, {
      "--fill": 100, ease: "none",
      scrollTrigger: { trigger: ref.current, start: "top 92%", end: "top 40%", scrub: true },
    });
    return () => { tween.scrollTrigger?.kill(); tween.kill(); };
  }, []);
  return <h2 ref={ref} id={id} className="mega" style={{ "--c": glow } as React.CSSProperties}>{children as ReactNode}</h2>;
}
