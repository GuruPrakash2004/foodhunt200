import { useEffect, useMemo, useRef, useState } from "react";
import Ticker from "./components/motion/Ticker.jsx";
import Toasts from "./components/ui/Toasts.jsx";
import { useToasts } from "./hooks/useToasts.js";
import { useAlarms } from "./hooks/useAlarms.js";
import AlarmModal from "./components/alarm/AlarmModal.jsx";
import RingModal from "./components/alarm/RingModal.jsx";
import { usePath } from "./hooks/usePath.js";
import DealOfHour from "./components/hero/DealOfHour.jsx";
import InsightsSection from "./components/insights/InsightsSection.jsx";
import { chime as playChime, loadChime, saveChime } from "./lib/chime.js";
import LoginPage from "./components/auth/LoginPage.jsx";
import { useProfile } from "./hooks/useProfile.js";
import { formatMobile } from "./lib/phone.js";
import AlertsPanel from "./components/alerts/AlertsPanel.jsx";
import DealsSection from "./components/deals/DealsSection.jsx";
import Hero from "./components/hero/Hero.jsx";
import LiveLog from "./components/hunt/LiveLog.jsx";
import TopBar from "./components/layout/TopBar.jsx";
import { useDeals } from "./hooks/useDeals.js";
import { useHunt } from "./hooks/useHunt.js";
import { useWatches } from "./hooks/useWatches.js";
import { DEFAULT_FILTERS, DEFAULT_PARAMS, FALLBACK_PLATFORMS } from "./lib/format.js";

export default function App() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const { deals, error: dealsError, refresh, saveFeedback } = useDeals(filters);
  const all = useDeals(DEFAULT_FILTERS);   // everything found, ignoring the filters: feeds the receipt, ticker and insights
  const refreshAll = () => { refresh(); all.refresh(); };
  const [chime, setChimeState] = useState(loadChime);
  const chimeRef = useRef(chime);
  const setChime = (cfg) => { chimeRef.current = cfg; setChimeState(cfg); saveChime(cfg); };
  const ding = (price) => {
    const c = chimeRef.current;
    if (c.on && (price == null || price <= c.under)) playChime(price != null && price <= c.under * 0.75 ? "great" : "good");
  };
  const { toasts, push, dismiss } = useToasts();
  const onEvent = (e) => {
    if (e.type === "deal") push({ kind: "deal", title: `₹${Math.round(e.deal.final_payable)} · ${e.deal.restaurant}`, text: e.deal.items });
    else if (e.type === "alert") push({ kind: "alert", title: `Alert: ${e.watch}`, text: e.text, ms: 9000 });
    else if (e.type === "error") push({ kind: "error", title: "Hunt problem", text: e.text, ms: 10000 });
    else if (e.type === "status" && /Switched to/.test(e.text || "")) push({ kind: "info", title: "Switched model", text: e.text.replace(/\(.*?\)\.? /, ""), ms: 7000 });
    else if (e.type === "done") push({ kind: e.status === "error" ? "error" : "info", title: e.status === "error" ? "Hunt failed" : "Hunt finished", text: (e.summary || "").slice(0, 140) });
  };
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [ringing, setRinging] = useState(null);
  const ringAlarm = (a) => {
    playChime("great");
    setRinging(a);
    push({ kind: "alert", title: `Time for ${a.label.toLowerCase()}`, text: "Hunt the cheapest deal and place your order.", ms: 12000 });
    try { if ("Notification" in window && Notification.permission === "granted") new Notification(`Time for ${a.label.toLowerCase()}`, { body: "FoodHunt200: find today's cheapest deal." }); } catch { /* notifications unavailable */ }
  };
  const alarmClock = useAlarms(ringAlarm);
  const hunt = useHunt({ onEvent, onDeal: refreshAll, onFinish: refreshAll, onNewDeal: (d) => ding(d.final_payable), onAlert: () => ding(null) });
  const { watches, add, remove } = useWatches();
  const { profile, save, logout } = useProfile();
  const [path, go] = usePath();
  const onLoginPage = path === "/login";

  // /login is the only page for logged-out visitors; logged-in visitors never see it
  useEffect(() => {
    if (profile === null && !onLoginPage) go("/login", { replace: true });
    if (profile && onLoginPage) go("/", { replace: true });
  }, [profile, onLoginPage, go]);
  const login = async (name, mobile) => { const problem = await save(name, mobile); if (!problem) go("/"); return problem; };
  const signOut = async () => { await logout(); go("/login"); };

  const labels = hunt.status?.labels || FALLBACK_PLATFORMS;
  const cheapest = useMemo(
    () => all.deals.reduce((best, d) => (!best || d.final_payable < best.final_payable ? d : best), null), [all.deals]);

  if (profile === undefined) return <div className="boot" aria-busy="true" />;
  if (profile === null) return <LoginPage onSubmit={login} />;
  if (onLoginPage) return <div className="boot" aria-busy="true" />;

  const needsLogin = Object.values(hunt.status?.platforms || {}).some((ok) => !ok);
  return (
    <>
      <TopBar status={hunt.status} profile={profile} onSaveProfile={save} onLogout={signOut} />
      <main>
        <Hero params={params} setParams={setParams} running={hunt.running} startedAt={hunt.startedAt} found={hunt.events.filter((e) => e.type === "deal").length}
          error={hunt.error || dealsError} onRun={() => hunt.run(params)} cheapest={cheapest} labels={labels}
          mobile={formatMobile(profile.mobile)} needsLogin={needsLogin} chime={chime} setChime={setChime} />
        <DealOfHour deals={all.deals}
          alarms={alarmClock.alarms} snooze={alarmClock.snooze} onOpenAlarms={() => setAlarmOpen(true)} />
        <Ticker deals={all.deals} />
        <LiveLog events={hunt.events} running={hunt.running} />
        <DealsSection deals={deals} filters={filters} setFilters={setFilters}
          budget={params.budget} totalCount={all.deals.length} onClearFilters={() => setFilters(DEFAULT_FILTERS)}
          onFeedback={(k, p) => { saveFeedback(k, p); all.refresh(); }} platforms={hunt.status?.platforms} labels={labels} profile={profile} />
        <InsightsSection refreshKey={`${all.deals.length}-${hunt.running}`} labels={labels} />
        <AlertsPanel watches={watches} onAdd={add} onRemove={remove} />
      </main>
      <AlarmModal open={alarmOpen} onClose={() => setAlarmOpen(false)} alarms={alarmClock.alarms} update={alarmClock.update} />
      <RingModal alarm={ringing} running={hunt.running} onClose={() => setRinging(null)}
        onSnooze={(min) => { alarmClock.snoozeFor(ringing, min); setRinging(null); }}
        onHunt={() => { setRinging(null); hunt.run(params); }} />
      <Toasts toasts={toasts} onDismiss={dismiss} />
      <footer className="footer"><span>FoodHunt200 finds the deal. You place the order.</span></footer>
    </>
  );
}
