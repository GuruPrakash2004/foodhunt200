import { useEffect, useRef } from "react";
import { rupees } from "../../lib/format.js";
import { LineReveal } from "../motion/text/SplitWords.tsx";
import Reveal from "../motion/Reveal.jsx";

const describe = (e) => {
  switch (e.type) {
    case "deal": return `✓ ${rupees(e.deal.final_payable)} · ${e.deal.restaurant} — ${e.deal.items}`;
    case "done": return `Finished (${e.status}). ${e.summary || ""}`;
    case "alert": return `Alert “${e.watch}”: ${e.text}`;
    default: return e.text;
  }
};

const KIND = { deal: "font-semibold text-ink", error: "text-bad", alert: "font-semibold text-pink" };

export default function LiveLog({ events, running }) {
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [events.length]);
  if (!events.length && !running) return null;
  return (
    <Reveal as="section" from="left" className="live-scan relative mt-[18px] overflow-hidden rounded-lg border border-line bg-surface px-5 py-4" aria-labelledby="live-title">
      <h2 id="live-title" className="mb-2.5 text-sm font-semibold"><LineReveal text="What the hunt is doing" /></h2>
      <div className="grid max-h-[220px] gap-[3px] overflow-auto text-sm" aria-live="polite">
        {events.map((e, i) => <p key={i} className={`animate-log text-muted motion-reduce:animate-none ${KIND[e.type] || ""}`}>{describe(e)}</p>)}
        <div ref={end} />
      </div>
    </Reveal>
  );
}
