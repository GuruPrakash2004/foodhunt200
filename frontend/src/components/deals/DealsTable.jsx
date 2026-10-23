import { Fragment, useMemo, useState } from "react";
import { km, minutes, rupees } from "../../lib/format.js";
import DealDetail from "./DealDetail.jsx";
import StarIcon from "./StarIcon.jsx";

const COLUMNS = [
  ["restaurant", "Restaurant"], ["items", "Item"], ["platform", "App"],
  ["item_total", "Base price", true], ["fees", "Fees", true], ["taxes", "Tax", true],
  ["savings", "Discount", true], ["final_payable", "Final price", true],
  ["distance_km", "Distance", true], ["eta_min", "ETA", true],
];

export default function DealsTable({ deals, onFeedback, profile, labels = {} }) {
  const [sort, setSort] = useState({ key: "final_payable", dir: 1 });
  const [open, setOpen] = useState(null);
  const sorted = useMemo(() => [...deals].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === "string" ? x.localeCompare(y) : x - y) * sort.dir;
  }), [deals, sort]);
  const sortBy = (key) => setSort(sort.key === key ? { key, dir: -sort.dir } : { key, dir: 1 });

  if (!deals.length) return <p className="empty">Nothing here yet. Start a hunt and the deals land in this table.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th><span className="visually-hidden">Favourite</span></th>
            {COLUMNS.map(([key, label, num]) => (
              <th key={key} className={num ? "num" : ""} tabIndex={0} onClick={() => sortBy(key)}
                onKeyDown={(e) => e.key === "Enter" && sortBy(key)}
                aria-sort={sort.key === key ? (sort.dir > 0 ? "ascending" : "descending") : undefined}>
                {label}{sort.key === key ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
              </th>
            ))}
            <th>Your note</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <Fragment key={d.deal_key}>
              <tr className="deal-row" onClick={() => setOpen(open === d.deal_key ? null : d.deal_key)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className={`star ${d.favorite ? "on" : ""}`} aria-pressed={d.favorite}
                    aria-label={d.favorite ? "Remove favourite" : "Add favourite"}
                    onClick={() => onFeedback(d.deal_key, { favorite: !d.favorite })}><StarIcon filled={d.favorite} /></button>
                </td>
                <td className="wrap">{d.restaurant}{d.source === "food_rescue" && <span className="tag rescue">rescue</span>}</td>
                <td className="wrap">{d.items}</td>
                <td><span className="plat"><i className={`dot ${d.platform}`} />{labels[d.platform] || d.platform}</span></td>
                <td className="num">{rupees(d.item_total)}</td>
                <td className="num">{rupees(d.fees)}</td>
                <td className="num">{rupees(d.taxes)}</td>
                <td className="num good">{d.savings ? `−${rupees(d.savings)}` : "—"}</td>
                <td className="num final">{rupees(d.final_payable)}</td>
                <td className="num">{km(d.distance_km)}</td>
                <td className="num">{minutes(d.eta_min)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <input className="note" defaultValue={d.note} placeholder="Add a note" aria-label={`Note for ${d.restaurant}`}
                    onBlur={(e) => e.target.value !== d.note && onFeedback(d.deal_key, { note: e.target.value })} />
                </td>
              </tr>
              {open === d.deal_key && <tr className="detail-row"><td colSpan={COLUMNS.length + 2}><DealDetail deal={d} profile={profile} /></td></tr>}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
