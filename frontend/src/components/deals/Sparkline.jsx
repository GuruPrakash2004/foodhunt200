export default function Sparkline({ points }) {
  if (points.length < 2) return <p className="muted">Seen once so far. Run more hunts to build a price history.</p>;
  const w = 260, h = 64, pad = 6;
  const ys = points.map((p) => p.final_payable);
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const x = (i) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v) => h - pad - ((v - lo) * (h - 2 * pad)) / span;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.final_payable)}`).join(" ");
  return (
    <figure className="spark">
      <svg width={w} height={h} role="img" aria-label={`Price history, low ₹${lo}, high ₹${hi}`}>
        <path d={path} fill="none" stroke="var(--pink)" strokeWidth="2" />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.final_payable)} r="3" fill="var(--pink)" />)}
      </svg>
      <figcaption className="muted">Low ₹{lo} · High ₹{hi} · {points.length} sightings</figcaption>
    </figure>
  );
}
