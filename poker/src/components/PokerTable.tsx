import { WifiSlashIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { buildPots, TURN_MS } from '../engine/pokerEngine';
import { BETTING_PHASES, type Card, type GameState, type Player } from '../types/poker';

interface Props {
  state: GameState;
  heroId: string;
  /** Shown in the middle of the table before the game starts. */
  invite: ReactNode;
}

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' } as const;

// `tall:` = wide AND tall screen (see index.css), so short laptop screens keep the mid sizes.
const SIZE = {
  seat: 'h-12 w-9 text-base sm:h-16 sm:w-12 sm:text-xl tall:h-18 tall:w-13',
  large: 'h-16 w-12 text-xl sm:h-20 sm:w-14 sm:text-2xl tall:h-24 tall:w-17 tall:text-3xl',
};

function CardView({ card, size, className = '', style }: { card: Card; size: keyof typeof SIZE; className?: string; style?: CSSProperties }) {
  const base = `${SIZE[size]} ${className} rounded-md shadow-md shadow-black/30`;
  if (card === '??') {
    return (
      <div
        style={style}
        className={`${base} border border-emerald-200/15 bg-[repeating-linear-gradient(45deg,#064e3b_0_5px,#065f46_5px_10px)]`}
      />
    );
  }
  const red = card[1] === 'h' || card[1] === 'd';
  return (
    <div
      style={style}
      className={`${base} flex flex-col items-center justify-center bg-slate-50 leading-none font-semibold ${red ? 'text-rose-600' : 'text-slate-900'}`}
    >
      <span>{card[0] === 'T' ? '10' : card[0]}</span>
      <span>{SUIT[card[1] as keyof typeof SUIT]}</span>
    </div>
  );
}

/** Draining turn bar. CSS-only; keyed by deadline so it restarts each turn. */
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
  const tone = left <= 5 ? 'text-rose-300' : left <= 10 ? 'text-amber-200' : 'text-emerald-200';
  return (
    <div className={`font-mono text-[11px] font-semibold tall:text-xs ${tone}`} aria-label={`${left} seconds left`}>
      {left}s
    </div>
  );
}

function Seat({ p, state, isHero }: { p: Player; state: GameState; isHero: boolean }) {
  const deadline = state.activeId === p.id && BETTING_PHASES.includes(state.phase) ? state.turnDeadline : null;
  const active = state.activeId === p.id;
  const won = state.phase === 'showdown' && state.pots.some((pot) => pot.winners.includes(p.id));
  const dimmed = p.folded || (state.phase !== 'waiting' && p.chips === 0 && !p.allIn && !won);
  const showCards = p.hole.length > 0 && !(p.folded && !isHero);
  return (
    <div className={`flex flex-col items-center transition-opacity duration-300 ${dimmed ? 'opacity-45' : ''}`}>
      {showCards && (
        // Your own cards fan slightly and overlap, which keeps them clear of the neighbouring seats.
        <div className={`-mb-2 flex ${isHero ? '-space-x-2' : 'gap-0.5'}`}>
          {p.hole.map((c, i) => (
            <CardView key={i} card={c} size={isHero ? 'large' : 'seat'} className={isHero ? (i === 0 ? '-rotate-4' : 'rotate-4') : ''} />
          ))}
        </div>
      )}
      <div
        className={`relative min-w-20 max-w-28 rounded-xl px-2.5 py-1 text-center shadow-lg shadow-black/40 transition duration-300 sm:min-w-24 tall:min-w-28 tall:max-w-36 tall:py-1.5 ${
          active
            ? 'bg-slate-900 ring-2 ring-emerald-300 shadow-emerald-400/20'
            : won
              ? 'bg-emerald-950 ring-2 ring-emerald-400'
              : 'bg-slate-950/90 ring-1 ring-white/10'
        }`}
      >
        {/* Your timer sits on top of your name card (the action bar is below it); everyone else's hangs underneath. */}
        {deadline && <TimerBar key={`bar-${deadline}`} deadline={deadline} className={`absolute inset-x-2 ${isHero ? '-top-2.5' : '-bottom-2.5'}`} />}
        {state.dealerSeat === p.seat && state.phase !== 'waiting' && (
          <span
            className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-slate-50 text-[10px] font-bold text-slate-900 shadow tall:size-6 tall:text-xs"
            title="Dealer"
          >
            D
          </span>
        )}
        <div className="flex items-center justify-center gap-1 truncate text-xs font-medium text-slate-200 tall:text-sm">
          {!p.connected && <WifiSlashIcon size={12} weight="bold" className="shrink-0 text-rose-300" aria-label="Disconnected" />}
          <span className="truncate">{isHero ? 'You' : p.name}</span>
        </div>
        <div className="font-mono text-sm font-semibold text-slate-50 tall:text-base">{p.chips}</div>
        {deadline ? (
          <SecondsLeft key={`secs-${deadline}`} deadline={deadline} />
        ) : (
          p.lastAction && <div className="truncate text-[11px] text-slate-400 tall:text-xs">{p.lastAction}</div>
        )}
      </div>
    </div>
  );
}

const CHIP = <span className="size-4 shrink-0 rounded-full border-2 border-dashed border-amber-100 bg-amber-400 shadow-sm sm:size-5" aria-hidden />;

/** A chip stack with an amount: bets in front of a seat, winnings on the move. */
function Chips({ amount }: { amount: number }) {
  return (
    <div className="flex w-max items-center gap-1.5 rounded-full bg-slate-950/75 py-0.5 pr-2.5 pl-0.5 text-xs font-semibold text-slate-50 shadow shadow-black/40 sm:text-sm">
      {CHIP}
      <span className="font-mono">{amount}</span>
    </div>
  );
}

/** Seat centre in percent of the table. Seat 0 (you) sits at the bottom, the rest clockwise. */
function seatPoint(i: number, n: number) {
  const angle = Math.PI / 2 + (i * 2 * Math.PI) / n;
  // Narrower than the felt so side seats stay on screen. Seats near 3 or 9 o'clock would cover the
  // board row, so they are pushed at least 35% of the vertical radius above or below it.
  const sin = Math.sin(angle);
  const y = Math.sign(sin || 1) * Math.max(Math.abs(sin), 0.35);
  return { x: 38 * Math.cos(angle), y: 42 * y, side: Math.abs(sin) < 0.6 };
}
const at = ({ x, y }: { x: number; y: number }, r: number) => ({ left: `${50 + r * x}%`, top: `${50 + r * y}%` });
/** Offset (in % of the table) that the chip keyframes in index.css travel. */
const travel = (dx: number, dy: number, delayMs = 0) => ({ '--dx': dx, '--dy': dy, animationDelay: `${delayMs}ms` }) as CSSProperties;
/**
 * Where a seat's bet sits, in % of the table from the middle. Seats near 3 and 9 o'clock keep their bet at
 * their own height, part-way in, so it stays clear of both the seat and the pot strip under the board.
 */
const betPoint = ({ x, y, side }: ReturnType<typeof seatPoint>) => (side ? { x: x * 0.45, y } : { x: x * 0.55, y: y * 0.55 });
const POT_DROP = 7; // the pot pills hang just below the board, in % of the table height

export default function PokerTable({ state, heroId, invite }: Props) {
  // Board cards already on screen. Cards that arrive together (the flop, or an all-in runout) deal in one after another.
  const shownCards = useRef(0);
  useEffect(() => {
    shownCards.current = state.board.length;
  });

  // When a betting round ends, the bets that were in front of each seat slide into the pot.
  const previous = useRef(state);
  const [collecting, setCollecting] = useState<{ key: string; id: string; amount: number }[]>([]);
  useEffect(() => {
    const old = previous.current;
    previous.current = state;
    if (old === state) return;
    if (old.handNumber !== state.handNumber) return setCollecting([]);
    if (old.phase === state.phase) return;
    // The action that ended the round (e.g. a call) is already folded into `committed`, so add it to the old bet.
    const finalBet = (p: Player) => p.bet + (state.players.find((n) => n.id === p.id)?.committed ?? p.committed) - p.committed;
    setCollecting(
      old.players.map((p) => ({ key: `${old.handNumber}-${old.phase}-${p.id}`, id: p.id, amount: finalBet(p) })).filter((c) => c.amount > 0),
    );
  }, [state]);

  const players = state.players;
  const heroIndex = Math.max(0, players.findIndex((p) => p.id === heroId));
  const ordered = [...players.slice(heroIndex), ...players.slice(0, heroIndex)]; // hero first, then clockwise
  const queuePos = state.queue.findIndex((q) => q.id === heroId);
  const name = (id: string) => (id === heroId ? 'You' : (players.find((p) => p.id === id)?.name ?? 'Someone'));
  const seated = (id: string) => ordered.some((p) => p.id === id);
  const pointOf = (id: string) => seatPoint(ordered.findIndex((p) => p.id === id), ordered.length);

  // Chips already in the middle, split into the main pot and side pots. A "pot" only one player can win is
  // just their own uncalled chips, which the engine hands back at showdown, so it isn't shown.
  const inFront = players.reduce((n, p) => n + p.bet, 0);
  const total = players.reduce((n, p) => n + p.committed, 0);
  const middle = buildPots(players.map((p) => ({ id: p.id, committed: p.committed - p.bet, folded: p.folded }))).filter(
    (p) => p.eligible.length > 1,
  );
  const winnersText = (ids: string[]) =>
    `${ids.map((w, k) => (k > 0 && w === heroId ? 'you' : name(w))).join(' and ')} ${ids.length === 1 && ids[0] !== heroId ? 'wins' : 'win'}`;
  const potLabel = (i: number, count: number) => (count === 1 ? 'Pot' : i === 0 ? 'Main' : count > 2 ? `Side ${i}` : 'Side');

  return (
    <div className="relative mx-auto h-full max-h-[56rem] w-full max-w-5xl [container-type:size]">
      <div className="absolute inset-x-[9%] inset-y-[13%] rounded-[50%] border-8 border-amber-950 bg-[radial-gradient(ellipse_at_center,#15803d_0%,#14532d_78%)] shadow-[inset_0_0_48px_rgba(2,6,23,.55),0_24px_60px_-20px_rgba(2,6,23,.8)] tall:border-[12px]" />

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {state.phase === 'waiting' ? (
          state.started ? (
            <p className="text-sm text-emerald-50/80">Waiting for more players…</p>
          ) : (
            <div className="rise-in flex flex-col items-center gap-2">
              {invite}
              <p className="text-xs text-emerald-50/70 sm:text-sm">
                {players.length} seated{state.queue.length > 0 && `, ${state.queue.length} in queue`}
              </p>
            </div>
          )
        ) : (
          // The board stays centred on its own; pots and results hang below it, so a tall showdown
          // panel never pushes the board up into the side seats.
          <div className="relative flex flex-col items-center">
            <div className="flex min-h-2 gap-1 [perspective:600px] sm:gap-1.5">
              {state.board.map((c, i) => (
                <CardView
                  key={`${state.handNumber}-${i}`}
                  card={c}
                  size="large"
                  className="deal-card"
                  style={{ animationDelay: `${Math.max(0, i - shownCards.current) * 180}ms` }}
                />
              ))}
            </div>
            {state.phase === 'showdown' ? (
              // At most half the table wide, so it stays clear of the side seats. Several pots get one line each.
              <div className="rise-in absolute top-full mt-2 w-max max-w-[50cqw] rounded-xl bg-slate-950/75 px-3 py-2 text-center backdrop-blur-sm tall:mt-3 tall:px-5 tall:py-3">
                {state.pots.length === 1 ? (
                  <>
                    <p className="text-sm font-semibold text-slate-50 sm:text-base tall:text-lg">
                      {winnersText(state.pots[0].winners)} <span className="font-mono">{state.pots[0].amount}</span>
                    </p>
                    {state.pots[0].hand && <p className="text-xs text-emerald-200 sm:text-sm">{state.pots[0].hand}</p>}
                  </>
                ) : (
                  <ul className="space-y-1 text-left text-xs sm:text-sm">
                    {state.pots.map((p, i) => (
                      <li key={i}>
                        <span className="text-slate-400">{potLabel(i, state.pots.length)}</span>{' '}
                        <span className="font-semibold text-slate-50">{winnersText(p.winners)}</span> <span className="font-mono font-semibold">{p.amount}</span>
                        {p.hand && <span className="text-emerald-200"> {p.hand}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="absolute top-full mt-2 flex w-max flex-col items-center tall:mt-3">
                {middle.length > 0 ? (
                  // One pill for the main pot and any side pots, no wider than the gap between the side seats.
                  // Re-keyed by the amounts so it bumps when collected chips land in it.
                  <div
                    key={middle.map((p) => p.amount).join('-')}
                    className="pot-bump flex max-w-[44cqw] flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 rounded-2xl bg-slate-950/75 py-1 pr-3 pl-1 text-xs font-semibold text-slate-50 shadow shadow-black/40 sm:text-sm"
                  >
                    {CHIP}
                    {middle.map((p, i) => (
                      <span key={i} className="whitespace-nowrap">
                        <span className="font-medium text-slate-300">{potLabel(i, middle.length)}</span> <span className="font-mono">{p.amount}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  inFront > 0 && (
                    <p className="text-xs text-emerald-50/80 sm:text-sm">
                      Total pot <span className="font-mono">{total}</span>
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {ordered.map((p, i) => {
        const point = seatPoint(i, ordered.length);
        return (
          <div key={p.id}>
            <div
              className={`absolute -translate-x-1/2 ${i === 0 ? '-translate-y-full' : '-translate-y-1/2'}`}
              // The bottom seat hangs from the table's bottom edge, so it never covers the action bar or footer text.
              style={i === 0 ? { left: '50%', top: '100%' } : at(point, 1)}
            >
              <Seat p={p} state={state} isHero={p.id === heroId} />
            </div>
            {p.bet > 0 && (
              // Re-keyed on every change, so each blind, call or raise tosses chips out from the seat again.
              <div
                key={`${state.handNumber}-${state.phase}-${p.bet}`}
                className="chip-from absolute"
                style={{ ...at(betPoint(point), 1), ...travel(point.x - betPoint(point).x, point.y - betPoint(point).y) }}
              >
                <Chips amount={p.bet} />
              </div>
            )}
          </div>
        );
      })}

      {collecting.map(({ key, id, amount }) => {
        if (!seated(id)) return null;
        const bet = betPoint(pointOf(id));
        return (
          <div
            key={key}
            aria-hidden
            className="chip-to pointer-events-none absolute"
            style={{ ...at(bet, 1), ...travel(-bet.x, -bet.y + POT_DROP) }}
          >
            <Chips amount={amount} />
          </div>
        );
      })}

      {state.phase === 'showdown' &&
        state.pots.flatMap((p, i) => {
          const share = Math.floor(p.amount / p.winners.length);
          const odd = p.amount - share * p.winners.length; // odd chips go to the first winners, as in the engine
          return p.winners.map((w, k) => {
            if (!seated(w)) return null; // left the table during the showdown
            const { x, y } = pointOf(w);
            return (
              <div
                key={`${state.handNumber}-${i}-${w}`}
                aria-hidden
                className="pot-to-winner pointer-events-none absolute top-1/2 left-1/2"
                style={travel(x, y, 900 + i * 450)}
              >
                <Chips amount={share + (k < odd ? 1 : 0)} />
              </div>
            );
          });
        })}

      {state.queue.length > 0 && queuePos < 0 && (
        <p className="absolute top-1 left-3 text-xs text-slate-400 tall:text-sm">In queue: {state.queue.map((q) => q.name).join(', ')}</p>
      )}

    </div>
  );
}
