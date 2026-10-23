import Modal from "../ui/Modal.jsx";

/** Shown when an alarm rings: hunt now, snooze, or dismiss. */
export default function RingModal({ alarm, onHunt, onSnooze, onClose, running }) {
  return (
    <Modal open={!!alarm} onClose={onClose} title={alarm ? `Time for ${alarm.label.toLowerCase()}` : ""}
      subtitle="Find today's cheapest deal, then order it in the app."
      footer={<>
        <button className="text-button" onClick={() => onSnooze(10)}>Snooze 10 min</button>
        <button className="text-button" onClick={onClose}>Dismiss</button>
        <button className="solid-button" onClick={onHunt} disabled={running}>{running ? "Hunting…" : "Hunt now"}</button>
      </>}>
      <svg className="ring-big" viewBox="0 0 64 64" width="96" height="96" aria-hidden="true">
        <circle cx="32" cy="36" r="20" fill="none" stroke="var(--blue-bright)" strokeWidth="4" />
        <path d="M32 36V24M32 36l8 5" fill="none" stroke="var(--pink)" strokeWidth="4" strokeLinecap="round" />
        <path d="M12 14l8-6M52 14l-8-6" fill="none" stroke="var(--pink)" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </Modal>
  );
}
