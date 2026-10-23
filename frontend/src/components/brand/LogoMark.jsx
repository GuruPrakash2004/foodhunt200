/** Flat logo mark for small sizes: a blue ring with a pink rupee. */
export default function LogoMark({ size = 32 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="logomark">
      <circle cx="32" cy="32" r="24" fill="none" stroke="var(--blue)" strokeWidth="5" />
      <path d="M22 24h20M22 31h20M25 24c9 0 12 4 8 9-2 2-5 3-8 3l12 10" fill="none" stroke="var(--pink)"
        strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
