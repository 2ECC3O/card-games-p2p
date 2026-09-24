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
  // One send per state: a double tap would otherwise play into the next player's turn. Any new state from the host
  // unlocks, so leading twice in a round (same empty pile, same turn) never looks like the move already sent.
  const [sentOn, setSentOn] = useState<GameState | null>(null);
  const sent = sentOn === state;
  const chosen = picked.filter((c) => me.hand.includes(c));
  const give = state.phase === 'exchange' ? state.gives.find((g) => g.from === heroId && !g.cards.length) : undefined;
  const myTurn = state.phase === 'playing' && state.activeId === heroId;
  const pile = state.pile?.cards ?? null;
  const ready = !sent && (give ? chosen.length === give.count : myTurn && beats(chosen, pile));
  const send = (action: PlayerAction) => {
    setSentOn(state);
    setPicked([]);
    onAction(action);
  };
  const toggle = (c: Card) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...chosen, c]));
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? 'someone';
  // The exchange: your cards going out are dimmed until everyone has picked; then they all change hands at once and
  // the ones you got are highlighted.
  const mine = state.phase === 'exchange' ? state.gives.filter((g) => g.from === heroId || g.to === heroId) : [];
  const outgoing = state.swapped ? [] : mine.filter((g) => g.from === heroId).flatMap((g) => g.cards);
  const got = state.swapped ? mine.filter((g) => g.to === heroId).flatMap((g) => g.cards) : [];
  const incoming = mine.find((g) => g.to === heroId);
  const coming = incoming && (incoming.cards.length ? `${nameOf(incoming.from)} gives you ${cardsText(incoming.cards)}` : `${nameOf(incoming.from)} is picking ${incoming.count} for you`);
  const going = mine.filter((g) => g.from === heroId && g.cards.length).map((g) => `${cardsText(g.cards)} to ${nameOf(g.to)}`).join(', ');
  const hint = give
    ? `Pick ${give.count} card${give.count > 1 ? 's' : ''} to give ${nameOf(give.to)}.${coming ? ` ${coming}.` : ''}`
    : mine.length && state.swapped
      ? `You gave ${going} and got ${cardsText(got)} from ${nameOf(incoming!.from)}.`
    : mine.length
      ? `Waiting for everyone to pick. You give ${going}; ${coming}.`
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
              className={`-ml-4 rounded-md transition-transform first:ml-0 focus-visible:outline-2 focus-visible:outline-yellow-300 disabled:cursor-default sm:-ml-5 ${on ? '-translate-y-3' : ''} ${got.includes(c) ? 'relative ring-3 ring-yellow-300' : ''} ${outgoing.includes(c) ? 'opacity-40' : ''}`}
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
              <button disabled={!pile || sent} onClick={() => send({ type: 'pass' })} className={`${button.quiet} min-h-12 px-5 text-base`}>
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
