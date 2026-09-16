import { useState } from 'react';
import { legalActions, TURN_MS } from '../engine/pokerEngine';
import type { GameState, PlayerAction } from '../types/poker';

interface Props {
  state: GameState;
  heroId: string;
  onAction: (action: PlayerAction) => void;
}

export default function ActionControls({ state, heroId, onAction }: Props) {
  const legal = legalActions(state, heroId);
  const [amount, setAmount] = useState(legal.minRaiseTo);
  const [sent, setSent] = useState(false); // one action per turn; the component is keyed by turn

  const pot = state.players.reduce((n, p) => n + p.committed, 0);
  const clamp = (v: number) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(v)));
  const potRaise = (fraction: number) => clamp(state.currentBet + (pot + legal.callAmount) * fraction);
  const send = (action: PlayerAction) => {
    if (sent) return;
    setSent(true);
    onAction(action);
  };

  const elapsed = TURN_MS - Math.max(0, (state.turnDeadline ?? 0) - Date.now());
  const btn = 'min-h-12 flex-1 rounded-xl font-bold disabled:opacity-40';

  return (
    <div className="mx-auto max-w-xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-slate-800">
        <div className="turn-timer h-full w-full" style={{ animationDuration: `${TURN_MS}ms`, animationDelay: `-${elapsed}ms` }} />
      </div>

      {legal.canRaise && (
        <div className="mb-2 flex items-center gap-2">
          <input
            type="range"
            aria-label="Raise amount"
            className="min-w-0 flex-1 accent-emerald-400"
            min={legal.minRaiseTo}
            max={legal.maxRaiseTo}
            step={state.blinds.small}
            value={amount}
            onChange={(e) => setAmount(clamp(Number(e.target.value)))}
          />
          <button onClick={() => setAmount(potRaise(0.5))} className="rounded-lg bg-slate-800 px-2 py-1.5 text-xs">½ pot</button>
          <button onClick={() => setAmount(potRaise(1))} className="rounded-lg bg-slate-800 px-2 py-1.5 text-xs">Pot</button>
          <button onClick={() => setAmount(legal.maxRaiseTo)} className="rounded-lg bg-slate-800 px-2 py-1.5 text-xs">Max</button>
        </div>
      )}

      <div className="flex gap-2">
        <button disabled={sent} onClick={() => send({ type: 'fold' })} className={`${btn} bg-rose-600`}>
          Fold
        </button>
        {legal.canCheck ? (
          <button disabled={sent} onClick={() => send({ type: 'check' })} className={`${btn} bg-slate-600`}>
            Check
          </button>
        ) : (
          <button disabled={sent} onClick={() => send({ type: 'call' })} className={`${btn} bg-sky-500 text-slate-950`}>
            {legal.callAmount === legal.maxRaiseTo - state.players.find((p) => p.id === heroId)!.bet ? 'All-in' : 'Call'} {legal.callAmount}
          </button>
        )}
        {legal.canRaise && (
          <button disabled={sent} onClick={() => send({ type: 'raise', amount })} className={`${btn} bg-emerald-500 text-slate-950`}>
            {amount === legal.maxRaiseTo ? 'All-in' : state.currentBet === 0 ? 'Bet' : 'Raise to'} {amount}
          </button>
        )}
      </div>
    </div>
  );
}
