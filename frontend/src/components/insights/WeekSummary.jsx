import { useEffect, useState } from "react";
import { getWeekly } from "../../api/index.js";
import { rupees } from "../../lib/format.js";
import CountUp from "../motion/CountUp.jsx";

const CARD = "grid content-start gap-1 rounded-lg border border-line bg-surface p-[18px]";
const DD = "text-[28px] font-bold leading-[1.15] tracking-[-.02em] tabular-nums";

/** The last seven days of hunting in a few numbers. */
export default function WeekSummary({ labels, refreshKey }) {
  const [w, setW] = useState(null);
  useEffect(() => { getWeekly().then(setW).catch(() => setW(null)); }, [refreshKey]);
  if (!w) return null;
  if (!w.deals) return <p className="empty">Nothing hunted in the last {w.days} days. Run a hunt and your week builds here.</p>;
  const split = Object.entries(w.by_platform).map(([p, n]) => `${labels[p] || p} ${n}`).join(" · ");
  return (
    <div>
      <p className="mb-6 max-w-[70ch] text-[17px] text-muted">
        In the last {w.days} days you ran <strong>{w.hunts}</strong> hunt{w.hunts === 1 ? "" : "s"} and found <strong>{w.deals}</strong> different
        deal{w.deals === 1 ? "" : "s"} ({split}).
      </p>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        <div className={CARD}><dt className="text-[13px] text-muted">Cheapest meal</dt><dd className={`${DD} text-pink`}><CountUp value={w.cheapest.final_payable} /></dd><span className="muted">{w.cheapest.items} · {w.cheapest.restaurant}</span></div>
        <div className={CARD}><dt className="text-[13px] text-muted">Average all-in price</dt><dd className={DD}><CountUp value={w.average} /></dd><span className="muted">across all deals</span></div>
        <div className={CARD}><dt className="text-[13px] text-muted">Offers saved you</dt><dd className={`${DD} text-good`}><CountUp value={w.saved} /></dd><span className="muted">total discount on those bills</span></div>
        {w.best_day && <div className={CARD}><dt className="text-[13px] text-muted">Cheapest day</dt><dd className={DD}>{w.best_day.name}</dd><span className="muted">average {rupees(w.best_day.average)}</span></div>}
        <div className={CARD}><dt className="text-[13px] text-muted">Favourites</dt><dd className={DD}><CountUp value={w.favourites} prefix="" /></dd><span className="muted">starred deals</span></div>
      </dl>
    </div>
  );
}
