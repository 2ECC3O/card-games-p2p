import { useCallback, useEffect, useRef } from 'react';

/** Two-note "your turn" chime via Web Audio (plus a short buzz on phones that support it). */
export function useAudio() {
  const ctx = useRef<AudioContext | null>(null);

  // iPhones only let a page start audio from inside a tap, but the chime plays when a turn arrives,
  // not on a tap. So the audio context is created and woken up on the first tap or key press anywhere
  // (Create, Join, Start...), and later chimes can play.
  useEffect(() => {
    const events = ['touchend', 'click', 'keydown'] as const;
    const stop = () => events.forEach((e) => document.removeEventListener(e, unlock, true));
    function unlock() {
      try {
        const ac = (ctx.current ??= new AudioContext());
        // A one-sample silent sound: older iOS versions need something played during the tap itself.
        const silent = ac.createBufferSource();
        silent.buffer = ac.createBuffer(1, 1, 22050);
        silent.connect(ac.destination);
        silent.start();
        void ac.resume().then(() => ac.state === 'running' && stop());
      } catch {
        stop(); // no Web Audio here; nothing to unlock
      }
    }
    events.forEach((e) => document.addEventListener(e, unlock, true));
    return stop;
  }, []);

  const chime = useCallback(() => {
    try {
      const ac = (ctx.current ??= new AudioContext());
      void ac.resume();
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
