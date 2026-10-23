import { billRows } from "../../lib/bill.js";
import { rupees } from "../../lib/format.js";
import CountUp from "../motion/CountUp.jsx";
import Spend from "../deals/Spend.jsx";

/** The cheapest verified bill so far, laid out like the receipt it came from. */
export default function Receipt({ deal, budget }) {
  const spare = deal ? Math.round(budget - deal.final_payable) : 0;
  const bill = deal ? billRows(deal) : null;
  return (
    <aside className="receipt" key={deal?.deal_key || "empty"} aria-label="Cheapest bill so far">
      <p className="receipt-kicker">{deal ? `Cheapest so far · ${deal.platform === "swiggy" ? "Swiggy Food" : "Zomato"}` : "No bill yet"}</p>
      {deal ? (
        <>
          <h2 className="receipt-title">{deal.restaurant}</h2>
          <p className="receipt-item">{deal.items}</p>
          <dl className="receipt-lines">
            {bill.rows.map((r, i) => (
              <div key={i} className={r.discount ? "discount" : ""}><dt>{r.label}</dt><dd>{r.discount ? `−${rupees(-r.amount)}` : rupees(r.amount)}</dd></div>
            ))}
          </dl>
          {bill.approximate && <p className="muted approx">Saved before bills were kept line by line, so this split is approximate.</p>}
          <div className="receipt-total"><span>To pay</span><strong><CountUp value={deal.final_payable} /></strong></div>
          <p className="spare">{spare >= 0 ? `${rupees(spare)} to spare on your ${rupees(budget)}` : `${rupees(-spare)} over your ${rupees(budget)}`}</p>
          <Spend deal={deal} />
        </>
      ) : (
        <p className="receipt-empty">Start a hunt and the cheapest bill it can verify shows up here, line by line, the way the app will charge it.</p>
      )}
      <svg className="receipt-edge" viewBox="0 0 160 8" preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id="teeth" width="16" height="8" patternUnits="userSpaceOnUse"><path d="M0 0h16L8 8z" fill="currentColor" /></pattern></defs>
        <rect width="160" height="8" fill="url(#teeth)" />
      </svg>
    </aside>
  );
}
