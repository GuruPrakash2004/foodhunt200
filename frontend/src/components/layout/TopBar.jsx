import { useState } from "react";
import { connectPlatform, platformStatus } from "../../api/index.js";
import ProfileMenu from "../auth/ProfileMenu.jsx";
import LogoMark from "../brand/LogoMark.jsx";

const NAV = "relative text-sm text-muted no-underline transition-colors duration-150 hover:text-ink after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:bg-pink after:transition-transform after:duration-300 hover:after:scale-x-100";

/** Hosted only: starts the platform login, opens its page in a new tab and waits until the server reports it done. */
function ConnectButton({ name, label, onConnected }) {
  const [state, setState] = useState({ busy: false, error: "" });
  const connect = async () => {
    const tab = window.open("", "_blank");   // opened now, inside the click, so the browser does not block it
    setState({ busy: true, error: "" });
    try {
      let s = await connectPlatform(name), sent = false;
      for (let i = 0; i < 150 && s.status !== "connected" && s.status !== "failed"; i++) {
        if (s.url && tab && !tab.closed && !sent) { tab.location.href = s.url; sent = true; }   // once: after that the tab belongs to the platform
        await new Promise((r) => setTimeout(r, 2000));
        s = await platformStatus(name);
      }
      if (s.status !== "connected") throw new Error(s.error || "The login did not finish.");
      onConnected?.();
      setState({ busy: false, error: "" });
    } catch (e) {
      tab?.close();
      setState({ busy: false, error: e.message });
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button className="btn-text" onClick={connect} disabled={state.busy} aria-label={`Connect ${label}`}>{state.busy ? "Waiting for login…" : "Connect"}</button>
      {state.error && <span className="max-w-[28ch] truncate text-bad" title={state.error} role="alert">{state.error}</span>}
    </span>
  );
}

export default function TopBar({ status, profile, onSaveProfile, onLogout, hosted, onConnected }) {
  const platforms = Object.entries(status?.platforms || {});
  return (
    <header className="page relative z-40 flex animate-bar-in flex-wrap items-center gap-5 py-4 motion-reduce:animate-none">
      <a className="group order-1 inline-flex items-center gap-2.5 font-display text-base font-bold tracking-[-.01em] no-underline" href="#top" aria-label="FoodHunt200 home">
        <LogoMark size={30} className="transition-transform duration-500 ease-soft group-hover:rotate-[120deg]" />
        <span>FOODHUNT<span className="text-pink">200</span></span>
      </a>
      <nav className="order-3 flex w-full justify-between gap-5 md:order-2 md:ml-auto md:w-auto md:justify-start" aria-label="Sections">
        <a className={NAV} href="#deals">Deals</a>
        <a className={NAV} href="#insights">Insights</a>
        <a className={NAV} href="#alerts">Alerts</a>
        <a className={NAV} href="/api/v1/docs" target="_blank" rel="noreferrer">API</a>
      </nav>
      <div className="order-4 flex w-full flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-muted md:order-3 md:w-auto">
        {platforms.map(([name, ok]) => (
          <span key={name} data-dot className={`before:mr-1.5 before:inline-block before:size-[7px] before:rounded-full before:align-[1px] ${ok ? "before:animate-beat before:bg-good" : "before:bg-muted"}`}>
            {status?.labels?.[name] || name} {ok ? "connected" : hosted ? <>login needed <ConnectButton name={name} label={status?.labels?.[name] || name} onConnected={onConnected} /></> : "login needed"}
          </span>
        ))}
      </div>
      {profile && <ProfileMenu className="order-2 ml-auto md:order-4 md:ml-0" profile={profile} onSave={onSaveProfile} onLogout={onLogout} canChangeNumber={!hosted} />}
    </header>
  );
}
