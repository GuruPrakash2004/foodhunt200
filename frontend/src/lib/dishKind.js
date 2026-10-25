// Which dish a deal is, and the colour that dish gives its QR code. No three.js here, so the flat fallback stays light.

const KINDS = [
  ["burger", "Burger", 0xc47a2c, /burger|whopper|patty|slider/],
  ["pizza", "Pizza", 0xd2561f, /pizza|margherita|calzone/],
  ["rice", "Biryani", 0xe0a030, /biryani|biriyani|pulao|pulav|khichdi|rice/],
  ["noodles", "Noodles", 0xd98b2b, /noodle|chowmein|chow mein|hakka|pasta|spaghetti|maggi|ramen|macaroni/],
  ["roll", "Roll", 0xc9863b, /roll|wrap|kathi|shawarma|frankie|sandwich|\bsub\b|taco|burrito|kebab/],
  ["cake", "Dessert", 0x7b4b2a, /cake|brownie|pastry|dessert|ice cream|sundae|donut|doughnut|waffle|pancake|jamun|cookie/],
];
const CURRY = ["curry", "Curry", 0xd2691e];

/** Reads the deal's item text ("2 x Veg Burger, 1 x Coke") and picks the first dish it recognises. */
export function dishInfo(text) {
  const parts = String(text || "").toLowerCase().split(/[,+;\n]|\band\b/);
  for (const part of parts) {
    for (const [kind, label, color, re] of KINDS) if (re.test(part)) return { kind, label, color };
  }
  return { kind: CURRY[0], label: CURRY[1], color: CURRY[2] };
}

/** The dish colour, darkened until a phone can read it against the cream plate. Hue and richness stay the dish's own. */
export function inkHex(color) {
  const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, l = (max + min) / 2;
  const s = d === 0 ? 0 : Math.min(1, (d / (1 - Math.abs(2 * l - 1))) * 1.1);
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  l = Math.min(l, 0.2);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
  const [rr, gg, bb] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h) % 6];
  const to = (v) => Math.round((v + m) * 255);
  return (to(rr) << 16) | (to(gg) << 8) | to(bb);
}

export const hexString = (n) => `#${n.toString(16).padStart(6, "0")}`;
export const PAPER = 0xfff6e4;
