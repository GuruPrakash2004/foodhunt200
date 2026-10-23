import { useRef, useState } from "react";
import { useMagnetic } from "../../hooks/useMagnetic.js";
import { useNow } from "../../hooks/useNow.js";
import Logo3D from "../brand/Logo3D.jsx";
import HuntOptions from "../hunt/HuntOptions.jsx";
import Modal from "../ui/Modal.jsx";
import Receipt from "./Receipt.jsx";

const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

/** Only mounted while a hunt runs, so the one-second clock isn't ticking the rest of the time. */
function Progress({ startedAt, found }) {
  const now = useNow(1000);
  return (
    <div className="progress" role="status">
      <div className="sweep" aria-hidden="true"><span /></div>
      <p>Hunting for <strong>{clock(now - startedAt)}</strong> · {found === 0 ? "nothing yet" : <><strong>{found}</strong> deal{found === 1 ? "" : "s"} so far</>}</p>
    </div>
  );
}

export default function Hero({ params, setParams, running, startedAt, found, error, onRun, cheapest, labels, mobile, needsLogin, chime, setChime }) {
  const [options, setOptions] = useState(() => window.location.hash === "#options");   // /#options opens the drawer
  const ring = useRef(null);
  useMagnetic(ring);
  const spot = (e) => {   // the soft light under the headline follows the pointer
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--sx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--sy", `${e.clientY - r.top}px`);
  };
  const where = params.platform === "both" ? Object.values(labels).join(" and ") : labels[params.platform];
  const diet = params.diet.startsWith("any") ? "any diet" : params.diet === "veg" ? "veg only" : "non-veg OK";
  const letters = "Meals under".split("");
  return (
    <section className="intro" id="top" aria-labelledby="intro-title" onPointerMove={spot}>
      <span className="spotlight" aria-hidden="true" />
      <Logo3D size={230} className="hero-logo" />
      <div className="intro-main">
        <p className="caption rise">{Object.values(labels).map((l, i) => <span key={l}>{i > 0 && <b> × </b>}{l}</span>)}</p>
        <h1 id="intro-title" className="intro-title">
          <span className="title-blue" aria-label="Meals under">
            {letters.map((c, i) => <span key={i} className="letter" aria-hidden="true" style={{ "--l": i }}>{c === " " ? " " : c}</span>)}
          </span>{" "}
          <label className="budget">
            <span aria-hidden="true">₹</span>
            <input type="number" inputMode="numeric" min="1" max="5000" value={params.budget} aria-label="Your price limit in rupees"
              onChange={(e) => setParams({ ...params, budget: e.target.value })} />
          </label>
        </h1>
        <p className="lede rise" style={{ "--i": 1 }}>
          Everything counted: delivery, platform fees, tax and offers, read from real {Object.values(labels).join(" and ")} carts,
          so the price you see is the price you pay. You place the order in the app.
        </p>
        <p className="caption rise" style={{ "--i": 2 }}>Where menu price meets the <span className="accent">real bill</span></p>

        <div className="intro-actions rise" style={{ "--i": 3 }}>
          <button ref={ring} className={`ring-button ${running ? "scanning" : ""}`} onClick={onRun} disabled={running} aria-label={running ? "Hunting" : "Start the hunt"}>
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="caption">{running ? "Hunting…" : "Start the hunt"}</span>
          <button className="text-button" onClick={() => setOptions(true)} aria-haspopup="dialog">Options</button>
          <span className="intro-scope">{where} · {diet}</span>
        </div>
        {running && <Progress startedAt={startedAt} found={found} />}
        {needsLogin && mobile && <p className="muted login-hint">The first hunt opens a Zomato / Swiggy login tab. Use <strong>{mobile}</strong> there.</p>}
        {error && <p className="error" role="alert">{error}</p>}

        <Modal open={options} onClose={() => setOptions(false)} variant="drawer" title="Hunt options"
          subtitle="These apply to the next hunt."
          footer={<><span className="muted">{where} · up to ₹{params.budget}</span><button className="solid-button" onClick={() => setOptions(false)}>Done</button></>}>
          <HuntOptions params={params} setParams={setParams} labels={labels} chime={chime} setChime={setChime} />
        </Modal>
      </div>
      <Receipt deal={cheapest} budget={Number(params.budget)} />
    </section>
  );
}
