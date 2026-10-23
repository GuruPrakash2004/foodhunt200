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
      footer={<><span className="muted">Rings while FoodHunt200 is open in a tab.</span><button className="solid-button" onClick={onClose}>Done</button></>}>
      <ul className="alarm-list">
        {alarms.map((a) => (
          <li key={a.id} className={a.on ? "on" : ""}>
            <div>
              <strong>{a.label}</strong>
              <span className="muted">{a.on ? "Ringing daily" : "Off"}</span>
            </div>
            <input type="time" value={a.time} onChange={(e) => e.target.value && update(a.id, { time: e.target.value })}
              aria-label={`${a.label} alarm time`} />
            <button type="button" role="switch" aria-checked={a.on} className={`switch ${a.on ? "on" : ""}`} onClick={() => toggle(a)}
              aria-label={`${a.label} alarm ${a.on ? "on" : "off"}`}><span /></button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
