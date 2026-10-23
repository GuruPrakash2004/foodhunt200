import { useEffect, useMemo, useState } from "react";
import { getHeatmap } from "../../api/index.js";
import { rupees } from "../../lib/format.js";

const DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 7);  // 7am to 11pm
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;

/** Average all-in price by weekday and hour, from every deal sighting. Cheaper is brighter pink. */
export default function HeatCalendar({ refreshKey }) {
  const [cells, setCells] = useState([]);
  useEffect(() => { getHeatmap().then(setCells).catch(() => setCells([])); }, [refreshKey]);
  const byKey = useMemo(() => Object.fromEntries(cells.map((c) => [`${c.dow}-${c.hour}`, c])), [cells]);
  const prices = cells.map((c) => c.avg);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const best = cells.reduce((b, c) => (!b || c.avg < b.avg ? c : b), null);
  const dayName = (dow) => DAYS.find(([, d]) => d === dow)?.[0];

  if (!cells.length) return <p className="empty">No pattern yet. Hunt at a few different times of day and the cheap hours start to show.</p>;
  return (
    <div>
      <p className="lede muted">
        Cheapest so far: <strong className="pink">{dayName(best.dow)} {hourLabel(best.hour)}</strong> with an average of {rupees(best.avg)}
        ({best.n} sighting{best.n === 1 ? "" : "s"}). The brightest pink cells are the cheapest; a dot means no data yet.
      </p>
      <div className="table-wrap heat">
        <table aria-label="Average price by weekday and hour">
          <thead><tr><th /> {HOURS.map((h) => <th key={h} className="num">{hourLabel(h)}</th>)}</tr></thead>
          <tbody>
            {DAYS.map(([name, dow]) => (
              <tr key={dow}>
                <th scope="row">{name}</th>
                {HOURS.map((h) => {
                  const c = byKey[`${dow}-${h}`];
                  const t = c ? (hi === lo ? 1 : 1 - (c.avg - lo) / (hi - lo)) : 0;   // 1 = cheapest
                  return (
                    <td key={h} className={`heat-cell ${c ? "has" : ""} ${c && t >= 0.7 ? "hot" : ""}`} style={{ "--t": t }}
                      title={c ? `${name} ${hourLabel(h)}: avg ${rupees(c.avg)}, lowest ${rupees(c.min)}, ${c.n} sighting${c.n === 1 ? "" : "s"}` : `${name} ${hourLabel(h)}: no data`}>
                      {c ? rupees(c.avg) : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
