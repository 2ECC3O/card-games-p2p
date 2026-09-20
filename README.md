# Card Games P2P

Poker, blackjack and roulette you play with friends in the browser. Free, fake chips, no sign-up.

**Play now: https://2ecc3o.github.io/card-games-p2p/**

## The games

| Game | Players | You play against | Link |
|---|---|---|---|
| Texas Hold'em | 2 to 10 | each other | [play](https://2ecc3o.github.io/card-games-p2p/poker/) |
| Blackjack | 1 to 7 | the dealer (the app deals) | [play](https://2ecc3o.github.io/card-games-p2p/blackjack/) |
| Roulette | 1 to 10 | the wheel (the app spins it) | [play](https://2ecc3o.github.io/card-games-p2p/roulette/) |

## Start a game in a minute

1. Open the link and pick a game.
2. Type your name and press **Create room**.
3. Send your friends the room code or the link, or let them scan the QR code.
4. When everyone is in, press **Start**.

Your friends don't need to be on your Wi-Fi. They can join from anywhere, mobile data included.

## What if...

| If... | Then |
|---|---|
| someone joins late | they wait in a queue and get dealt in at the next hand |
| a player reloads the page or their phone locks | they keep their seat if they come back within 60 seconds |
| the person who made the room leaves | another player's browser takes over after about 6 seconds and the game goes on |
| a player takes too long | the game moves on for them: check or fold after 30 s in Hold'em, stand after 20 s in blackjack, betting closes after 25 s in roulette |
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

Each game's own README has the full rules and details:
[Hold'em](poker/README.md) · [Blackjack](blackjack/README.md) · [Roulette](roulette/README.md)

## For developers

<details>
<summary>Folders, running it locally, publishing, adding a game</summary>

### Folders

| Path | What's in it |
|---|---|
| `poker/` | the Hold'em app (Vite + React + TypeScript) |
| `blackjack/` | the blackjack app, same stack and design |
| `roulette/` | the roulette app, same stack and design |
| `index.html` | the game picker page at the root of the site |
| `.github/workflows/deploy.yml` | tests, builds and publishes everything |

Each game is its own app with its own `package.json`. They don't share code; blackjack started as a
copy of Hold'em's networking and styling, and roulette as a copy of blackjack's.

### Run a game on your computer

Needs [Node.js](https://nodejs.org) 20.19 or newer.

```bash
cd poker
npm install
npm run dev
```

Open http://localhost:5173. Use `cd blackjack` or `cd roulette` for the other games.

`npm test` runs the rule and network checks. `npm run build` makes the finished site in `dist/`.

### Visual design

The game picker is plain HTML and CSS, with no JavaScript, downloaded fonts or image assets.
All three games import `room.css` for the shared room setup, controls and table styling.
Their existing card, chip and wheel animations remain in each game's stylesheet.
Keep the green poker, blue blackjack and red roulette accents, and check layouts at 375 × 667.

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
