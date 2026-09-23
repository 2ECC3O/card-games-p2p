import { useState } from 'react';
import type { GameState, PlayerAction } from '../types/pokdeng';
import { button } from './ui';

interface Props {
  state: GameState;
  heroId: string;
  onAction: (action: PlayerAction) => void;
}

const big = 'min-h-12 flex-1 px-3 text-base sm:min-h-14 sm:text-lg';
const wrap = 'rise-in mx-auto max-w-2xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5';

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

export function BetControls({ state, heroId, onAction }: Props) {
  const hero = state.players.find((p) => p.id === heroId)!;
  const min = state.config.minBet;
  const clamp = (v: number) => Math.max(min, Math.min(hero.chips, Math.round(v)));
  const [amount, setAmount] = useState(() => clamp(hero.lastBet));
  const [sent, send] = useSendOnce(onAction);
  const quick = `${button.quiet} min-h-11 px-3 text-sm`;

  return (
    <div className={wrap}>
      <div className="mb-2 flex items-center gap-2">
        <input
          type="range"
          aria-label="Bet amount"
          className="h-11 min-w-0 flex-1 cursor-pointer accent-yellow-400"
          min={min}
          max={hero.chips}
          step={min}
          value={amount}
          onChange={(e) => setAmount(clamp(Number(e.target.value)))}
        />
        <button onClick={() => setAmount(min)} className={quick}>
          Min
        </button>
        <button onClick={() => setAmount(clamp(amount * 2))} className={quick}>
          ×2
        </button>
        <button onClick={() => setAmount(hero.chips)} className={quick}>
          Max
        </button>
      </div>
      <div className="flex">
        <button disabled={sent} onClick={() => send({ type: 'bet', amount })} className={`${button.primary} ${big}`}>
          {amount === hero.chips ? 'All-in' : 'Bet'} <span className="font-mono">{amount}</span>
        </button>
      </div>
    </div>
  );
}

export function PlayControls({ onAction }: Pick<Props, 'onAction'>) {
  const [sent, send] = useSendOnce(onAction);
  return (
    <div className={`${wrap} flex gap-2`}>
      <button disabled={sent} onClick={() => send({ type: 'stay' })} className={`${button.secondary} ${big}`}>
        Stay
      </button>
      <button disabled={sent} onClick={() => send({ type: 'draw' })} className={`${button.primary} ${big}`}>
        Draw a card
      </button>
    </div>
  );
}
