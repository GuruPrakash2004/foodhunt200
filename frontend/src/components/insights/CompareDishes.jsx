import { useEffect, useState } from "react";
import { getCompare } from "../../api/index.js";
import { rupees } from "../../lib/format.js";
import { Tag } from "../ui/Tag.jsx";

/** The same dish from more than one restaurant or platform, cheapest first. */
export default function CompareDishes({ labels, refreshKey }) {
  const [groups, setGroups] = useState([]);
  useEffect(() => { getCompare().then(setGroups).catch(() => setGroups([])); }, [refreshKey]);
  if (!groups.length) return <p className="empty">No dish has shown up at two places yet. When it does, the cheaper one is marked here.</p>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-4">
      {groups.map((g) => (
        <li key={g.dish} className="rounded-lg border border-line bg-surface px-[18px] py-4">
          <header className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3"><h3 className="text-[17px] font-bold">{g.dish}</h3><span className="muted">{g.options.length} places · up to {rupees(g.spread)} apart</span></header>
          <ol className="grid gap-1.5">
            {g.options.map((o, i) => (
              <li key={o.deal_key} className={`grid grid-cols-[auto_1fr_auto_76px] items-center gap-3 rounded-lg px-2.5 py-2 ${i === 0 ? "bg-[color-mix(in_srgb,var(--color-pink)_14%,var(--color-surface-2))]" : "bg-surface-2"}`}>
                <Tag>{labels[o.platform] || o.platform}</Tag>
                <span className="min-w-0 truncate">{o.restaurant}</span>
                <strong className="tabular-nums">{rupees(o.final_payable)}</strong>
                <span className={`text-right text-[13px] ${i === 0 ? "text-good" : "text-muted"}`}>{i === 0 ? "cheapest" : `+${rupees(o.final_payable - g.options[0].final_payable)}`}</span>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}
