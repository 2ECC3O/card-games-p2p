import { useState } from 'react';
import { catchable, handsOf, LIMITS, MAX_LEGS, mustDraw, score } from '../engine/pokDengEngine';
import type { GameState, PlayerAction } from '../types/pokdeng';
import { button, field } from './ui';

interface Props {
  state: GameState;
  heroId: string;
  onAction: (action: PlayerAction) => void;
}

const big = 'min-h-12 flex-1 px-3 text-base sm:min-h-14 sm:text-lg';
const wrap = 'rise-in mx-auto max-w-2xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5';
const quick = `${button.quiet} min-h-11 px-3 text-sm`;

/** One action per decision; the parent keys these components by decision. */
function useSendOnce(onAction: Props['onAction']) {
  const [sent, setSent] = useState(false);
  const send = (action: PlayerAction) => {
    if (sent) return;
    setSent(true);
    onAction(action);
  };
  return [sent, send] as const;
}

/** Bet on up to three hands (ขา): at your seat, cut in before another player, or last after the dealer. */
export function BetControls({ state, heroId, onAction }: Props) {
  const hero = state.players.find((p) => p.id === heroId)!;
  const mine = handsOf(state, heroId);
  const min = state.config.minBet;
  const max = Math.min(hero.chips, state.maxBet ?? Infinity);
  const [wanted, setAmount] = useState(hero.lastBet);
  const amount = Math.max(min, Math.min(max, Math.round(wanted)));
  const [spot, setSpot] = useState('seat');
  const others = state.players.filter((p) => p.id !== heroId && p.id !== state.bankerId);
  const canBet = max >= min && mine.length < MAX_LEGS;
  const bet = (ready: boolean) => onAction({ type: 'bet', amount, spot, ready });

  return (
    <div className={wrap}>
      {canBet && (
        <div className="mb-2 flex items-center gap-2">
          <input
            type="range"
            aria-label="Bet amount"
            className="h-11 min-w-0 flex-1 cursor-pointer accent-yellow-400"
            min={min}
            max={max}
            step={min}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <button onClick={() => setAmount(min)} className={quick}>Min</button>
          <button onClick={() => setAmount(amount * 2)} className={quick}>×2</button>
          <button onClick={() => setAmount(max)} className={quick}>Max</button>
        </div>
      )}
      <div className="mb-2 flex items-center gap-2">
        {canBet && (
          <select aria-label="Where this hand sits" className={`${field} min-h-11 min-w-0 flex-1 py-2`} value={spot} onChange={(e) => setSpot(e.target.value)}>
            <option value="seat">At my seat</option>
            {others.map((p) => <option key={p.id} value={p.id}>Cut in before {p.name}</option>)}
            <option value="last">Last, after the dealer</option>
          </select>
        )}
        {mine.length > 0 ? (
          <span className="shrink-0 text-sm text-slate-300">
            {mine.length} hand{mine.length > 1 && 's'}: <span className="font-mono">{mine.map((h) => h.bet).join(' + ')}</span>
          </span>
        ) : !canBet && <span className="text-sm text-slate-300">Not enough chips for the dealer's limit.</span>}
      </div>
      <div className="flex gap-2">
        {mine.length ? (
          <button onClick={() => onAction({ type: 'clear' })} className={`${button.quiet} min-h-12 px-4`}>Clear</button>
        ) : (
          <button onClick={() => onAction({ type: 'ready' })} className={`${button.quiet} min-h-12 px-4`}>Sit out</button>
        )}
        {canBet && (
          <button onClick={() => bet(false)} className={`${button.quiet} ${big}`}>
            + Hand <span className="font-mono text-sm text-slate-300">{amount}</span>
          </button>
        )}
        {mine.length ? (
          <button onClick={() => onAction({ type: 'ready' })} className={`${button.primary} ${big}`}>Deal me in</button>
        ) : (
          canBet && (
            <button onClick={() => bet(true)} className={`${button.primary} ${big}`}>
              {amount === hero.chips ? 'All-in' : 'Bet'} <span className="font-mono">{amount}</span>
            </button>
          )
        )}
      </div>
    </div>
  );
}

/** The dealer's betting-time control: a limit on each hand's bet (อั้น). */
export function LimitControls({ state, onAction }: Omit<Props, 'heroId'>) {
  const min = state.config.minBet;
  const options = [null, ...LIMITS.map((x) => x * min)];
  return (
    <div className={wrap}>
      <p className="mb-2 text-center text-sm text-slate-300">You're the dealer this round. Set a bet limit if you like; the others are betting.</p>
      <div className="grid grid-cols-5 gap-1 rounded-xl bg-slate-950/60 p-1 ring-1 ring-white/10" role="group" aria-label="Bet limit">
        {options.map((o) => (
          <button
            key={o ?? 'none'}
            aria-pressed={state.maxBet === o}
            onClick={() => onAction({ type: 'limit', amount: o })}
            className="min-h-11 rounded-lg font-mono text-sm font-medium text-slate-300 transition aria-pressed:bg-slate-100 aria-pressed:text-slate-900 hover:text-slate-50"
          >
            {o ?? 'None'}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A player's turn on one of their hands: draw one card or stay. */
export function PlayControls({ state, heroId, onAction }: Props) {
  const [sent, send] = useSendOnce(onAction);
  const mine = handsOf(state, heroId);
  const hand = state.hands.find((h) => h.id === state.activeHand)!;
  const forced = mustDraw(state, hand);
  return (
    <div className={wrap}>
      {mine.length > 1 && <p className="mb-1.5 text-center text-sm text-slate-300">Hand {mine.indexOf(hand) + 1} of {mine.length} · score {score(hand.cards)}</p>}
      <div className="flex gap-2">
        <button disabled={sent || forced} onClick={() => send({ type: 'stay' })} className={`${button.secondary} ${big} flex-col gap-0 leading-tight`}>
          Stay
          {forced && <span className="text-[11px] font-normal sm:text-xs">Under 4: must draw</span>}
        </button>
        <button disabled={sent} onClick={() => send({ type: 'draw' })} className={`${button.primary} ${big}`}>Draw a card</button>
      </div>
    </div>
  );
}

/** The dealer's turn: catch (จับ) one group on two cards, then draw or stay against the rest. */
export function DealerControls({ state, onAction }: Omit<Props, 'heroId'>) {
  const [sent, send] = useSendOnce(onAction);
  const canCatch = !state.caught && state.dealer.length === 2;
  const drew = catchable(state, 3).length, stayed = catchable(state, 2).length;
  return (
    <div className={wrap}>
      <p className="mb-1.5 text-center text-sm text-slate-300">
        Your turn to deal · you have <span className="font-mono font-semibold text-slate-50">{score(state.dealer)}</span>
      </p>
      {canCatch && (drew > 0 || stayed > 0) && (
        <div className="mb-2 flex gap-2">
          {[[3, drew, 'drew'], [2, stayed, 'stayed']].map(([n, count, verb]) => (
            <button key={n} disabled={sent || !count} onClick={() => send({ type: 'catch', cards: n as 2 | 3 })} className={`${button.quiet} min-h-12 flex-1 flex-col gap-0 px-2 leading-tight`}>
              Catch {n}-card hands
              <span className="text-[11px] font-normal text-slate-300 sm:text-xs">{count} that {verb}, on your 2 cards</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button disabled={sent} onClick={() => send({ type: 'stay' })} className={`${button.secondary} ${big}`}>Stay</button>
        <button disabled={sent || state.dealer.length > 2} onClick={() => send({ type: 'draw' })} className={`${button.primary} ${big}`}>Draw a card</button>
      </div>
    </div>
  );
}
