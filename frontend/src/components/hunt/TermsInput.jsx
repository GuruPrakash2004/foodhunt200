import { useState } from "react";

const SUGGESTIONS = ["thali", "biryani", "rice bowl", "meals", "dosa", "combo", "rolls", "paratha", "idli", "noodles", "sandwich", "pizza"];

/** Search terms as removable chips, with one-click suggestions. The value stays a comma-separated string. */
export default function TermsInput({ value, onChange }) {
  const [draft, setDraft] = useState("");
  const terms = value.split(",").map((t) => t.trim()).filter(Boolean);
  const set = (list) => onChange(list.join(", "));
  const add = (raw) => {
    const incoming = raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    const next = [...terms];
    incoming.forEach((t) => { if (!next.some((x) => x.toLowerCase() === t)) next.push(t); });
    set(next); setDraft("");
  };
  const onKey = (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); if (draft.trim()) add(draft); }
    else if (e.key === "Backspace" && !draft && terms.length) set(terms.slice(0, -1));
  };
  const unused = SUGGESTIONS.filter((s) => !terms.some((t) => t.toLowerCase() === s));
  return (
    <div className="terms">
      <div className="terms-box">
        {terms.map((t) => (
          <span key={t} className="term">
            {t}
            <button type="button" onClick={() => set(terms.filter((x) => x !== t))} aria-label={`Remove ${t}`}>×</button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => draft.trim() && add(draft)}
          placeholder={terms.length ? "Add another…" : "Type a dish and press Enter"} aria-label="Add a search term" />
      </div>
      {unused.length > 0 && (
        <div className="suggest" aria-label="Suggestions">
          {unused.slice(0, 8).map((s) => <button type="button" key={s} className="chip" onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}
    </div>
  );
}
