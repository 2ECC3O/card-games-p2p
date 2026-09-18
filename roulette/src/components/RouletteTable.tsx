import { WifiSlashIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BET_MS, OUTSIDE, payoutMultiple, RED, SPIN_MS, staked, WHEEL } from '../engine/rouletteEngine';
import type { GameState, Spot } from '../types/roulette';

interface Props {
  state: GameState;
  heroId: string;
  /** Shown in place of the board before the game starts. */
  invite: ReactNode;
  canBet: boolean;
  onPlace: (spot: Spot) => void;
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function useMedia(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

const colorOf = (n: number) => (n === 0 ? 'Green' : RED.has(n) ? 'Red' : 'Black');
const TONE = { Green: 'bg-emerald-700', Red: 'bg-red-600', Black: 'bg-slate-950' };
const short = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : `${n}`);

// ------------------------------------------------ wheel

const STEP = 360 / 37;
const polar = (r: number, deg: number) => `${(r * Math.sin((deg * Math.PI) / 180)).toFixed(2)} ${(-r * Math.cos((deg * Math.PI) / 180)).toFixed(2)}`;
/** One pocket, centred on the top of the wheel; each is rotated into place. */
const POCKET = `M${polar(97, -STEP / 2)} A97 97 0 0 1 ${polar(97, STEP / 2)} L${polar(62, STEP / 2)} A62 62 0 0 0 ${polar(62, -STEP / 2)}Z`;
const FILL = { Green: '#047857', Red: '#dc2626', Black: '#0f172a' };

/** Spins (a few turns, then eases out) to put `result` under the marker at the top whenever `spinKey` changes. */
function Wheel({ result, spinKey, landed }: { result: number | null; spinKey: string; landed: boolean }) {
  const [reduced] = useState(reducedMotion);
  const turned = useRef(0);
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    if (result === null) return;
    const target = -WHEEL.indexOf(result) * STEP;
    const extra = (((target - turned.current) % 360) + 360) % 360;
    turned.current += extra + (reduced ? 0 : 360 * 5);
    setAngle(turned.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  return (
    <svg viewBox="-100 -100 200 200" className="size-32 shrink-0 drop-shadow-xl sm:size-40 tall:size-56 [@media(max-height:44rem)]:size-24" role="img" aria-label={landed && result !== null ? `The wheel stopped on ${result}` : 'Roulette wheel'}>
      <circle r="99.5" fill="#451a03" />
      <g style={{ transform: `rotate(${angle}deg)`, transition: reduced ? 'none' : `transform ${SPIN_MS - 400}ms cubic-bezier(0.12, 0.6, 0.08, 1)` }}>
        {WHEEL.map((n, i) => (
          <g key={n} transform={`rotate(${i * STEP})`}>
            <path d={POCKET} fill={FILL[colorOf(n)]} stroke="#d6d3d1" strokeOpacity="0.35" strokeWidth="0.6" />
            <text y="-86" fill="#f8fafc" fontSize="8.5" fontWeight="600" textAnchor="middle" dominantBaseline="middle">
              {n}
            </text>
          </g>
        ))}
        <circle r="62" fill="#292524" />
        <circle r="46" fill="#7f1d1d" stroke="#44403c" strokeWidth="3" />
        <path d="M0 -30V30M-30 0H30" stroke="#d6b86a" strokeWidth="5" strokeLinecap="round" />
        <circle r="9" fill="#d6b86a" />
      </g>
      {landed && <circle cy="-71" r="5" fill="#f8fafc" stroke="#0f172a" strokeOpacity="0.4" className="rise-in" />}
      <path d="M0 -84L-6 -100H6Z" fill="#fbbf24" stroke="#451a03" strokeWidth="1.5" />
    </svg>
  );
}

// ------------------------------------------------ board

interface Cell {
  spot: Spot;
  label: ReactNode;
  name: string;
  tone: string;
  /** Position along the board (0 at one end, the column bets at the other) and across it (three number rows, dozens, even money). */
  along: number;
  across: number;
  alongSpan?: number;
  acrossSpan?: number;
}

const DIAMOND = (color: string) => <span className={`block size-3.5 rotate-45 rounded-[2px] ring-1 ring-white/50 sm:size-4 ${color}`} aria-hidden />;
const OUTSIDE_CELLS: Record<(typeof OUTSIDE)[number], Omit<Cell, 'spot' | 'tone'> & { tone?: string }> = {
  d1: { label: '1st 12', name: 'First dozen, 1 to 12', along: 0, across: 3, alongSpan: 4 },
  d2: { label: '2nd 12', name: 'Second dozen, 13 to 24', along: 4, across: 3, alongSpan: 4 },
  d3: { label: '3rd 12', name: 'Third dozen, 25 to 36', along: 8, across: 3, alongSpan: 4 },
  low: { label: '1–18', name: 'Low, 1 to 18', along: 0, across: 4, alongSpan: 2 },
  even: { label: 'Even', name: 'Even', along: 2, across: 4, alongSpan: 2 },
  red: { label: DIAMOND('bg-red-600'), name: 'Red', along: 4, across: 4, alongSpan: 2 },
  black: { label: DIAMOND('bg-slate-950'), name: 'Black', along: 6, across: 4, alongSpan: 2 },
  odd: { label: 'Odd', name: 'Odd', along: 8, across: 4, alongSpan: 2 },
  high: { label: '19–36', name: 'High, 19 to 36', along: 10, across: 4, alongSpan: 2 },
  c1: { label: '2:1', name: 'First column', along: 12, across: 0 },
  c2: { label: '2:1', name: 'Second column', along: 12, across: 1 },
  c3: { label: '2:1', name: 'Third column', along: 12, across: 2 },
};

/**
 * The layout: zero, then the numbers in rows of three (1, 2, 3 / 4, 5, 6 ...), the column bets at the far end,
 * dozens and even-money bets alongside. Wide screens lay it out left to right with 3 on top; phones stand it
 * upright with 1 on the left. Grid lines are 1-based, and the numbers start one line in, after the zero.
 */
function cells(upright: boolean): (Cell & { style: CSSProperties })[] {
  const all: Cell[] = [
    { spot: 'n0', label: '0', name: '0', tone: TONE.Green, along: -1, across: 0, acrossSpan: 3 },
    ...Array.from({ length: 36 }, (_, i): Cell => ({ spot: `n${i + 1}`, label: `${i + 1}`, name: `${i + 1}`, tone: TONE[colorOf(i + 1)], along: Math.floor(i / 3), across: i % 3 })),
    ...OUTSIDE.map((spot) => ({ spot, tone: '', ...OUTSIDE_CELLS[spot] })),
  ];
  return all.map((c) => {
    // Across index for the number rows: 0 = the column holding 1, 4, 7 ... Lying down, that row is at the bottom.
    const across = c.across < 3 && !upright ? 3 - c.across - (c.acrossSpan ?? 1) : c.across;
    const a = `${c.along + 2} / span ${c.alongSpan ?? 1}`;
    const b = `${across + 1} / span ${c.acrossSpan ?? 1}`;
    return { ...c, style: upright ? { gridRow: a, gridColumn: b } : { gridColumn: a, gridRow: b } };
  });
}
const LYING = cells(false);
const UPRIGHT = cells(true);

function Board({ state, heroId, canBet, onPlace, landed }: { state: GameState; heroId: string; canBet: boolean; onPlace: (s: Spot) => void; landed: boolean }) {
  const upright = !useMedia('(min-width: 40rem)');
  const hero = state.players.find((p) => p.id === heroId);
  const result = landed ? state.result : null;
  return (
    <div
      className={`grid overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_top,#991b1b_0%,#7f1d1d_80%)] shadow-[inset_0_0_32px_rgba(2,6,23,.45)] ring-4 ring-amber-950 ${
        upright
          ? 'mx-auto max-h-[31.5rem] w-full max-w-sm flex-1 grid-cols-[repeat(3,minmax(0,1fr))_3.75rem_3.75rem] grid-rows-[repeat(14,minmax(1.35rem,1fr))]'
          : 'grid-cols-[repeat(14,minmax(0,1fr))] grid-rows-[repeat(3,2.75rem)_2.25rem_2.25rem] tall:grid-rows-[repeat(3,3.5rem)_2.75rem_2.75rem]'
      }`}
    >
      {(upright ? UPRIGHT : LYING).map(({ spot, label, name, tone, style }) => {
        const mine = hero?.bets[spot] ?? 0;
        const others = state.players.some((p) => p.id !== heroId && p.bets[spot]);
        const won = result !== null && payoutMultiple(spot, result) > 0;
        return (
          <button
            key={spot}
            style={style}
            disabled={!canBet}
            onClick={() => onPlace(spot)}
            aria-label={`${name}${mine ? `, your bet ${mine}` : ''}${others ? ', other players have bets here' : ''}`}
            className={`relative grid place-items-center text-xs font-semibold text-slate-50 ring-1 ring-white/25 transition select-none sm:text-sm tall:text-base ${tone} ${
              won ? 'win-glow z-10' : ''
            } enabled:cursor-pointer enabled:hover:brightness-125 enabled:active:brightness-150 focus-visible:z-20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-200`}
          >
            {label}
            {mine > 0 && (
              <span
                key={`${state.round}-${mine}`}
                className={`chip-drop absolute top-1/2 left-1/2 grid h-5 min-w-5 place-items-center rounded-full border-2 border-dashed border-amber-100 bg-amber-400 px-0.5 font-mono text-[9px] leading-none text-amber-950 shadow shadow-black/50 transition-opacity sm:h-6 sm:min-w-6 sm:text-[10px] ${
                  result !== null && !won ? 'opacity-35' : ''
                }`}
                aria-hidden
              >
                {short(mine)}
              </span>
            )}
            {others && !mine && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-slate-100/80" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------ table

/** Draining timer bar. CSS-only; keyed by deadline so it restarts each time. */
function TimerBar({ deadline, total, className }: { deadline: number; total: number; className: string }) {
  const elapsed = total - Math.max(0, deadline - Date.now());
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-slate-950 ring-1 ring-black/40 ${className}`} role="presentation">
      <div className="turn-timer h-full w-full" style={{ animationDuration: `${total}ms`, animationDelay: `-${elapsed}ms` }} />
    </div>
  );
}

function Ball({ n, big = false }: { n: number; big?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-mono font-semibold text-slate-50 ring-1 ring-white/25 ${TONE[colorOf(n)]} ${big ? 'size-12 text-xl tall:size-14 tall:text-2xl' : 'size-6 text-[10px] sm:size-7 sm:text-xs'}`}>
      {n}
    </span>
  );
}

export default function RouletteTable({ state, heroId, invite, canBet, onPlace }: Props) {
  // Every screen spins its wheel when it first hears the result, and shows the outcome once the wheel stops.
  const [landedRound, setLandedRound] = useState(-1);
  const settled = state.phase === 'settled';
  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(() => setLandedRound(state.round), reducedMotion() ? 300 : SPIN_MS);
    return () => clearTimeout(t);
  }, [settled, state.round]);
  const landed = settled && landedRound === state.round;
  // On a short screen the board can push the wheel out of view; bring it back for the spin.
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (settled) top.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [settled, state.round]);
  const history = settled && !landed ? state.history.slice(1) : state.history;

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3 px-3 pb-3 sm:gap-4 sm:px-5">
      <div ref={top} className="flex shrink-0 items-center gap-4 scroll-mt-2 sm:gap-6">
        <Wheel result={settled ? state.result : null} spinKey={`${state.round}-${state.phase}`} landed={landed} />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5" aria-live="polite">
          {!state.started ? (
            <p className="text-sm text-slate-300 sm:text-base">Single-zero wheel. The game starts when the host presses Start.</p>
          ) : state.phase === 'betting' && state.deadline ? (
            <div className="flex max-w-60 flex-col gap-1.5">
              <p className="text-base font-semibold sm:text-lg">Place your bets</p>
              <TimerBar key={state.deadline} deadline={state.deadline} total={BET_MS} className="w-full" />
            </div>
          ) : settled && !landed ? (
            <p className="text-base font-semibold text-slate-200 sm:text-lg">No more bets…</p>
          ) : landed && state.result !== null ? (
            <div className="rise-in flex items-center gap-3">
              <Ball n={state.result} big />
              <p className="text-base font-semibold sm:text-lg">{state.result === 0 ? 'Zero' : `${colorOf(state.result)} ${state.result}`}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-300">Waiting for players…</p>
          )}
          {history.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] tracking-wider text-slate-400 uppercase">Last numbers</p>
              <ol className="flex flex-wrap gap-1" aria-label="Last numbers, newest first">
                {history.map((n, i) => (
                  <li key={i}>
                    <Ball n={n} />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      <ul className="flex shrink-0 flex-wrap justify-center gap-1.5 sm:gap-2" aria-label="Players">
        {state.players.map((p) => {
          const stake = staked(p.bets);
          const net = p.payout - stake;
          const status =
            state.phase === 'betting'
              ? p.done
                ? stake ? 'Ready' : 'Sitting out'
                : stake ? `Bet ${stake}` : 'Betting…'
              : settled
                ? !stake ? 'Sat out' : !landed ? `Bet ${stake}` : net > 0 ? `Won ${net}` : net < 0 ? `Lost ${-net}` : 'Even'
                : '';
          return (
            <li
              key={p.id}
              className={`min-w-20 rounded-xl px-2.5 py-1 text-center shadow-lg shadow-black/30 transition sm:min-w-24 ${
                landed && net > 0 ? 'bg-red-950 ring-2 ring-red-400' : p.id === heroId ? 'bg-slate-900 ring-1 ring-red-300/60' : 'bg-slate-950/80 ring-1 ring-white/10'
              }`}
            >
              <div className="flex items-center justify-center gap-1 truncate text-xs font-medium text-slate-200">
                {!p.connected && <WifiSlashIcon size={12} weight="bold" className="shrink-0 text-rose-300" aria-label="Disconnected" />}
                <span className="truncate">{p.id === heroId ? 'You' : p.name}</span>
              </div>
              {/* The payout is already in the chips; hold it back until the wheel stops. */}
              <div className="font-mono text-sm font-semibold">{settled && !landed ? p.chips - p.payout : p.chips}</div>
              {status && <div className={`text-[11px] ${landed && net > 0 ? 'text-red-200' : 'text-slate-400'}`}>{status}</div>}
            </li>
          );
        })}
      </ul>

      {state.started ? (
        <Board state={state} heroId={heroId} canBet={canBet} onPlace={onPlace} landed={landed} />
      ) : (
        <div className="rise-in flex flex-col items-center gap-2 py-2">
          {invite}
          <p className="text-xs text-slate-400 sm:text-sm">
            {state.players.length} seated{state.queue.length > 0 && `, ${state.queue.length} in queue`}
          </p>
        </div>
      )}

      {state.queue.length > 0 && !state.queue.some((q) => q.id === heroId) && (
        <p className="text-center text-xs text-slate-400">In queue: {state.queue.map((q) => q.name).join(', ')}</p>
      )}
    </div>
  );
}
