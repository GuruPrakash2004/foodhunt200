import { useCart } from "../../hooks/useCart.js";
import QrCode from "./QrCode.jsx";

/** One click puts this deal's items and offer in your cart in the platform app. You pay there; this app never orders. */
export default function AddToCartButton({ deal, label }) {
  const { status, message, link, add } = useCart();
  if (!deal.can_add_to_cart) return null;
  return (
    <span className="my-2 inline-flex flex-wrap items-center gap-2">
      <button type="button" className={`whitespace-nowrap rounded-full border-0 px-3.5 py-1.5 text-[13px] font-semibold disabled:opacity-60 ${status === "added" ? "bg-transparent text-pink shadow-[inset_0_0_0_1px_var(--color-pink)]" : "bg-pink text-ground"}`} disabled={status === "adding"} onClick={() => add(deal.deal_key)}>
        {status === "adding" ? "Adding…" : status === "added" ? "In your cart ✓" : "Add to cart"}
      </button>
      {status === "added" && link && <QrCode value={link} dish={deal.items} label={`Scan to open your ${label || deal.platform} cart on your phone`} />}
      {status === "added" && link && <a className="text-[13px] font-semibold text-brand-bright" href={link} target="_blank" rel="noreferrer">Open in {label || deal.platform} →</a>}
      {status === "added" && <span className="muted"> {link ? "Scan the code with your phone, or tap the link, to see the cart, check the bill and pay." : `Open ${label || deal.platform} to check the bill and pay.`}</span>}
      {status === "error" && <span className="error" role="alert"> {message}</span>}
    </span>
  );
}
