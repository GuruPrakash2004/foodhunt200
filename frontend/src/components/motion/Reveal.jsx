import { useRef } from "react";
import { useInView } from "../../hooks/useInView.js";

/** Fades and lifts its children in when they scroll into view. */
export default function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const ref = useRef(null);
  const seen = useInView(ref);
  return (
    <Tag ref={ref} className={`reveal ${seen ? "in" : ""} ${className}`} style={{ "--d": `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}
