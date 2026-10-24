import { nextAlarm } from "../../hooks/useAlarms.js";
import { useNow } from "../../hooks/useNow.js";
import { rupees } from "../../lib/format.js";

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

/** One quiet line: the best thing seen this past hour, and when the next meal alarm goes off. */
export default function DealOfHour({ deals, alarms, snooze, onOpenAlarms }) {
  const now = useNow(1000);
  const best = deals.filter((d) => now - new Date(d.found_at).getTime() <= 3600e3)
    .reduce((b, d) => (!b || d.final_payable < b.final_payable ? d : b), null);
  const next = nextAlarm(alarms, snooze, now);
  return (
    <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 rounded-lg border-l-[6px] border-brand bg-surface-2 px-[22px] py-4 text-[15px]">
      <p>
        {best
          ? <>Cheapest in the last hour: <strong className="font-display font-semibold tracking-[-.02em] text-pink">{rupees(best.final_payable)}</strong> {best.items} at {best.restaurant}.</>
          : <span className="muted">Nothing found in the last hour.</span>}
      </p>
      <p className="flex items-baseline gap-3.5">
        {next
          ? <>{next.snoozed ? "Snoozed. " : ""}{next.alarm.label} alarm in <strong className="font-display text-[clamp(22px,3vw,32px)] font-bold leading-none tracking-[-.03em] tabular-nums">{clock(next.at - now)}</strong></>
          : <span className="muted">No meal alarm set</span>}
        <button className="btn-text" onClick={onOpenAlarms}>{next ? "Change" : "Set one"}</button>
      </p>
    </div>
  );
}
