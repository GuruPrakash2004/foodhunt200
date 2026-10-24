import { useEffect, useState } from "react";
import * as api from "../api/index.js";

/**
 * The signed-in user. `profile` is undefined while loading, null when signed out.
 * Locally that is just a name and number kept on this computer; hosted, signing in also needs the private access code
 * and the server answers with a session cookie.
 */
export function useProfile() {
  const [profile, setProfile] = useState(undefined);
  const [hosted, setHosted] = useState(false);
  useEffect(() => {
    // learn whether the server is hosted before deciding what the login page shows
    Promise.all([api.getAuthConfig().catch(() => ({ hosted: false })), api.getProfile().catch(() => null)])
      .then(([config, saved]) => { setHosted(!!config.hosted); setProfile(saved); });
  }, []);
  useEffect(() => {
    const out = () => setProfile(null);
    window.addEventListener("fh-unauthorized", out);
    return () => window.removeEventListener("fh-unauthorized", out);
  }, []);

  /** Returns an error message, or "" on success. */
  const save = async (name, mobile, accessCode = "") => {
    try {
      setProfile(hosted ? await api.login({ name, mobile, access_code: accessCode }) : await api.saveProfile({ name, mobile }));
      return "";
    } catch (e) { return e.message; }
  };
  const logout = async () => {
    await api.clearProfile().catch(() => {});
    if (hosted) await api.logoutSession().catch(() => {});
    setProfile(null);
  };
  return { profile, save, logout, hosted };
}
