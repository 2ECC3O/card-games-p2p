import type { GameState } from '../types/slave';
import { cardsText, oddsLabel, ordinal, type Odds } from './SlaveTable';
import TournamentPanel, { useTicker, type TickerLine } from './TournamentPanel';

const nameOf = (s: GameState, id: string | null) => s.players.find((p) => p.id === id)?.name ?? 'Someone';

function describe(prev: GameState, state: GameState): TickerLine[] {
  const lines: TickerLine[] = [];
  const same = prev.round === state.round;
  if (!same) lines.push({ text: `Round ${state.round}` });
  for (const g of state.gives) {
    const before = same ? prev.gives.find((x) => x.from === g.from && x.to === g.to) : undefined;
    if (g.cards.length && !before?.cards.length) lines.push({ text: `${nameOf(state, g.from)} gives ${nameOf(state, g.to)} ${cardsText(g.cards)}` });
  }
  if (state.phase === 'playing' && prev.phase !== 'playing') lines.push({ text: `${nameOf(state, state.activeId)} has 3♣ and leads; turns go ${state.dir === 1 ? 'clockwise' : 'counter-clockwise'}` });
  if (state.pile && state.pile.cards.join() !== prev.pile?.cards.join()) lines.push({ text: `${nameOf(state, state.pile.by)}: ${cardsText(state.pile.cards)}` });
  for (const id of state.passed) if (!prev.passed.includes(id)) lines.push({ text: `${nameOf(state, id)} passes` });
  if (same && prev.pile && !state.pile) lines.push({ text: `Pile clears, ${nameOf(state, state.activeId)} leads` });
  state.out.forEach((id, i) => {
    if (i < state.out.length - (state.phase === 'settled' ? 1 : 0) && !(same && prev.out.includes(id))) lines.push({ text: `${nameOf(state, id)} is out, ${ordinal(i + 1)}` });
  });
  if (state.phase === 'settled' && prev.phase !== 'settled') {
    lines.push({ text: state.players.filter((p) => p.title && p.title !== 'Citizen').map((p) => `${p.title} ${p.name}`).join(' · ') });
  }
  return lines;
}

export default function Tournament({ state, url, odds }: { state: GameState; url: string; odds: Odds }) {
  const feed = useTicker(state, describe);
  const leaders = state.players.map((p) => ({
    id: p.id, name: p.name, connected: p.connected, points: p.points, chance: odds[p.id] && oddsLabel(state, odds[p.id]),
    note: [p.title, state.phase === 'playing' || state.phase === 'exchange' ? `${p.hand.length} card${p.hand.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '),
  }));
  return <TournamentPanel code={state.roomCode} url={url} leaders={leaders} feed={feed} />;
}
