import { useCallback, useEffect, useState } from "react";

/** The current URL path, kept in sync with back/forward. `go(path, { replace })` changes it without a reload. */
export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((to, { replace = false } = {}) => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", to);
    setPath(window.location.pathname);
    window.scrollTo(0, 0);
  }, []);
  return [path, go];
}
