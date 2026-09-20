import type { GameState, Spot } from '../types/roulette';
import { payoutMultiple, staked } from './rouletteEngine';

/** Exact chance that this round's bets return a net profit on a single-zero wheel. */
export function profitChance(s: GameState, landed = false): Record<string, number> {
  const result: Record<string, number> = {};
  for (const p of s.players) {
    const stake = staked(p.bets);
    if (!stake) continue;
    const wins = (n: number) => Object.entries(p.bets).reduce((sum, [spot, amount]) => sum + amount! * payoutMultiple(spot as Spot, n), 0) > stake;
    result[p.id] = landed && s.result !== null ? Number(wins(s.result)) : Array.from({ length: 37 }, (_, n) => Number(wins(n))).reduce((a, b) => a + b, 0) / 37;
  }
  return result;
}
