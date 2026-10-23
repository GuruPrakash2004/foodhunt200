import { useState } from "react";
import Reveal from "../motion/Reveal.jsx";
import CompareDishes from "./CompareDishes.jsx";
import HeatCalendar from "./HeatCalendar.jsx";
import ReplayPanel from "./ReplayPanel.jsx";
import WeekSummary from "./WeekSummary.jsx";

const TABS = [["week", "This week"], ["compare", "Compare dishes"], ["heat", "Cheapest times"], ["replay", "Hunt replay"]];

export default function InsightsSection({ refreshKey, labels }) {
  // a link like /#insights-compare opens that tab
  const [tab, setTab] = useState(() => TABS.find(([id]) => window.location.hash === `#insights-${id}`)?.[0] || "week");
  return (
    <Reveal as="section" className="section" id="insights" aria-labelledby="insights-title">
      <div className="section-head">
        <h2 id="insights-title" className="section-title">Insights</h2>
        <div className="tabs" role="tablist" aria-label="Insights">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>
      {tab === "week" && <WeekSummary labels={labels} refreshKey={refreshKey} />}
      {tab === "compare" && <CompareDishes labels={labels} refreshKey={refreshKey} />}
      {tab === "heat" && <HeatCalendar refreshKey={refreshKey} />}
      {tab === "replay" && <ReplayPanel refreshKey={refreshKey} />}
    </Reveal>
  );
}
