import pokersolver from 'pokersolver';
import type { Card } from '../types/poker';

const { Hand } = pokersolver;
const DECK = [...'23456789TJQKA'].flatMap((rank) => [...'shdc'].map((suit) => `${rank}${suit}` as Card));

/** Share of wins against the cards supplied. Unknown hole cards and board cards are sampled without replacement. */
export function handEquity(players: { id: string; hole: Card[] }[], board: Card[], samples = 240, dead: Card[] = []): Record<string, number> {
  if (!players.length) return {};
  if (players.length === 1) return { [players[0].id]: 1 };
  const known = new Set<Card>([...board, ...dead, ...players.flatMap((p) => p.hole)].filter((c) => c !== '??'));
  const available = DECK.filter((c) => !known.has(c));
  const missing = 5 - board.length + players.reduce((n, p) => n + 2 - p.hole.filter((c) => c !== '??').length, 0);
  if (missing > available.length || board.length > 5 || players.some((p) => p.hole.length !== 2)) return {};
  // ponytail: the same cards give every spectator the same Monte Carlo estimate without sending odds over the wire.
  let seed = 2166136261;
  for (const char of JSON.stringify([players.map((p) => p.hole), board, dead])) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 2 ** 32;
  };
  const totals = Object.fromEntries(players.map((p) => [p.id, 0])) as Record<string, number>;
  const trials = missing === 0 ? 1 : samples;
  for (let trial = 0; trial < trials; trial++) {
    const cards = [...available];
    for (let i = 0; i < missing; i++) {
      const j = i + Math.floor(random() * (cards.length - i));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    let cursor = 0;
    const runout = [...board, ...cards.slice(cursor, cursor + 5 - board.length)];
    cursor += 5 - board.length;
    const solved = players.map((p) => Hand.solve([...p.hole.map((c) => c === '??' ? cards[cursor++] : c), ...runout]));
    const winners = Hand.winners(solved);
    players.forEach((p, i) => { if (winners.includes(solved[i])) totals[p.id] += 1 / winners.length; });
  }
  return Object.fromEntries(players.map((p) => [p.id, totals[p.id] / trials]));
}
