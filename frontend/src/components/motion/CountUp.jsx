import Odometer from "./text/Odometer.tsx";

/** A rupee figure whose digits roll to the value. `ms` is kept so call sites don't change; the roll speed is in CSS. */
export default function CountUp({ value, prefix = "₹" }) {
  return value == null ? "—" : <Odometer text={`${prefix}${Math.round(value)}`} />;
}
