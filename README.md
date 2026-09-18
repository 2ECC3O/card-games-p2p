# Card Games P2P

Card games to play with friends in the browser. Free, virtual chips only: no accounts, no money, no game
server. One player's browser tab hosts the table and everyone else connects to it directly (peer to peer).

**Play: https://2ecc3o.github.io/card-games-p2p/**

| Game | Play | Code |
|---|---|---|
| Texas Hold'em, up to 10 players | https://2ecc3o.github.io/card-games-p2p/poker/ | [`poker/`](poker/README.md) |
| Blackjack, up to 7 players against the house | https://2ecc3o.github.io/card-games-p2p/blackjack/ | [`blackjack/`](blackjack/README.md) |

Each game is its own Vite + React app with its own `package.json`. To work on one:

```bash
cd poker
npm install
npm run dev
```

(or `cd blackjack`). Each folder's README covers its rules, tests and hosting.

## Publishing

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): for each game
`npm ci`, `npm test` and `npm run build`, then one GitHub Pages site with the game picker
([`index.html`](index.html)) at the root and each game in its own folder. If any game's tests or build fail,
nothing is deployed. The optional TURN relay settings (`OPENRELAY_APP` variable, `OPENRELAY_API_KEY`
secret) apply to both games.

## License

[MIT](LICENSE)
