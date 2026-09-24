import { WifiSlashIcon } from '@phosphor-icons/react';
import { useEffect, useState, type ReactNode } from 'react';
import { TURN_MS } from '../engine/slaveEngine';
import type { Card, GameState, Player, Title } from '../types/slave';

export type Odds = Record<string, { king: number; slave: number }>;
const pct = (n: number) => `~${Math.round(n * 100)}%`;
/** Until someone is out the race is for King; after that, to stay clear of Slave. */
export const oddsLabel = (s: GameState, c: Odds[string]) => (s.out.length ? `Slave ${pct(c.slave)}` : `King ${pct(c.king)}`);

interface Props {
  state: GameState;
  heroId: string;
  /** Spectators only: each seat's chance to end the round King, and Slave. */
  odds?: Odds;
  /** Shown in the middle of the table before the game starts. */
  invite: ReactNode;
}

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' } as const;
const face = (c: Card) => (c[0] === 'T' ? '10' : c[0]);
/** "10♥ 10♠", for the feed and hints. */
export const cardsText = (cards: Card[]) => cards.map((c) => (c === '??' ? '?' : `${face(c)}${SUIT[c[1] as keyof typeof SUIT]}`)).join(' ');
export const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`;

const SIZE = {
  sm: 'h-10 w-7 text-sm sm:h-12 sm:w-9 sm:text-base',
  md: 'h-14 w-10 text-lg sm:h-20 sm:w-14 sm:text-2xl tall:h-24 tall:w-17 tall:text-3xl',
};

/** A card face up, or its back for '??'. */
export function CardFace({ card, size = 'md' }: { card: Card; size?: keyof typeof SIZE }) {
  if (card === '??') return <span className={`${SIZE[size]} block shrink-0 rounded-md border border-white/20 bg-[repeating-linear-gradient(45deg,#5e3a6e_0_5px,#7a4f8c_5px_10px)] shadow-md shadow-black/30`} />;
  const suit = SUIT[card[1] as keyof typeof SUIT];
  return (
    <span className={`${SIZE[size]} relative grid shrink-0 place-items-center rounded-md bg-slate-50 leading-none font-semibold shadow-md shadow-black/30 ${'hd'.includes(card[1]) ? 'text-rose-600' : 'text-slate-900'}`}>
      <span className="absolute top-0.5 left-0.5 flex flex-col items-center text-[0.6em] sm:top-1 sm:left-1">
        <span>{face(card)}</span>
        <span>{suit}</span>
      </span>
      <span className="mt-2 text-[1.1em]">{suit}</span>
    </span>
  );
}

/** Draining timer bar. CSS-only; keyed by deadline so it restarts each time. */
function TimerBar({ deadline, className }: { deadline: number; className: string }) {
  const elapsed = TURN_MS - Math.max(0, deadline - Date.now());
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-slate-950 ring-1 ring-black/40 ${className}`} role="presentation">
      <div className="turn-timer h-full w-full" style={{ animationDuration: `${TURN_MS}ms`, animationDelay: `-${elapsed}ms` }} />
    </div>
  );
}

function SecondsLeft({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const tone = left <= 5 ? 'text-rose-300' : left <= 10 ? 'text-amber-200' : 'text-yellow-100';
  return (
    <div className={`font-mono text-[11px] font-semibold tall:text-xs ${tone}`} aria-label={`${left} seconds left`}>
      {left}s
    </div>
  );
}

const TITLES: Title[] = ['King', 'Queen', 'Citizen', 'Serf', 'Slave'];

export const TITLE_TONE: Record<Title, string> = {
  King: 'bg-yellow-300 text-yellow-950',
  Queen: 'bg-rose-200 text-rose-950',
  Citizen: 'bg-slate-200 text-slate-900',
  Serf: 'bg-slate-500 text-slate-50',
  Slave: 'bg-slate-950 text-slate-300 ring-1 ring-white/30',
};

function Seat({ p, state, isHero, odds }: { p: Player; state: GameState; isHero: boolean; odds?: Odds[string] }) {
  const active = state.activeId === p.id || (state.phase === 'exchange' && state.gives.some((g) => g.from === p.id && !g.cards.length));
  const deadline = active ? state.deadline : null;
  const place = state.out.indexOf(p.id);
  const passed = state.phase === 'playing' && state.passed.includes(p.id);
  const status = !state.started || state.phase === 'waiting' ? '' : place >= 0 ? `Out ${ordinal(place + 1)}` : passed ? 'Passed' : state.phase === 'exchange' && active ? 'Choosing…' : `${p.hand.length} card${p.hand.length === 1 ? '' : 's'}`;
  return (
    <div
      className={`relative w-20 rounded-xl px-2 py-1 text-center shadow-lg shadow-black/40 transition duration-300 sm:w-24 sm:px-2.5 tall:w-32 tall:py-1.5 ${
        active ? 'bg-slate-900 ring-2 ring-yellow-300 shadow-yellow-400/20' : 'bg-slate-950/90 ring-1 ring-white/10'
      } ${passed || place >= 0 || p.left ? 'opacity-60' : ''}`}
    >
      {p.title && (
        <span key={p.title} className={`rise-in absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2 text-[10px] font-bold tracking-wide uppercase shadow ${TITLE_TONE[p.title]}`}>{p.title}</span>
      )}
      {deadline && <TimerBar key={`bar-${deadline}`} deadline={deadline} className="absolute inset-x-2 -bottom-2.5" />}
      <div className="flex items-center justify-center gap-1 truncate text-xs font-medium text-slate-200 tall:text-sm">
        {!p.connected && <WifiSlashIcon size={12} weight="bold" className="shrink-0 text-rose-300" aria-label="Disconnected" />}
        <span className="truncate">{isHero ? 'You' : p.name}</span>
      </div>
      <div className="font-mono text-sm font-semibold text-slate-50 tall:text-base">{p.points} pt{p.points === 1 ? '' : 's'}</div>
      {deadline ? <SecondsLeft key={`secs-${deadline}`} deadline={deadline} /> : status && <div className="truncate text-[11px] text-slate-400 tall:text-xs">{status}</div>}
      {odds && <div className="font-mono text-[11px] font-semibold text-amber-200 tall:text-xs" title="Chance from simulated playouts of the cards on the table">{oddsLabel(state, odds)}</div>}
    </div>
  );
}

/** Seat centre, in % of the table from its middle. You sit at the bottom; the others follow clockwise round the oval. */
function seatPoint(i: number, n: number) {
  const angle = Math.PI / 2 + (i * 2 * Math.PI) / n;
  const sin = Math.sin(angle);
  return { x: 40 * Math.cos(angle), y: 42 * Math.sign(sin || 1) * Math.max(Math.abs(sin), 0.35) };
}
const at = ({ x, y }: { x: number; y: number }) => ({ left: `${50 + x}%`, top: `${50 + y}%` });

export default function SlaveTable({ state, heroId, invite, odds }: Props) {
  const { players } = state;
  const nameOf = (id: string) => (id === heroId ? 'You' : (players.find((p) => p.id === id)?.name ?? 'Someone'));
  const heroIndex = Math.max(0, players.findIndex((p) => p.id === heroId));
  const ordered = [...players.slice(heroIndex), ...players.slice(0, heroIndex)]; // you first, then clockwise
  const queuePos = state.queue.findIndex((q) => q.id === heroId);
  const caption = 'text-[10px] font-semibold tracking-[0.2em] text-yellow-100/60 uppercase sm:text-xs';

  let middle: ReactNode;
  if (!state.started) {
    middle = (
      <div className="rise-in flex flex-col items-center gap-2">
        {invite}
        <p className="text-xs text-yellow-50/70 sm:text-sm">
          {players.length} seated{state.queue.length > 0 && `, ${state.queue.length} in queue`}
        </p>
      </div>
    );
  } else if (state.phase === 'waiting') {
    middle = <p className="text-sm text-yellow-50/80">Waiting for players…</p>;
  } else if (state.phase === 'exchange') {
    middle = (
      <div className="flex flex-col items-center gap-2">
        <p className={caption}>Card exchange</p>
        {state.gives.map((g) => (
          <div key={`${g.from}-${g.to}`} className="flex items-center gap-2 text-xs text-yellow-50/80 sm:text-sm">
            <span>{nameOf(g.from)} → {nameOf(g.to)}</span>
            {g.cards.length ? (
              <span className="flex gap-1">{g.cards.map((c, i) => <CardFace key={i} card={c} size="sm" />)}</span>
            ) : (
              <span className="text-yellow-50/50">choosing {g.count}…</span>
            )}
          </div>
        ))}
      </div>
    );
  } else if (state.phase === 'settled') {
    const ranked = [...players].filter((p) => p.title).sort((a, b) => TITLES.indexOf(a.title!) - TITLES.indexOf(b.title!));
    middle = (
      <div className="rise-in flex flex-col items-center gap-1">
        <p className={caption}>Round {state.round} · New titles</p>
        {ranked.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-xs text-yellow-50 sm:text-sm">
            <span className={`w-16 rounded-full px-2 text-[10px] font-bold tracking-wide uppercase ${TITLE_TONE[p.title!]}`}>{p.title}</span>
            <span className="max-w-32 truncate">{nameOf(p.id)}</span>
          </div>
        ))}
      </div>
    );
  } else {
    const pile = state.pile;
    middle = pile ? (
      <div className="flex flex-col items-center gap-1.5">
        <div key={pile.cards.join()} className="rise-in flex gap-1">
          {pile.cards.map((c) => <CardFace key={c} card={c} />)}
        </div>
        <p className={caption}>{nameOf(pile.by)} played</p>
      </div>
    ) : (
      <p className="text-sm font-semibold text-yellow-50 sm:text-base">{nameOf(state.activeId ?? '')} lead{state.activeId === heroId ? '' : 's'}</p>
    );
  }

  return (
    <div data-table className="relative mx-auto h-full max-h-[56rem] w-full max-w-5xl [container-type:size]">
      <div className="table-felt absolute inset-x-[9%] inset-y-[13%] rounded-[50%] border-8 border-[#2b1d35] shadow-[inset_0_0_48px_rgba(2,6,23,.55),0_24px_60px_-20px_rgba(2,6,23,.8)] tall:border-[12px]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[20%] text-center">{middle}</div>

      {ordered.map((p, i) => {
        const point = seatPoint(i, ordered.length);
        return (
          <div
            key={p.id}
            // Your seat sits on the table's bottom edge, clear of your hand below it.
            className={`absolute -translate-x-1/2 ${i === 0 ? '-translate-y-full' : '-translate-y-1/2'}`}
            style={i === 0 ? { left: '50%', top: '100%' } : at(point)}
          >
            <Seat p={p} state={state} isHero={p.id === heroId} odds={odds?.[p.id]} />
          </div>
        );
      })}

      {state.queue.length > 0 && queuePos < 0 && (
        <p className="absolute top-1 left-3 text-xs text-slate-400 tall:text-sm">In queue: {state.queue.map((q) => q.name).join(', ')}</p>
      )}
    </div>
  );
}
