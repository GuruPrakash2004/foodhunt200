import { useEffect, useState } from "react";
import { shareDeal } from "../../lib/shareCard.js";
import { getHistory } from "../../api/index.js";
import { billRows } from "../../lib/bill.js";
import { rupees } from "../../lib/format.js";
import AddToCartButton from "./AddToCartButton.jsx";
import Sparkline from "./Sparkline.jsx";
import Spend from "./Spend.jsx";

export default function DealDetail({ deal: d, profile, labels = {} }) {
  const [history, setHistory] = useState([]);
  const [shared, setShared] = useState("");
  const share = async () => setShared(await shareDeal(d, profile).catch(() => "failed"));
  useEffect(() => { getHistory(d.deal_key).then(setHistory).catch(() => setHistory([])); }, [d.deal_key]);
  const bill = billRows(d);
  return (
    <div className="grid gap-7 min-[700px]:grid-cols-[minmax(230px,330px)_1fr]">
      <table className="w-full text-sm">
        <tbody>
          {bill.rows.map((r, i) => (
            <tr key={i}><td className="py-1">{r.label}</td><td className={`py-1 text-right tabular-nums ${r.discount ? "text-good" : ""}`}>{r.discount ? `−${rupees(-r.amount)}` : rupees(r.amount)}</td></tr>
          ))}
          <tr className="font-display text-[17px] font-bold tracking-[-.03em] text-pink"><td className="pt-2.5">To pay</td><td className="pt-2.5 text-right tabular-nums">{rupees(d.final_payable)}</td></tr>
        </tbody>
      </table>
      <div>
        <Spend deal={d} />
        <AddToCartButton deal={d} label={labels[d.platform]} />
        <h3 className="mb-2.5 text-sm font-semibold">Price history</h3>
        <Sparkline points={history} />
        <button className="btn-text" onClick={share}>Share as image</button>
        {shared && <span className="muted"> {shared === "downloaded" ? "Saved to your downloads." : shared === "failed" ? "Could not make the image." : ""}</span>}
        {bill.approximate && <p className="muted">Saved before bills were kept line by line, so this split is approximate.</p>}
        <p className="muted">Every line above is copied from {d.platform}'s own bill. {d.can_add_to_cart ? "Add it to your cart here, then pay in the app." : "Order it in the app."}</p>
      </div>
    </div>
  );
}
