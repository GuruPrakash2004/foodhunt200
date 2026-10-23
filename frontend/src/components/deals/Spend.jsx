import { rupees } from "../../lib/format.js";

/**
 * Where the rupees go: one bar split into the dish, the fees and the tax, plus a sentence saying what the
 * extras cost. This is the thing people actually want to know when a ₹89 dish ends up costing ₹113.
 */
export default function Spend({ deal }) {
  const fees = deal.fees ?? deal.delivery_fee + deal.platform_fee + deal.packaging_fee + deal.other_charges;
  const parts = [["dish", "Dish", deal.item_total], ["fees", "Fees", fees], ["tax", "Tax", deal.taxes]].filter(([, , v]) => v > 0);
  const extras = fees + deal.taxes;
  const saved = Math.abs(deal.discount ?? deal.savings ?? 0);
  const sentence = extras > 0
    ? `Fees and tax added ${rupees(extras)} to a ${rupees(deal.item_total)} dish${saved ? `, and the offer took ${rupees(saved)} back` : ""}.`
    : `No fees or tax on top of the ${rupees(deal.item_total)} dish${saved ? `, and the offer took ${rupees(saved)} off` : ""}.`;
  return (
    <figure className="spend">
      <div className="spend-bar" role="img" aria-label={parts.map(([, name, v]) => `${name} ${rupees(v)}`).join(", ")}>
        {parts.map(([key, name, v]) => <span key={key} className={`spend-${key}`} style={{ flexGrow: v }} title={`${name} ${rupees(v)}`} />)}
      </div>
      <figcaption>{sentence}</figcaption>
    </figure>
  );
}
