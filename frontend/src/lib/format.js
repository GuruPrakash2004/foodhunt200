export const FALLBACK_PLATFORMS = { zomato: "Zomato", swiggy: "Swiggy Food" };
export const rupees = (n) => (n == null ? "—" : `₹${Math.round(n)}`);
export const km = (n) => (n == null ? "—" : `${n} km`);
/** "just now", "12 min ago", "3 h ago": when a deal was found. found_at is local time without a zone. */
export function ago(iso, now = Date.now()) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(t)) return "—";
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 1) return "just now";
  return min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min ` : ""}ago`;
}
export const minutes = (n) => (n == null ? "—" : `${n} min`);

export const DEFAULT_PARAMS = {
  budget: 200, platform: "both", diet: "any (veg or non-veg)", address: "Home",
  queries: "thali, biryani, rice bowl, meals, dosa, combo, rolls", max_carts: 6, extra_items: 2,
};
export const DEFAULT_FILTERS = { q: "", min_price: "", max_price: "", max_distance: "", platform: "", favorites: false };

export function notify(text) {
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification("FoodHunt200", { body: text });
  } catch { /* notifications unavailable */ }
}
