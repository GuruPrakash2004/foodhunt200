import { useState } from "react";
import { DEFAULT_FILTERS } from "../../lib/format.js";
import { EXPORT_URL } from "../../api/index.js";
import CountUp from "../motion/CountUp.jsx";
import Reveal from "../motion/Reveal.jsx";
import DealsTable from "./DealsTable.jsx";
import FilterBar from "./FilterBar.jsx";
import SideBySide from "./SideBySide.jsx";

const VIEW_KEY = "foodhunt.view";
const readView = () => { try { return localStorage.getItem(VIEW_KEY) || "sides"; } catch { return "sides"; } };

export default function DealsSection({ deals, filters, setFilters, budget, onFeedback, platforms, labels, profile, totalCount = 0, onClearFilters }) {
  const filtered = Object.keys(DEFAULT_FILTERS).some((k) => filters[k] !== DEFAULT_FILTERS[k]);
  const hidden = Math.max(0, totalCount - deals.length);
  const [view, setView] = useState(readView);
  const pick = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ } };
  const cheapest = deals.length ? Math.min(...deals.map((d) => d.final_payable)) : null;
  const avgSaving = deals.length ? deals.reduce((s, d) => s + d.savings, 0) / deals.length : 0;
  return (
    <Reveal as="section" className="section" id="deals" aria-labelledby="deals-title">
      <div className="section-head">
        <h2 id="deals-title" className="section-title">Deals</h2>
        <p className="stats-line">
          <span><b><CountUp value={deals.length} prefix="" ms={400} /></b> shown</span>
          <span>cheapest <b className="pink"><CountUp value={cheapest} /></b></span>
          <span>offers took <b><CountUp value={avgSaving} /></b> off on average</span>
        </p>
        <div className="view-switch" role="group" aria-label="Deal layout">
          <button className={`chip ${view === "sides" ? "on" : ""}`} aria-pressed={view === "sides"} onClick={() => pick("sides")}>Side by side</button>
          <button className={`chip ${view === "table" ? "on" : ""}`} aria-pressed={view === "table"} onClick={() => pick("table")}>Table</button>
        </div>
        <a className="text-button" href={EXPORT_URL}>Download Excel history</a>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} budget={budget} labels={labels} />
      {filtered && hidden > 0 && (
        <p className="filter-note" role="status">
          {deals.length === 0 ? `Your filters hide all ${totalCount} deal${totalCount === 1 ? "" : "s"} found so far.` : `${hidden} of ${totalCount} deals are hidden by your filters.`}{" "}
          <button className="text-button" onClick={onClearFilters}>Clear filters</button>
        </p>
      )}
      {deals.length === 0 && hidden > 0 ? null : view === "sides"
        ? <SideBySide deals={deals} onFeedback={onFeedback} connected={platforms} labels={labels} profile={profile} budget={budget} />
        : <DealsTable deals={deals} onFeedback={onFeedback} profile={profile} labels={labels} />}
    </Reveal>
  );
}
