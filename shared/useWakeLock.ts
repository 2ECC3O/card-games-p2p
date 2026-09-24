import { useEffect } from 'react';

/**
 * Keeps the screen on while `active`, so a phone doesn't dim and lock mid-game (which pauses the page).
 * Uses the Screen Wake Lock API: only on HTTPS or localhost, and a browser may still refuse (e.g. battery
 * saver). Browsers drop the lock whenever the page is hidden, so it is taken again when the page is shown.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const take = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (done) void next.release();
        else lock = next;
      } catch {
        /* not allowed right now; the screen just behaves normally */
      }
    };
    void take();
    document.addEventListener('visibilitychange', take);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', take);
      void lock?.release();
    };
  }, [active]);
}
