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
    <div className="grid gap-2.5">
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface-2 p-2 focus-within:border-brand-bright">
        {terms.map((t) => (
          <span key={t} className="inline-flex animate-pop items-center gap-1 rounded bg-surface-3 py-[3px] pl-2.5 pr-1 text-sm">
            {t}
            <button type="button" className="size-[22px] rounded-full border-0 bg-transparent p-0 text-[17px] leading-none text-inherit hover:bg-ground" onClick={() => set(terms.filter((x) => x !== t))} aria-label={`Remove ${t}`}>×</button>
          </span>
        ))}
        <input className="w-auto min-w-[140px] flex-1 border-0 bg-transparent p-1 outline-none" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => draft.trim() && add(draft)}
          placeholder={terms.length ? "Add another…" : "Type a dish and press Enter"} aria-label="Add a search term" />
      </div>
      {unused.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Suggestions">
          {unused.slice(0, 8).map((s) => <button type="button" key={s} className="chip !px-3 !py-1 !text-[13px]" onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}
    </div>
  );
}
