import { useCallback, useEffect, useState } from "react";
import * as api from "../api/index.js";

/** Saved delivery addresses from each platform's account, loaded once and again after a hunt (a first login may have just happened). */
export function useAddresses(running) {
  const [state, setState] = useState({ addresses: {}, errors: {}, loading: true, failed: "" });
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api.getAddresses()
      .then((r) => setState({ addresses: r.addresses, errors: r.errors, loading: false, failed: "" }))
      .catch((e) => setState((s) => ({ ...s, loading: false, failed: e.message })));
  }, []);
  useEffect(() => { if (!running) reload(); }, [running, reload]);
  return { ...state, reload };
}
