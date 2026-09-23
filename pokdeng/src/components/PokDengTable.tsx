import { WifiSlashIcon } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BET_MS, deng, handType, TURN_MS } from '../engine/pokDengEngine';
import type { Card, GameState, Hand, Outcome, Player } from '../types/pokdeng';

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

/** Where a hand was placed, when it isn't its owner's own spot. */
const spotName = (s: GameState, h: Hand) =>
  h.spot === 'last' ? 'Last, after the dealer' : h.spot === 'seat' ? null : `Cut in: ${s.players.find((p) => p.id === h.spot)?.name ?? 'seat'}`;

/** One hand (ขา): its cards, its name once known, where it sits if it cut in, and its stake or result. */
function HandView({ hand, state, size, active, revealDelay, labelDelay, dealDelay }: {
  hand: Hand; state: GameState; size: keyof typeof SIZE; active: boolean; revealDelay: number; labelDelay: number; dealDelay: (card: number) => number;
}) {
  const label = handLabel(hand.cards);
  const [result, tone] = hand.outcome ? OUTCOME[hand.outcome] : ['', ''];
  const where = spotName(state, hand);
  return (
    <div className="flex min-w-16 flex-col items-center gap-1">
      {hand.cards.length > 0 && (
        <div className={`relative rounded-lg p-0.5 transition ${active ? 'ring-2 ring-yellow-300' : ''}`}>
          <div className={`flex ${OVERLAP[size]}`}>
            {hand.cards.map((c, i) => (
              // Keyed by position, so a hidden card turns over in place when it's revealed.
              <CardView key={`${state.round}-${i}`} card={c} size={size} dealDelay={dealDelay(i)} flipDelay={FLIP_PAUSE} />
            ))}
          </div>
        </div>
      )}
      {label && (
        <span
          key={label}
          style={{ animationDelay: `${labelDelay}ms` }}
          className="rise-in rounded-full bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-slate-50 ring-1 ring-white/20 tall:text-xs"
        >
          {label}
        </span>
      )}
      {where && <span className="max-w-24 truncate text-[10px] text-yellow-100/80 tall:text-xs">{where}</span>}
      {/* The chip animations centre on their anchor, so the chip sits absolutely in a fixed-height slot. */}
      <div className="relative h-6 w-full sm:h-7">
        {hand.outcome ? (
          <>
            {hand.net < 0 && (
              <div className="chip-lost absolute top-1/2 left-1/2" style={{ animationDelay: `${revealDelay}ms` }} aria-hidden>
                <Chips amount={-hand.net} />
              </div>
            )}
            <div
              className={`rise-in absolute inset-x-0 top-0 mx-auto w-max rounded-full px-2.5 py-0.5 text-xs font-semibold shadow shadow-black/40 sm:text-sm ${tone}`}
              style={{ animationDelay: `${revealDelay}ms` }}
            >
              {result}
              {hand.net !== 0 && <span className="font-mono"> {hand.net > 0 ? `+${hand.net}` : `−${-hand.net}`}</span>}
            </div>
          </>
        ) : (
          <div key={`${state.round}-${hand.bet}`} className="chip-from absolute top-1/2 left-1/2" style={{ '--dx': 0, '--dy': 6 } as CSSProperties}>
            <Chips amount={hand.bet} />
          </div>
        )}
      </div>
    </div>
  );
}

/** The dealer's cards and, once known, their hand. */
function DealerHand({ state, size, dealDelay, labelDelay }: { state: GameState; size: keyof typeof SIZE; dealDelay: (card: number) => number; labelDelay: number }) {
  const label = handLabel(state.dealer);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`flex ${OVERLAP[size]}`}>
        {state.dealer.map((c, i) => (
          // Keyed by position, so a hidden card turns over in place when it's revealed.
          <CardView key={`${state.round}-${i}`} card={c} size={size} dealDelay={dealDelay(i)} flipDelay={FLIP_PAUSE} />
        ))}
      </div>
      {label && (
        <span
          key={`${state.round}-${label}`}
          className="rise-in rounded-full bg-slate-950 px-2 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-slate-50 ring-1 ring-white/20 sm:text-xs tall:text-sm"
          style={{ animationDelay: `${labelDelay}ms` }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function Seat({ p, state, isHero, revealDelay, dealDelay, dealEnd, dealerHand, top }: {
  p: Player; state: GameState; isHero: boolean; revealDelay: number; dealDelay: (hand: Hand, card: number) => number; dealEnd: number;
  /** The dealer's cards, shown at this seat when it deals. */
  dealerHand: ReactNode;
  /** In the top half of the table: cards go below the name, towards the middle. */
  top: boolean;
}) {
  const hands = state.hands.filter((h) => h.owner === p.id);
  const banker = state.bankerId === p.id;
  const active = state.phase === 'playing' && state.activeId === p.id;
  const deadline = active ? state.deadline : null;
  const betting = state.phase === 'betting' && !banker && !p.ready;
  const satOut = !banker && (state.phase === 'playing' || state.phase === 'settled') && !hands.length;
  // The dealer's result is the other side of every hand.
  const net = banker ? -state.hands.reduce((n, h) => n + h.net, 0) : hands.reduce((n, h) => n + h.net, 0);
  const won = state.phase === 'settled' && net > 0;
  return (
    <div className={`flex ${top ? 'flex-col-reverse' : 'flex-col'} items-center gap-1.5 transition-opacity duration-300 ${satOut || p.left ? 'opacity-45' : ''}`}>
      {banker && state.dealer.length > 0 && dealerHand}
      {hands.length > 0 && (
        <div className="flex items-end gap-1 sm:gap-2">
          {hands.map((h) => (
            <HandView
              key={h.id}
              hand={h}
              state={state}
              size={isHero && hands.length === 1 ? 'large' : 'seat'}
              active={state.activeHand === h.id && hands.length > 1}
              revealDelay={revealDelay}
              labelDelay={h.outcome ? revealDelay - 200 : dealEnd}
              dealDelay={(card) => dealDelay(h, card)}
            />
          ))}
        </div>
      )}
      <div
        className={`relative w-18 rounded-xl px-2 py-1 text-center shadow-lg shadow-black/40 transition duration-300 sm:w-24 sm:px-2.5 tall:w-32 tall:py-1.5 ${
          active ? 'bg-slate-900 ring-2 ring-yellow-300 shadow-yellow-400/20' : won ? 'bg-yellow-950 ring-2 ring-yellow-400' : 'bg-slate-950/90 ring-1 ring-white/10'
        }`}
      >
        {banker && (
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-yellow-300 px-2 text-[10px] font-bold tracking-wide text-yellow-950 uppercase shadow">Dealer</span>
        )}
        {deadline && <TimerBar key={`bar-${deadline}`} deadline={deadline} total={TURN_MS} className="absolute inset-x-2 -bottom-2.5" />}
        <div className="flex items-center justify-center gap-1 truncate text-xs font-medium text-slate-200 tall:text-sm">
          {!p.connected && <WifiSlashIcon size={12} weight="bold" className="shrink-0 text-rose-300" aria-label="Disconnected" />}
          <span className="truncate">{isHero ? 'You' : p.name}</span>
        </div>
        <div className="font-mono text-sm font-semibold text-slate-50 tall:text-base">{p.chips}</div>
        {banker && state.phase === 'settled' && net !== 0 && (
          <div className={`rise-in font-mono text-[11px] font-semibold tall:text-xs ${net > 0 ? 'text-yellow-200' : 'text-rose-300'}`} style={{ animationDelay: `${revealDelay}ms` }}>
            {net > 0 ? `+${net}` : `−${-net}`}
          </div>
        )}
        {deadline ? (
          <SecondsLeft key={`secs-${deadline}`} deadline={deadline} />
        ) : (
          (betting || satOut) && <div className="truncate text-[11px] text-slate-400 tall:text-xs">{betting ? 'Betting…' : 'Sitting out'}</div>
        )}
      </div>
    </div>
  );
}

/** Seat centre, in % of the table from its middle. You sit at the bottom; the others follow clockwise round the oval. */
function seatPoint(i: number, n: number) {
  const angle = Math.PI / 2 + (i * 2 * Math.PI) / n;
  // Narrower than the felt so side seats stay on screen; seats near 3 and 9 o'clock move up or down clear of the middle.
  const sin = Math.sin(angle);
  return { x: 38 * Math.cos(angle), y: 42 * Math.sign(sin || 1) * Math.max(Math.abs(sin), 0.35) };
}
const at = ({ x, y }: { x: number; y: number }) => ({ left: `${50 + x}%`, top: `${50 + y}%` });
/** Where the app sits when it deals alone: the top of the table. */
const HOUSE = { x: 0, y: -30 };

export default function PokDengTable({ state, heroId, invite }: Props) {
  const players = state.players;
  const { hands } = state;
  // The deal goes one card at a time in dealing order: the seated hands, the dealer, then the hands that sit last.
  const dealerSlot = hands.filter((h) => h.spot !== 'last').length;
  const slots = hands.length + 1;
  const slotOf = (h: Hand) => hands.indexOf(h) + (h.spot === 'last' ? 1 : 0);
  const dealAt = (slot: number, round: number) => (round * slots + slot) * DEAL_STEP;
  const dealEnd = dealAt(slots - 1, 1) + FLY_MS + FLIP_PAUSE + FLIP_MS; // last card dealt and turned over
  const handDeal = (h: Hand, card: number) => (card < 2 ? dealAt(slotOf(h), card) : 0); // a drawn card flies in straight away

  // At settlement every hidden hand turns over and the dealer's third card (if any) comes in; results wait until the
  // last card is face up. Worked out once per round so re-renders don't restart it.
  const dealerShown = useRef(0);
  const reveal = useRef({ round: -1, from: 0, delay: 0 });
  if (state.phase === 'settled' && reveal.current.round !== state.round) {
    const from = dealerShown.current;
    const drawn = state.dealer.length - from;
    const end = from === 0 ? dealEnd : REVEALED + (drawn > 0 ? FLY_MS + FLIP_PAUSE + FLIP_MS : 0); // from 0: dealt and settled at once (a dealer Pok)
    reveal.current = { round: state.round, from, delay: end + 200 };
  }
  useEffect(() => {
    dealerShown.current = state.dealer.length;
  });
  const settled = state.phase === 'settled';
  const { from, delay } = settled ? reveal.current : { from: state.dealer.length, delay: REVEALED + 200 }; // mid-round: hands just caught
  const queuePos = state.queue.findIndex((q) => q.id === heroId);

  const heroIndex = Math.max(0, players.findIndex((p) => p.id === heroId));
  const ordered = [...players.slice(heroIndex), ...players.slice(0, heroIndex)]; // you first, then clockwise
  const pointOf = (id: string | null) => (id && ordered.some((p) => p.id === id) ? seatPoint(ordered.findIndex((p) => p.id === id), ordered.length) : HOUSE);
  const dealerAt = pointOf(state.bankerId);
  const dealerHand = (size: keyof typeof SIZE) => (
    <DealerHand
      state={state}
      size={size}
      dealDelay={(i) => (settled && from > 0 ? REVEALED + (i - from) * DEAL_STEP : i < 2 ? dealAt(dealerSlot, i) : 0)}
      labelDelay={settled ? delay - 200 : state.caught ? REVEALED : dealEnd}
    />
  );

  return (
    <div data-table className="relative mx-auto h-full max-h-[56rem] w-full max-w-5xl [container-type:size]">
      <div className="table-felt absolute inset-x-[9%] inset-y-[13%] rounded-[50%] border-8 border-amber-950 shadow-[inset_0_0_48px_rgba(2,6,23,.55),0_24px_60px_-20px_rgba(2,6,23,.8)] tall:border-[12px]" />

      {/* Cards are dealt from the middle of the table. */}
      <div data-deck aria-hidden className="absolute top-1/2 left-1/2 size-0" />

      {/* Alone at the table, the app deals from the top. */}
      {state.started && !state.bankerId && (
        <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1" style={at(HOUSE)}>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-yellow-100/70 uppercase sm:text-xs">The house deals</p>
          {dealerHand('large')}
        </div>
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {!state.started ? (
          <div className="rise-in flex flex-col items-center gap-2">
            {invite}
            <p className="text-xs text-yellow-50/70 sm:text-sm">
              {players.length} seated{state.queue.length > 0 && `, ${state.queue.length} in queue`}
            </p>
          </div>
        ) : (
          <div className="flex max-w-[50cqw] flex-col items-center">
            <p className="text-[10px] font-semibold tracking-[0.25em] text-yellow-100/55 uppercase sm:text-xs tall:text-sm">Pok 8 and 9 win on two cards</p>
            <p className="mt-0.5 text-[10px] tracking-wider text-yellow-100/45 uppercase sm:text-xs">
              Minimum bet <span className="font-mono">{state.config.minBet}</span>
              {state.maxBet !== null && <> · Limit <span className="font-mono">{state.maxBet}</span></>}
              {state.caught && <> · Caught the {state.caught}-card hands</>}
            </p>
            {state.phase === 'betting' && state.deadline && (
              <div className="rise-in mt-3 flex w-40 flex-col items-center gap-1.5 sm:w-52">
                <p className="text-sm font-semibold text-yellow-50 sm:text-base">Place your bets</p>
                <TimerBar key={`bet-${state.deadline}`} deadline={state.deadline} total={BET_MS} className="w-full" />
              </div>
            )}
            {state.phase === 'waiting' && <p className="mt-3 text-sm text-yellow-50/80">{state.botMatch && players.length === 1 && !state.queue.length ? `${players[0].name} wins the match!` : 'Waiting for players…'}</p>}
          </div>
        )}
      </div>

      {ordered.map((p, i) => {
        const point = seatPoint(i, ordered.length);
        return (
          <div
            key={p.id}
            // Your seat hangs from the table's bottom edge, so it never covers the controls; seats along the top hang
            // from near their name, so their cards stay on the table instead of under the header.
            className={`absolute -translate-x-1/2 ${i === 0 ? '-translate-y-full' : point.y < -30 ? '-translate-y-6' : '-translate-y-1/2'}`}
            style={i === 0 ? { left: '50%', top: '100%' } : at(point)}
          >
            <Seat p={p} state={state} isHero={p.id === heroId} revealDelay={delay} dealDelay={handDeal} dealEnd={dealEnd} dealerHand={dealerHand(i === 0 ? 'large' : 'seat')} top={i > 0 && point.y < 0} />
          </div>
        );
      })}

      {/* Winnings slide from the dealer to each winning hand's seat. */}
      {settled &&
        hands.flatMap((h) => {
          if (h.net <= 0 || !ordered.some((p) => p.id === h.owner)) return [];
          const to = pointOf(h.owner);
          const travel = { '--dx': to.x - dealerAt.x, '--dy': to.y - dealerAt.y, animationDelay: `${delay + 400}ms` } as CSSProperties;
          return (
            <div key={`${state.round}-${h.id}`} aria-hidden className="pot-to-winner pointer-events-none absolute" style={{ ...at(dealerAt), ...travel }}>
              <Chips amount={h.bet + h.net} />
            </div>
          );
        })}

      {state.queue.length > 0 && queuePos < 0 && (
        <p className="absolute top-1 left-3 text-xs text-slate-400 tall:text-sm">In queue: {state.queue.map((q) => q.name).join(', ')}</p>
      )}
    </div>
  );
}
