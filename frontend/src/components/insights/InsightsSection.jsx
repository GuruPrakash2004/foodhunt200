import { useState } from "react";
import FoodDrift from "../motion/FoodDrift.jsx";
import Reveal from "../motion/Reveal.jsx";
import SectionTitle from "../motion/SectionTitle.tsx";
import CompareDishes from "./CompareDishes.jsx";
import HeatCalendar from "./HeatCalendar.jsx";
import ReplayPanel from "./ReplayPanel.jsx";
import WeekSummary from "./WeekSummary.jsx";

const TABS = [["week", "This week"], ["compare", "Compare dishes"], ["heat", "Cheapest times"], ["replay", "Hunt replay"]];

export default function InsightsSection({ refreshKey, labels }) {
  // a link like /#insights-compare opens that tab
  const [tab, setTab] = useState(() => TABS.find(([id]) => window.location.hash === `#insights-${id}`)?.[0] || "week");
  return (
    <Reveal as="section" stagger className="relative mt-[var(--section-gap)]" id="insights" aria-labelledby="insights-title">
      <FoodDrift photos={["f07", "f06"]} side="left" />
      <div className="mb-4 flex flex-wrap items-baseline gap-x-8 gap-y-5">
        <SectionTitle id="insights-title" glow="#6a4cff">Insights</SectionTitle>
        <div data-cascade className="ml-auto flex flex-wrap gap-[22px]" role="tablist" aria-label="Insights">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className="border-0 border-b-2 border-transparent bg-transparent pb-2 pt-1 text-[15px] text-muted transition-colors duration-150 hover:text-ink aria-selected:border-pink aria-selected:text-ink" onClick={() => setTab(id)}>{label}</button>
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
