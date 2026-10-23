export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind || "info"}`} role="status">
          <div className="toast-text">
            <strong>{t.title}</strong>
            {t.text && <span>{t.text}</span>}
          </div>
          <button className="icon-button" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
