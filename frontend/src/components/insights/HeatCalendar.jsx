import { useEffect, useMemo, useState } from "react";
import { getHeatmap } from "../../api/index.js";
import { rupees } from "../../lib/format.js";

const DAYS = [["Mon", "Monday", 1], ["Tue", "Tuesday", 2], ["Wed", "Wednesday", 3], ["Thu", "Thursday", 4], ["Fri", "Friday", 5], ["Sat", "Saturday", 6], ["Sun", "Sunday", 0]];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 7);  // 7am to 11pm
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
const hourRange = (h) => `${h % 12 || 12}–${(h + 1) % 12 || 12} ${h + 1 >= 12 && h + 1 < 24 ? "pm" : "am"}`;
const TINT = "bg-[color-mix(in_srgb,var(--color-pink)_calc(var(--t)*34%_+_6%),var(--color-surface))]";
const wavg = (cells) => { const n = cells.reduce((s, c) => s + c.n, 0); return n ? cells.reduce((s, c) => s + c.avg * c.n, 0) / n : null; };

/** Average all-in price by weekday and hour, from every deal sighting. Hover or focus a slot to read it; cheaper is brighter pink. */
export default function HeatCalendar({ refreshKey }) {
  const [cells, setCells] = useState([]);
  const [pin, setPin] = useState(null);       // the slot being looked at; null while nothing is hovered
  useEffect(() => { getHeatmap().then(setCells).catch(() => setCells([])); }, [refreshKey]);
  const byKey = useMemo(() => Object.fromEntries(cells.map((c) => [`${c.dow}-${c.hour}`, c])), [cells]);
  const best = useMemo(() => cells.reduce((b, c) => (!b || c.avg < b.avg ? c : b), null), [cells]);
  const stats = useMemo(() => {
    const prices = cells.map((c) => c.avg);
    return {
      lo: Math.min(...prices), hi: Math.max(...prices), overall: wavg(cells),
      byHour: Object.fromEntries(HOURS.map((h) => [h, wavg(cells.filter((c) => c.hour === h))])),
      byDay: Object.fromEntries(DAYS.map(([, , d]) => [d, wavg(cells.filter((c) => c.dow === d))])),
    };
  }, [cells]);

  if (!cells.length) return <p className="empty">No pattern yet. Hunt at a few different times of day and the cheap hours start to show.</p>;
  const { lo, hi, overall, byHour, byDay } = stats;
  const heat = (c) => (hi === lo ? 1 : 1 - (c.avg - lo) / (hi - lo));   // 1 = cheapest
  const active = pin ? byKey[`${pin.dow}-${pin.hour}`] : null;
  const shown = active || best;
  const dayName = (dow) => DAYS.find(([, , d]) => d === dow);
  const cheaperThan = Math.round((cells.filter((c) => c.avg > shown.avg).length / cells.length) * 100);
  const hourBars = HOURS.map((h) => byHour[h]);
  const barLo = Math.min(...hourBars.filter(Boolean)), barHi = Math.max(...hourBars.filter(Boolean));

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm text-muted">{active ? "You are looking at" : "Cheapest so far"}</p>
          <p className="mt-1 font-display text-[clamp(26px,3.4vw,40px)] font-bold leading-tight tracking-[-.03em]">
            <span className="text-pink">{dayName(shown.dow)[1]}</span> <span className="whitespace-nowrap">{hourRange(shown.hour)}</span>
          </p>
          <p className="mt-1 text-muted">
            average <strong className="font-display text-ink tabular-nums">{rupees(shown.avg)}</strong>
            {overall && <> · <span className={shown.avg <= overall ? "text-good" : "text-bad"}>{shown.avg <= overall ? `${rupees(overall - shown.avg)} under` : `${rupees(shown.avg - overall)} over`} your usual {rupees(overall)}</span></>}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-center">
          {[["Lowest seen", rupees(shown.min)], ["Sightings", shown.n], ["Cheaper than", `${cheaperThan}%`]].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-2 px-2 py-3"><dt className="text-xs text-muted">{k}</dt><dd className="mt-1 font-display text-xl font-bold tracking-[-.02em] tabular-nums">{v}</dd></div>
          ))}
        </dl>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface" onPointerLeave={() => setPin(null)}>
        <table className="w-full min-w-[860px] border-collapse text-xs" aria-label="Average price by weekday and hour">
          <thead>
            <tr>
              <th className="w-16" />
              {HOURS.map((h) => {
                const avg = byHour[h];
                const t = avg == null ? 0 : barHi === barLo ? 1 : 1 - (avg - barLo) / (barHi - barLo);
                return (
                  <th key={h} scope="col" className={`px-1 pb-1 pt-3 align-bottom font-medium ${pin?.hour === h ? "text-pink" : "text-muted"}`}>
                    <div className="mx-auto flex h-10 w-3.5 items-end" aria-hidden="true">
                      <span className="w-full origin-bottom animate-[grow-y_.9s_var(--ease-soft)_both] rounded-t-sm bg-pink/70 motion-reduce:animate-none" style={{ height: `${avg == null ? 0 : 18 + t * 82}%`, animationDelay: `${h * 30}ms` }} title={avg == null ? "" : `${hourLabel(h)} averages ${rupees(avg)}`} />
                    </div>
                    <div className="mt-1">{hourLabel(h)}</div>
                  </th>
                );
              })}
              <th scope="col" className="px-3 pb-1 pt-3 text-right align-bottom font-medium text-muted">Day avg</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map(([short, , dow], row) => (
              <tr key={dow}>
                <th scope="row" className={`px-3.5 py-0.5 text-left text-sm font-semibold ${pin?.dow === dow ? "text-pink" : "text-ink"}`}>{short}</th>
                {HOURS.map((h, col) => {
                  const c = byKey[`${dow}-${h}`];
                  const t = c ? heat(c) : 0;
                  const isBest = c === best, inLine = !pin || pin.dow === dow || pin.hour === h;
                  return (
                    <td key={h} className="p-0.5">
                      {c ? (
                        <button type="button" style={{ "--t": t, animationDelay: `${(row + col) * 26}ms` }}
                          onPointerEnter={() => setPin({ dow, hour: h })} onFocus={() => setPin({ dow, hour: h })} onBlur={() => setPin(null)}
                          aria-label={`${dayName(dow)[1]} ${hourLabel(h)}: average ${rupees(c.avg)}, lowest ${rupees(c.min)}, ${c.n} sighting${c.n === 1 ? "" : "s"}`}
                          className={`relative block w-full animate-[pop_.5s_var(--ease-soft)_both] rounded-[5px] border-0 py-2 text-[12px] tabular-nums transition duration-150 hover:z-10 hover:scale-[1.18] hover:shadow-[0_6px_22px_rgb(255_45_149/.45)] focus-visible:z-10 focus-visible:scale-[1.18] motion-reduce:animate-none ${t >= 0.7 ? "bg-pink font-bold text-ground" : `${TINT} text-ink`} ${inLine ? "" : "opacity-40"}`}>
                          {rupees(c.avg)}
                          {isBest && <span className="pointer-events-none absolute inset-0 animate-ping rounded-[5px] border-2 border-white motion-reduce:animate-none" aria-hidden="true" />}
                        </button>
                      ) : <span className={`block py-2 text-center text-muted/60 transition-opacity ${inLine ? "" : "opacity-40"}`} title={`${dayName(dow)[1]} ${hourLabel(h)}: no data`}>·</span>}
                    </td>
                  );
                })}
                <td className="px-3 text-right font-display text-[13px] font-bold tabular-nums text-muted">{byDay[dow] ? rupees(byDay[dow]) : "·"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
        <span className="inline-flex items-center gap-2">dearer
          <i className="h-2 w-28 rounded-full bg-gradient-to-r from-[color-mix(in_srgb,var(--color-pink)_8%,var(--color-surface))] to-pink" aria-hidden="true" />cheaper</span>
        <span>The bars on top are the average per hour across all days.</span>
        {best && <button className="btn-text ml-auto" onClick={() => setPin({ dow: best.dow, hour: best.hour })}>Show me the cheapest slot</button>}
      </div>
    </div>
  );
}
