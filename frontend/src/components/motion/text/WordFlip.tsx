import { useEffect, useState } from "react";

/** Cycles through short words with a vertical flip: "Scanning", "Reading carts", ... */
export default function WordFlip({ words, ms = 1700 }: { words: string[]; ms?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % words.length), ms);
    return () => clearInterval(id);
  }, [words.length, ms]);
  return <span className="flip"><span key={i} className="flip-w">{words[i]}</span></span>;
}
