import { useEffect, useRef, useState } from "react";
import * as api from "../api/index.js";
import { notify } from "../lib/format.js";
import { unlockAudio } from "../lib/chime.js";

/** Starts a hunt and streams its progress; calls onDeal when a new deal arrives. */
export function useHunt({ onDeal, onFinish, onNewDeal, onAlert, onEvent }) {
  const [events, setEvents] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [startedAt, setStartedAt] = useState(0);
  const timer = useRef(null);

  const refreshStatus = () => api.getStatus().then(setStatus).catch(() => {});
  useEffect(() => { refreshStatus(); }, [running]);   // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (params) => {
    unlockAudio();   // browsers only allow sound after a click
    setError(""); setEvents([]);
    try {
      const { hunt_id } = await api.startHunt(
        { ...params, budget: Number(params.budget), max_carts: Number(params.max_carts), extra_items: Number(params.extra_items) });
      setStartedAt(Date.now());
      setRunning(true);
      api.openHuntEvents(hunt_id, (event) => {
        setEvents((list) => [...list, event]);
        onEvent?.(event);
        if (event.type === "deal") { onNewDeal?.(event.deal); clearTimeout(timer.current); timer.current = setTimeout(onDeal, 80); }
        if (event.type === "alert") { notify(event.text); onAlert?.(event); }
      }, () => { setRunning(false); onFinish(); });
    } catch (e) { setError(e.message); }
  };

  const stop = () => api.stopHunt().catch((e) => setError(e.message));   // the stream then ends with a "done" event

  return { events, running, startedAt, error, status, refreshStatus, run, stop };
}
