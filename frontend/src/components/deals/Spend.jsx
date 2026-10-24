import { rupees } from "../../lib/format.js";

/**
 * Where the rupees go: one bar split into the dish, the fees and the tax, plus a sentence saying what the
 * extras cost. This is the thing people actually want to know when a ₹89 dish ends up costing ₹113.
 */
export const SPEND = { dish: "bg-brand", fees: "bg-[#8a8d94]", tax: "bg-[#55585f]" };

export default function Spend({ deal }) {
  const fees = deal.fees ?? deal.delivery_fee + deal.platform_fee + deal.packaging_fee + deal.other_charges;
  const parts = [["dish", "Dish", deal.item_total], ["fees", "Fees", fees], ["tax", "Tax", deal.taxes]].filter(([, , v]) => v > 0);
  const extras = fees + deal.taxes;
  const saved = Math.abs(deal.discount ?? deal.savings ?? 0);
  const sentence = extras > 0
    ? `Fees and tax added ${rupees(extras)} to a ${rupees(deal.item_total)} dish${saved ? `, and the offer took ${rupees(saved)} back` : ""}.`
    : `No fees or tax on top of the ${rupees(deal.item_total)} dish${saved ? `, and the offer took ${rupees(saved)} off` : ""}.`;
  return (
    <figure className="mb-1.5 mt-4">
      <div className="spend-bar flex h-2.5 gap-0.5 overflow-hidden rounded-[3px]" role="img" aria-label={parts.map(([, name, v]) => `${name} ${rupees(v)}`).join(", ")}>
        {parts.map(([key, name, v]) => <span key={key} className={`min-w-1 ${SPEND[key]}`} style={{ flexGrow: v }} title={`${name} ${rupees(v)}`} />)}
      </div>
      <figcaption className="mt-2 text-[13px] text-muted">{sentence}</figcaption>
    </figure>
  );
}
