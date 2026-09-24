# Slave P2P

Slave (สลาฟ), the Thai climbing card game, for up to 8 players (plus a waiting queue), played in the browser with
friends or bots. No chips, no accounts, no money, no game server. One player's browser hosts the table; everyone
else connects to it directly.

Part of [Card Games P2P](../README.md). It started as a copy of [Pok Deng](../pokdeng/README.md)'s app, with its
own engine and table, in plum.

## Play

1. Open **https://2ecc3o.github.io/card-games-p2p/slave/**.
2. Type your name and press **Create room**.
3. Share the room code, link or QR code. Friends press **Join**, or **Watch** to follow without a seat.
4. Press **Start**. Bots fill the table up to 4 players; the host can add more bots, up to 8 seats.

## How to play (Thai rules)

- **Deal:** one 52-card deck, no jokers, all dealt out. Uneven hands are fine. You see only your own cards.
- **Rank:** 3 is lowest, then 4 up to K, A, and **2 is highest**. Suits never matter.
- **Plays:** a single, a pair, three of a kind (ตอง) or four of a kind. No straights (สเตจ).
- **Beating the pile:** the same number of cards of a higher rank. Three of a kind also beats any single, and four
  of a kind beats any pair.
- **Your turn (30 s):** tap cards, then **Play**, or **Pass**. A pass puts you out until the pile clears. When
  everyone else has passed, the pile clears and whoever played it leads; if they're already out, the next player
  leads. Time out and you pass (or, leading, play your lowest rank).
- **Who starts:** the holder of 3♣ in the first round; after that, last round's Slave.
- **Titles:** first out is **King**, second **Queen**, second-last **Serf** (รองสลาฟ), last **Slave**, everyone else
  **Citizen**. With 3 players there's no Queen or Serf; with 2, just King and Slave.
- **Falls:** a King who isn't first out drops to Slave. A Queen who then isn't in the top two drops to Serf.
- **Exchange (30 s):** at each deal the Slave's two best cards go to the King and the Serf's best card to the
  Queen. The King and Queen then pick the same number of cards to give back. Time out and you give your lowest.
- **Points:** finishing k-th of n earns n − k points, for the TOURNAMENT display's leaderboard.
- **Bots** lead their lowest rank (all of it) and follow with the lowest play that beats the pile. They never
  bomb with three or four of a kind. A player who leaves mid-round plays out the round the same way.

## Run it on your own computer

Needs [Node.js](https://nodejs.org) 20.19 or newer. From this folder: `npm install`, then `npm run dev`.
`npm test` runs the engine and network checks; `npm run build` makes the static site in `dist/`.

## How it works

- `src/engine/slaveEngine.ts`: the rules as pure functions over one `GameState`. Only the host runs them.
- `src/network/tableNet.ts`: PeerJS rooms, as in the other games. `maskFor` hides every hand but your own, and
  exchanges you're not part of. Spectators see everything.
- `src/components/SlaveTable.tsx`, `HandControls.tsx`: the table, and your hand with its play, pass and give
  buttons.

Bump `PREFIX` in `tableNet.ts` when the wire format changes.

## License

[MIT](../LICENSE)
