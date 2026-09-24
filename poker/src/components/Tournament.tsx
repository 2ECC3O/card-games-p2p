import type { GameState } from '../types/poker';
import TournamentPanel, { useTicker, type TickerLine } from '../../../shared/TournamentPanel';

function describe(prev: GameState, state: GameState): TickerLine[] {
  const lines: TickerLine[] = [];
  if (state.handNumber !== prev.handNumber) lines.push({ text: `Hand ${state.handNumber}: blinds ${state.blinds.small}/${state.blinds.big}` });
  for (const p of state.players) {
    const before = prev.players.find((old) => old.id === p.id);
    if (before && p.lastAction && p.lastAction !== before.lastAction)
      lines.push({ text: `${p.name}: ${p.lastAction}` });
  }
  if (state.phase === 'showdown' && prev.phase !== 'showdown') {
    for (const pot of state.pots) {
      const names = pot.winners.map((id) => state.players.find((p) => p.id === id)?.name ?? 'Player').join(' & ');
      lines.push({ text: `${names} ${pot.winners.length > 1 ? 'split' : 'wins'} ${pot.amount}${pot.hand ? ` with ${pot.hand}` : ''}` });
    }
  }
  return lines;
}

/** A spectator display for one table; history counts completed hands, including ties as wins. */
export default function Tournament({ state, url, equity }: { state: GameState; url: string; equity: Record<string, number> }) {
  const feed = useTicker(state, describe);
  const exact = state.board.length === 5 || state.phase === 'showdown';
  const leaders = state.players.map((p) => {
    const score = p.chips + (state.phase === 'showdown' ? 0 : p.committed);
    return {
      id: p.id, name: p.name, connected: p.connected, score, change: score - state.config.startingStack,
      detail: p.handsPlayed ? `${Math.round((100 * p.handsWon) / p.handsPlayed)}% · ${p.handsWon}/${p.handsPlayed} past hands` : 'No past hands',
      chance: equity[p.id] === undefined ? undefined : `${exact ? '' : '~'}${Math.round(equity[p.id] * 100)}%`,
    };
  });
  return <TournamentPanel code={state.roomCode} url={url} heading="Chip counts · Live win chance" chanceTitle="Chance of winning this hand; ties split the chance. Past hands: completed hands won, ties included, over hands dealt." leaders={leaders} feed={feed} />;
}
