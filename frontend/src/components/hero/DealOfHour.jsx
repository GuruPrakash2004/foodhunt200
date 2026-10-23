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
    <div className="statusline">
      <p>
        {best
          ? <>Cheapest in the last hour: <strong className="pink">{rupees(best.final_payable)}</strong> {best.items} at {best.restaurant}.</>
          : <span className="muted">Nothing found in the last hour.</span>}
      </p>
      <p className="statusline-alarm">
        {next
          ? <>{next.snoozed ? "Snoozed. " : ""}{next.alarm.label} alarm in <strong className="hour-clock tabular">{clock(next.at - now)}</strong></>
          : <span className="muted">No meal alarm set</span>}
        <button className="text-button" onClick={onOpenAlarms}>{next ? "Change" : "Set one"}</button>
      </p>
    </div>
  );
}
