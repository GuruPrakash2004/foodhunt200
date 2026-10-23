import { useEffect, useState } from "react";
import * as api from "../api/index.js";

export function useWatches() {
  const [watches, setWatches] = useState([]);
  const reload = () => api.getWatches().then(setWatches).catch(() => {});
  useEffect(() => { reload(); }, []);

  const add = async (query, max_price) => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    await api.addWatch({ query, max_price });
    reload();
  };
  const remove = async (id) => { await api.removeWatch(id); reload(); };

  return { watches, add, remove };
}
