import { numberLabel, SPIN_MS, staked } from '../engine/rouletteEngine';
import { profitChance } from '../engine/odds';
import type { GameState, Spot } from '../types/roulette';
import { playerColor, resultName, useLanded } from './RouletteTable';
import TournamentPanel, { useTicker, type TickerLine } from '../../../shared/TournamentPanel';

const SPOT_NAME: Record<string, string> = {
  red: 'red', black: 'black', odd: 'odd', even: 'even', low: '1–18', high: '19–36',
  d1: 'the 1st dozen', d2: 'the 2nd dozen', d3: 'the 3rd dozen', c1: 'column 1', c2: 'column 2', c3: 'column 3',
};
const spotName = (spot: string) => (spot[0] === 'n' ? numberLabel(Number(spot.slice(1))) : SPOT_NAME[spot]);

/** Ticker lines for the TOURNAMENT display. Results wait until the wheel has stopped on screen. */
function describe(prev: GameState, s: GameState): TickerLine[] {
  const lines: TickerLine[] = [];
  if (s.phase === 'betting' && s.round !== prev.round) lines.push({ text: `Round ${s.round}: place your bets` });

  for (const p of s.players) {
    const before = prev.players.find((q) => q.id === p.id);
    if (!before || s.round !== prev.round) continue;
    if (staked(p.bets) === 0 && staked(before.bets) > 0 && s.phase === 'betting') {
      lines.push({ text: `${p.name} takes their chips back` });
      continue;
    }
    for (const [spot, amount] of Object.entries(p.bets)) {
      const added = amount! - (before.bets[spot as Spot] ?? 0);
      if (added > 0) lines.push({ text: `${p.name} puts ${added} on ${spotName(spot)}` });
    }
  }

  if (s.phase === 'settled' && prev.phase !== 'settled' && s.result !== null) {
    lines.push({ text: 'No more bets. The wheel spins…' });
    const n = s.result;
    lines.push({ text: `${resultName(n)}!`, delay: SPIN_MS });
    for (const p of s.players) {
      const stake = staked(p.bets);
      if (!stake) continue;
      const net = p.payout - stake;
      lines.push({ text: net > 0 ? `${p.name} wins ${net}` : net < 0 ? `${p.name} loses ${-net}` : `${p.name} breaks even`, delay: SPIN_MS });
    }
  }
  return lines;
}

/** The TOURNAMENT display's side panel for roulette. */
export default function Tournament({ state, url }: { state: GameState; url: string }) {
  const feed = useTicker(state, describe);
  const landed = useLanded(state);
  const chances = profitChance(state, landed);
  // Chips on the table count as the player's; winnings only once the wheel has stopped on screen.
  const leaders = state.players.map((p) => {
    const score = p.chips + (state.phase === 'settled' ? (landed ? 0 : staked(p.bets) - p.payout) : staked(p.bets));
    const chance = chances[p.id] === undefined ? undefined : `Win ${Math.round(chances[p.id] * 100)}%`;
    return { id: p.id, name: p.name, connected: p.connected, color: playerColor(p.seat), score, change: score - state.config.startingStack, chance };
  });
  return <TournamentPanel code={state.roomCode} url={url} heading="Chip counts" chanceTitle="Chance this round's bets return a net profit" leaders={leaders} feed={feed} />;
}
