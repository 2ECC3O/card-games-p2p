import type { Card, GameState } from '../types/blackjack';
import { handValue, isBlackjack } from './blackjackEngine';

/** Chance that all current hands return more than their stakes if stood now. Spectator view only. */
export function standProfitChance(s: GameState): Record<string, number> {
  if (!['playing', 'settled'].includes(s.phase) || s.dealer.length < 2 || s.dealer.includes('??')) return {};
  const players = s.players.filter((p) => p.hands.length && p.hands.every((h) => h.cards.length >= 2 && !h.cards.includes('??')));
  const result: Record<string, number> = {};
  if (s.phase === 'settled') {
    for (const p of players) result[p.id] = Number(p.hands.reduce((n, h) => n + h.payout - h.bet, 0) > 0);
    return result;
  }

  const deck = Array.from({ length: s.config.decks }, () =>
    [...'23456789TJQKA'].flatMap((r) => [...'shdc'].map((suit) => `${r}${suit}` as Card)),
  ).flat();
  for (const card of [...s.dealer, ...s.players.flatMap((p) => p.hands.flatMap((h) => h.cards))]) {
    const i = deck.indexOf(card);
    if (i >= 0) deck.splice(i, 1);
  }
  let seed = [...s.dealer, ...players.flatMap((p) => p.hands.flatMap((h) => h.cards))].join('').split('').reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const random = () => ((seed ^= seed << 13, seed ^= seed >>> 17, seed ^= seed << 5) >>> 0) / 2 ** 32;
  const dealerBJ = isBlackjack(s.dealer);
  const trials = handValue(s.dealer).total >= 17 ? 1 : 240;
  for (let trial = 0; trial < trials; trial++) {
    const remaining = deck.slice();
    const dealer = s.dealer.slice();
    while (handValue(dealer).total < 17 && remaining.length) dealer.push(remaining.splice(Math.floor(random() * remaining.length), 1)[0]);
    const dealerTotal = handValue(dealer).total;
    for (const p of players) {
      const profit = p.hands.reduce((sum, h) => {
        const total = handValue(h.cards).total;
        const natural = !h.split && isBlackjack(h.cards);
        const payout = total > 21 ? 0 : dealerBJ ? (natural ? h.bet : 0) : natural ? h.bet + Math.floor(h.bet * 3 / 2)
          : dealerTotal > 21 || total > dealerTotal ? h.bet * 2 : total === dealerTotal ? h.bet : 0;
        return sum + payout - h.bet;
      }, 0);
      result[p.id] = (result[p.id] ?? 0) + Number(profit > 0) / trials;
    }
  }
  return result;
}
