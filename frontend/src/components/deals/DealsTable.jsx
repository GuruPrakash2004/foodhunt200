import { Fragment, useMemo, useState } from "react";
import { useNow } from "../../hooks/useNow.js";
import { ago, km, minutes, rupees } from "../../lib/format.js";
import CountUp from "../motion/CountUp.jsx";
import { PlatformDot, Tag } from "../ui/Tag.jsx";
import AddToCartButton from "./AddToCartButton.jsx";
import DealDetail from "./DealDetail.jsx";
import { SPEND } from "./Spend.jsx";
import StarIcon from "./StarIcon.jsx";

const SORTS = [
  ["price", "Cheapest", (a, b) => a.final_payable - b.final_payable],
  ["new", "Newest", (a, b) => (b.hunt_id || 0) - (a.hunt_id || 0) || a.final_payable - b.final_payable],
  ["near", "Nearest", (a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9)],
  ["fast", "Fastest", (a, b) => (a.eta_min ?? 1e9) - (b.eta_min ?? 1e9)],
  ["name", "A–Z", (a, b) => a.restaurant.localeCompare(b.restaurant)],
];
const MEDAL = ["text-[#ffd166]", "text-[#c9ced6]", "text-[#d99058]"];
const MAX_PICKS = 3;

const feesOf = (d) => d.fees ?? (d.delivery_fee || 0) + (d.platform_fee || 0) + (d.packaging_fee || 0) + (d.other_charges || 0);
const partsOf = (d) => [["dish", "Dish", d.item_total], ["fees", "Fees", feesOf(d)], ["tax", "Tax", d.taxes]].filter(([, , v]) => v > 0);

/** The bill as one bar. Its length is the final price against the dearest deal here, so cheap ones read as short at a glance. */
function PriceBar({ deal, max }) {
  const parts = partsOf(deal);
  return (
    <div className="grid gap-1">
      <div className="h-2.5 overflow-hidden rounded-[3px] bg-surface-3" role="img" aria-label={parts.map(([, n, v]) => `${n} ${rupees(v)}`).join(", ")}>
        <div className="spend-bar flex h-full gap-px transition-[width] duration-700 ease-soft" style={{ width: `${Math.max(12, (deal.final_payable / max) * 100)}%` }}>
          {parts.map(([k, n, v]) => <span key={k} className={`min-w-0.5 ${SPEND[k]}`} style={{ flexGrow: v }} title={`${n} ${rupees(v)}`} />)}
        </div>
      </div>
      <span className="text-xs text-muted tabular-nums">
        {rupees(deal.item_total)} + {rupees(feesOf(deal))} + {rupees(deal.taxes)}
        {deal.savings ? <b className="ml-1 font-semibold text-good">− {rupees(deal.savings)}</b> : null}
      </span>
    </div>
  );
}

function Podium({ top, budget, onPick }) {
  return (
    <ol className="mb-5 grid gap-3.5 sm:grid-cols-3">
      {top.map((d, i) => {
        const spare = budget ? Math.round(budget - d.final_payable) : 0;
        return (
          <li key={d.deal_key} className="animate-row motion-reduce:animate-none" style={{ animationDelay: `${i * 90}ms` }}>
            <button onClick={() => onPick(d.deal_key)}
              className={`group relative grid h-full w-full content-start gap-1.5 overflow-hidden rounded-lg border bg-surface p-4 text-left transition duration-200 hover:-translate-y-1 hover:bg-surface-2 ${i === 0 ? "border-pink shadow-[0_0_34px_rgb(255_45_149/.22)]" : "border-line"}`}>
              <span className={`absolute right-3 top-1 font-display text-[44px] font-bold leading-none opacity-80 ${MEDAL[i]}`}>{i + 1}</span>
              <span className="inline-flex items-center gap-2 text-[13px] text-muted"><PlatformDot platform={d.platform} />{d.platform}</span>
              <strong className="font-display text-[34px] font-bold leading-none tracking-[-.04em] text-pink tabular-nums [text-shadow:0_0_24px_rgb(255_45_149/.3)]"><CountUp value={d.final_payable} /></strong>
              <span className="truncate font-semibold">{d.restaurant}</span>
              <span className="muted truncate">{d.items}</span>
              {spare > 0 && <span className="text-xs text-good">{rupees(spare)} to spare</span>}
              <span className="mt-1.5 h-0.5 w-0 bg-pink transition-[width] duration-500 ease-soft group-hover:w-full" />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function CompareTray({ picks, onRemove, onClear }) {
  const best = Math.min(...picks.map((d) => d.final_payable));
  const worst = Math.max(...picks.map((d) => d.final_payable));
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4" role="region" aria-label="Compare deals">
      <div className="pointer-events-auto flex max-w-full animate-rise flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2/95 p-3 shadow-[0_18px_50px_rgb(0_0_0/.6)] backdrop-blur">
        {picks.map((d) => (
          <div key={d.deal_key} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${d.final_payable === best && picks.length > 1 ? "border-pink" : "border-line"}`}>
            <div className="grid min-w-0 max-w-[150px]">
              <span className="truncate text-sm font-semibold">{d.restaurant}</span>
              <span className="text-xs text-muted">{d.final_payable === best ? (picks.length > 1 ? "cheapest" : "picked") : `+${rupees(d.final_payable - best)}`}</span>
            </div>
            <strong className="font-display text-lg tracking-[-.03em] text-pink tabular-nums">{rupees(d.final_payable)}</strong>
            <button className="icon-btn !size-6" aria-label={`Remove ${d.restaurant} from the comparison`} onClick={() => onRemove(d.deal_key)}>×</button>
          </div>
        ))}
        {picks.length > 1 && <span className="text-sm text-good">The cheapest saves {rupees(worst - best)}</span>}
        {picks.length < 2 && <span className="muted">Pick up to {MAX_PICKS} to compare</span>}
        <button className="btn-text" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}

/** The deals as a leaderboard: podium for the cheapest three, a price bar on every row, sort chips, and a compare tray. */
export default function DealsTable({ deals, onFeedback, profile, labels = {}, budget }) {
  const now = useNow(30000);
  const [sort, setSort] = useState({ key: "price", dir: 1 });
  const [open, setOpen] = useState(null);
  const [picked, setPicked] = useState([]);   // deal_keys chosen for the compare tray

  const byPrice = useMemo(() => [...deals].sort(SORTS[0][2]), [deals]);
  const rank = useMemo(() => Object.fromEntries(byPrice.map((d, i) => [d.deal_key, i + 1])), [byPrice]);
  const max = byPrice.length ? byPrice[byPrice.length - 1].final_payable : 1;
  const sorted = useMemo(() => {
    const cmp = SORTS.find(([k]) => k === sort.key)[2];
    return [...deals].sort((a, b) => cmp(a, b) * sort.dir);
  }, [deals, sort]);
  const picks = picked.map((k) => deals.find((d) => d.deal_key === k)).filter(Boolean);

  const sortBy = (key) => setSort(sort.key === key ? { key, dir: -sort.dir } : { key, dir: 1 });
  const togglePick = (key) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < MAX_PICKS ? [...p, key] : p));
  const reveal = (key) => {
    setOpen(key);
    requestAnimationFrame(() => document.getElementById(`deal-${key}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };
  const glow = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  if (!deals.length) return <p className="empty">Nothing here yet. Start a hunt and the deals land in this table.</p>;
  return (
    <div>
      <Podium top={byPrice.slice(0, 3)} budget={Number(budget)} onPick={reveal} />

      <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Sort deals">
        <span className="muted mr-1">Sort</span>
        {SORTS.map(([key, label]) => (
          <button key={key} className="chip" aria-pressed={sort.key === key} onClick={() => sortBy(key)}>
            {label}{sort.key === key ? (sort.dir > 0 ? " ↑" : " ↓") : ""}
          </button>
        ))}
        <span className="muted ml-auto">{deals.length} deal{deals.length === 1 ? "" : "s"} · click a row for the bill</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm max-lg:block" aria-label="Deals">
          <thead className="max-lg:hidden">
            <tr className="bg-surface text-[13px] text-muted">
              <th className="px-3 py-2.5 text-left font-semibold"><span className="sr-only">Favourite</span></th>
              <th className="px-3 py-2.5 text-left font-semibold">#</th>
              <th className="px-3 py-2.5 text-left font-semibold">Restaurant</th>
              <th className="px-3 py-2.5 text-left font-semibold">App</th>
              <th className="min-w-[230px] px-3 py-2.5 text-left font-semibold">Where the rupees go</th>
              <th className="px-3 py-2.5 text-right font-semibold">Final price</th>
              <th className="px-3 py-2.5 text-right font-semibold">Distance · ETA</th>
              <th className="px-3 py-2.5 text-left font-semibold">Cart</th>
              <th className="px-3 py-2.5 text-left font-semibold">Compare</th>
            </tr>
          </thead>
          <tbody className="max-lg:block">
            {sorted.map((d, i) => {
              const isOpen = open === d.deal_key, isPicked = picked.includes(d.deal_key);
              return (
                <Fragment key={d.deal_key}>
                  <tr id={`deal-${d.deal_key}`} tabIndex={0} aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : d.deal_key)} onPointerMove={glow}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), setOpen(isOpen ? null : d.deal_key))}
                    className={`animate-row cursor-pointer border-t border-line max-lg:grid max-lg:grid-cols-[auto_auto_minmax(0,1fr)_auto] max-lg:items-center max-lg:gap-x-2.5 max-lg:gap-y-2.5 max-lg:p-3 transition-colors duration-150 first:border-0 hover:[background-image:radial-gradient(280px_circle_at_var(--mx,50%)_var(--my,50%),rgb(255_45_149/.11),transparent_70%)] motion-reduce:animate-none ${isOpen ? "bg-surface" : ""} ${isPicked ? "bg-[color-mix(in_srgb,var(--color-pink)_9%,transparent)]" : ""}`}
                    style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                    <td className="px-3 py-3 max-lg:p-0 max-lg:min-w-0 max-lg:col-start-1 max-lg:row-start-1" onClick={(e) => e.stopPropagation()}>
                      <button className="grid place-items-center rounded-md border-0 bg-transparent p-1.5 text-muted transition duration-150 hover:bg-surface-2 hover:text-ink aria-pressed:text-pink" aria-pressed={d.favorite}
                        aria-label={d.favorite ? "Remove favourite" : "Add favourite"} onClick={() => onFeedback(d.deal_key, { favorite: !d.favorite })}><StarIcon filled={d.favorite} /></button>
                    </td>
                    <td className={`px-3 py-3 font-display font-bold tabular-nums ${MEDAL[rank[d.deal_key] - 1] || "text-muted"} max-lg:p-0 max-lg:min-w-0 max-lg:col-start-2 max-lg:row-start-1`}>{rank[d.deal_key]}</td>
                    <td className="px-3 py-3 max-lg:p-0 max-lg:min-w-0 max-lg:col-start-3 max-lg:row-start-1 lg:min-w-[200px] lg:max-w-[300px]">
                      <div className="font-semibold">{d.restaurant}{d.source === "food_rescue" && <Tag tone="rescue">rescue</Tag>}</div>
                      <div className="muted truncate">{d.items}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span title={d.found_at}>hunted {ago(d.found_at, now)}</span>
                        {d.rival && <Tag tone="fair" className="!ml-0" title={`${labels[d.rival.platform] || d.rival.platform} charges ${rupees(d.rival.final_payable)}`}>
                          {d.rival.gap ? `${rupees(d.rival.gap)} cheaper than ${labels[d.rival.platform] || d.rival.platform}` : `same price on ${labels[d.rival.platform] || d.rival.platform}`}</Tag>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 max-lg:p-0 max-lg:min-w-0 max-lg:col-span-2 max-lg:col-start-1 max-lg:row-start-3"><span className="inline-flex items-center gap-2"><PlatformDot platform={d.platform} />{labels[d.platform] || d.platform}</span></td>
                    <td className="px-3 py-3 max-lg:p-0 max-lg:min-w-0 max-lg:col-span-4 max-lg:col-start-1 max-lg:row-start-2"><PriceBar deal={d} max={max} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-display text-[17px] font-bold tracking-[-.02em] text-pink tabular-nums [text-shadow:0_0_18px_rgb(255_45_149/.25)] max-lg:p-0 max-lg:min-w-0 max-lg:col-start-4 max-lg:row-start-1">{rupees(d.final_payable)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-muted tabular-nums max-lg:p-0 max-lg:min-w-0 max-lg:col-span-2 max-lg:col-start-3 max-lg:row-start-3">{km(d.distance_km)} · {minutes(d.eta_min)}</td>
                    <td className="px-3 py-3 max-lg:p-0 max-lg:min-w-0 max-lg:col-span-3 max-lg:col-start-1 max-lg:row-start-4" onClick={(e) => e.stopPropagation()}><AddToCartButton deal={d} label={labels[d.platform]} /></td>
                    <td className="px-3 py-3 max-lg:p-0 max-lg:min-w-0 max-lg:col-start-4 max-lg:row-start-4" onClick={(e) => e.stopPropagation()}>
                      <button className="chip" aria-pressed={isPicked} disabled={!isPicked && picked.length >= MAX_PICKS} onClick={() => togglePick(d.deal_key)}
                        aria-label={`${isPicked ? "Remove" : "Add"} ${d.restaurant} ${isPicked ? "from" : "to"} the comparison`}>{isPicked ? "✓" : "+"}</button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-surface max-lg:block">
                      <td colSpan={9} className="animate-row px-5 py-5 max-lg:block max-lg:px-3 motion-reduce:animate-none">
                        <DealDetail deal={d} profile={profile} labels={labels} />
                        <input className="mt-4 w-full max-w-md" defaultValue={d.note} placeholder="A note for yourself (kept with this deal)" aria-label={`Note for ${d.restaurant}`}
                          onBlur={(e) => e.target.value !== d.note && onFeedback(d.deal_key, { note: e.target.value })} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {picks.length > 0 && <CompareTray picks={picks} onRemove={togglePick} onClear={() => setPicked([])} />}
    </div>
  );
}
