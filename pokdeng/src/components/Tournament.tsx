import { handType, staked } from '../engine/pokDengEngine';
import type { GameState } from '../types/pokdeng';
import TournamentPanel, { useTicker, type TickerLine } from '../../../shared/TournamentPanel';

const nameOf = (s: GameState, id: string | null) => s.players.find((p) => p.id === id)?.name ?? 'The house';

function describe(prev: GameState, state: GameState): TickerLine[] {
  const lines: TickerLine[] = [];
  if (state.round !== prev.round) lines.push({ text: `Round ${state.round}: ${nameOf(state, state.bankerId)} deals` });
  if (state.maxBet !== prev.maxBet && state.round === prev.round) lines.push({ text: `Limit ${state.maxBet ?? 'lifted'}` });
  for (const h of state.hands) {
    const before = prev.hands.find((old) => old.id === h.id);
    const who = nameOf(state, h.owner);
    if (!before) lines.push({ text: `${who} bets ${h.bet}${h.spot === 'last' ? ', last' : h.spot !== 'seat' ? `, cutting in before ${nameOf(state, h.spot)}` : ''}` });
    else if (h.cards.length === 3 && before.cards.length === 2) lines.push({ text: `${who} draws` });
    if (h.outcome && !before?.outcome) lines.push({ text: `${who}: ${handType(h.cards).name}, ${h.outcome}${h.net ? ` ${h.net > 0 ? '+' : '−'}${Math.abs(h.net)}` : ''}` });
  }
  if (state.caught && !prev.caught) lines.push({ text: `${nameOf(state, state.bankerId)} catches the ${state.caught}-card hands` });
  if (state.dealer.length === 3 && prev.dealer.length === 2) lines.push({ text: `${nameOf(state, state.bankerId)} draws` });
  return lines;
}

export default function Tournament({ state, url }: { state: GameState; url: string }) {
  const feed = useTicker(state, describe);
  const leaders = state.players.map((p) => {
    const score = p.chips + (state.phase === 'settled' ? 0 : staked(state, p.id));
    return { id: p.id, name: p.name, connected: p.connected, score, change: score - state.config.startingStack };
  });
  return <TournamentPanel code={state.roomCode} url={url} heading="Chip counts" leaders={leaders} feed={feed} />;
}
