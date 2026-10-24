import StarIcon from "./StarIcon.jsx";

export default function FilterBar({ filters, setFilters, budget, labels }) {
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const toggle = (k, v) => () => setFilters({ ...filters, [k]: filters[k] === v ? "" : v });
  const withinBudget = String(filters.max_price) === String(budget);
  return (
    <div className="flex flex-wrap items-end gap-3 pb-[18px] pt-1">
      <label className="flex-[1_1_220px]">Search<input value={filters.q} onChange={set("q")} placeholder="Restaurant or dish" /></label>
      <label className="w-[104px]">From ₹<input type="number" min="0" value={filters.min_price} onChange={set("min_price")} /></label>
      <label className="w-[104px]">Up to ₹<input type="number" min="0" value={filters.max_price} onChange={set("max_price")} /></label>
      <label className="w-[104px]">Within km<input type="number" min="0" step="0.5" value={filters.max_distance} onChange={set("max_distance")} /></label>
      <div className="flex flex-wrap items-center gap-1.5">
        {Object.keys(labels).map((p) => (
          <button key={p} className="chip" aria-pressed={filters.platform === p}
            onClick={toggle("platform", p)}>{labels[p]}</button>
        ))}
        <button className="chip inline-flex items-center gap-1.5" aria-pressed={filters.favorites}
          onClick={() => setFilters({ ...filters, favorites: !filters.favorites })}><StarIcon filled={filters.favorites} /> Starred</button>
        <button className="chip" aria-pressed={withinBudget}
          onClick={() => setFilters({ ...filters, max_price: withinBudget ? "" : String(budget) })}>Under ₹{budget}</button>
      </div>
    </div>
  );
}
