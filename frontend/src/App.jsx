import { useEffect, useMemo, useRef, useState } from "react";
import Ticker from "./components/motion/Ticker.jsx";
import Boot from "./components/ui/Boot.jsx";
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
import SmoothScroll from "./components/motion/SmoothScroll.tsx";
import Backdrop from "./components/motion/Backdrop.tsx";
import Cursor from "./components/motion/Cursor.tsx";
import { LineReveal } from "./components/motion/text/SplitWords.tsx";
import ScrollFX from "./components/motion/ScrollFX.jsx";
import Reveal from "./components/motion/Reveal.jsx";
import PriceDrop from "./components/hero/PriceDrop.tsx";
import Hero from "./components/hero/Hero.jsx";
import LiveLog from "./components/hunt/LiveLog.jsx";
import TopBar from "./components/layout/TopBar.jsx";
import { useDeals } from "./hooks/useDeals.js";
import { useAddresses } from "./hooks/useAddresses.js";
import { useHunt } from "./hooks/useHunt.js";
import { useWatches } from "./hooks/useWatches.js";
import { DEFAULT_FILTERS, DEFAULT_PARAMS, FALLBACK_PLATFORMS } from "./lib/format.js";

function Dashboard({ profile, hosted, save, signOut }) {
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
    else if (e.type === "done") push({ kind: e.status === "error" ? "error" : "info", title: e.status === "error" ? "Hunt failed" : e.status === "stopped" ? "Hunt stopped" : "Hunt finished", text: (e.summary || "").slice(0, 140) });
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
  const addressBook = useAddresses(hunt.running);
  const { watches, add, remove } = useWatches();
  const labels = hunt.status?.labels || FALLBACK_PLATFORMS;
  const cheapest = useMemo(() => {   // the cheapest bill of the latest hunt, so a new hunt's result shows up even if an older deal was cheaper
    const latest = Math.max(0, ...all.deals.map((d) => d.hunt_id || 0));
    const pool = all.deals.filter((d) => (d.hunt_id || 0) === latest);
    return pool.reduce((best, d) => (!best || d.final_payable < best.final_payable ? d : best), null);
  }, [all.deals]);

  const needsLogin = Object.values(hunt.status?.platforms || {}).some((ok) => !ok);
  return (
    <>
      <SmoothScroll /><Backdrop /><Cursor />
      <ScrollFX />
      <TopBar status={hunt.status} profile={profile} onSaveProfile={save} onLogout={signOut} hosted={hosted} onConnected={hunt.refreshStatus} />
      <main className="page">
        <PriceDrop budget={params.budget} />
        <Hero params={params} setParams={setParams} running={hunt.running} startedAt={hunt.startedAt} found={hunt.events.filter((e) => e.type === "deal").length}
          error={hunt.error || dealsError} onRun={() => hunt.run(params)} onStop={hunt.stop} cheapest={cheapest} labels={labels}
          mobile={formatMobile(profile.mobile)} needsLogin={needsLogin} hosted={hosted} chime={chime} setChime={setChime} addressBook={addressBook} />
        <Reveal from="left"><DealOfHour deals={all.deals}
          alarms={alarmClock.alarms} snooze={alarmClock.snooze} onOpenAlarms={() => setAlarmOpen(true)} /></Reveal>
        <Reveal from="right" delay={120}><Ticker deals={all.deals} /></Reveal>
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
      <Reveal as="footer" className="page mt-[var(--section-gap)] border-t border-line pb-10 pt-7 text-sm text-muted"><span>FoodHunt200 finds the deal. You place the order.</span><div className="mt-6 overflow-hidden font-display text-[clamp(26px,8.4vw,140px)] font-extrabold leading-[.9] tracking-[-.05em] text-transparent [-webkit-text-stroke:1.5px_var(--glow)]" aria-hidden="true"><LineReveal text="FOODHUNT200" /></div></Reveal>
    </>
  );
}

const LOGIN_PATH = "/login", MAIN_PATH = "/foodHunt200";
const sameRoute = (a, b) => a.replace(/\/+$/, "").toLowerCase() === b.toLowerCase();
const ENTERED = "fh-entered";
const wasEntered = () => { try { return sessionStorage.getItem(ENTERED) === "1"; } catch { return false; } };
const markEntered = (on) => { try { on ? sessionStorage.setItem(ENTERED, "1") : sessionStorage.removeItem(ENTERED); } catch { /* storage blocked */ } };

export default function App() {
  const { profile, save, logout, hosted } = useProfile();
  const [path, go] = usePath();
  // every new visit starts on /login, even with a saved profile; the app itself lives at /foodHunt200
  const [entered, setEntered] = useState(wasEntered);
  const signedIn = !!profile && entered;
  const onLoginPage = sameRoute(path, LOGIN_PATH);
  const onMainPage = sameRoute(path, MAIN_PATH);

  useEffect(() => {
    if (profile === undefined) return;
    if (!signedIn && !onLoginPage) go(LOGIN_PATH, { replace: true });
    if (signedIn && !onMainPage) go(MAIN_PATH, { replace: true });
  }, [profile, signedIn, onLoginPage, onMainPage, go]);
  const login = async (name, mobile, code) => {
    const problem = await save(name, mobile, code);
    if (!problem) { markEntered(true); setEntered(true); go(MAIN_PATH); }
    return problem;
  };
  const signOut = async () => { markEntered(false); setEntered(false); await logout(); go(LOGIN_PATH); };

  if (profile === undefined) return <Boot />;
  if (!signedIn) return <LoginPage onSubmit={login} hosted={hosted} />;
  if (!onMainPage) return <Boot />;
  // everything that talks to the API lives below, so it only loads once you are signed in
  return <Dashboard profile={profile} hosted={hosted} save={save} signOut={signOut} />;
}
