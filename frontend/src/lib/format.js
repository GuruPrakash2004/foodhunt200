export const FALLBACK_PLATFORMS = { zomato: "Zomato", swiggy: "Swiggy Food" };
export const rupees = (n) => (n == null ? "—" : `₹${Math.round(n)}`);
export const km = (n) => (n == null ? "—" : `${n} km`);
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
