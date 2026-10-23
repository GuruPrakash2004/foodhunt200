import { useCountUp } from "../../hooks/useCountUp.js";

export default function CountUp({ value, prefix = "₹", ms = 700 }) {
  const shown = useCountUp(value, ms);
  return value == null ? "—" : <>{prefix}{Math.round(shown)}</>;
}
