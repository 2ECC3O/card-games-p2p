# Roulette P2P

Single-zero roulette for up to 10 players around one wheel (plus a waiting queue), played in the browser.
Free to play with virtual chips only: no accounts, no money, no game server. One player's browser tab hosts
the table and spins the wheel; everyone else connects to it directly (peer to peer).

Works on phones, tablets and desktop browsers. Part of [Card Games P2P](../README.md): it shares
[Blackjack](../blackjack/README.md)'s networking, look and layout, in red.

## Play

1. Open **https://2ecc3o.github.io/card-games-p2p/roulette/** in Safari, Chrome, Firefox or Edge.
2. **To start a table:** type your name, choose a starting stack and minimum bet, and press **Create room**.
3. **To invite friends:** share the room code, invite link or QR code (on the table before the game starts,
   and behind the room code button at the top left afterwards).
4. **Friends** open the link, enter their name and press **Join**. They can be anywhere.
5. The room creator presses **Start**. You can play alone, or press **Add bot** to play a last-seat-standing match.

Keep the page open while you play: the game runs in the players' browsers.

## Run it on your own computer

Needs [Node.js](https://nodejs.org) 20.19 or newer. From this `roulette` folder:

```bash
npm install
npm run dev
```

Then open the address it prints. `npm test` runs the engine and network checks; `npm run build` makes the
static site in `dist/`. Hosting and the optional TURN relay in `.env.example` work exactly as described in
the [Hold'em README](../poker/README.md).

## How to play

- **Betting:** every round opens with a 25-second betting window. Pick a chip (1, 5, 25 or 100 minimum
  bets) and tap the board to place it; tap again to add more. Bet on as many spots as you like.
  **Clear** takes your chips back, **Repeat** puts last round's bets down again.
- Press **Done betting** (**Spin** when you play alone) once you're set. The wheel spins when everyone is
  done or the time runs out. Anyone who hasn't bet sits the round out.
- **Payouts:** a single number pays 35 to 1, a dozen or a column 2 to 1, and red/black, odd/even and
  1-18/19-36 pay 1 to 1. Zero loses every bet except a bet on zero.
- **Out of chips:** press **Rejoin** to come back with a fresh stack at the next round.
- **Bots:** the host can add bots before or during play. They bet the minimum on red or black. A bot that cannot afford the minimum leaves permanently. A bot match stops when only one funded seat remains.
- **Watching:** spectators and the TOURNAMENT display see each player's exact chance of net profit on the current bets across all 37 pockets.

Splits, streets, corners and lines (bets on the lines between numbers) aren't offered.

## How it works

Same design as Blackjack P2P:

- `src/engine/rouletteEngine.ts`: the rules as pure functions over one `GameState`. Only the host runs them.
  The number is drawn with `crypto.getRandomValues` when betting closes.
- `src/network/tableNet.ts`: PeerJS rooms. The host checks every bet, then sends everyone the table (nothing
  is hidden in roulette). A standby player holds a snapshot and takes over if the host drops; reload
  reconnects to your seat within 60 seconds.
- `src/network/codec.ts`: compressed messages with size limits.
- `src/components/RouletteTable.tsx`, `ActionControls.tsx`: the wheel, the board, and the chip controls.
  Each screen spins its own wheel when it hears the result and shows the outcome once it stops.

Timings and limits live at the top of the engine (`BET_MS`, `SPIN_MS`, `SETTLE_MS`, `MAX_SEATS`).
When the wire format changes, bump `PREFIX` in `tableNet.ts` so old and new pages never share a room.

## License

[MIT](../LICENSE)
