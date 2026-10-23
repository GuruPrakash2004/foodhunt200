import { useEffect, useRef } from "react";
import { rupees } from "../../lib/format.js";

const describe = (e) => {
  switch (e.type) {
    case "deal": return `✓ ${rupees(e.deal.final_payable)} · ${e.deal.restaurant} — ${e.deal.items}`;
    case "done": return `Finished (${e.status}). ${e.summary || ""}`;
    case "alert": return `Alert “${e.watch}”: ${e.text}`;
    default: return e.text;
  }
};

export default function LiveLog({ events, running }) {
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [events.length]);
  if (!events.length && !running) return null;
  return (
    <section className="panel live" aria-labelledby="live-title">
      <h2 id="live-title" className="panel-title">What the hunt is doing</h2>
      <div className="log" aria-live="polite">
        {events.map((e, i) => <p key={i} className={`log-${e.type}`}>{describe(e)}</p>)}
        <div ref={end} />
      </div>
    </section>
  );
}
