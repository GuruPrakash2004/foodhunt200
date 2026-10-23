import { useEffect, useRef, useState } from "react";
import { formatMobile, initialOf, isValidMobile } from "../../lib/phone.js";
import Modal from "../ui/Modal.jsx";

export default function ProfileMenu({ profile, onSave, onLogout }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(null);       // "number" | "logout" | null
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const closeDialog = () => { setDialog(null); setMobile(""); setError(""); };
  const change = async (e) => {
    e.preventDefault();
    if (!isValidMobile(mobile)) return setError("Enter a 10-digit mobile number starting with 6, 7, 8 or 9.");
    const problem = await onSave(profile.name, mobile);
    if (problem) return setError(problem);
    closeDialog(); setOpen(false);
  };

  return (
    <div className="profile" ref={box}>
      <button className="profile-chip" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true">
        <span className="avatar" aria-hidden="true">{initialOf(profile.name)}</span>
        <span className="profile-name">{profile.name}</span>
      </button>
      {open && (
        <div className="profile-pop" role="menu">
          <div className="profile-card">
            <span className="avatar big" aria-hidden="true">{initialOf(profile.name)}</span>
            <div><strong>{profile.name}</strong><span className="muted">{formatMobile(profile.mobile)}</span></div>
          </div>
          <button role="menuitem" className="menu-row" onClick={() => setDialog("number")}>
            <span>Change number</span><span aria-hidden="true">›</span>
          </button>
          <button role="menuitem" className="menu-row danger" onClick={() => setDialog("logout")}>
            <span>Log out</span><span aria-hidden="true">›</span>
          </button>
        </div>
      )}

      <Modal open={dialog === "number"} onClose={closeDialog} title="Change your number"
        subtitle={`Now: ${formatMobile(profile.mobile)}`}
        footer={<><button type="button" className="text-button" onClick={closeDialog}>Cancel</button><button form="change-number" className="solid-button">Save number</button></>}>
        <form id="change-number" onSubmit={change} className="stack-form" noValidate>
          <label>New mobile number
            <span className="phone-field">
              <span className="phone-prefix" aria-hidden="true">+91</span>
              <input data-autofocus value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="numeric" placeholder="98765 43210" />
            </span>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <p className="muted">Not verified by an OTP. Zomato and Swiggy still ask for their own.</p>
        </form>
      </Modal>

      <Modal open={dialog === "logout"} onClose={closeDialog} title="Log out?"
        subtitle="Your deals, notes and alerts stay saved on this computer."
        footer={<><button type="button" className="text-button" onClick={closeDialog}>Stay</button><button className="solid-button" onClick={onLogout}>Log out</button></>}>
        <p>You'll be asked for your name and number again next time.</p>
      </Modal>
    </div>
  );
}
