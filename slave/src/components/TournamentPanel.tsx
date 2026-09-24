import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';

/** One ticker line. `delay` holds it back (ms), e.g. until a wheel stops spinning on screen. */
export interface TickerLine {
  text: string;
  delay?: number;
}

export interface Leader {
  id: string;
  name: string;
  points: number;
  connected: boolean;
  /** Title and cards left. */
  note: string;
  /** Live odds, "King ~34%". */
  chance?: string;
}

interface Entry {
  key: number;
  at: number;
  text: string;
}

const MAX_LINES = 40;

/** A running feed of what just happened, worked out by comparing each state with the one before. */
export function useTicker<S>(state: S, describe: (prev: S, next: S) => TickerLine[]) {
  const [feed, setFeed] = useState<Entry[]>([]);
  const prev = useRef(state);
  const counter = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const old = prev.current;
    prev.current = state;
    if (old === state) return;
    for (const line of describe(old, state)) {
      const push = () => setFeed((f) => [{ key: counter.current++, at: Date.now(), text: line.text }, ...f].slice(0, MAX_LINES));
      if (line.delay) timers.current.push(setTimeout(push, line.delay));
      else push();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return feed;
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** The side panel of the TOURNAMENT display: how to join, points, and the live feed. */
export default function TournamentPanel({ code, url, leaders, feed }: { code: string; url: string; leaders: Leader[]; feed: Entry[] }) {
  const ranked = [...leaders].sort((a, b) => b.points - a.points);
  return (
    <aside className="flex shrink-0 flex-col gap-5 border-t border-white/10 bg-slate-950/70 p-4 lg:min-h-0 lg:w-80 lg:overflow-y-auto lg:border-t-0 lg:border-l xl:w-96 xl:p-5">
      <div className="flex items-center gap-4">
        <div className="shrink-0 rounded-lg bg-slate-50 p-1.5">
          <QRCodeSVG value={url} bgColor="#f8fafc" fgColor="#020617" className="size-20 xl:size-24" title={`QR code to join room ${code}`} />
        </div>
        <div>
          <p className="text-xs tracking-wider text-slate-400 uppercase">Scan to watch or play</p>
          <p className="font-mono text-2xl font-semibold tracking-[0.2em] xl:text-3xl">{code}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Points · Live odds</h2>
        {ranked.length === 0 ? (
          <p className="text-sm text-slate-400">Nobody seated yet.</p>
        ) : (
          <ol className="space-y-1">
            {ranked.map((p, i) => (
              <li key={p.id} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 xl:text-lg ${i === 0 ? 'bg-white/8' : ''} ${p.connected ? '' : 'opacity-50'}`}>
                <span className="w-5 text-right font-mono text-sm text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <span className="text-xs text-slate-400 xl:text-sm">{p.note}</span>
                {p.chance && <span className="font-mono text-xs font-semibold text-amber-200 xl:text-sm" title="Chance from simulated playouts of the cards on the table">{p.chance}</span>}
                <span className="w-10 text-right font-mono font-semibold">{p.points}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="min-h-0">
        <h2 className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Live</h2>
        {feed.length === 0 ? (
          <p className="text-sm text-slate-400">Waiting for the first move…</p>
        ) : (
          <ol className="space-y-1.5" aria-live="polite">
            {feed.map((e, i) => (
              <li key={e.key} className={`rise-in flex gap-2.5 text-sm xl:text-base ${i === 0 ? 'text-slate-50' : 'text-slate-300'}`}>
                <span className="shrink-0 font-mono text-xs leading-6 text-slate-500">{clock(e.at)}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
