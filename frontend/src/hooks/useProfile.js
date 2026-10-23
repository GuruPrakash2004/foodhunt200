import { useEffect, useState } from "react";
import * as api from "../api/index.js";

/** The local user (name + mobile). `profile` is undefined while loading, null when logged out. */
export function useProfile() {
  const [profile, setProfile] = useState(undefined);
  useEffect(() => { api.getProfile().then(setProfile).catch(() => setProfile(null)); }, []);

  /** Returns an error message, or "" on success. */
  const save = async (name, mobile) => {
    try { setProfile(await api.saveProfile({ name, mobile })); return ""; } catch (e) { return e.message; }
  };
  const logout = async () => { await api.clearProfile().catch(() => {}); setProfile(null); };
  return { profile, save, logout };
}
