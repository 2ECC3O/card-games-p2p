# Pok Deng P2P

[Pok Deng](https://en.wikipedia.org/wiki/Pok_Deng) (ป๊อกเด้ง), the Thai card game, for up to 7 players (plus a
waiting queue), played in the browser with the traditional rotating dealer. Virtual chips only: no accounts, no
money, no game server. One player's browser hosts the table; everyone else connects to it directly.

Part of [Card Games P2P](../README.md). It started as a copy of [Blackjack](../blackjack/README.md)'s app,
with its own engine and table, in yellow.

## Play

1. Open **https://2ecc3o.github.io/card-games-p2p/pokdeng/**.
2. Type your name, choose a starting stack and minimum bet (and whether under 4 must draw), and press **Create room**.
3. Share the room code, link or QR code. Friends press **Join**, or **Watch** to follow without a seat.
4. Press **Start**. Play alone against the app as dealer, or with friends and bots, taking turns to deal.

## How to play (Thai rules)

- **Dealer (เจ้ามือ):** the deal passes clockwise every round. The dealer doesn't bet; every other hand plays
  against the dealer, who pays and collects from their own chips. Alone at the table, the app deals.
- **Betting (30 s):** bet on up to 3 hands (ขา): at your seat, cut in before another player to take their place
  in the deal (ตัดขา), or last, dealt after the dealer (ขาบ๊วย). Press **Bet** for one hand, or **+ Hand** then
  **Deal me in** for more; **Sit out** skips the round. The dealer may set a bet limit (อั้น) of 2, 5, 10 or 20
  minimum bets; lowering it hands the excess back.
- **Score:** ace is 1, 2 to 9 are face value, 10 and picture cards count 0. Only the last digit counts.
- **Deal:** two cards each, one at a time, in dealing order. You see only your own hands.
- **Pok:** two cards scoring 8 or 9. It's shown at once and can't draw. A dealer Pok settles every hand on the
  spot: a higher Pok wins, an equal Pok ties, anything else loses.
- **Your turn (60 s per hand):** **Draw a card** (one only) or **Stay**. With the house rule on, a two-card hand
  under 4 must draw. Time out and the hand draws on 4 or less.
- **The dealer's turn (60 s):** first, if they like, **catch** (จับ) one group on the dealer's two cards: every
  hand that drew (3 cards) or every hand that stayed (2 cards). Then **draw** or **stay** against the rest.
- **Winning:** Pok 9, Pok 8, Tong (three of a kind), straight, three picture cards (สามเหลือง), then score 9 down
  to 0. Straights run 2-3-4 up to Q-K-A; the ace is high, so A-2-3 and K-A-2 aren't straights. Same class and
  score is a tie (เจ๊า): nobody pays. Tong, straights and three faces compare their highest card.
- **Deng (multiplier):** a win pays the bet times the winning hand's deng; a loss pays the dealer's deng.

  | Hand | Deng |
  |---|---|
  | two cards of one suit, or a pair | 2 |
  | three cards of one suit, a straight, three picture cards | 3 |
  | Tong | 5 |
  | anything else | 1 |

- **Chips:** losers pay first, never more than they have. Then the dealer pays winners in dealing order; a dealer
  who runs out pays no more that round. Out of chips? Press **Rejoin** for a fresh stack.
- **Bots** bet the minimum and draw on 4 or less. As dealer, a bot on 5 or more catches the hands that drew,
  then stays. A bot that can't afford the minimum leaves for good.

### Where the app decides

The Thai rules leave a few things to the table. Here: one deck shuffled every round; the house rule's "pay
everyone" penalty never comes up because the app simply won't let a hand under 4 stay; a straight ranks above
three picture cards; a dealer who leaves mid-round plays by the draw-on-4 rule, and one who leaves before the
deal hands every bet back and passes the deal on.

## Run it on your own computer

Needs [Node.js](https://nodejs.org) 20.19 or newer. From the repository root, install once for every game, then
start this one:

```bash
npm install
npm run dev -w pokdeng
```

Then open the address it prints. `npm test -w pokdeng` runs the engine checks (`npm test` at the root runs every
game's plus the shared network checks); `npm run build -w pokdeng` makes the static site in `pokdeng/dist/`.

## How it works

- `src/engine/pokDengEngine.ts`: the rules as pure functions over one `GameState`. Only the host runs them.
- `src/network/tableNet.ts`: this game's side of the shared PeerJS room (`../shared/tableNet.ts`): its engine,
  its room prefix and the shape of a valid move. `maskFor` hides the deck, and every hand but
  your own (a Pok and caught hands are face up) until the round settles; the dealer's cards show after a catch.
  Spectators see everything.
- `src/components/PokDengTable.tsx`, `ActionControls.tsx`: the table and the bet, limit, draw and dealer controls.

Bump `prefix` in `src/network/tableNet.ts` when the wire format changes.

## License

[MIT](../LICENSE)
