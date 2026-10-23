import { useEffect, useRef, useState } from "react";
import { km, minutes, rupees } from "../../lib/format.js";
import DealDetail from "./DealDetail.jsx";
import StarIcon from "./StarIcon.jsx";

function DealRow({ deal: d, index, fresh, open, onToggle, onFeedback, profile, budget }) {
  const spare = Math.round(budget - d.final_payable);
  return (
    <li className={`row ${open ? "open" : ""} ${fresh ? "fresh" : ""}`} style={{ "--i": Math.min(index, 8) }}>
      <div className="row-line">
        <button className="row-main" aria-expanded={open} onClick={onToggle}>
          <strong>{d.restaurant}{d.source === "food_rescue" && <span className="tag rescue">rescue</span>}</strong>
          <span className="muted">{d.items}</span>
          <span className="row-bill">
            {rupees(d.item_total)} dish + {rupees(d.fees)} fees + {rupees(d.taxes)} tax{d.savings ? ` − ${rupees(d.savings)} offer` : ""}
            {d.distance_km != null ? ` · ${km(d.distance_km)}` : ""}{d.eta_min != null ? ` · ${minutes(d.eta_min)}` : ""}
          </span>
        </button>
        <div className="row-money">
          <span className="row-price">{rupees(d.final_payable)}</span>
          {spare > 0 && <span className="spare">{rupees(spare)} to spare</span>}
        </div>
        <button className={`star ${d.favorite ? "on" : ""}`} aria-pressed={d.favorite} aria-label={d.favorite ? "Remove star" : "Star this deal"}
          onClick={() => onFeedback(d.deal_key, { favorite: !d.favorite })}><StarIcon filled={d.favorite} /></button>
      </div>
      {open && (
        <div className="row-detail">
          <DealDetail deal={d} profile={profile} />
          <input className="note" defaultValue={d.note} placeholder="A note for yourself (kept with this deal)" aria-label={`Note for ${d.restaurant}`}
            onBlur={(e) => e.target.value !== d.note && onFeedback(d.deal_key, { note: e.target.value })} />
        </div>
      )}
    </li>
  );
}

/** One list per platform, side by side, each sorted cheapest first. */
export default function SideBySide({ deals, onFeedback, connected, labels, profile, budget }) {
  const [open, setOpen] = useState(null);
  const known = useRef(null);  // deals seen on earlier renders; anything else just arrived
  const arrived = known.current ? new Set(deals.filter((d) => !known.current.has(d.deal_key)).map((d) => d.deal_key)) : new Set();
  useEffect(() => { known.current = new Set(deals.map((d) => d.deal_key)); }, [deals]);
  const lists = Object.fromEntries(Object.keys(labels).map((p) => [
    p, deals.filter((d) => d.platform === p).sort((a, b) => a.final_payable - b.final_payable)]));
  const withDeals = Object.keys(labels).filter((p) => lists[p].length);
  const without = Object.keys(labels).filter((p) => !lists[p].length);
  const why = (p) => (connected?.[p] === false ? "not logged in yet (the first hunt opens its login)" : "no deals match");
  return (
    <>
      <div className="side-by-side">
        {withDeals.map((p) => (
          <section key={p} className="lane" aria-labelledby={`lane-${p}`}>
            <header className="lane-head">
              <h3 id={`lane-${p}`} className="plat"><i className={`dot ${p}`} />{labels[p]}</h3>
              <span className="muted">{lists[p].length} deal{lists[p].length === 1 ? "" : "s"}</span>
              <span className="from">from {rupees(lists[p][0].final_payable)}</span>
            </header>
            <ul>
              {lists[p].map((d, i) => (
                <DealRow key={d.deal_key} deal={d} index={i} fresh={arrived.has(d.deal_key)} profile={profile} budget={budget}
                  open={open === d.deal_key} onFeedback={onFeedback} onToggle={() => setOpen(open === d.deal_key ? null : d.deal_key)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {without.length > 0 && (
        <p className={withDeals.length ? "lane-note" : "empty"}>
          {without.map((p) => `${labels[p]}: ${why(p)}`).join(" · ")}
        </p>
      )}
    </>
  );
}
