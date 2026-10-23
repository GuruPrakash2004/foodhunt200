import ProfileMenu from "../auth/ProfileMenu.jsx";
import LogoMark from "../brand/LogoMark.jsx";

export default function TopBar({ status, profile, onSaveProfile, onLogout }) {
  const platforms = Object.entries(status?.platforms || {});
  return (
    <header className="topbar">
      <a className="wordmark" href="#top" aria-label="FoodHunt200 home"><LogoMark size={30} /><span className="wordmark-text">FOODHUNT<span>200</span></span></a>
      <nav aria-label="Sections">
        <a href="#deals">Deals</a>
        <a href="#insights">Insights</a>
        <a href="#alerts">Alerts</a>
        <a href="/api/v1/docs" target="_blank" rel="noreferrer">API</a>
      </nav>
      <div className="topbar-status">
        {platforms.map(([name, ok]) => (
          <span key={name} className={`dot-label ${ok ? "ok" : ""}`}>{status?.labels?.[name] || name} {ok ? "connected" : "login needed"}</span>
        ))}
      </div>
      {profile && <ProfileMenu profile={profile} onSave={onSaveProfile} onLogout={onLogout} />}
    </header>
  );
}
