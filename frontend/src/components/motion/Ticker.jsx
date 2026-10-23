import { rupees } from "../../lib/format.js";

/** A slow marquee of the cheapest deals found. Decorative: the same deals are listed below. */
export default function Ticker({ deals }) {
  const top = [...deals].sort((a, b) => a.final_payable - b.final_payable).slice(0, 8);
  if (top.length < 2) return null;
  const row = (suffix) => top.map((d) => (
    <span key={d.deal_key + suffix} className="ticker-item"><b>{rupees(d.final_payable)}</b> {d.restaurant} · {d.items}</span>
  ));
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">{row("a")}{row("b")}</div>
    </div>
  );
}
