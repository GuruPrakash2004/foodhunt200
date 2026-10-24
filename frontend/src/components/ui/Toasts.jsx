const DOT = { info: "before:bg-brand-bright", deal: "before:bg-pink", alert: "before:bg-good", error: "before:bg-bad" };

export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[70] grid w-[min(380px,calc(100vw-32px))] gap-2.5" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex animate-toast items-start justify-between gap-3 rounded-lg border border-line bg-surface-2 py-3 pl-3.5 pr-2.5 shadow-[0_10px_30px_rgb(0_0_0/.5)]" role="status">
          <div className="grid min-w-0 gap-0.5">
            <strong className={`text-[15px] before:mr-2 before:inline-block before:size-2 before:rounded-full before:content-[''] ${DOT[t.kind || "info"]}`}>{t.title}</strong>
            {t.text && <span className="line-clamp-2 overflow-hidden text-ellipsis text-sm text-muted">{t.text}</span>}
          </div>
          <button className="icon-btn" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
