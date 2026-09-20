import type { GameState } from '../types/blackjack';
import TournamentPanel, { useTicker, type TickerLine } from './TournamentPanel';

function describe(prev: GameState, state: GameState): TickerLine[] {
  const lines: TickerLine[] = [];
  if (state.round !== prev.round) lines.push({ text: `Round ${state.round}: place your bets` });
  for (const p of state.players) {
    const before = prev.players.find((old) => old.id === p.id);
    if (!before) continue;
    if (p.hands.length && !before.hands.length) lines.push({ text: `${p.name} bets ${p.hands[0].bet}` });
    if (p.hands.length > before.hands.length && before.hands.length) lines.push({ text: `${p.name} splits` });
    for (let i = 0; i < p.hands.length; i++) {
      const hand = p.hands[i];
      const old = before.hands[i];
      if (!old) continue;
      if (hand.doubled && !old.doubled) lines.push({ text: `${p.name} doubles` });
      else if (hand.cards.length > old.cards.length && old.cards.length >= 2) lines.push({ text: `${p.name} hits` });
    }
    if (state.phase === 'settled' && prev.phase !== 'settled') {
      for (const hand of p.hands) if (hand.outcome) lines.push({ text: `${p.name}: ${hand.outcome}${hand.payout > hand.bet ? ` +${hand.payout - hand.bet}` : ''}` });
    }
  }
  return lines;
}

export default function Tournament({ state, url, chances }: { state: GameState; url: string; chances: Record<string, number> }) {
  const feed = useTicker(state, describe);
  const leaders = state.players.map((p) => ({
    id: p.id, name: p.name, connected: p.connected, chance: chances[p.id],
    chips: p.chips + (state.phase === 'settled' ? 0 : p.hands.reduce((sum, hand) => sum + hand.bet, 0)),
  }));
  return <TournamentPanel code={state.roomCode} url={url} leaders={leaders} startingStack={state.config.startingStack} feed={feed} />;
}
