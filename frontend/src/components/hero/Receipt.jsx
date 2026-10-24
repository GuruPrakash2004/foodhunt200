import { billRows } from "../../lib/bill.js";
import { useNow } from "../../hooks/useNow.js";
import { ago, rupees } from "../../lib/format.js";
import CountUp from "../motion/CountUp.jsx";
import Spend from "../deals/Spend.jsx";

/** The cheapest verified bill of the latest hunt, laid out like the receipt it came from. */
export default function Receipt({ deal, budget }) {
  const now = useNow(30000);
  const spare = deal ? Math.round(budget - deal.final_payable) : 0;
  const bill = deal ? billRows(deal) : null;
  return (
    <aside className="relative mb-2 origin-top animate-[print_.9s_var(--ease-soft)_both] rounded-t-lg border border-b-0 border-l-[6px] border-line border-l-pink bg-surface px-[clamp(20px,2.6vw,30px)] pb-[34px] pt-[clamp(20px,2.6vw,30px)] motion-reduce:animate-none" key={deal?.deal_key || "empty"} aria-label="Cheapest bill so far">
      <p className="mb-1.5 text-sm text-muted">{deal ? `Latest hunt · ${deal.platform === "swiggy" ? "Swiggy Food" : "Zomato"} · ${ago(deal.found_at, now)}` : "No bill yet"}</p>
      {deal ? (
        <>
          <h2 className="text-[22px] font-bold leading-tight tracking-[-.01em]">{deal.restaurant}</h2>
          <p className="mb-[18px] mt-1 text-[15px] text-muted">{deal.items}</p>
          <dl>
            {bill.rows.map((r, i) => (
              <div key={i} className="flex animate-line justify-between py-1.5 text-[15px] tabular-nums motion-reduce:animate-none" style={{ animationDelay: `${i * 40}ms` }}>
                <dt className="text-muted">{r.label}</dt><dd className={r.discount ? "text-good" : ""}>{r.discount ? `−${rupees(-r.amount)}` : rupees(r.amount)}</dd>
              </div>
            ))}
          </dl>
          {bill.approximate && <p className="muted mt-2 !text-xs">Saved before bills were kept line by line, so this split is approximate.</p>}
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3.5"><span className="text-muted">To pay</span><strong className="font-display text-[40px] font-bold leading-none tracking-[-.04em] text-pink tabular-nums [text-shadow:0_0_28px_rgb(255_45_149/.4)]"><CountUp value={deal.final_payable} /></strong></div>
          <p className="mt-1.5 text-xs text-good">{spare >= 0 ? `${rupees(spare)} to spare on your ${rupees(budget)}` : `${rupees(-spare)} over your ${rupees(budget)}`}</p>
          <Spend deal={deal} />
        </>
      ) : (
        <p className="max-w-[34ch] text-[15px] text-muted">Start a hunt and the cheapest bill it can verify shows up here, line by line, the way the app will charge it.</p>
      )}
      <svg className="absolute -left-px top-full block h-2 w-[calc(100%+2px)]" viewBox="0 0 160 8" preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id="teeth" width="16" height="8" patternUnits="userSpaceOnUse"><path d="M0 0h16L8 8z" fill="var(--color-surface)" /></pattern></defs>
        <rect width="160" height="8" fill="url(#teeth)" />
      </svg>
    </aside>
  );
}
