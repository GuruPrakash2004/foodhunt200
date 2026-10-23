import { useEffect, useState } from "react";
import { getWeekly } from "../../api/index.js";
import { rupees } from "../../lib/format.js";
import CountUp from "../motion/CountUp.jsx";

/** The last seven days of hunting in a few numbers. */
export default function WeekSummary({ labels, refreshKey }) {
  const [w, setW] = useState(null);
  useEffect(() => { getWeekly().then(setW).catch(() => setW(null)); }, [refreshKey]);
  if (!w) return null;
  if (!w.deals) return <p className="empty">Nothing hunted in the last {w.days} days. Run a hunt and your week builds here.</p>;
  const split = Object.entries(w.by_platform).map(([p, n]) => `${labels[p] || p} ${n}`).join(" · ");
  return (
    <div className="week">
      <p className="lede">
        In the last {w.days} days you ran <strong>{w.hunts}</strong> hunt{w.hunts === 1 ? "" : "s"} and found <strong>{w.deals}</strong> different
        deal{w.deals === 1 ? "" : "s"} ({split}).
      </p>
      <dl className="week-stats">
        <div><dt>Cheapest meal</dt><dd className="pink"><CountUp value={w.cheapest.final_payable} /></dd><span className="muted">{w.cheapest.items} · {w.cheapest.restaurant}</span></div>
        <div><dt>Average all-in price</dt><dd><CountUp value={w.average} /></dd><span className="muted">across all deals</span></div>
        <div><dt>Offers saved you</dt><dd className="good"><CountUp value={w.saved} /></dd><span className="muted">total discount on those bills</span></div>
        {w.best_day && <div><dt>Cheapest day</dt><dd>{w.best_day.name}</dd><span className="muted">average {rupees(w.best_day.average)}</span></div>}
        <div><dt>Favourites</dt><dd><CountUp value={w.favourites} prefix="" /></dd><span className="muted">starred deals</span></div>
      </dl>
    </div>
  );
}
