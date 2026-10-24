import { useEffect, useState } from "react";

const DIGITS = "0123456789".split("");

/** Digits sit in columns and roll to their value. The real text is on aria-label for screen readers. */
export default function Odometer({ text }: { text: string }) {
  const [live, setLive] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setLive(true)); return () => cancelAnimationFrame(id); }, []);
  return (
    <span className="odo" aria-label={text} role="text">
      {[...text].map((ch, i) => /\d/.test(ch)
        ? (
          <span className="odo-col" key={`${text.length - i}`} aria-hidden="true">
            <span className="odo-strip" style={{ transform: `translateY(${live ? -Number(ch) : 0}em)` }}>
              {DIGITS.map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        )
        : <span key={`${text.length - i}`} aria-hidden="true">{ch}</span>)}
    </span>
  );
}
