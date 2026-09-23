import { handType } from '../engine/pokDengEngine';
import type { GameState } from '../types/pokdeng';
import TournamentPanel, { useTicker, type TickerLine } from './TournamentPanel';

function describe(prev: GameState, state: GameState): TickerLine[] {
  const lines: TickerLine[] = [];
  if (state.round !== prev.round) lines.push({ text: `Round ${state.round}: place your bets` });
  for (const p of state.players) {
    const before = prev.players.find((old) => old.id === p.id);
    if (!before) continue;
    if (p.bet && !before.bet) lines.push({ text: `${p.name} bets ${p.bet}` });
    if (p.cards.length === 3 && before.cards.length === 2) lines.push({ text: `${p.name} draws` });
    if (state.phase === 'settled' && prev.phase !== 'settled' && p.outcome)
      lines.push({ text: `${p.name}: ${handType(p.cards).name}, ${p.outcome}${p.net ? ` ${p.net > 0 ? '+' : ''}${p.net}` : ''}` });
  }
  return lines;
}

export default function Tournament({ state, url }: { state: GameState; url: string }) {
  const feed = useTicker(state, describe);
  const leaders = state.players.map((p) => ({
    id: p.id, name: p.name, connected: p.connected,
    chips: p.chips + (state.phase === 'settled' ? 0 : p.bet),
  }));
  return <TournamentPanel code={state.roomCode} url={url} leaders={leaders} startingStack={state.config.startingStack} feed={feed} />;
}
