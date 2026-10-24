import { useEffect, useRef, useState } from "react";
import { formatMobile, initialOf, isValidMobile } from "../../lib/phone.js";
import Modal from "../ui/Modal.jsx";
import PhoneField from "../ui/PhoneField.jsx";

const AVATAR = "grid place-items-center rounded-full bg-brand font-bold text-white";
const MENU_ROW = "flex w-full items-center justify-between rounded-lg border-0 bg-transparent px-3.5 py-[13px] text-left transition-all duration-150 hover:bg-surface-3 hover:pl-[18px]";

export default function ProfileMenu({ profile, onSave, onLogout, className = "" }) {
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
    <div className={`relative ${className}`} ref={box}>
      <button className="flex items-center gap-2.5 rounded-full border border-line bg-transparent py-[3px] pl-[3px] pr-3.5 transition-colors duration-150 hover:bg-surface-2" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true">
        <span className={`${AVATAR} size-7 text-[13px]`} aria-hidden="true">{initialOf(profile.name)}</span>
        <span className="max-w-[110px] truncate">{profile.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 grid w-[min(300px,calc(100vw-32px))] animate-pop gap-0.5 rounded-lg border border-line bg-surface-2 p-1.5 shadow-[0_14px_40px_rgb(0_0_0/.55)]" role="menu">
          <div className="flex items-center gap-3.5 px-3 pb-4 pt-3.5">
            <span className={`${AVATAR} size-[52px] text-[22px]`} aria-hidden="true">{initialOf(profile.name)}</span>
            <div className="grid min-w-0 gap-0.5"><strong>{profile.name}</strong><span className="muted">{formatMobile(profile.mobile)}</span></div>
          </div>
          <button role="menuitem" className={MENU_ROW} onClick={() => setDialog("number")}>
            <span>Change number</span><span aria-hidden="true">›</span>
          </button>
          <button role="menuitem" className={`${MENU_ROW} text-bad`} onClick={() => setDialog("logout")}>
            <span>Log out</span><span aria-hidden="true">›</span>
          </button>
        </div>
      )}

      <Modal open={dialog === "number"} onClose={closeDialog} title="Change your number"
        subtitle={`Now: ${formatMobile(profile.mobile)}`}
        footer={<><button type="button" className="btn-text" onClick={closeDialog}>Cancel</button><button form="change-number" className="btn-solid">Save number</button></>}>
        <form id="change-number" onSubmit={change} className="grid gap-3.5" noValidate>
          <label>New mobile number
            <PhoneField data-autofocus value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="98765 43210" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <p className="muted">Not verified by an OTP. Zomato and Swiggy still ask for their own.</p>
        </form>
      </Modal>

      <Modal open={dialog === "logout"} onClose={closeDialog} title="Log out?"
        subtitle="Your deals, notes and alerts stay saved on this computer."
        footer={<><button type="button" className="btn-text" onClick={closeDialog}>Stay</button><button className="btn-solid" onClick={onLogout}>Log out</button></>}>
        <p>You'll be asked for your name and number again next time.</p>
      </Modal>
    </div>
  );
}
