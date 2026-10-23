import { useEffect, useState } from "react";
import { getCompare } from "../../api/index.js";
import { rupees } from "../../lib/format.js";

/** The same dish from more than one restaurant or platform, cheapest first. */
export default function CompareDishes({ labels, refreshKey }) {
  const [groups, setGroups] = useState([]);
  useEffect(() => { getCompare().then(setGroups).catch(() => setGroups([])); }, [refreshKey]);
  if (!groups.length) return <p className="empty">No dish has shown up at two places yet. When it does, the cheaper one is marked here.</p>;
  return (
    <ul className="compare">
      {groups.map((g) => (
        <li key={g.dish} className="compare-group">
          <header><h3>{g.dish}</h3><span className="muted">{g.options.length} places · up to {rupees(g.spread)} apart</span></header>
          <ol>
            {g.options.map((o, i) => (
              <li key={o.deal_key} className={i === 0 ? "best" : ""}>
                <span className={`tag ${o.platform}`}>{labels[o.platform] || o.platform}</span>
                <span className="compare-name">{o.restaurant}</span>
                <strong>{rupees(o.final_payable)}</strong>
                <span className={i === 0 ? "good" : "muted"}>{i === 0 ? "cheapest" : `+${rupees(o.final_payable - g.options[0].final_payable)}`}</span>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}
