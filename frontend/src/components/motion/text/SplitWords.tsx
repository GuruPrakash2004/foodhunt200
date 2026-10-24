import { type ElementType, useLayoutEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

interface Props { text: string; as?: ElementType; className?: string; id?: string; delay?: number }

/** Each word sits in its own mask. Screen readers get the whole sentence from aria-label. */
function words(text: string) {
  return text.split(" ").map((w, i) => (
    <span className="sw" key={i} aria-hidden="true"><span className="sw-i">{w}</span>{" "}</span>
  ));
}

/** Headline: words rise out of their masks, slightly rotated, one after another, when scrolled into view. */
export function LineReveal({ text, as: Tag = "span", className = "", delay = 0, ...rest }: Props) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (prefersReducedMotion() || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".sw-i", {
        yPercent: 115, rotate: 5, duration: 1, ease: "power4.out", stagger: 0.06, delay,
        scrollTrigger: { trigger: ref.current, start: "top 90%", once: true },
      });
    }, ref);
    return () => ctx.revert();
  }, [text, delay]);
  return <Tag ref={ref} className={`split ${className}`} aria-label={text} {...rest}>{words(text)}</Tag>;
}

/** Paragraph: words brighten from dim to full as you scroll through it. */
export function ScrubText({ text, as: Tag = "p", className = "", ...rest }: Props) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (prefersReducedMotion() || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".sw-i", {
        opacity: 0.16, stagger: 0.12, ease: "none",
        scrollTrigger: { trigger: ref.current, start: "top 88%", end: "bottom 58%", scrub: true },
      });
    }, ref);
    return () => ctx.revert();
  }, [text]);
  return <Tag ref={ref} className={`split scrub ${className}`} aria-label={text} {...rest}>{words(text)}</Tag>;
}
