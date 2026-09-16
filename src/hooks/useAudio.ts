import { useCallback, useRef } from 'react';

/** Two-note "your turn" chime via Web Audio (plus a short buzz on phones). */
export function useAudio() {
  const ctx = useRef<AudioContext | null>(null);
  const chime = useCallback(() => {
    try {
      const ac = (ctx.current ??= new AudioContext());
      void ac.resume(); // needs a prior user gesture; joining the room was one
      [880, 1318.5].forEach((freq, i) => {
        const start = ac.currentTime + i * 0.12;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
        osc.connect(gain).connect(ac.destination);
        osc.start(start);
        osc.stop(start + 0.4);
      });
      navigator.vibrate?.(80);
    } catch {
      /* no audio available */
    }
  }, []);
  return { chime };
}
