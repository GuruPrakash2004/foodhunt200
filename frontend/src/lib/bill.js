// Lines that only restate the total: they are shown as "To pay", not as a charge.
const TOTAL_LINE = /to ?pay|grand total|total payable|amount payable|payable|bill total|net total/i;

/**
 * The rows of a deal's bill. When the deal has the platform's own lines they are shown exactly as the platform
 * labelled them. Older deals only have the category totals, so those are shown and marked approximate.
 */
export function billRows(deal) {
  if (deal.bill_lines?.length) {
    return {
      approximate: false,
      rows: deal.bill_lines.filter((l) => !TOTAL_LINE.test(l.label)).map((l) => ({ label: l.label, amount: l.amount, discount: l.amount < 0 })),
    };
  }
  const rows = [["Dish", deal.item_total], ["Delivery", deal.delivery_fee], ["Platform fee", deal.platform_fee],
    ["Packaging", deal.packaging_fee], ["Tax", deal.taxes], ["Other charges", deal.other_charges]]
    .filter(([, v]) => v).map(([label, amount]) => ({ label, amount, discount: false }));
  if (deal.savings) rows.push({ label: `Offer${deal.offer ? ` (${deal.offer})` : ""}`, amount: -deal.savings, discount: true });
  return { approximate: true, rows };
}
