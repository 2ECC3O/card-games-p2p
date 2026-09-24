import { useState } from 'react';
import { legalActions } from '../engine/pokerEngine';
import type { GameState, PlayerAction } from '../types/poker';
import { button } from '../../../shared/ui';

interface Props {
  state: GameState;
  heroId: string;
  onAction: (action: PlayerAction) => void;
}

export default function ActionControls({ state, heroId, onAction }: Props) {
  const legal = legalActions(state, heroId);
  const hero = state.players.find((p) => p.id === heroId)!;
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

  const big = 'min-h-12 flex-1 px-3 text-base sm:min-h-14 sm:text-lg';
  const quick = `${button.quiet} min-h-11 px-3 text-sm`;

  return (
    <div className="rise-in mx-auto max-w-2xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
      {legal.canRaise && (
        <div className="mb-2 flex items-center gap-2">
          <input
            type="range"
            aria-label="Raise amount"
            className="h-11 min-w-0 flex-1 cursor-pointer accent-emerald-400"
            min={legal.minRaiseTo}
            max={legal.maxRaiseTo}
            step={state.blinds.small}
            value={amount}
            onChange={(e) => setAmount(clamp(Number(e.target.value)))}
          />
          <button onClick={() => setAmount(potRaise(0.5))} className={quick}>
            ½ pot
          </button>
          <button onClick={() => setAmount(potRaise(1))} className={quick}>
            Pot
          </button>
          <button onClick={() => setAmount(legal.maxRaiseTo)} className={quick}>
            Max
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button disabled={sent} onClick={() => send({ type: 'fold' })} className={`${button.quiet} ${big}`}>
          Fold
        </button>
        {legal.canCheck ? (
          <button disabled={sent} onClick={() => send({ type: 'check' })} className={`${button.secondary} ${big}`}>
            Check
          </button>
        ) : (
          <button disabled={sent} onClick={() => send({ type: 'call' })} className={`${button.secondary} ${big}`}>
            {legal.callAmount === hero.chips ? 'All-in' : 'Call'} <span className="font-mono">{legal.callAmount}</span>
          </button>
        )}
        {legal.canRaise && (
          <button disabled={sent} onClick={() => send({ type: 'raise', amount })} className={`${button.primary} ${big}`}>
            {amount === legal.maxRaiseTo ? 'All-in' : state.currentBet === 0 ? 'Bet' : 'Raise to'} <span className="font-mono">{amount}</span>
          </button>
        )}
      </div>
    </div>
  );
}
