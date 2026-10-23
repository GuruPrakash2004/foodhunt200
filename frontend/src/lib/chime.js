/** A short two-note chime (Web Audio, no sound files) plus a light vibration where the device has one. */
let ctx;
const KEY = "foodhunt.chime";

export const loadChime = () => {
  try { return { on: true, under: 150, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { on: true, under: 150 }; }
};
export const saveChime = (cfg) => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* storage unavailable */ } };

/** Browsers only allow sound after a click, so call this from the Run button. */
export function unlockAudio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch { /* no audio available */ }
}

/** "good" = two notes; "great" (well under the target) = a rising three-note run. */
export function chime(level = "good") {
  try {
    navigator.vibrate?.(80);
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = level === "great" ? [[880, 0], [1100, 0.12], [1318, 0.24], [1760, 0.36]] : [[880, 0], [1318, 0.14]];
    notes.forEach(([freq, delay]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay); osc.stop(now + delay + 0.55);
    });
  } catch { /* ignore audio errors */ }
}
