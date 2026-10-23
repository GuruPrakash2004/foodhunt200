import { useEffect, useState } from "react";
import { shareDeal } from "../../lib/shareCard.js";
import { getHistory } from "../../api/index.js";
import { billRows } from "../../lib/bill.js";
import { rupees } from "../../lib/format.js";
import Sparkline from "./Sparkline.jsx";
import Spend from "./Spend.jsx";

export default function DealDetail({ deal: d, profile }) {
  const [history, setHistory] = useState([]);
  const [shared, setShared] = useState("");
  const share = async () => setShared(await shareDeal(d, profile).catch(() => "failed"));
  useEffect(() => { getHistory(d.deal_key).then(setHistory).catch(() => setHistory([])); }, [d.deal_key]);
  const bill = billRows(d);
  return (
    <div className="detail-grid">
      <table className="bill">
        <tbody>
          {bill.rows.map((r, i) => (
            <tr key={i}><td>{r.label}</td><td className={`num ${r.discount ? "good" : ""}`}>{r.discount ? `−${rupees(-r.amount)}` : rupees(r.amount)}</td></tr>
          ))}
          <tr className="bill-total"><td>To pay</td><td className="num">{rupees(d.final_payable)}</td></tr>
        </tbody>
      </table>
      <div>
        <Spend deal={d} />
        <h3 className="panel-title">Price history</h3>
        <Sparkline points={history} />
        <button className="text-button" onClick={share}>Share as image</button>
        {shared && <span className="muted"> {shared === "downloaded" ? "Saved to your downloads." : shared === "failed" ? "Could not make the image." : ""}</span>}
        {bill.approximate && <p className="muted">Saved before bills were kept line by line, so this split is approximate.</p>}
        <p className="muted">Every line above is copied from {d.platform}'s own bill. Order it in the app.</p>
      </div>
    </div>
  );
}
