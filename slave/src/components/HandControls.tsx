import { useState } from 'react';
import { beats } from '../engine/slaveEngine';
import type { Card, GameState, PlayerAction } from '../types/slave';
import { CardFace, cardsText } from './SlaveTable';
import { button } from './ui';

interface Props {
  state: GameState;
  heroId: string;
  onAction: (action: PlayerAction) => void;
  /** Shown when there's nothing for you to do. */
  status: string;
}

/** Your hand: tap cards to pick them, then play, pass or (in the exchange) give them. */
export default function HandControls({ state, heroId, onAction, status }: Props) {
  const me = state.players.find((p) => p.id === heroId)!;
  const [picked, setPicked] = useState<Card[]>([]);
  // One send per decision: a double tap would otherwise play into the next player's turn.
  const decision = `${state.round}-${state.phase}-${state.activeId}-${state.pile?.cards.join()}-${state.passed.length}`;
  const [sent, setSent] = useState<string | null>(null);
  const chosen = picked.filter((c) => me.hand.includes(c));
  const give = state.phase === 'exchange' ? state.gives.find((g) => g.from === heroId && !g.cards.length) : undefined;
  const myTurn = state.phase === 'playing' && state.activeId === heroId;
  const pile = state.pile?.cards ?? null;
  const ready = sent !== decision && (give ? chosen.length === give.count : myTurn && beats(chosen, pile));
  const send = (action: PlayerAction) => {
    setSent(decision);
    setPicked([]);
    onAction(action);
  };
  const toggle = (c: Card) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...chosen, c]));
  const receiver = give && state.players.find((p) => p.id === give.to)?.name;
  const hint = give
    ? `Pick ${give.count} card${give.count > 1 ? 's' : ''} to give ${receiver}`
    : myTurn
      ? pile
        ? `Beat ${cardsText(pile)}: ${pile.length === 1 ? 'a higher card or any three of a kind' : pile.length === 2 ? 'a higher pair or any four of a kind' : `a higher ${pile.length === 3 ? 'three' : 'four'} of a kind`}`
        : 'You lead: a single, pair, three or four of a kind'
      : status;

  return (
    <div className="rise-in mx-auto max-w-4xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
      <div className="mb-2 flex flex-wrap justify-center gap-y-2 pt-3" role="group" aria-label="Your cards">
        {me.hand.map((c) => {
          const on = chosen.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              aria-label={cardsText([c])}
              disabled={!give && !myTurn}
              onClick={() => toggle(c)}
              className={`-ml-4 rounded-md transition-transform first:ml-0 focus-visible:outline-2 focus-visible:outline-yellow-300 disabled:cursor-default sm:-ml-5 ${on ? '-translate-y-3' : ''}`}
            >
              <CardFace card={c} />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-slate-300 sm:text-base" aria-live="polite">{hint}</p>
        {give ? (
          <button disabled={!ready} onClick={() => send({ type: 'give', cards: chosen })} className={`${button.primary} min-h-12 px-6 text-base`}>
            Give
          </button>
        ) : (
          myTurn && (
            <>
              <button disabled={!pile || sent === decision} onClick={() => send({ type: 'pass' })} className={`${button.quiet} min-h-12 px-5 text-base`}>
                Pass
              </button>
              <button disabled={!ready} onClick={() => send({ type: 'play', cards: chosen })} className={`${button.primary} min-h-12 px-6 text-base`}>
                Play
              </button>
            </>
          )
        )}
      </div>
    </div>
  );
}
