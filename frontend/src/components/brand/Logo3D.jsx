const LAYERS = 14;

/**
 * The FoodHunt200 mark: a rupee coin that turns slowly in 3D, with an orbiting ring.
 * Pure CSS 3D (stacked discs from cerulean at the back to pink at the front), so it costs nothing to load.
 */
export default function Logo3D({ size = 220, className = "" }) {
  return (
    <div className={`logo3d ${className}`} style={{ "--s": typeof size === "number" ? `${size}px` : size }} role="img"
      aria-label="FoodHunt200 logo: a turning rupee coin with an orbiting ring">
      <div className="logo3d-orbit" aria-hidden="true"><span /></div>
      <div className="logo3d-tilt" aria-hidden="true">
        <div className="logo3d-coin">
          {Array.from({ length: LAYERS }, (_, i) => {
            const face = i === 0 || i === LAYERS - 1;
            return (
              <span key={i} className={`logo3d-disc ${face ? "face" : ""} ${i === 0 ? "back" : ""}`}
                style={{ "--t": i / (LAYERS - 1), "--z": `${(i - (LAYERS - 1) / 2) * 4}px` }}>
                {face && <b>₹</b>}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
