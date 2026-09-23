# Pok Deng P2P

[Pok Deng](https://en.wikipedia.org/wiki/Pok_Deng) (ป๊อกเด้ง), the Thai card game, for up to 7 players against
the dealer (plus a waiting queue), played in the browser. Virtual chips only: no accounts, no money, no game
server. One player's browser hosts the table and deals as the dealer; everyone else connects to it directly.

Part of [Card Games P2P](../README.md). It started as a copy of [Blackjack](../blackjack/README.md)'s app,
with its own engine and table, in yellow.

## Play

1. Open **https://2ecc3o.github.io/card-games-p2p/pokdeng/**.
2. Type your name, choose a starting stack and minimum bet, and press **Create room**.
3. Share the room code, link or QR code. Friends press **Join**, or **Watch** to follow without a seat.
4. Press **Start**. Play alone against the dealer, or **Add bot** for a last-seat-standing match.

## How to play

- **Cards:** ace is 1, 2 to 9 are face value, 10 and picture cards are 0. Your score is the last digit of
  the total (7 + 8 = 15 scores 5).
- **Betting:** each round opens with a 30-second betting window. Anyone who doesn't bet sits it out.
- **Deal:** everyone, dealer included, gets two cards face down. You see only your own.
- **Pok:** two cards scoring 8 or 9 is a pok. It's shown at once and can't draw. If the dealer has a pok,
  every hand is compared straight away.
- **Your turn:** in seat order, **Draw a card** (one only) or **Stay**, 60 seconds each (then you stay).
- **Dealer:** once everyone has played, all hands turn over. The dealer draws a third card on 4 or less.
- **Winning:** hands rank Pok 9, Pok 8, Tong (three of a kind), straight flush, straight, three picture cards,
  then score 9 down to 0. Ace plays low (A-2-3) or high (Q-K-A), never K-A-2.
- **Deng (multiplier):** the winner is paid the bet times the winning hand's deng, and a losing player pays
  the bet times the dealer's deng.

  | Hand | Deng |
  |---|---|
  | two cards of one suit, or a pair | 2 |
  | three cards of one suit | 3 |
  | straight, three picture cards | 3 |
  | Tong, straight flush | 5 |
  | anything else | 1 |

- **Ties:** same rank and score: the side with more deng wins the difference, otherwise it's a push.
- **Out of chips:** a loss never takes more than you have. Press **Rejoin** for a fresh stack next round.
- **Bots** bet the minimum and draw on 4 or less. A bot that can't afford the minimum leaves for good.

### House rules the engine picks

Pok Deng has many house variations. This table uses one deck shuffled each round, a fixed dealer rule
(draw on 4 or less) rather than a banker choosing per player, and one shared comparison after the dealer
plays. There's no rotating banker: the app is always the dealer.

## Run it on your own computer

Needs [Node.js](https://nodejs.org) 20.19 or newer. From this folder: `npm install`, then `npm run dev`.
`npm test` runs the engine and network checks; `npm run build` makes the static site in `dist/`.

## How it works

- `src/engine/pokDengEngine.ts`: the rules as pure functions over one `GameState`. Only the host runs them.
- `src/network/tableNet.ts`: PeerJS rooms, as in the other games. `maskFor` hides the deck, the dealer's cards
  and other players' cards (except a shown pok) until the round settles. Spectators see everything.
- `src/components/PokDengTable.tsx`, `ActionControls.tsx`: the table and the bet / draw controls.

Bump `PREFIX` in `tableNet.ts` when the wire format changes.

## License

[MIT](../LICENSE)
