/** A +91 prefix welded to a number input. */
export default function PhoneField({ inputClass = "", ...input }) {
  return (
    <span className="flex items-stretch">
      <span className="grid place-items-center rounded-l-md border border-r-0 border-line bg-surface-3 px-3.5 text-ink" aria-hidden="true">+91</span>
      <input className={`rounded-l-none ${inputClass}`} inputMode="numeric" {...input} />
    </span>
  );
}
