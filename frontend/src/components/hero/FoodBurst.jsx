import { useEffect, useRef } from "react";

/* Position (% of the stage), size (% of stage width), tilt and burst delay for each photo. Photos live in public/food. */
const CARDS = [
  { src: "f10", x: 50, y: 30, w: 17, r: -6, d: 0 },
  { src: "f02", x: 31, y: 40, w: 13, r: 8, d: 1 },
  { src: "f03", x: 69, y: 38, w: 13, r: -10, d: 2 },
  { src: "f07", x: 17, y: 62, w: 12, r: -7, d: 3 },
  { src: "f11", x: 82, y: 64, w: 14, r: 7, d: 4 },
  { src: "f06", x: 40, y: 70, w: 12, r: 5, d: 5 },
  { src: "f04", x: 60, y: 74, w: 11, r: -5, d: 6 },
  { src: "f12", x: 8, y: 30, w: 10, r: 9, d: 7 },
  { src: "f09", x: 91, y: 28, w: 10, r: -8, d: 8 },
  { src: "f08", x: 26, y: 18, w: 9, r: -4, d: 9 },
  { src: "f01", x: 75, y: 16, w: 9, r: 6, d: 10 },
  { src: "f05", x: 52, y: 88, w: 10, r: 3, d: 11 },
  { src: "f14", x: 12, y: 86, w: 9, r: -6, d: 12 },
];

/** Dark stage: an outlined wordmark draws itself, then food photos burst out over it and drift with the pointer. */
export default function FoodBurst({ word = true }) {
  const stage = useRef(null);
  useEffect(() => {   // listen on the window so the photos drift even when a form sits on top of them
    const drift = (e) => {
      const el = stage.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      el.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    };
    window.addEventListener("pointermove", drift, { passive: true });
    return () => window.removeEventListener("pointermove", drift);
  }, []);
  return (
    <div className="burst" ref={stage} aria-hidden="true">
      {word && (
        <svg className="burst-word" viewBox="0 0 1000 220" preserveAspectRatio="xMidYMid meet">
          <text x="50%" y="76%" textAnchor="middle" pathLength="1">FOODHUNT</text>
        </svg>
      )}
      {CARDS.map((c) => (
        <figure key={c.src} className="burst-card" style={{ "--x": `${c.x}%`, "--y": `${c.y}%`, "--w": `${c.w}%`, "--r": `${c.r}deg`, "--d": c.d, "--z": c.w / 6 }}>
          <img src={`/food/${c.src}.jpg`} alt="" loading="eager" decoding="async" draggable="false" />
        </figure>
      ))}
    </div>
  );
}
