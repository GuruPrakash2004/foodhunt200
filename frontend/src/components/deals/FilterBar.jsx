import StarIcon from "./StarIcon.jsx";

export default function FilterBar({ filters, setFilters, budget, labels }) {
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const toggle = (k, v) => () => setFilters({ ...filters, [k]: filters[k] === v ? "" : v });
  const withinBudget = String(filters.max_price) === String(budget);
  return (
    <div className="filters">
      <label className="grow">Search<input value={filters.q} onChange={set("q")} placeholder="Restaurant or dish" /></label>
      <label className="num-field">From ₹<input type="number" min="0" value={filters.min_price} onChange={set("min_price")} /></label>
      <label className="num-field">Up to ₹<input type="number" min="0" value={filters.max_price} onChange={set("max_price")} /></label>
      <label className="num-field">Within km<input type="number" min="0" step="0.5" value={filters.max_distance} onChange={set("max_distance")} /></label>
      <div className="chips">
        {Object.keys(labels).map((p) => (
          <button key={p} className={`chip ${filters.platform === p ? "on" : ""}`} aria-pressed={filters.platform === p}
            onClick={toggle("platform", p)}>{labels[p]}</button>
        ))}
        <button className={`chip with-icon ${filters.favorites ? "on" : ""}`} aria-pressed={filters.favorites}
          onClick={() => setFilters({ ...filters, favorites: !filters.favorites })}><StarIcon filled={filters.favorites} /> Starred</button>
        <button className={`chip ${withinBudget ? "on" : ""}`} aria-pressed={withinBudget}
          onClick={() => setFilters({ ...filters, max_price: withinBudget ? "" : String(budget) })}>Under ₹{budget}</button>
      </div>
    </div>
  );
}
