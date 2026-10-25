import { useEffect, useRef, useState } from "react";
import { dishInfo, hexString, inkHex, PAPER } from "../../lib/dishKind.js";

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Flat QR in the dish colour: used until the 3D scene loads, and when WebGL is missing. */
function FlatQr({ value, label, color }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((q) => q.toDataURL(value, { margin: 2, width: 240, errorCorrectionLevel: "M", color: { dark: hexString(inkHex(color)), light: hexString(PAPER) } }))
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(""));
    return () => { live = false; };
  }, [value, color]);
  return src ? <img className="block rounded-md" src={src} width="240" height="240" alt={label} /> : null;
}

/**
 * A QR code for a link. The dish in the deal (burger, pizza, biryani…) breaks into cubes that fly into the code,
 * which is drawn in that dish's colour. Holds on the code so a phone camera can read it.
 */
export default function QrCode({ value, label, dish }) {
  const host = useRef(null), scrub = useRef(null), ctl = useRef(null);
  const [flat, setFlat] = useState(false);
  const [phase, setPhase] = useState("");
  const [playing, setPlaying] = useState(!reducedMotion());
  const [hold, setHold] = useState(true);
  const info = dishInfo(dish);

  useEffect(() => {
    let dead = false, scene;
    import("../../lib/qrScene.js")
      .then(({ createQrScene }) => {
        if (dead || !host.current) return;
        scene = createQrScene(host.current, {
          text: value, dish, reduced: reducedMotion(),
          onPhase: setPhase, onPlaying: setPlaying,
          onTime: (t) => { if (scrub.current) scrub.current.value = t; },
        });
        ctl.current = scene;
      })
      .catch(() => !dead && setFlat(true));
    return () => { dead = true; ctl.current = null; scene?.dispose(); };
  }, [value, dish]);

  useEffect(() => { ctl.current?.setHold(hold); }, [hold, phase]);

  if (flat) return <FlatQr value={value} label={label} color={info.color} />;
  const btn = "rounded-full border-0 bg-surface-2 px-3 py-1 text-xs font-semibold text-inherit";
  return (
    <figure className="m-0 inline-flex w-60 max-w-full flex-col gap-1.5" aria-label={label}>
      <div ref={host} role="img" aria-label={label} className="aspect-square w-full overflow-hidden rounded-md bg-ground" />
      <div className="flex items-center gap-2 text-xs">
        <button type="button" className={btn} onClick={() => (playing ? ctl.current?.pause() : ctl.current?.play())}>{playing ? "Pause" : "Play"}</button>
        <button type="button" className={btn} onClick={() => ctl.current?.replay()}>Replay</button>
        <span className="muted ml-auto" aria-live="polite">{phase}</span>
      </div>
      <input ref={scrub} type="range" min="0" max="13" step="0.01" defaultValue="0" aria-label="Animation position" className="w-full" onChange={(e) => ctl.current?.seek(+e.target.value)} />
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} /> Hold on QR
      </label>
    </figure>
  );
}
