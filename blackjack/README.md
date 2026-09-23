# Blackjack P2P

Blackjack for up to 7 players against the house (plus a waiting queue), played in the browser. Free to play
with virtual chips only: no accounts, no money, no game server. One player's browser tab hosts the table and
deals as the house; everyone else connects to it directly (peer to peer).

Works on phones, tablets and desktop browsers. Part of [Card Games P2P](../README.md): it shares
[Hold'em](../poker/README.md)'s networking, look and layout, in blue.

## Play

1. Open **https://2ecc3o.github.io/card-games-p2p/blackjack/** in Safari, Chrome, Firefox or Edge.
2. **To start a table:** type your name, choose a starting stack, minimum bet and number of decks, and press **Create room**.
3. **To invite friends:** share the room code, invite link or QR code (on the table before the game starts,
   and behind the room code button at the top left afterwards).
4. **Friends** open the link, enter their name and press **Join**. They can be anywhere.
5. The room creator presses **Start**. You can play alone against the house, or press **Add bot** to play a last-seat-standing match.

Keep the page open while you play: the game runs in the players' browsers.

## Run it on your own computer

Needs [Node.js](https://nodejs.org) 20.19 or newer. From this `blackjack` folder:

```bash
npm install
npm run dev
```

Then open the address it prints. `npm test` runs the engine and network checks; `npm run build` makes the
static site in `dist/`. Hosting options (same Wi-Fi, static hosts, the optional TURN relay in
`.env.example`) work exactly as described in the [Hold'em README](../poker/README.md); the workflow at the
repository root publishes both games to Pages on every push to `main`.

## How to play

- **Betting:** every round opens with a 30-second betting window. Pick an amount with the slider (or Min,
  ×2, Max) and press **Bet**. Anyone who doesn't bet in time sits the round out.
- **Your turn:** players act in seat order, left to right, with 60 seconds per decision (then you stand).
  - **Hit** takes a card, **Stand** keeps your total.
  - **Double** doubles your bet on your first two cards and takes exactly one more card.
  - **Split** turns a pair (any two 10-value cards count) into two hands with equal bets, up to four hands.
    Split aces get one card each.
- **Results:** once everyone has played, the dealer flips the hole card and draws to 17. Wins pay 1 to 1,
  a blackjack pays 3 to 2 (rounded down), ties push.
- **Out of chips:** press **Rejoin** to be dealt back in with a fresh stack at the next round.
- **Bots:** the host can add bots before or during play. They bet the minimum and use a simple strategy based on visible cards. A bot that cannot afford the minimum leaves permanently. A bot match stops when only one funded seat remains.
- **Watching:** spectators and the TOURNAMENT display see an estimated chance of net profit if each player's current hands all stand. The estimate uses 240 dealer runouts; settled results are exact.

### Rules the engine follows

- Shoe of 1, 2, 6 or 8 decks, crypto-random shuffle, reshuffled when three quarters are dealt.
- The dealer peeks: with a dealer blackjack the round ends before anyone acts (player blackjacks push).
- Dealer stands on all 17s. Double after split is allowed. 21 after a split is not a blackjack.
- No insurance or surrender.

## How it works

Same design as Hold'em P2P:

- `src/engine/blackjackEngine.ts`: the rules as pure functions over one `GameState`. Only the host runs them.
- `src/network/tableNet.ts`: PeerJS rooms. The host checks every action, then sends each player their view
  (`maskFor`: no shoe, and the dealer's hole card face down until the dealer plays). A standby player holds
  a snapshot and takes over if the host drops; reload reconnects to your seat within 60 seconds.
- `src/network/codec.ts`: compressed messages with size limits.
- `src/components/BlackjackTable.tsx`, `ActionControls.tsx`: the table and the bet / play controls.

Timings and limits live at the top of the engine (`BET_MS`, `TURN_MS`, `SETTLE_MS`, `MAX_SEATS`, `MAX_HANDS`).
When the wire format changes, bump `PREFIX` in `tableNet.ts` so old and new pages never share a room.

## License

[MIT](../LICENSE)
