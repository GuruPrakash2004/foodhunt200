import TermsInput from "./TermsInput.jsx";

/** Pick a saved address from the platform accounts; falls back to typing a label when none could be loaded. */
function AddressPicker({ book, labels, value, onChange }) {
  const groups = Object.entries(book?.addresses || {}).filter(([, list]) => list.length);
  const problems = Object.entries(book?.errors || {}).map(([p, m]) => `${labels[p] || p}: ${m}`);
  return (
    <div className="grid justify-items-start gap-2">
      {groups.length > 0 ? (
        <label>Deliver to
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            {!groups.some(([, l]) => l.some((a) => a.label === value)) && <option value={value}>{value}</option>}
            {groups.map(([p, list]) => (
              <optgroup key={p} label={labels[p] || p}>
                {list.map((a) => <option key={a.label} value={a.label}>{a.label}{a.text !== a.label ? ` · ${a.text.slice(0, 50)}` : ""}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      ) : (
        <label>Address label<input value={value} onChange={(e) => onChange(e.target.value)} /></label>
      )}
      <button type="button" className="btn-text" onClick={book?.reload} disabled={book?.loading}>{book?.loading ? "Loading addresses…" : "Refresh addresses"}</button>
      {problems.map((m) => <p key={m} className="muted max-w-[46ch]">{m}</p>)}
    </div>
  );
}

const Choice = ({ value, current, onPick, children }) => (
  <button type="button" className="chip" aria-pressed={current === value} onClick={() => onPick(value)}>{children}</button>
);

const Group = ({ title, hint, children }) => (
  <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
    <legend className="mb-0.5 p-0 text-[15px] font-semibold text-ink">{title}</legend>
    {hint && <p className="muted max-w-[46ch]">{hint}</p>}
    {children}
  </fieldset>
);

/** The hunt settings, grouped by what they decide. Rendered inside the options drawer. */
export default function HuntOptions({ params, setParams, labels, chime, setChime, addressBook }) {
  const set = (k) => (v) => setParams({ ...params, [k]: v });
  const field = (k) => (e) => set(k)(e.target.value);
  return (
    <div className="grid gap-7">
      <Group title="Where to hunt">
        <div className="flex flex-wrap items-center gap-1.5">
          <Choice value="both" current={params.platform} onPick={set("platform")}>All</Choice>
          {Object.keys(labels).map((p) => <Choice key={p} value={p} current={params.platform} onPick={set("platform")}>{labels[p]}</Choice>)}
        </div>
        <AddressPicker book={addressBook} labels={labels} value={params.address} onChange={set("address")} />
      </Group>

      <Group title="What to look for">
        <div className="flex flex-wrap items-center gap-1.5">
          <Choice value="any (veg or non-veg)" current={params.diet} onPick={set("diet")}>Any</Choice>
          <Choice value="veg" current={params.diet} onPick={set("diet")}>Veg</Choice>
          <Choice value="non-veg" current={params.diet} onPick={set("diet")}>Non-veg OK</Choice>
        </div>
        <span className="text-[13px] text-muted">Search terms</span>
        <TermsInput value={params.queries} onChange={set("queries")} />
      </Group>

      <Group title="Unlocking offers"
        hint="Offers often need a minimum order. Let the hunt add a drink, a side or a second small dish to reach it. The bill still has to stay within your price, and every item is listed on the deal.">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Extra items allowed to unlock an offer">
          {[0, 1, 2, 3].map((n) => (
            <button key={n} type="button" className="min-w-14 rounded-md border border-line bg-transparent px-3.5 py-[9px] font-semibold transition duration-150 hover:bg-surface-2 active:scale-95 aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white" aria-pressed={params.extra_items === n}
              onClick={() => set("extra_items")(n)}>{n === 0 ? "None" : `+${n}`}</button>
          ))}
          <span className="muted">extra item{params.extra_items === 1 ? "" : "s"} allowed</span>
        </div>
      </Group>

      <Group title="Limits">
        <label>Carts to check per platform
          <input type="number" min="1" max="15" value={params.max_carts} onChange={field("max_carts")} />
        </label>
      </Group>

      <Group title="Sound" hint="A chime when a new deal lands. A bigger one when it is 25% under your price.">
        <div className="flex flex-wrap items-center gap-3.5">
          <button type="button" className="chip" aria-pressed={chime.on} onClick={() => setChime({ ...chime, on: !chime.on })}>
            {chime.on ? "Chime on" : "Chime off"}
          </button>
          <label className="inline-flex items-center gap-2">at or under ₹
            <input className="w-[90px]" type="number" min="1" value={chime.under} onChange={(e) => setChime({ ...chime, under: Number(e.target.value) || 1 })} />
          </label>
        </div>
      </Group>
    </div>
  );
}
