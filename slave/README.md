# Slave P2P

Slave, the Thai climbing card game, for up to 8 players (plus a waiting queue), played in the browser with
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
- **Rank:** 3 is lowest, then 4 up to K, A, and **2 is highest**. Within a rank the suit decides, ♣ < ♦ < ♥ < ♠, so
  **2♠ is the highest card**.
- **Plays:** a single, a pair, three of a kind or four of a kind. No straights.
- **Beating the pile:** the same number of cards with a higher top card: a higher rank, or the same rank with a
  higher suit (7♠ on 7♥; 7♠ 7♣ on 7♥ 7♦). Three of a kind also beats any single, and four
  of a kind beats any pair.
- **Your turn (30 s):** tap cards, then **Play**, or **Pass**. A pass puts you out until the pile clears. When
  everyone else has passed, the pile clears and whoever played it leads; if they're already out, the next player
  leads. Time out and you pass, or play your lowest card if it's your lead.
- **Who starts:** every round, whoever holds 3♣ (after the exchange) leads. Turns then go whichever way round
  reaches last round's Slave sooner: clockwise on a tie, in the first round, or when the Slave holds 3♣.
- **Titles:** first out is **King**, second **Queen**, second-last **Serf**, last **Slave**, everyone else
  **Citizen**. With 3 players there's no Queen or Serf; with 2, just King and Slave.
- **Falls:** a King who isn't first out drops to Slave. A Queen who then isn't in the top two drops to Serf.
- **Exchange (30 s):** at each deal the Slave's two best cards are set aside for the King and the Serf's best card
  for the Queen; they show dimmed in the giver's hand. The King and Queen pick the same number from their own hand
  to give back (time out and you give back your lowest). Nothing moves until everyone has picked; then every card
  changes hands at once, flying across the table, the cards you got are highlighted, and the swap stays on the
  table for 4 seconds before the first lead.
- **Points:** finishing k-th of n earns n − k points, for the TOURNAMENT display's leaderboard.
- **Bots** go out whenever one play empties their hand. They lead their lowest rank whole; against a player on one
  card they lead a pair or more, or their highest single. They follow with the lowest set that fits, breaking up a
  bigger set only when nothing fits, and hold back 2s and bombs (three or four of a kind) until someone is on two
  cards or fewer, or they're on four or fewer. In the exchange they give back their lowest singles and keep pairs.
  A player who leaves mid-round is played out the same way.
- **Live odds:** spectators and the TOURNAMENT display see each seat's chance to end the round King (until someone
  is out), then to end it Slave. Their browser plays the round out 200 times from the cards on the table, everyone
  playing like a bot with a random legal move three times in ten. It's an estimate, not an exact figure.

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
