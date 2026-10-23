import { useEffect, useRef, useState } from "react";

const KEY = "foodhunt.alarms", FIRED = "foodhunt.alarms.fired";
const DEFAULTS = [
  { id: "breakfast", label: "Breakfast", time: "08:30", on: false },
  { id: "lunch", label: "Lunch", time: "12:30", on: false },
  { id: "dinner", label: "Dinner", time: "19:30", on: false },
];

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** When this alarm next rings, as a timestamp (today if still ahead, otherwise tomorrow). */
export function nextRing(alarm, now = Date.now()) {
  const [h, m] = alarm.time.split(":").map(Number);
  const t = new Date(now); t.setHours(h, m, 0, 0);
  if (t.getTime() <= now) t.setDate(t.getDate() + 1);
  return t.getTime();
}

/** The soonest thing that will ring: a snooze or an enabled meal alarm. */
export function nextAlarm(alarms, snooze, now = Date.now()) {
  const candidates = alarms.filter((a) => a.on).map((a) => ({ alarm: a, at: nextRing(a, now) }));
  if (snooze) candidates.push({ alarm: alarms.find((a) => a.id === snooze.id) || DEFAULTS[1], at: snooze.at, snoozed: true });
  return candidates.sort((a, b) => a.at - b.at)[0] || null;
}

/**
 * Meal alarms (breakfast, lunch, dinner), saved in this browser. `onRing(alarm)` fires once per alarm per day,
 * at the minute it is set for. Alarms only ring while the app is open in a tab.
 */
export function useAlarms(onRing) {
  const [alarms, setAlarms] = useState(() => DEFAULTS.map((d) => ({ ...d, ...(read(KEY, []).find((a) => a.id === d.id) || {}) })));
  const [snooze, setSnooze] = useState(null);
  const latest = useRef({ alarms, snooze, onRing });
  latest.current = { alarms, snooze, onRing };

  useEffect(() => write(KEY, alarms), [alarms]);
  const update = (id, patch) => setAlarms((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  useEffect(() => {
    const id = setInterval(() => {
      const { alarms: list, snooze: snz, onRing: ring } = latest.current;
      const now = new Date();
      if (snz && now.getTime() >= snz.at) { setSnooze(null); ring(list.find((a) => a.id === snz.id) || DEFAULTS[1]); return; }
      const fired = read(FIRED, {});
      for (const a of list) {
        const key = `${a.id}@${a.time}`;
        if (a.on && a.time === hhmm(now) && fired[key] !== dayKey(now)) {
          write(FIRED, { ...fired, [key]: dayKey(now) });
          ring(a);
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return { alarms, update, snooze, snoozeFor: (alarm, minutes = 10) => setSnooze({ id: alarm.id, at: Date.now() + minutes * 60000 }), clearSnooze: () => setSnooze(null) };
}
