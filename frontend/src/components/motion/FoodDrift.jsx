/** Decorative food photos that sit in a section's margin and drift at different speeds as the page scrolls. */
export default function FoodDrift({ photos, side = "right" }) {
  return (
    <div className={`drift ${side} hidden min-[1960px]:block`} aria-hidden="true">
      {photos.map((src, i) => (
        <img key={src} src={`/food/${src}.jpg`} alt="" loading="lazy" decoding="async" draggable="false"
          style={{ "--depth": 0.4 + i * 0.5, "--tilt": `${(i % 2 ? 1 : -1) * (6 + i * 3)}deg`, "--top": `${8 + i * 34}%` }} />
      ))}
    </div>
  );
}
