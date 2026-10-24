import { rupees } from "../../lib/format.js";

/** A slow marquee of the cheapest deals found. Decorative: the same deals are listed below. */
export default function Ticker({ deals }) {
  const top = [...deals].sort((a, b) => a.final_payable - b.final_payable).slice(0, 8);
  if (top.length < 2) return null;
  const row = (suffix) => top.map((d) => (
    <span key={d.deal_key + suffix} className="whitespace-nowrap text-muted"><b className="mr-1.5 font-display font-bold tracking-[-.02em] text-pink">{rupees(d.final_payable)}</b> {d.restaurant} · {d.items}</span>
  ));
  return (
    <div className="group mt-3 overflow-hidden rounded-lg bg-surface py-3.5" aria-hidden="true">
      <div className="flex w-max animate-[marquee_38s_linear_infinite] gap-12 pl-12 group-hover:[animation-play-state:paused] motion-reduce:animate-none">{row("a")}{row("b")}</div>
    </div>
  );
}
