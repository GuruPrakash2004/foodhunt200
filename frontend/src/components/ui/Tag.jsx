const TONES = {
  plain: "bg-surface-3 text-ink",
  fair: "ml-2 whitespace-nowrap bg-[color-mix(in_srgb,var(--color-brand)_30%,var(--color-surface-3))] text-ink",
  rescue: "ml-2 bg-[color-mix(in_srgb,var(--color-good)_22%,var(--color-surface-3))] text-good",
};

/** A small label chip: "rescue", "₹22 cheaper than Swiggy", a platform name. */
export function Tag({ tone = "plain", className = "", children, ...rest }) {
  return <span className={`inline-block rounded px-2 py-px text-xs font-semibold ${TONES[tone]} ${className}`} {...rest}>{children}</span>;
}

const DOT = { zomato: "bg-zomato", swiggy: "bg-swiggy" };

/** The brand-coloured dot beside a platform name. */
export function PlatformDot({ platform }) {
  return <i className={`size-[9px] flex-none rounded-full ${DOT[platform] || "bg-muted"}`} />;
}
