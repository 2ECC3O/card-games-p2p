# Card Games P2P

Poker, blackjack, roulette, eight-ball pool and Pok Deng you play with friends in the browser. Free, no sign-up.

**Play now: https://2ecc3o.github.io/card-games-p2p/**

## The games

| Game | Players | You play against | Link |
|---|---|---|---|
| Texas Hold'em | 1 to 10, with bots | each other | [play](https://2ecc3o.github.io/card-games-p2p/poker/) |
| Blackjack | 1 to 7 | the dealer (the app deals) | [play](https://2ecc3o.github.io/card-games-p2p/blackjack/) |
| Roulette | 1 to 10 | the wheel (the app spins it) | [play](https://2ecc3o.github.io/card-games-p2p/roulette/) |
| Eight-ball pool | 1 to 4, with bots | the other team | [play](https://2ecc3o.github.io/card-games-p2p/pool/) |
| Pok Deng | 1 to 7, with bots | whoever deals this round (it rotates; alone, the app deals) | [play](https://2ecc3o.github.io/card-games-p2p/pokdeng/) |

## Start a game in a minute

1. Open the link and pick a game.
2. Type your name and press **Create room**.
3. Send your friends the room code or the link, or let them scan the QR code.
4. When everyone is in, press **Start**.

New to a game? Press **How to play ?** on the game's page, or the **?** next to the room code during play. It's a short step-by-step guide with pictures; the game keeps running behind it.

Your friends don't need to be on your Wi-Fi. They can join from anywhere, mobile data included.

## Tournament display

Type **TOURNAMENT** as the display name when creating or joining a room. That browser hosts or watches without taking a seat and shows the table beside a live chip leaderboard, action feed, and invite QR code. On a phone, scroll below the table for the display panel.

Poker spectators and the TOURNAMENT display also see each active hand's **win chance**. Before the river, it is estimated from random runouts; on the completed board, it is exact. Ties split the chance. The display keeps the separate **past hand win rate**: completed hands won (a split pot counts as a win for each winner) divided by completed hands dealt. The count survives a rebuy in the same room. The feed is kept in the display browser and starts fresh if that page reloads.

Blackjack spectators see the estimated chance a player's current hands return a net profit if stood now. Roulette spectators see the exact chance their current bets return a net profit across 37 pockets. In a bot match, a bot that cannot afford the minimum leaves, and the last funded seat wins; a solo blackjack or roulette room without bots still runs normal rounds. This display does not run brackets or cross-room scores. A tournament display sees hidden cards just like any other spectator, so put the screen where players cannot use it to see opponents' cards.

Pool spectators see a rough live rack outlook based on cleared balls and whose turn it is. The TOURNAMENT display also shows past rack win rate. The outlook is a simple estimate, not a measured winning probability. Pool supports singles or Scotch doubles, and the host fills empty seats with bots when the match starts. Every screen watches each shot roll out, you aim by dragging on the table with a live trajectory guide, and each shot has a 90-second clock.

## What if...

| If... | Then |
|---|---|
| someone joins late | they wait in a queue and get dealt in at the next hand |
| a player reloads the page or their phone locks | they keep their seat if they come back within 60 seconds |
| the person who made the room leaves | another player's browser takes over after about 6 seconds and the game goes on |
| a player takes too long | the game moves on for them: check or fold after 60 s in Hold'em, stand after 60 s in blackjack, stay after 60 s in Pok Deng, betting closes after 30 s in blackjack and Pok Deng and 60 s in roulette, a pool shot is a foul after 90 s |
| nobody does anything for 5 minutes | the room closes |
| everyone closes the tab | the room is gone (there's no server keeping it) |
| you opened the link inside Instagram, TikTok, Messenger... | open it in Safari or Chrome instead; those built-in browsers can block the connection |

You need a recent browser: Safari 16.4+, Chrome 111+ or Firefox 128+. On iPhone that means iOS 16.4 or newer.

The chips are pretend. Nobody can buy them or cash them out.

## How it works

The person who creates a room is the host. Their browser deals the cards and checks every move. The other
players connect straight to the host's browser ([WebRTC](https://webrtc.org), with [PeerJS](https://peerjs.com)
helping them find each other). There's no game server.

Each player's browser only receives the cards that player is allowed to see. The host's browser holds the
whole deck, though, so play with people you trust.

Pool replays each shot in every browser from the shot's inputs; its physics only uses arithmetic and square roots, so every browser lands on exactly the same result.

Each game's own README has the full rules and details:
[Hold'em](poker/README.md) · [Blackjack](blackjack/README.md) · [Roulette](roulette/README.md) · [Pool](pool/README.md) · [Pok Deng](pokdeng/README.md)

## For developers

<details>
<summary>Folders, running it locally, publishing, adding a game</summary>

### Folders

| Path | What's in it |
|---|---|
| `poker/` | the Hold'em app (Vite + React + TypeScript) |
| `blackjack/` | the blackjack app, same stack and design |
| `roulette/` | the roulette app, same stack and design |
| `pool/` | eight-ball pool, same peer-to-peer room pattern |
| `pokdeng/` | Pok Deng, a copy of blackjack's app with its own engine, in yellow |
| `index.html` | the game picker page at the root of the site |
| `.github/workflows/deploy.yml` | tests, builds and publishes everything |

Each game is its own app with its own `package.json`. They don't share code; blackjack started as a
copy of Hold'em's networking and styling, roulette and Pok Deng as copies of blackjack's, and pool follows the same room pattern.

### Run a game on your computer

Needs [Node.js](https://nodejs.org) 20.19 or newer.

```bash
cd poker
npm install
npm run dev
```

Open http://localhost:5173. Use `cd blackjack`, `cd roulette`, `cd pool`, or `cd pokdeng` for the other games.

`npm test` runs the rule and network checks. `npm run build` makes the finished site in `dist/`.

### Visual design

The game picker is plain HTML and CSS, with no JavaScript, downloaded fonts or image assets.
All five games import `room.css` for the shared room setup, controls and the How to play guide. Each game keeps its guide pages in `src/components/rules.tsx`; `HowToPlay.tsx` is the same file in every game.
Their existing card, chip and wheel animations remain in each game's stylesheet.
Keep the green poker, blue blackjack, red roulette, green felt pool and yellow Pok Deng accents, and check layouts at 375 × 667.

### Publishing

Pushing to `main` publishes the site. GitHub Actions runs the tests and build for every game, then puts the
picker page at the root and each game in its own folder. If any game fails, nothing goes live and the
current site stays up.

Players on mobile data sometimes can't connect directly. An optional relay fixes that: set the
`OPENRELAY_APP` variable and `OPENRELAY_API_KEY` secret in the repo settings. The
[Hold'em README](poker/README.md) explains how.

### Adding a game

1. Make a folder with its own Vite app. Keep `base: './'` in its Vite config, and give it `test` and
   `build` scripts.
2. Add the folder name to the `game:` list in `deploy.yml`.
3. Add a game row for it in `index.html`.

</details>

## License

[MIT](LICENSE)
