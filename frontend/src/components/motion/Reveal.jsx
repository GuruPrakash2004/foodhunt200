import { useRef } from "react";
import { useInView } from "../../hooks/useInView.js";

/**
 * Blurs, lifts and fades its children in when they scroll into view.
 * `from` ("left" | "right") swings it in tilted from that side like the hero cards;
 * `stagger` makes its direct children arrive one after another instead of all at once.
 */
export default function Reveal({ as: Tag = "div", delay = 0, from, stagger = false, className = "", children, ...rest }) {
  const ref = useRef(null);
  const seen = useInView(ref);
  return (
    <Tag ref={ref} className={`reveal ${stagger ? "stagger" : ""} ${seen ? "in" : ""} ${className}`} data-from={from} style={{ "--d": `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}
