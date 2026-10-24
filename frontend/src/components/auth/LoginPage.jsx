import { useEffect, useState } from "react";
import { isValidMobile } from "../../lib/phone.js";
import Logo3D from "../brand/Logo3D.jsx";
import FoodBurst from "../hero/FoodBurst.jsx";
import Backdrop from "../motion/Backdrop.tsx";
import { LineReveal } from "../motion/text/SplitWords.tsx";
import PhoneField from "../ui/PhoneField.jsx";

/** Price tags that drift up the page like steam: [text, left %, seconds, delay, tilt]. */
const TAGS = [
  ["₹187 all-in", 6, 15, 0, -6], ["+ GST ₹14", 17, 18, 5, 5], ["− ₹58 offer", 29, 14, 2, -4], ["₹149 on the menu", 41, 19, 8, 7],
  ["Delivery ₹0", 53, 16, 3, -8], ["₹160 to pay", 64, 17, 10, 4], ["+ fee ₹9", 75, 15, 6, -5], ["₹199 → ₹160", 86, 20, 1, 6],
];
const GLOWS = ["#ff2d95", "#007ba7", "#6a4cff", "#ff8a1f"];
const RISE = "animate-rise [animation-delay:calc(var(--i,0)*90ms+400ms)] motion-reduce:animate-none";

export default function LoginPage({ onSubmit }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // the page glow slowly cycles through the section colours
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--glow", GLOWS[0]);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => root.style.removeProperty("--glow");
    let i = 0;
    const id = setInterval(() => { i = (i + 1) % GLOWS.length; root.style.setProperty("--glow", GLOWS[i]); }, 3200);
    return () => { clearInterval(id); root.style.removeProperty("--glow"); };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Enter your name.");
    if (!isValidMobile(mobile)) return setError("Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.");
    setError(""); setBusy(true);
    const problem = await onSubmit(name, mobile);
    setBusy(false);
    if (problem) setError(problem);
  };

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <Backdrop />
      <div className="absolute inset-0 -z-10 opacity-30 sm:opacity-45" aria-hidden="true"><FoodBurst word={false} /></div>
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        {TAGS.map(([text, left, secs, delay, tilt]) => (
          <span key={text} className="absolute -bottom-12 animate-float-up whitespace-nowrap rounded-full border border-line bg-surface-2/70 px-3.5 py-1.5 font-display text-sm font-bold tracking-[-.02em] text-pink backdrop-blur max-sm:hidden motion-reduce:hidden"
            style={{ left: `${left}%`, animationDuration: `${secs}s`, animationDelay: `-${delay}s`, "--r": `${tilt}deg` }}>{text}</span>
        ))}
      </div>

      <main className="mx-auto grid min-h-screen max-w-[1280px] items-center gap-[clamp(24px,6vw,96px)] px-[var(--gutter)] py-[clamp(24px,6vw,80px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,480px)]">
        <div className="grid min-h-[50vh] content-center justify-items-center gap-6 text-center lg:justify-items-start lg:text-left">
          <Logo3D size="min(300px, 62vw)" />
          <div>
            <p className="mega !m-0 !text-[clamp(40px,6.6vw,96px)] animate-[fill-in_2.2s_ease_.5s_forwards]" style={{ "--c": "var(--color-pink)" }} aria-hidden="true">FoodHunt</p>
            <p className="mega !m-0 !text-[clamp(40px,6.6vw,96px)] animate-[fill-in_2.2s_ease_1.1s_forwards]" style={{ "--c": "var(--color-brand-bright)" }} aria-hidden="true">200</p>
          </div>
          <p className="max-w-[34ch] text-[19px] text-muted [text-shadow:0_2px_16px_#0a0a0a,0_0_6px_#0a0a0a]">
            <LineReveal text="The price on the menu is never the price you pay. This finds the one you pay." delay={0.5} />
          </p>
        </div>

        <form className="glow-card grid animate-rise gap-4 p-[clamp(20px,3vw,36px)] [animation-delay:.3s] motion-reduce:animate-none" onSubmit={submit} noValidate aria-labelledby="login-title">
          <h1 id="login-title" className="font-display text-[26px] font-bold leading-[1.15] tracking-[-.04em]">FOODHUNT<span className="text-pink">200</span></h1>
          <p className={`text-base text-muted ${RISE}`} style={{ "--i": 0 }}>Who is hunting? Your name and number stay on this computer.</p>
          <label className={RISE} style={{ "--i": 1 }}>Your name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} placeholder="e.g. Guru" autoFocus />
          </label>
          <label className={RISE} style={{ "--i": 2 }}>Mobile number
            <PhoneField value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="tel-national" placeholder="98765 43210" aria-label="Mobile number, 10 digits" />
          </label>
          {error && <p className="error !mt-0" role="alert">{error}</p>}
          <button className={`btn-solid group relative overflow-hidden px-6 py-[13px] text-base ${RISE}`} style={{ "--i": 3 }} disabled={busy}>
            <span className="absolute inset-y-0 left-0 w-1/3 -skew-x-[20deg] animate-shimmer bg-white/40 motion-reduce:hidden" aria-hidden="true" />
            <span className="relative">{busy ? "Saving…" : "Start hunting"}</span>
          </button>
          <p className={`muted ${RISE}`} style={{ "--i": 4 }}>This number is not verified by an OTP. Zomato and Swiggy ask for their own OTP when you connect them.</p>
        </form>
      </main>
    </div>
  );
}
