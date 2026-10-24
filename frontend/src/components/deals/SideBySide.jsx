import { useEffect, useRef, useState } from "react";
import { km, minutes, rupees } from "../../lib/format.js";
import Reveal from "../motion/Reveal.jsx";
import { PlatformDot, Tag } from "../ui/Tag.jsx";
import DealDetail from "./DealDetail.jsx";
import StarIcon from "./StarIcon.jsx";

function DealRow({ deal: d, index, fresh, open, onToggle, onFeedback, profile, budget }) {
  const spare = Math.round(budget - d.final_payable);
  return (
    <li className="group animate-row border-b border-line [animation-delay:calc(var(--i,0)*40ms)] motion-reduce:animate-none" data-fresh={fresh || undefined} style={{ "--i": Math.min(index, 8) }}>
      <div className="flex items-center gap-2">
        <button className="row-main grid min-w-0 flex-1 gap-px rounded-md border-0 bg-transparent px-1 py-3.5 text-left transition duration-150 hover:translate-x-1 hover:bg-surface motion-reduce:hover:translate-x-0" aria-expanded={open} onClick={onToggle}>
          <strong className="font-semibold">{d.restaurant}{d.source === "food_rescue" && <Tag tone="rescue">rescue</Tag>}</strong>
          <span className="muted truncate">{d.items}</span>
          <span className="text-[13px] text-muted tabular-nums">
            {rupees(d.item_total)} dish + {rupees(d.fees)} fees + {rupees(d.taxes)} tax{d.savings ? ` − ${rupees(d.savings)} offer` : ""}
            {d.distance_km != null ? ` · ${km(d.distance_km)}` : ""}{d.eta_min != null ? ` · ${minutes(d.eta_min)}` : ""}
          </span>
        </button>
        <div className="grid justify-items-end gap-px">
          <span className="inline-block font-display text-lg font-bold tracking-[-.03em] text-pink tabular-nums transition-transform duration-[250ms] [text-shadow:0_0_18px_rgb(255_45_149/.25)] group-hover:scale-[1.08] motion-reduce:group-hover:scale-100">{rupees(d.final_payable)}</span>
          {spare > 0 && <span className="text-xs text-good">{rupees(spare)} to spare</span>}
        </div>
        <button className="grid place-items-center rounded-md border-0 bg-transparent p-1.5 text-muted transition duration-150 hover:bg-surface-2 hover:text-ink aria-pressed:text-pink" aria-pressed={d.favorite} aria-label={d.favorite ? "Remove star" : "Star this deal"}
          onClick={() => onFeedback(d.deal_key, { favorite: !d.favorite })}><StarIcon filled={d.favorite} /></button>
      </div>
      {open && (
        <div className="grid gap-3 px-1 pb-[18px] pt-1.5">
          <DealDetail deal={d} profile={profile} />
          <input className="w-full" defaultValue={d.note} placeholder="A note for yourself (kept with this deal)" aria-label={`Note for ${d.restaurant}`}
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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-8">
        {withDeals.map((p, i) => (
          <Reveal as="section" key={p} from={i % 2 ? "right" : "left"} delay={i * 120} className="lane" aria-labelledby={`lane-${p}`}>
            <header data-cascade className="flex items-baseline gap-3 border-b border-line pb-2.5">
              <h3 id={`lane-${p}`} className="inline-flex items-center gap-2 text-base font-bold"><PlatformDot platform={p} />{labels[p]}</h3>
              <span className="muted">{lists[p].length} deal{lists[p].length === 1 ? "" : "s"}</span>
              <span data-shock className="relative ml-auto font-display text-sm font-bold tracking-[-.02em] text-pink [text-shadow:0_0_18px_rgb(255_45_149/.25)]">from {rupees(lists[p][0].final_payable)}</span>
            </header>
            <ul>
              {lists[p].map((d, i) => (
                <DealRow key={d.deal_key} deal={d} index={i} fresh={arrived.has(d.deal_key)} profile={profile} budget={budget}
                  open={open === d.deal_key} onFeedback={onFeedback} onToggle={() => setOpen(open === d.deal_key ? null : d.deal_key)} />
              ))}
            </ul>
          </Reveal>
        ))}
      </div>
      {without.length > 0 && (
        <p className={withDeals.length ? "mt-4 text-sm text-muted" : "empty"}>
          {without.map((p) => `${labels[p]}: ${why(p)}`).join(" · ")}
        </p>
      )}
    </>
  );
}
