import { useRef, useState } from "react";
import { useMagnetic } from "../../hooks/useMagnetic.js";
import { useNow } from "../../hooks/useNow.js";
import { LineReveal } from "../motion/text/SplitWords.tsx";
import WordFlip from "../motion/text/WordFlip.tsx";
import Logo3D from "../brand/Logo3D.jsx";
import HuntOptions from "../hunt/HuntOptions.jsx";
import Modal from "../ui/Modal.jsx";
import Receipt from "./Receipt.jsx";

const CAPTION = "text-[13px] leading-[1.9] tracking-[.32em] uppercase text-muted";
const RISE = "animate-rise [animation-delay:calc(var(--i,0)*70ms)] motion-reduce:animate-none";

const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

/** Only mounted while a hunt runs, so the one-second clock isn't ticking the rest of the time. */
function Progress({ startedAt, found }) {
  const now = useNow(1000);
  return (
    <div className="mt-[22px] grid max-w-[420px] gap-2" role="status">
      <div className="h-[3px] overflow-hidden rounded-sm bg-surface-3" aria-hidden="true"><span className="block h-full w-[30%] animate-sweep bg-pink motion-reduce:animate-none" /></div>
      <p className="text-sm text-muted tabular-nums"><WordFlip words={["Scanning menus", "Reading carts", "Adding up fees", "Checking the bill"]} /> · <strong className="font-semibold text-ink">{clock(now - startedAt)}</strong> · {found === 0 ? "nothing yet" : <><strong className="font-semibold text-ink">{found}</strong> deal{found === 1 ? "" : "s"} so far</>}</p>
    </div>
  );
}

export default function Hero({ params, setParams, running, startedAt, found, error, onRun, cheapest, labels, mobile, needsLogin, hosted, chime, setChime, addressBook, onStop }) {
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
    <section className="relative isolate grid overflow-x-clip items-start gap-[clamp(24px,5vw,72px)] pb-2 pt-[clamp(12px,2.4vw,28px)] min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)] [&>*]:min-w-0" id="top" aria-labelledby="intro-title" onPointerMove={spot}>
      <span className="pointer-events-none absolute left-[var(--sx,30%)] top-[var(--sy,40%)] -ml-[260px] -mt-[260px] size-[520px] rounded-full bg-brand opacity-15 blur-[90px] transition-[left,top] duration-[350ms] ease-soft motion-reduce:hidden" aria-hidden="true" />
      <Logo3D size={230} className="pointer-events-none absolute left-[50.5%] top-[47%] -ml-[115px] -mt-[115px] max-[1240px]:hidden" />
      <div className="relative z-[1]">
        <p className={`${CAPTION} ${RISE}`}>{Object.values(labels).map((l, i) => <span key={l}>{i > 0 && <b className="font-normal text-pink"> × </b>}{l}</span>)}</p>
        <h1 id="intro-title" className="mt-3.5 text-[clamp(44px,7vw,96px)] font-extrabold leading-none tracking-[-.045em]">
          <span className="text-brand [text-shadow:0_0_40px_rgb(0_123_167/.55)]" aria-label="Meals under">
            {letters.map((c, i) => <span key={i} className="letter" aria-hidden="true" style={{ "--l": i }}>{c === " " ? " " : c}</span>)}
          </span>{" "}
          <label className="inline-flex items-baseline gap-0 font-display text-[.86em] font-bold leading-none tracking-[-.05em] text-pink [text-shadow:0_0_40px_rgb(255_45_149/.45)]">
            <span aria-hidden="true">₹</span>
            <input className="w-[3.3ch] rounded-none border-0 border-b-[3px] border-line bg-transparent p-0 font-[inherit] tracking-[inherit] text-[inherit] [field-sizing:content] [text-shadow:inherit] [appearance:textfield] hover:border-line-hi focus:border-pink [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="number" inputMode="numeric" min="1" max="5000" value={params.budget} aria-label="Your price limit in rupees"
              onChange={(e) => setParams({ ...params, budget: e.target.value })} />
          </label>
        </h1>
        <p className={`mt-[18px] max-w-[50ch] text-[17px] text-muted ${RISE}`} style={{ "--i": 1 }}>
          <LineReveal delay={0.4} text={`Everything counted: delivery, platform fees, tax and offers, read from real ${Object.values(labels).join(" and ")} carts, so the price you see is the price you pay. You place the order in the app.`} />
        </p>
        <p className={`${CAPTION} ${RISE} mt-4`} style={{ "--i": 2 }}>Where menu price meets the <span className="text-pink">real bill</span></p>

        <div className={`mt-7 flex flex-wrap items-center gap-[18px] ${RISE}`} style={{ "--i": 3 }}>
          <button ref={ring} className={`ring-button ${running ? "scanning" : ""}`} onClick={onRun} disabled={running} aria-label={running ? "Hunting" : "Start the hunt"}>
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className={CAPTION}>{running ? "Hunting…" : "Start the hunt"}</span>
          {running && <button type="button" className="rounded-full border border-bad bg-transparent px-3.5 py-[5px] text-[13px] font-semibold text-bad transition-colors hover:bg-bad hover:text-ground" onClick={onStop}>Stop hunt</button>}
          <button className="btn-text" onClick={() => setOptions(true)} aria-haspopup="dialog">Options</button>
          <span className="text-sm text-muted">{where} · {diet}</span>
        </div>
        {running && <Progress startedAt={startedAt} found={found} />}
        {needsLogin && hosted && <p className="muted mt-3.5 max-w-[48ch]">Press <strong className="font-semibold text-ink">Connect</strong> in the top bar to log in to Zomato / Swiggy first. Use the number you have registered with each app.</p>}
        {needsLogin && !hosted && mobile && <p className="muted mt-3.5 max-w-[48ch]">The first hunt opens a Zomato / Swiggy login tab. Use <strong className="font-semibold text-ink">{mobile}</strong> there.</p>}
        {error && <p className="error" role="alert">{error}</p>}

        <Modal open={options} onClose={() => setOptions(false)} variant="drawer" title="Hunt options"
          subtitle="These apply to the next hunt."
          footer={<><span className="muted">{where} · up to ₹{params.budget}</span><button className="btn-solid" onClick={() => setOptions(false)}>Done</button></>}>
          <HuntOptions params={params} setParams={setParams} labels={labels} chime={chime} setChime={setChime} addressBook={addressBook} />
        </Modal>
      </div>
      <Receipt deal={cheapest} budget={Number(params.budget)} />
    </section>
  );
}
