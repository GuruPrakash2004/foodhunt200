import { useState } from "react";
import Logo3D from "../brand/Logo3D.jsx";
import { isValidMobile } from "../../lib/phone.js";

export default function LoginPage({ onSubmit }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    <main className="login">
      <div className="login-stage rise" style={{ "--i": 0 }}>
        <Logo3D size="min(440px, 78vw)" />
        <p className="login-tag">The price on the menu is never the price you pay. This finds the one you pay.</p>
      </div>
      <form className="login-card rise" style={{ "--i": 2 }} onSubmit={submit} noValidate aria-labelledby="login-title">
        <h1 id="login-title" className="login-title">FOODHUNT<span className="display-pink">200</span></h1>
        <p className="lede">Who is hunting? Your name and number stay on this computer.</p>
        <label>Your name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} placeholder="e.g. Guru" autoFocus />
        </label>
        <label>Mobile number
          <span className="phone-field">
            <span className="phone-prefix" aria-hidden="true">+91</span>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="numeric" autoComplete="tel-national"
              placeholder="98765 43210" aria-label="Mobile number, 10 digits" />
          </span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="solid-button big" disabled={busy}>{busy ? "Saving…" : "Start hunting"}</button>
        <p className="muted">This number is not verified by an OTP. Zomato and Swiggy ask for their own OTP when you connect them.</p>
      </form>
    </main>
  );
}
