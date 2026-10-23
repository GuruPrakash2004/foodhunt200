import { useCallback, useRef, useState } from "react";

/** Small popups that dismiss themselves. kind: "deal" | "alert" | "info" | "error". */
export function useToasts(ms = 6000) {
  const [toasts, setToasts] = useState([]);
  const id = useRef(0);
  const dismiss = useCallback((toastId) => setToasts((list) => list.filter((t) => t.id !== toastId)), []);
  const push = useCallback((toast) => {
    const toastId = ++id.current;
    setToasts((list) => [...list.slice(-3), { id: toastId, ...toast }]);
    setTimeout(() => dismiss(toastId), toast.ms || ms);
  }, [dismiss, ms]);
  return { toasts, push, dismiss };
}
