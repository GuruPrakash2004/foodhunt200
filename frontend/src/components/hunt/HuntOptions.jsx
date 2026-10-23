import TermsInput from "./TermsInput.jsx";

const Choice = ({ value, current, onPick, children }) => (
  <button type="button" className={`chip ${current === value ? "on" : ""}`} aria-pressed={current === value} onClick={() => onPick(value)}>{children}</button>
);

const Group = ({ title, hint, children }) => (
  <fieldset className="group">
    <legend>{title}</legend>
    {hint && <p className="muted group-hint">{hint}</p>}
    {children}
  </fieldset>
);

/** The hunt settings, grouped by what they decide. Rendered inside the options drawer. */
export default function HuntOptions({ params, setParams, labels, chime, setChime }) {
  const set = (k) => (v) => setParams({ ...params, [k]: v });
  const field = (k) => (e) => set(k)(e.target.value);
  return (
    <div className="options-form">
      <Group title="Where to hunt">
        <div className="chips">
          <Choice value="both" current={params.platform} onPick={set("platform")}>All</Choice>
          {Object.keys(labels).map((p) => <Choice key={p} value={p} current={params.platform} onPick={set("platform")}>{labels[p]}</Choice>)}
        </div>
        <label>Address label<input value={params.address} onChange={field("address")} /></label>
      </Group>

      <Group title="What to look for">
        <div className="chips">
          <Choice value="any (veg or non-veg)" current={params.diet} onPick={set("diet")}>Any</Choice>
          <Choice value="veg" current={params.diet} onPick={set("diet")}>Veg</Choice>
          <Choice value="non-veg" current={params.diet} onPick={set("diet")}>Non-veg OK</Choice>
        </div>
        <span className="field-label">Search terms</span>
        <TermsInput value={params.queries} onChange={set("queries")} />
      </Group>

      <Group title="Unlocking offers"
        hint="Offers often need a minimum order. Let the hunt add a drink, a side or a second small dish to reach it. The bill still has to stay within your price, and every item is listed on the deal.">
        <div className="stepper" role="group" aria-label="Extra items allowed to unlock an offer">
          {[0, 1, 2, 3].map((n) => (
            <button key={n} type="button" className={`step ${params.extra_items === n ? "on" : ""}`} aria-pressed={params.extra_items === n}
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
        <div className="row-inline">
          <button type="button" className={`chip ${chime.on ? "on" : ""}`} aria-pressed={chime.on} onClick={() => setChime({ ...chime, on: !chime.on })}>
            {chime.on ? "Chime on" : "Chime off"}
          </button>
          <label className="inline-field">at or under ₹
            <input type="number" min="1" value={chime.under} onChange={(e) => setChime({ ...chime, under: Number(e.target.value) || 1 })} />
          </label>
        </div>
      </Group>
    </div>
  );
}
