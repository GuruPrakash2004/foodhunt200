import Modal from "../ui/Modal.jsx";

/** Set the breakfast, lunch and dinner alarms. */
export default function AlarmModal({ open, onClose, alarms, update }) {
  const toggle = (a) => {
    if (!a.on && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
    update(a.id, { on: !a.on });
  };
  return (
    <Modal open={open} onClose={onClose} title="Meal alarm"
      subtitle="A reminder to place your order. Pick the meals and the times."
      footer={<><span className="muted">Rings while FoodHunt200 is open in a tab.</span><button className="btn-solid" onClick={onClose}>Done</button></>}>
      <ul className="grid gap-2.5">
        {alarms.map((a) => (
          <li key={a.id} className={`grid grid-cols-[1fr_auto_auto] items-center gap-3.5 rounded-lg border-l-4 px-4 py-3.5 transition duration-200 ${a.on ? "border-pink bg-surface-3" : "border-transparent bg-surface-2"}`}>
            <div className="grid gap-0.5">
              <strong>{a.label}</strong>
              <span className="muted">{a.on ? "Ringing daily" : "Off"}</span>
            </div>
            <input className="w-[132px] tabular-nums" type="time" value={a.time} onChange={(e) => e.target.value && update(a.id, { time: e.target.value })}
              aria-label={`${a.label} alarm time`} />
            <button type="button" role="switch" aria-checked={a.on} onClick={() => toggle(a)} aria-label={`${a.label} alarm ${a.on ? "on" : "off"}`}
              className="group flex h-[30px] w-[52px] items-center rounded-full border-0 bg-surface p-[3px] transition-colors duration-200 aria-checked:bg-pink">
              <span className="size-6 rounded-full bg-muted transition duration-[250ms] group-aria-checked:translate-x-[22px] group-aria-checked:bg-ground" />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
