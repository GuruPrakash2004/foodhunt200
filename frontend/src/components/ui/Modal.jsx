import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The button or link that was just activated: the panel "grows out of" it, and shrinks back into it.
let trigger = null;
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => { trigger = e.target.closest?.("button, a, [role=button]") || null; }, true);
}

/** Which side of the panel the trigger is on, so the funnel narrows toward it. */
function sideOf(ox, oy, w, h) {
  const dx = (ox - w / 2) / w, dy = (oy - h / 2) / h;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

/**
 * A dialog on a dark scrim, opening and closing with a genie effect (like a Mac window minimising):
 * it funnels out of the button you pressed and sucks back into it. `variant="drawer"` sits on the right,
 * `"center"` in the middle. Esc or a click on the scrim closes it, Tab stays inside, focus returns to the opener.
 */
export default function Modal({ open, onClose, title, subtitle, variant = "center", footer, children }) {
  const panel = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;                       // the latest handler, without re-running the focus logic on every render
  const [closing, setClosing] = useState(false);      // true while the panel plays its exit
  const [genie, setGenie] = useState({ side: "left", ox: 0, oy: 0 });
  const origin = useRef(null);
  const wasOpen = useRef(false);
  const show = open || closing;
  const phase = open ? "in" : "out";

  // the button that opened the popup, captured before the first paint so the effect starts from the right place
  useLayoutEffect(() => {
    if (open) { origin.current = trigger; setClosing(false); }
    else if (wasOpen.current) {
      if (reducedMotion()) return;
      setClosing(true);
      const t = setTimeout(() => setClosing(false), 800);   // safety net if animationend never fires
      return () => clearTimeout(t);
    }
    wasOpen.current = open;
  }, [open]);

  // Work out where the panel will sit and where the trigger is relative to it (offsetWidth ignores the running animation).
  useLayoutEffect(() => {
    if (!show || !panel.current || phase === "out") return;
    const w = panel.current.offsetWidth, h = panel.current.offsetHeight;
    const left = variant === "drawer" ? window.innerWidth - w : (window.innerWidth - w) / 2;
    const top = variant === "drawer" ? 0 : (window.innerHeight - h) / 2;
    const r = origin.current?.isConnected ? origin.current.getBoundingClientRect() : null;
    const cx = r ? r.left + r.width / 2 : window.innerWidth / 2, cy = r ? r.top + r.height / 2 : window.innerHeight / 2;
    const ox = cx - left, oy = cy - top;
    setGenie({ side: sideOf(ox, oy, w, h), ox, oy });
  }, [show, variant]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const scrollBefore = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("modal-open");   // pauses the busy background animations
    const first = panel.current?.querySelector("[data-autofocus]") || panel.current?.querySelector(FOCUSABLE);
    first?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = scrollBefore;
      document.documentElement.classList.remove("modal-open");
      opener?.focus?.();
    };
  }, [open]);

  if (!show) return null;
  return createPortal(
    <div className={`fixed inset-0 z-[60] flex bg-black/65 will-change-[opacity] ${phase === "out" ? "scrim-out" : "animate-fade"}`} onPointerDown={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}>
      <section ref={panel} data-lenis-prevent className={`flex max-h-full min-h-0 flex-col bg-surface genie genie-${phase} ${variant === "drawer"
          ? "ml-auto h-full w-[min(500px,100vw)] border-l border-line"
          : "m-auto max-h-[calc(100vh-32px)] w-[min(440px,calc(100vw-32px))] rounded-lg border border-line"}`} data-side={genie.side}
        style={{ "--ox": `${genie.ox}px`, "--oy": `${genie.oy}px` }}
        onAnimationEnd={(e) => { if (phase === "out" && e.animationName === "genie-out" && e.target === e.currentTarget) setClosing(false); }}
        role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
          <div>
            <h2 id={titleId} className="text-xl font-bold leading-tight tracking-[-.01em]">{title}</h2>
            {subtitle && <p className="muted mt-1.5">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 pb-[22px] pt-3.5">{children}</div>
        {footer && <footer className="flex items-center justify-between gap-4 border-t border-line px-6 py-3.5 [&_.muted]:mr-auto">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
