import { useState } from "react";
import FoodDrift from "../motion/FoodDrift.jsx";
import Reveal from "../motion/Reveal.jsx";
import { ScrubText } from "../motion/text/SplitWords.tsx";
import SectionTitle from "../motion/SectionTitle.tsx";

export default function AlertsPanel({ watches, onAdd, onRemove }) {
  const [query, setQuery] = useState("");
  const [max, setMax] = useState(150);
  const submit = (e) => {
    e.preventDefault();
    if (query.trim()) { onAdd(query.trim(), Number(max)); setQuery(""); }
  };
  return (
    <Reveal as="section" stagger className="relative mt-[var(--section-gap)] max-w-[720px]" id="alerts" aria-labelledby="alerts-title">
      <FoodDrift photos={["f11", "f03"]} side="right" />
      <SectionTitle id="alerts-title" glow="#ff8a1f">Price alerts</SectionTitle>
      <ScrubText className="mb-5 mt-1.5 text-[17px] text-muted" text="Name a dish or a restaurant and a price. After each hunt, a match raises a browser notification." />
      <form data-cascade className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_160px_auto]" onSubmit={submit}>
        <label>Dish or restaurant<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. biryani" /></label>
        <label>At or under (₹)<input type="number" min="1" value={max} onChange={(e) => setMax(e.target.value)} /></label>
        <button className="btn-solid">Add alert</button>
      </form>
      <ul data-cascade className="mt-[18px]">
        {watches.map((w) => (
          <li key={w.id} className="flex animate-[drop_.7s_cubic-bezier(.3,1.6,.5,1)_both] items-center justify-between border-b border-line py-3 motion-reduce:animate-none">
            <span>“{w.query}” at or under <strong>₹{w.max_price}</strong></span>
            <button className="btn-text" onClick={() => onRemove(w.id)} aria-label={`Remove alert ${w.query}`}>Remove</button>
          </li>
        ))}
        {!watches.length && <li className="muted py-3">No alerts yet.</li>}
      </ul>
    </Reveal>
  );
}
