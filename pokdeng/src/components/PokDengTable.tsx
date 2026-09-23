import { WifiSlashIcon } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BET_MS, deng, handType, TURN_MS } from '../engine/pokDengEngine';
import type { Card, GameState, Outcome, Player } from '../types/pokdeng';

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
/** Cards in a hand overlap, leaving the corner index of each one visible. */
const OVERLAP = { seat: '-space-x-4 sm:-space-x-6 tall:-space-x-7', large: '-space-x-6 sm:-space-x-7 tall:-space-x-9' };
// Card motion, in ms. A dealt card flies from the deck face down, lands, waits FLIP_PAUSE, then turns over.
const FLY_MS = 650;
const FLIP_MS = 550;
const FLIP_PAUSE = 300;
const DEAL_STEP = 300; // between cards in the opening deal, one at a time round the table
const REVEALED = FLIP_PAUSE + FLIP_MS; // every hidden hand is face up this long after the round settles

const face = 'absolute inset-0 rounded-md shadow-md shadow-black/30 transition-opacity duration-500 [backface-visibility:hidden]';

/**
 * A card that can be dealt and turned over. With `dealDelay` it flies in face down from the deck (`data-deck`)
 * that many ms after it first appears, then turns face up `flipDelay` ms after landing. A face-down card ('??')
 * that later becomes known turns over `flipDelay` ms after that happens.
 */
function CardView({ card, size, dealDelay, flipDelay = 0 }: { card: Card; size: keyof typeof SIZE; dealDelay?: number; flipDelay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // Reduce Motion: nothing flies or turns over. A dealt card fades in face up at its turn, and a hidden card
  // that becomes known cross-fades.
  const [reduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [landsAt] = useState(() => (dealDelay === undefined ? 0 : Date.now() + dealDelay + (reduced ? 0 : FLY_MS)));
  const [shown, setShown] = useState<Card>(dealDelay === undefined || reduced ? card : '??');

  useLayoutEffect(() => {
    const el = ref.current!;
    if (dealDelay === undefined) return;
    if (reduced) {
      const fade = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, delay: dealDelay, fill: 'backwards' });
      return () => fade.cancel();
    }
    const deck = el.closest('[data-table]')?.querySelector('[data-deck]');
    if (!deck) return;
    const from = deck.getBoundingClientRect();
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const fly = el.animate(
      [{ transform: `translate(${dx}px, ${dy}px) rotate(25deg) scale(0.6)`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: 'none', opacity: 1 }],
      { duration: FLY_MS, delay: dealDelay, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)', fill: 'backwards' },
    );
    return () => fly.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (card === shown) return;
    const t = setTimeout(() => setShown(card), Math.max(0, landsAt - Date.now()) + flipDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);

  const red = shown[1] === 'h' || shown[1] === 'd';
  const suit = SUIT[shown[1] as keyof typeof SUIT];
  return (
    <div ref={ref} className={`${SIZE[size]} relative shrink-0 [perspective:800px]`}>
      <div
        className="relative size-full transition-transform ease-in-out [transform-style:preserve-3d]"
        style={{ transitionDuration: `${FLIP_MS}ms`, transform: shown === '??' && !reduced ? 'rotateY(180deg)' : undefined }}
      >
        <div style={{ opacity: reduced && shown === '??' ? 0 : 1 }} className={`${face} grid place-items-center bg-slate-50 leading-none font-semibold ${red ? 'text-rose-600' : 'text-slate-900'}`}>
          {shown !== '??' && (
            <>
              <span className="absolute top-0.5 left-0.5 flex flex-col items-center text-[0.6em] sm:top-1 sm:left-1">
                <span>{shown[0] === 'T' ? '10' : shown[0]}</span>
                <span>{suit}</span>
              </span>
              <span className="mt-2 text-[1.1em]">{suit}</span>
            </>
          )}
        </div>
        <div
          style={{ opacity: reduced && shown !== '??' ? 0 : 1 }}
          className={`${face} border border-yellow-200/20 bg-[repeating-linear-gradient(45deg,#854d0e_0_5px,#a16207_5px_10px)] ${reduced ? '' : '[transform:rotateY(180deg)]'}`}
        />
      </div>
    </div>
  );
}

/** Draining timer bar. CSS-only; keyed by deadline so it restarts each time. */
function TimerBar({ deadline, total, className }: { deadline: number; total: number; className: string }) {
  const elapsed = total - Math.max(0, deadline - Date.now());
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-slate-950 ring-1 ring-black/40 ${className}`} role="presentation">
      <div className="turn-timer h-full w-full" style={{ animationDuration: `${total}ms`, animationDelay: `-${elapsed}ms` }} />
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

const CHIP = <span className="size-4 shrink-0 rounded-full border-2 border-dashed border-amber-100 bg-amber-400 shadow-sm sm:size-5" aria-hidden />;

/** A chip stack with an amount. */
function Chips({ amount }: { amount: number }) {
  return (
    <div className="flex w-max items-center gap-1.5 rounded-full bg-slate-950/75 py-0.5 pr-2.5 pl-0.5 text-xs font-semibold text-slate-50 shadow shadow-black/40 sm:text-sm">
      {CHIP}
      <span className="font-mono">{amount}</span>
    </div>
  );
}

const OUTCOME: Record<Outcome, [string, string]> = {
  win: ['Win', 'bg-yellow-300 text-yellow-950'],
  push: ['Push', 'bg-slate-200 text-slate-900'],
  lose: ['Lose', 'bg-slate-950/75 text-slate-400'],
};

/** "Pok 9 · 2 deng", "Straight · 3 deng", "6"; nothing while any card is hidden. */
function handLabel(cards: Card[]) {
  if (!cards.length || cards.includes('??')) return null;
  const d = deng(cards);
  return `${handType(cards).name}${d > 1 ? ` · ${d} deng` : ''}`;
}

/** `dealDelay(i)`: when card i flies in. `labelDelay`: when the hand's name shows. */
function HandView({ cards, size, round, labelDelay, dealDelay }: { cards: Card[]; size: keyof typeof SIZE; round: number; labelDelay: number; dealDelay: (i: number) => number }) {
  const label = handLabel(cards);
  return (
    <div className="relative rounded-lg p-0.5">
      <div className={`flex ${OVERLAP[size]}`}>
        {cards.map((c, i) => (
          // Keyed by position, so a hidden card turns over in place when it's revealed.
          <CardView key={`${round}-${i}`} card={c} size={size} dealDelay={dealDelay(i)} flipDelay={FLIP_PAUSE} />
        ))}
      </div>
      {label && (
        <span
          key={label}
          style={{ animationDelay: `${labelDelay}ms` }}
          className="rise-in absolute -top-2 -right-3 rounded-full bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-slate-50 ring-1 ring-white/20 tall:text-xs"
        >
          {label}
        </span>
      )}
    </div>
  );
}

function Seat({ p, state, isHero, revealDelay, dealDelay, dealEnd }: { p: Player; state: GameState; isHero: boolean; revealDelay: number; dealDelay: (card: number) => number; dealEnd: number }) {
  const active = state.activeId === p.id && state.phase === 'playing';
  const deadline = active ? state.deadline : null;
  const betting = state.phase === 'betting' && !p.bet;
  const satOut = (state.phase === 'playing' || state.phase === 'settled') && !p.bet;
  const settled = p.outcome !== null;
  const [label, tone] = settled ? OUTCOME[p.outcome!] : ['', ''];
  return (
    <div className={`flex flex-col items-center transition-opacity duration-300 ${satOut || p.left ? 'opacity-45' : ''}`}>
      {p.cards.length > 0 && (
        <div className="mb-1.5 flex flex-col items-center gap-1">
          <HandView cards={p.cards} size={isHero ? 'large' : 'seat'} round={state.round} labelDelay={settled ? revealDelay - 200 : dealEnd} dealDelay={dealDelay} />
          {/* The chip animations centre on their anchor, so the chip sits absolutely in a fixed-height slot. */}
          <div className="relative h-6 w-full sm:h-7">
            {settled ? (
              <>
                {p.net < 0 && (
                  <div className="chip-lost absolute top-1/2 left-1/2" style={{ animationDelay: `${revealDelay}ms` }} aria-hidden>
                    <Chips amount={-p.net} />
                  </div>
                )}
                <div
                  className={`rise-in absolute inset-x-0 top-0 mx-auto w-max rounded-full px-2.5 py-0.5 text-xs font-semibold shadow shadow-black/40 sm:text-sm ${tone}`}
                  style={{ animationDelay: `${revealDelay}ms` }}
                >
                  {label}
                  {p.net !== 0 && <span className="font-mono"> {p.net > 0 ? `+${p.net}` : `−${-p.net}`}</span>}
                </div>
              </>
            ) : (
              <div key={`${state.round}-${p.bet}`} className="chip-from absolute top-1/2 left-1/2" style={{ '--dx': 0, '--dy': 6 } as CSSProperties}>
                <Chips amount={p.bet} />
              </div>
            )}
          </div>
        </div>
      )}
      <div
        className={`relative w-18 rounded-xl px-2 py-1 text-center shadow-lg shadow-black/40 transition duration-300 sm:w-24 sm:px-2.5 tall:w-32 tall:py-1.5 ${
          active ? 'bg-slate-900 ring-2 ring-yellow-300 shadow-yellow-400/20' : p.outcome === 'win' ? 'bg-yellow-950 ring-2 ring-yellow-400' : 'bg-slate-950/90 ring-1 ring-white/10'
        }`}
      >
        {deadline && <TimerBar key={`bar-${deadline}`} deadline={deadline} total={TURN_MS} className="absolute inset-x-2 -bottom-2.5" />}
        <div className="flex items-center justify-center gap-1 truncate text-xs font-medium text-slate-200 tall:text-sm">
          {!p.connected && <WifiSlashIcon size={12} weight="bold" className="shrink-0 text-rose-300" aria-label="Disconnected" />}
          <span className="truncate">{isHero ? 'You' : p.name}</span>
        </div>
        <div className="font-mono text-sm font-semibold text-slate-50 tall:text-base">{p.chips}</div>
        {deadline ? (
          <SecondsLeft key={`secs-${deadline}`} deadline={deadline} />
        ) : (
          (betting || satOut) && <div className="truncate text-[11px] text-slate-400 tall:text-xs">{betting ? 'Betting…' : 'Sitting out'}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Seat anchor (bottom centre of the seat) in percent of the table. Seats follow the curved edge of the table
 * from left to right, in the order they play; with many players the ends climb up the sides.
 */
function seatPoint(i: number, n: number) {
  const step = n > 1 ? Math.min(0.7, (Math.PI * 1.1) / (n - 1)) : 0;
  const angle = Math.PI / 2 + ((n - 1) / 2 - i) * step;
  return { x: 50 + 39 * Math.cos(angle), y: 40 + 50 * Math.sin(angle) };
}
const DEALER = { x: 50, y: 16 };

export default function PokDengTable({ state, heroId, invite }: Props) {
  // The opening deal goes one card at a time: each player in seat order, then the dealer, twice round.
  const players = state.players;
  const inPlay = players.filter((p) => p.bet > 0);
  const dealAt = (slot: number, round: number) => (round * (inPlay.length + 1) + slot) * DEAL_STEP;
  const dealEnd = dealAt(inPlay.length, 1) + FLY_MS + FLIP_PAUSE + FLIP_MS; // last card dealt and turned over
  // A third card flies in straight away.
  const playerDeal = (p: Player) => (card: number) => (card < 2 ? dealAt(inPlay.indexOf(p), card) : 0);

  // At settlement every hidden hand turns over, then the dealer's third card (if any) comes in; results wait
  // until the last card is face up. Worked out once per round so re-renders don't restart it.
  const dealerShown = useRef(0);
  const reveal = useRef({ round: -1, from: 0, delay: 0 });
  if (state.phase === 'settled' && reveal.current.round !== state.round) {
    const from = dealerShown.current;
    const drawn = state.dealer.length - from;
    const end = from === 0 ? dealEnd : REVEALED + (drawn > 0 ? FLY_MS + FLIP_PAUSE + FLIP_MS : 0); // from 0: dealt and settled at once (a dealer pok)
    reveal.current = { round: state.round, from, delay: end + 200 };
  }
  useEffect(() => {
    dealerShown.current = state.dealer.length;
  });
  const settled = state.phase === 'settled';
  const { from, delay } = settled ? reveal.current : { from: state.dealer.length, delay: 0 };
  const queuePos = state.queue.findIndex((q) => q.id === heroId);
  const dealerLabel = handLabel(state.dealer);

  return (
    <div data-table className="relative mx-auto h-full max-h-[56rem] w-full max-w-5xl [container-type:size]">
      <div className="table-felt absolute inset-x-[7%] top-[2%] bottom-[8%] rounded-t-[3rem] rounded-b-[50%] border-8 border-amber-950 shadow-[inset_0_0_48px_rgba(2,6,23,.55),0_24px_60px_-20px_rgba(2,6,23,.8)] tall:border-[12px]" />

      {/* The deck cards are dealt from, at the dealer's left. */}
      <div data-deck aria-hidden className="absolute top-[7%] left-[78%] size-0" />

      {state.dealer.length > 0 && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${DEALER.x}%`, top: `${DEALER.y}%` }}>
          <div className="relative flex gap-1 sm:gap-1.5">
            {state.dealer.map((c, i) => (
              <CardView
                key={`${state.round}-${i}`}
                card={c}
                size="large"
                dealDelay={settled && from > 0 ? REVEALED + (i - from) * DEAL_STEP : i < 2 ? dealAt(inPlay.length, i) : 0}
                flipDelay={FLIP_PAUSE}
              />
            ))}
            {dealerLabel && (
              <span
                key={`${state.round}-${dealerLabel}`}
                className="rise-in absolute -top-2 -right-3 rounded-full bg-slate-950 px-2 py-0.5 font-mono text-xs font-semibold whitespace-nowrap text-slate-50 ring-1 ring-white/20 tall:text-sm"
                style={{ animationDelay: `${settled ? delay - 200 : dealEnd}ms` }}
              >
                {dealerLabel}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-[30%] flex flex-col items-center text-center">
        {!state.started ? (
          <div className="rise-in flex flex-col items-center gap-2">
            {invite}
            <p className="text-xs text-yellow-50/70 sm:text-sm">
              {players.length} seated{state.queue.length > 0 && `, ${state.queue.length} in queue`}
            </p>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-semibold tracking-[0.25em] text-yellow-100/55 uppercase sm:text-xs tall:text-sm">Pok 8 and 9 win on two cards</p>
            <p className="mt-0.5 text-[10px] tracking-wider text-yellow-100/45 uppercase sm:text-xs">
              Dealer draws on 4 or less · Minimum bet <span className="font-mono">{state.config.minBet}</span>
            </p>
            {state.phase === 'betting' && state.deadline && (
              <div className="rise-in mt-3 flex w-40 flex-col items-center gap-1.5 sm:w-52">
                <p className="text-sm font-semibold text-yellow-50 sm:text-base">Place your bets</p>
                <TimerBar key={`bet-${state.deadline}`} deadline={state.deadline} total={BET_MS} className="w-full" />
              </div>
            )}
            {state.phase === 'waiting' && <p className="mt-3 text-sm text-yellow-50/80">{state.botMatch && players.length === 1 && !state.queue.length ? `${players[0].name} wins the match!` : 'Waiting for players…'}</p>}
          </>
        )}
      </div>

      {players.map((p, i) => {
        const point = seatPoint(i, players.length);
        return (
          <div key={p.id} className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${point.x}%`, top: `${point.y}%` }}>
            <Seat p={p} state={state} isHero={p.id === heroId} revealDelay={delay} dealDelay={playerDeal(p)} dealEnd={dealEnd} />
          </div>
        );
      })}

      {/* Winnings slide from the dealer to each winner's seat. */}
      {settled &&
        players.flatMap((p, i) => {
          if (p.net <= 0) return [];
          const point = seatPoint(i, players.length);
          const travel = { '--dx': point.x - DEALER.x, '--dy': point.y - 8 - DEALER.y, animationDelay: `${delay + 400}ms` } as CSSProperties;
          return (
            <div key={`${state.round}-${p.id}`} aria-hidden className="pot-to-winner pointer-events-none absolute" style={{ left: `${DEALER.x}%`, top: `${DEALER.y}%`, ...travel }}>
              <Chips amount={p.bet + p.net} />
            </div>
          );
        })}

      {state.queue.length > 0 && queuePos < 0 && (
        <p className="absolute top-1 left-3 text-xs text-slate-400 tall:text-sm">In queue: {state.queue.map((q) => q.name).join(', ')}</p>
      )}
    </div>
  );
}
