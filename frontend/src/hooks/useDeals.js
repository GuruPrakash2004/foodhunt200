import { useCallback, useEffect, useState } from "react";
import * as api from "../api/index.js";

/** Deals matching the filters, refetched (debounced) whenever they change. */
export function useDeals(filters) {
  const [deals, setDeals] = useState([]);
  const [error, setError] = useState("");

  const refresh = useCallback(
    () => api.getDeals(filters).then(setDeals).catch((e) => setError(e.message)), [filters]);
  useEffect(() => { const t = setTimeout(refresh, 200); return () => clearTimeout(t); }, [refresh]);

  /** Optimistic favourite / note change, rolled back by a refetch if the save fails. */
  const saveFeedback = async (key, patch) => {
    setDeals((list) => list.map((d) => (d.deal_key === key ? { ...d, ...patch } : d)));
    try { await api.saveFeedback({ key, ...patch }); } catch (e) { setError(e.message); refresh(); }
  };

  return { deals, error, refresh, saveFeedback };
}
