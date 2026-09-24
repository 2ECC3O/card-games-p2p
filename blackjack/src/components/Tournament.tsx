import type { GameState } from '../types/blackjack';
import TournamentPanel, { useTicker, type TickerLine } from '../../../shared/TournamentPanel';

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
  const leaders = state.players.map((p) => {
    const score = p.chips + (state.phase === 'settled' ? 0 : p.hands.reduce((sum, hand) => sum + hand.bet, 0));
    const chance = chances[p.id] === undefined ? undefined : `Stand ~${Math.round(chances[p.id] * 100)}%`;
    return { id: p.id, name: p.name, connected: p.connected, score, change: score - state.config.startingStack, chance };
  });
  return <TournamentPanel code={state.roomCode} url={url} heading="Chip counts" chanceTitle="Chance of net profit if all hands stand now" leaders={leaders} feed={feed} />;
}
