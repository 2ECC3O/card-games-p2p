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
  /** Everything the player has, including chips riding on the current round. */
  chips: number;
  connected: boolean;
  /** Optional marker colour (roulette's player colours). */
  color?: string;
  handsPlayed: number;
  handsWon: number;
  equity?: number;
  exact?: boolean;
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

/** The side panel of the TOURNAMENT display: how to join, chip counts, and the live feed. */
export default function TournamentPanel({ code, url, leaders, startingStack, feed }: { code: string; url: string; leaders: Leader[]; startingStack: number; feed: Entry[] }) {
  const ranked = [...leaders].sort((a, b) => b.chips - a.chips);
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
        <h2 className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Chip counts · Live win chance</h2>
        {ranked.length === 0 ? (
          <p className="text-sm text-slate-400">Nobody seated yet.</p>
        ) : (
          <ol className="space-y-1">
            {ranked.map((p, i) => {
              const change = p.chips - startingStack;
              return (
                <li key={p.id} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 xl:text-lg ${i === 0 ? 'bg-white/8' : ''} ${p.connected ? '' : 'opacity-50'}`}>
                  <span className="w-5 text-right font-mono text-sm text-slate-400">{i + 1}</span>
                  {p.color && <span className="size-3 shrink-0 rounded-full ring-1 ring-slate-950/80" style={{ backgroundColor: p.color }} aria-hidden />}
                  <span className="min-w-0 flex-1 font-medium">
                    <span className="block truncate">{p.name}</span>
                    <span className="block text-xs font-normal text-slate-400" title="Completed hands won, including ties, divided by completed hands dealt">
                      {p.handsPlayed ? `${Math.round((100 * p.handsWon) / p.handsPlayed)}% · ${p.handsWon}/${p.handsPlayed} past hands` : 'No past hands'}
                    </span>
                  </span>
                  {p.equity !== undefined && <span className="font-mono text-xs font-semibold text-amber-200" title="Chance of winning this hand; ties split the chance">{p.exact ? '' : '~'}{Math.round(p.equity * 100)}%</span>}
                  <span className="font-mono font-semibold">{p.chips}</span>
                  <span className={`w-14 text-right font-mono text-xs xl:text-sm ${change > 0 ? 'text-emerald-300' : change < 0 ? 'text-rose-300' : 'text-slate-500'}`}>
                    {change > 0 ? `+${change}` : change < 0 ? `−${-change}` : '±0'}
                  </span>
                </li>
              );
            })}
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
