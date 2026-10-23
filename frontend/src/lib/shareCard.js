const W = 1080, H = 1350;
const INK = "#0a0a0a", BLUE = "#007ba7", BLUE_BRIGHT = "#3db4e0", PINK = "#ff2d95", MUTED = "#a7a9ad", PANEL = "#1a1c1f", TEXT = "#f4f4f1";
const rupee = (n) => `₹${Math.round(n)}`;

function wrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = text.split(" ");
  let line = "", row = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      if (row === maxLines - 1) { ctx.fillText(`${line}…`, x, y + row * lineHeight); return y + (row + 1) * lineHeight; }
      ctx.fillText(line, x, y + row * lineHeight); line = words[i]; row++;
    } else line = test;
  }
  ctx.fillText(line, x, y + row * lineHeight);
  return y + (row + 1) * lineHeight;
}

/** Draws a deal as a 1080x1350 card in the app theme and returns a PNG blob. */
export async function renderDealCard(d, who) {
  await Promise.all([document.fonts.load("700 80px Unbounded"), document.fonts.load("400 30px 'Manrope Variable'")]).catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = PINK; ctx.fillRect(0, 0, 14, H);                         // the receipt's pink edge

  ctx.textBaseline = "alphabetic";
  ctx.font = "700 44px Unbounded, sans-serif";
  ctx.fillStyle = TEXT; ctx.fillText("FOODHUNT", 80, 120);
  ctx.fillStyle = PINK; ctx.fillText("200", 80 + ctx.measureText("FOODHUNT").width, 120);

  ctx.font = "400 30px 'Manrope Variable', sans-serif";
  ctx.fillStyle = BLUE_BRIGHT; ctx.fillText(`${d.platform === "swiggy" ? "Swiggy Food" : "Zomato"} · all-in price`, 80, 230);

  ctx.font = "700 72px Unbounded, sans-serif"; ctx.fillStyle = TEXT;
  let y = wrap(ctx, d.restaurant, 80, 320, W - 160, 86);
  ctx.font = "400 40px 'Manrope Variable', sans-serif"; ctx.fillStyle = MUTED;
  y = wrap(ctx, d.items, 80, y + 20, W - 160, 52);

  ctx.font = "700 250px Unbounded, sans-serif"; ctx.fillStyle = PINK;
  ctx.shadowColor = "rgba(255,45,149,.55)"; ctx.shadowBlur = 50;
  ctx.fillText(rupee(d.final_payable), 70, y + 280);
  ctx.shadowBlur = 0;

  const rows = [["Item total", d.item_total], ["Fees", d.fees], ["Taxes", d.taxes]];
  if (d.savings) rows.push([`Discount${d.offer ? ` (${d.offer})` : ""}`, -d.savings]);
  const top = y + 360, rowH = 64;
  ctx.fillStyle = PANEL; ctx.fillRect(80, top - 50, W - 160, rows.length * rowH + 40);
  ctx.font = "400 36px 'Manrope Variable', sans-serif";
  rows.forEach(([label, value], i) => {
    const ry = top + 10 + i * rowH;
    ctx.fillStyle = MUTED; ctx.textAlign = "left"; ctx.fillText(label, 110, ry);
    ctx.fillStyle = value < 0 ? "#5fd48a" : TEXT; ctx.textAlign = "right";
    ctx.fillText(value < 0 ? `−${rupee(-value)}` : rupee(value), W - 110, ry);
  });
  ctx.textAlign = "left";

  ctx.fillStyle = MUTED; ctx.font = "400 30px 'Manrope Variable', sans-serif";
  const km = d.distance_km != null ? `${d.distance_km} km` : null, eta = d.eta_min != null ? `${d.eta_min} min` : null;
  ctx.fillText([km, eta].filter(Boolean).join(" · "), 80, H - 140);
  ctx.fillStyle = BLUE_BRIGHT;
  ctx.fillText(`Found by ${who?.name || "FoodHunt200"} · order it in the app`, 80, H - 90);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Shares the card through the system share sheet when available, otherwise downloads it. */
export async function shareDeal(d, profile) {
  const blob = await renderDealCard(d, profile);
  const name = `foodhunt-${d.restaurant.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.round(d.final_payable)}.png`;
  const file = new File([blob], name, { type: "image/png" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `${d.restaurant} for ${rupee(d.final_payable)}` });
      return "shared";
    }
  } catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
