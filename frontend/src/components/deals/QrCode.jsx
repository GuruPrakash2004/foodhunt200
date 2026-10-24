import { useEffect, useState } from "react";

/** A QR code for a link, so a phone camera can open it. White tile so it scans on the dark theme. */
export default function QrCode({ value, label }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((q) => q.toDataURL(value, { margin: 1, width: 132, color: { dark: "#0A0A0A", light: "#FFFFFF" } }))
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(""));
    return () => { live = false; };
  }, [value]);
  return src ? <img className="block rounded-md bg-white p-1.5" src={src} width="132" height="132" alt={label} /> : null;
}
