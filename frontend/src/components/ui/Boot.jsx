import { useEffect, useState } from "react";

/** Shown while the first answer from the server is on its way. A free host that was asleep takes up to a minute to wake. */
export default function Boot() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 3000); return () => clearTimeout(t); }, []);
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center" aria-busy="true">
      {slow && <p className="muted max-w-[34ch] animate-rise">Waking the server. If it has been idle this can take up to a minute.</p>}
    </div>
  );
}
