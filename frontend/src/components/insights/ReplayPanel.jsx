import { useEffect, useRef, useState } from "react";
import { getHunts, getReplay } from "../../api/index.js";
import { rupees } from "../../lib/format.js";

const KIND = { deal: "font-semibold text-ink", error: "text-bad", alert: "font-semibold text-pink" };
const text = (e) => (e.type === "deal" ? `✓ ${rupees(e.deal.final_payable)} · ${e.deal.restaurant} — ${e.deal.items}`
  : e.type === "done" ? `Finished (${e.status}). ${e.summary || ""}` : e.type === "alert" ? `Alert: ${e.text}` : e.text);

/** Pick a finished hunt and scrub through its steps like a timeline. */
export default function ReplayPanel({ refreshKey }) {
  const [hunts, setHunts] = useState([]);
  const [huntId, setHuntId] = useState("");
  const [events, setEvents] = useState([]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [problem, setProblem] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    getHunts().then((list) => {
      const done = list.filter((h) => h.status !== "running");
      setHunts(done);
      if (done.length && !huntId) setHuntId(String(done[0].id));
    }).catch(() => setHunts([]));
  }, [refreshKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!huntId) return;
    setPlaying(false); setProblem("");
    getReplay(huntId).then((r) => { setEvents(r.events); setStep(r.events.length); }).catch((e) => { setEvents([]); setStep(0); setProblem(e.message); });
  }, [huntId]);

  useEffect(() => {
    clearInterval(timer.current);
    if (!playing) return;
    timer.current = setInterval(() => setStep((s) => { if (s >= events.length) { setPlaying(false); return s; } return s + 1; }), 450);
    return () => clearInterval(timer.current);
  }, [playing, events.length]);

  if (!hunts.length) return <p className="empty">No finished hunts yet. Run one and you can replay it here.</p>;
  const shown = events.slice(0, step);
  const dealsSoFar = shown.filter((e) => e.type === "deal").length;
  const seconds = shown.length ? shown[shown.length - 1].t : 0;
  const play = () => { if (step >= events.length) setStep(0); setPlaying(!playing); };

  return (
    <div className="grid gap-3.5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex-[1_1_280px]">Hunt
          <select value={huntId} onChange={(e) => setHuntId(e.target.value)}>
            {hunts.map((h) => <option key={h.id} value={h.id}>#{h.id} · {h.started_at?.replace("T", " ")} · {h.deal_count} deal{h.deal_count === 1 ? "" : "s"}</option>)}
          </select>
        </label>
        <button className="btn-solid" onClick={play} disabled={!events.length}>{playing ? "Pause" : step >= events.length ? "Replay" : "Play"}</button>
      </div>
      {problem ? <p className="muted">{problem}</p> : (
        <>
          <input type="range" min="0" max={events.length} value={step} onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }}
            aria-label="Scrub through the hunt" />
          <p className="muted">Step {step} of {events.length} · {seconds.toFixed(1)}s · {dealsSoFar} deal{dealsSoFar === 1 ? "" : "s"} found so far</p>
          <div className="grid max-h-[320px] gap-[3px] overflow-auto rounded-lg bg-surface p-4 text-sm">{shown.slice(-14).map((e, i) => <p key={`${step}-${i}`} className={`animate-log text-muted ${KIND[e.type] || ""}`}>{text(e)}</p>)}</div>
        </>
      )}
    </div>
  );
}
