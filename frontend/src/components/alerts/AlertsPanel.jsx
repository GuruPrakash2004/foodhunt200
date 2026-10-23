import { useState } from "react";
import Reveal from "../motion/Reveal.jsx";

export default function AlertsPanel({ watches, onAdd, onRemove }) {
  const [query, setQuery] = useState("");
  const [max, setMax] = useState(150);
  const submit = (e) => {
    e.preventDefault();
    if (query.trim()) { onAdd(query.trim(), Number(max)); setQuery(""); }
  };
  return (
    <Reveal as="section" className="section alerts" id="alerts" aria-labelledby="alerts-title">
      <h2 id="alerts-title" className="section-title">Price alerts</h2>
      <p className="lede">Name a dish or a restaurant and a price. After each hunt, a match raises a browser notification.</p>
      <form className="alert-form" onSubmit={submit}>
        <label>Dish or restaurant<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. biryani" /></label>
        <label>At or under (₹)<input type="number" min="1" value={max} onChange={(e) => setMax(e.target.value)} /></label>
        <button className="solid-button">Add alert</button>
      </form>
      <ul className="watch-list">
        {watches.map((w) => (
          <li key={w.id}>
            <span>“{w.query}” at or under <strong>₹{w.max_price}</strong></span>
            <button className="text-button" onClick={() => onRemove(w.id)} aria-label={`Remove alert ${w.query}`}>Remove</button>
          </li>
        ))}
        {!watches.length && <li className="muted">No alerts yet.</li>}
      </ul>
    </Reveal>
  );
}
