import { useLayoutEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion, ScrollTrigger } from "@/lib/gsap";
import Odometer from "../motion/text/Odometer";

/** An illustrative bill (not live data): the menu price, then each charge snaps on until the real all-in price. */
const BASE = 159;
const STEPS = [
  { k: "Delivery", amt: 36, sign: 1, side: -1, top: 24 },
  { k: "Platform fee", amt: 9, sign: 1, side: 1, top: 28 },
  { k: "GST", amt: 14, sign: 1, side: -1, top: 66 },
  { k: "Offer", amt: 58, sign: -1, side: 1, top: 64 },
];
const FINAL = STEPS.reduce((t, s) => t + s.sign * s.amt, BASE);
/** Photo cards kept to the edges so the price stays clear. x/y are % of the stage. */
const CARDS = [
  { src: "f02", x: 9, y: 24, w: 12, r: -8 }, { src: "f10", x: 91, y: 22, w: 12, r: 7 },
  { src: "f03", x: 20, y: 74, w: 11, r: 6 }, { src: "f11", x: 80, y: 76, w: 12, r: -6 },
  { src: "f07", x: 5, y: 58, w: 9, r: 9 }, { src: "f09", x: 95, y: 56, w: 9, r: -9 },
  { src: "f06", x: 33, y: 12, w: 8, r: -5 }, { src: "f04", x: 67, y: 10, w: 8, r: 5 },
];

export default function PriceDrop({ budget }: { budget: string | number }) {
  const root = useRef<HTMLDivElement>(null);
    const still = useRef(prefersReducedMotion());
  const [total, setTotal] = useState(still.current ? FINAL : BASE);
  const [done, setDone] = useState(still.current);
  const [hint, setHint] = useState(true);
  const [note, setNote] = useState(still.current ? "All-in price" : "On the menu");

  useLayoutEffect(() => {
    if (still.current || !root.current) return;
    const w = root.current.clientWidth;
    const ctx = gsap.context(() => {
      const t = gsap.timeline({ defaults: { overwrite: "auto" } });
      const marks: number[] = [];
      t.to({}, { duration: 0.35 });   // a short lead-in so the first scroll does not start a chip straight away
      STEPS.forEach((s, i) => {
        const chip = `.pd-chip[data-i="${i}"]`;
        t.fromTo(chip, { x: s.side * w * 0.45, opacity: 0, rotate: s.side * 14 }, { x: 0, opacity: 1, rotate: 0, duration: 0.65, ease: "back.out(1.5)" }, ">+0.3");
        t.to(chip, { x: -s.side * w * 0.3, scale: 0.35, opacity: 0, duration: 0.45, ease: "power2.in" }, ">+0.55");
        marks.push(t.duration() - 0.08);
        t.fromTo(".pd-price", { scale: 1.07 }, { scale: 1, duration: 0.45, ease: "power3.out" }, "<");
      });
      const doneAt = t.duration();
      t.fromTo(".pd-ring", { scale: 0.4, opacity: 0.9 }, { scale: 3.4, opacity: 0, duration: 1.3, ease: "power2.out" }, doneAt);
      t.fromTo(".pd-card", { scale: 0, opacity: 0, x: (_i, el) => (50 - Number(el.dataset.x)) * w / 100, y: (_i, el) => (50 - Number(el.dataset.y)) * w / 100 * 0.5 },
        { scale: 1, opacity: 1, x: 0, y: 0, duration: 1, ease: "back.out(1.3)", stagger: 0.07 }, doneAt + 0.05);
      t.fromTo(".pd-head .sw-i", { yPercent: 115, rotate: 5 }, { yPercent: 0, rotate: 0, duration: 0.9, ease: "power4.out", stagger: 0.07 }, doneAt + 0.4);
      t.to({}, { duration: 1.4 });   // hold the finished scene for a beat before the page scrolls on
      // The scroll position drives everything. The numbers are derived from where we are, so scrolling back up rewinds them.
      ScrollTrigger.create({
        animation: t, trigger: root.current, start: "top top+=64", end: "+=320%", pin: true, scrub: 0.7, anticipatePin: 1,
        onUpdate: () => {
          const now = t.time();
          const k = marks.filter((m) => now >= m).length;
          setTotal(STEPS.slice(0, k).reduce((sum, st) => sum + st.sign * st.amt, BASE));
          setNote(k === 0 ? "On the menu" : now >= doneAt ? "All-in price" : `${STEPS[k - 1].sign > 0 ? "+" : "−"} ${STEPS[k - 1].k}`);
          setDone(now >= doneAt);
          setHint(now < 0.5);
        },
      });
    }, root);
    return () => ctx.revert();
  }, []);

  const tilt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    gsap.to(".pd-cards", { rotateY: ((e.clientX - r.left) / r.width - 0.5) * 8, rotateX: -((e.clientY - r.top) / r.height - 0.5) * 6, duration: 0.8, ease: "power3.out", overwrite: true });
  };
  const head = `Meals under ₹${budget || 200}`;

  return (
    <div className="relative isolate mb-[clamp(8px,2vw,24px)] h-[clamp(420px,calc(100vh-80px),760px)] w-full overflow-hidden rounded-lg bg-ground [perspective:1100px]" ref={root} onPointerMove={tilt}>
      <div className="pd-cards absolute inset-0 [transform-style:preserve-3d]" aria-hidden="true">
        {CARDS.map((c) => (
          <figure key={c.src} className="pd-card absolute m-0 aspect-[4/5] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] shadow-[0_18px_40px_rgb(0_0_0/.6)] max-sm:nth-[n+5]:hidden motion-reduce:opacity-100" data-x={c.x} data-y={c.y} style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, rotate: `${c.r}deg` }}>
            <img className="block size-full object-cover" src={`/food/${c.src}.jpg`} alt="" draggable="false" decoding="async" />
          </figure>
        ))}
      </div>
      <p className="absolute inset-x-0 top-[14%] text-center text-[clamp(13px,1.4vw,17px)] uppercase tracking-[.14em] text-muted" aria-live="polite">{note}</p>
      <div className={`pd-price absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 font-display text-[clamp(84px,17vw,260px)] font-extrabold leading-none tracking-[-.05em] transition-colors duration-500 ${done ? "text-pink [filter:drop-shadow(0_0_28px_rgb(255_45_149/.5))]" : "text-[#f4f4f5]"}`} aria-label={`Example: all-in price ₹${total}`}>
        <i className="pd-ring pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-pink opacity-0" aria-hidden="true" />
        <Odometer text={`₹${total}`} />
      </div>
      {STEPS.map((s, i) => (
        <span key={s.k} className="pd-chip absolute whitespace-nowrap rounded-full border border-line bg-surface-2 px-4 py-2 text-[clamp(14px,1.9vw,24px)] font-semibold opacity-0 motion-reduce:hidden max-sm:px-3 max-sm:py-1.5" data-i={i} aria-hidden="true" style={{ [s.side < 0 ? "left" : "right"]: "9%", top: `${s.top}%` }}>
          {s.sign > 0 ? "+" : "−"} {s.k} <b className={`ml-1.5 font-display ${s.sign < 0 ? "text-good" : "text-pink"}`}>₹{s.amt}</b>
        </span>
      ))}
      <h2 className="pd-head split absolute inset-x-0 bottom-[9%] m-0 text-center text-[clamp(28px,5vw,64px)] font-extrabold leading-[1.05] tracking-[-.035em]" aria-label={head}>
        {head.split(" ").map((w, i) => <span className="sw" key={i} aria-hidden="true"><span className="sw-i">{w}</span>{" "}</span>)}
      </h2>
      {!still.current && <p className={`absolute inset-x-0 bottom-[4%] animate-[bob-y_1.6s_ease-in-out_infinite] text-center text-[13px] uppercase tracking-[.2em] text-muted transition-opacity duration-[400ms] ${hint ? "opacity-100" : "opacity-0"}`} aria-hidden="true">Scroll ↓</p>}
      <small className="absolute bottom-2.5 left-4 text-xs text-muted">Example bill. Your hunt reads the real one.</small>
    </div>
  );
}
