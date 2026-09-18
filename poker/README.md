# Hold'em P2P

Part of [Card Games P2P](../README.md), next to [Blackjack](../blackjack/README.md).

Texas Hold'em for up to 10 players (plus a waiting queue), played in the browser. Free to play with
virtual chips only: no accounts, no money, no game server. One player's browser tab hosts the table and
everyone else connects to it directly (peer to peer).

Works on phones, tablets and desktop browsers.

There are two ways to use it:

| I want to... | Do this |
|---|---|
| **Play right now** | Open **https://2ecc3o.github.io/card-games-p2p/poker/**. Nothing to install, no account. |
| **Run or change the code on my own computer** | Follow [Run it on your own computer](#run-it-on-your-own-computer) (needs a few free tools). |

---

## Play right now

1. Open **https://2ecc3o.github.io/card-games-p2p/poker/** in Safari, Chrome, Firefox or Edge.
2. **To start a table:** type your name, choose a starting stack and blind speed, and press **Create room**.
3. **To invite friends:** share the **room code**, the **invite link** or the **QR code**. They're on the
   table before the game starts, and behind the room code button at the top left afterwards.
4. **Your friends** open the link (or the page, then type the code), enter their name and press **Join**.
   They can be anywhere: same Wi-Fi, another house, or on mobile data.
5. When at least 2 players are in, the room creator presses **Start game**.

Keep the page open while you play. The game runs in the players' browsers, so if everyone closes the page,
the room ends. See [How to play](#how-to-play) for the rules and controls.

---

## Run it on your own computer

You only need this if you want to change the game or host your own copy. To just play, use the link above.

**1. Install the tools (once):**
- [Node.js](https://nodejs.org), version 20.19 or newer. The "LTS" download is fine.
- [Git](https://git-scm.com/downloads), to download the code (optional: see step 2).

**2. Download the code.** Either:
- open a terminal and run:
  ```bash
  git clone https://github.com/2ECC3O/card-games-p2p.git
  ```
  ```bash
  cd card-games-p2p/poker
  ```
- or, without Git: on https://github.com/2ECC3O/card-games-p2p press **Code > Download ZIP**, unzip it, and
  open a terminal in its `poker` folder.

**3. Install and start it:**
```bash
npm install
```
```bash
npm run dev
```

**4. Open http://localhost:5173** in your browser. The game reloads by itself when you edit the code.
Press `Ctrl+C` in the terminal to stop it.

Other commands:

```bash
npm test         # engine and codec self-checks (dealing, betting rules, side pots, chip conservation)
npm run build    # type-check and build the finished site into dist/
npm run preview  # serve the built dist/ locally
```

---

## Hosting your own copy

Your local copy from the steps above only runs on your computer. To play it with other people:

### On the same Wi-Fi, straight from your computer

1. Start the dev server so other devices can reach it:
   ```bash
   npm run dev -- --host
   ```
2. Vite prints a `Network:` address such as `http://192.168.1.20:5173`. **Open the game at that address**
   on your own computer (not `localhost`) *before* you create the room. The invite link and QR code use
   whatever address you opened.
3. Friends scan the QR code or open the link. Windows may ask to let Node through the firewall; allow it.

On a plain `http://` address two phone features are switched off by the browser (see
[Why HTTPS](#why-https)): the **Share link** button can't share or copy, and the screen won't be kept awake.
The QR code, room code and the game itself still work.

### Over the internet

Put the built site on any static host with HTTPS and send people the link:

1. `npm run build`
2. Upload the `dist/` folder, or connect the repository to a host such as Netlify or Cloudflare Pages
   with build command `npm run build` and output folder `dist`.

The site uses relative paths (`base: './'` in `vite.config.ts`), so it also works from a sub-folder.

**The repository already publishes itself to GitHub Pages.** Every push to `main` runs
`.github/workflows/deploy.yml` (at the repository root): install, `npm test` and `npm run build` for each
game, then deploy them together, this one to https://2ecc3o.github.io/card-games-p2p/poker/. If any tests or
build fail, nothing is deployed. You can also
start a deployment by hand from the repository's **Actions** tab (**Deploy to GitHub Pages**, then
**Run workflow**). In a fork, turn it on under **Settings > Pages > Source: GitHub Actions**.

### Why HTTPS

A page served over HTTPS (or from `localhost`) counts as a "secure context", and browsers only give some
features to secure pages:

| Feature | Used for | On plain `http://` |
|---|---|---|
| Web Share API and clipboard | **Share link** button | Does nothing |
| Screen Wake Lock API | Keeping the phone screen on during a game | Screen dims and locks as usual |

The game itself (WebRTC connections, cards, chips) doesn't need HTTPS, so it should also work over plain
`http://` (`[UNVERIFIED]` on real phones; only tested on `localhost`). HTTPS additionally
encrypts the page download, so nobody on the same network (for example public Wi-Fi) can alter the game
files on the way. Static hosts such as Netlify and Cloudflare Pages give you HTTPS automatically.

### Players on mobile data or strict networks

Most players connect directly. Players whose network blocks that (common on mobile data, personal
hotspots, and hotel, school or office Wi-Fi) need a **relay** (a TURN server). The site works without one;
those players just can't connect.

The live site uses an **Open Relay** free account (by Metered, 20 GB of relay traffic a month). The
game sends compressed messages, so a fully relayed 10-player table uses very roughly 20 MB an hour.

To set it up for your own deployment:

1. Sign up at https://www.metered.ca/tools/openrelay/ and create an app. Note the **app name**
   (the `<name>` in `<name>.metered.live`) and the **API key**.
2. Store them in the GitHub repository (the deploy workflow passes them into the build):
   ```bash
   gh variable set OPENRELAY_APP
   gh secret set OPENRELAY_API_KEY
   ```
3. Run the **Deploy to GitHub Pages** workflow again (Actions tab), or push a commit.

For a local build, put the same values in `.env` as `VITE_OPENRELAY_APP` and `VITE_OPENRELAY_API_KEY`
(see `.env.example`).

The API key ends up in the site's JavaScript, where anyone can read it. On the free plan the worst case is
someone using up the monthly allowance, after which relayed players can't connect until it resets; there
is no bill. If the relay can't be reached, the game carries on with direct connections only.

Checked on the live site: the credentials request succeeds from the page, and a test connection forced
through the relay (over UDP, and separately over TCP/TLS for networks that block UDP) delivered its
message, with about 430 ms round trip.

---

## Phones and browsers

The app is built for **Safari 16.4+, Chrome 111+ and Firefox 128+** (the minimums of Tailwind CSS 4, which it
uses). On iPhone and iPad, browsers use Safari's engine (Apple's rule; the EU allows other engines since
iOS 17.4 `[UNVERIFIED]` but major browsers there still mostly use Safari's), so iOS 16.4 or newer is needed. It has been
tested in desktop Chrome at phone, tablet and laptop sizes, **not yet on real iPhones or Android phones**.

Things phones do differently:

- **Screen lock and app switching pause the page.** While you're at a table the app asks the browser to keep
  the screen on (HTTPS only, and the browser may refuse, e.g. in battery saver). If a phone does lock:
  the room creator's seat is taken over by another player after about 6 seconds, a player whose turn it is
  gets checked or folded after 30 seconds, and anyone who comes back within 60 seconds keeps their seat.
- **Sound:** iPhones only allow sound after a tap, so the turn chime is switched on by your first tap on the
  page (Create, Join, Start...). No vibration on iPhones; Safari doesn't support it.
- **Links opened inside apps** (Instagram, Facebook, Messenger, LINE, Snapchat, TikTok, WeChat...) open in
  that app's built-in browser, which can block the connections. The home screen detects these and asks the
  player to open the page in Safari or Chrome.

## How to play

- **Create a room:** pick a starting stack and a blind speed. Blinds start at 10/20 and go up every
  5 (Fast), 10 (Standard) or 20 (Slow) hands. **Custom** lets you type your own levels, e.g.
  `10/20, 25/50, 50/100`, and how many hands each level lasts.
- **Join a room:** enter your name and the 6-character room code, or open an invite link.
- **Start:** the host presses **Start game** once at least 2 players are seated.
- **Your turn:** you have 30 seconds, shown as a countdown and a draining bar on your name card
  (everyone can see whose turn it is). If time runs out you check when you can, otherwise you fold.
  A short chime plays when the action reaches you; the speaker button in the header mutes it.
- **Betting:** Fold, Check or Call, and Bet/Raise with the slider or the ½ pot, Pot and Max shortcuts.
  Bets fly out of your seat onto the table and slide into the pot when the betting round ends.
- **Pots:** when someone is all-in for less, the middle shows the main pot and side pots separately.
  At showdown each pot is awarded on its own and the chips fly to the winners.
- **Seats and queue:** a table seats 10. Anyone who joins after the game starts, or when the table is
  full, waits in the queue and is dealt in at the next hand when a seat is free.
- **Out of chips:** press **Rejoin** to go back into the queue with a fresh starting stack.
- **Leaving and reloading:** reloading the tab puts you back in the same seat if you return within
  60 seconds. **Leave** gives up your seat.
- **Removing someone (room creator only):** tap the room code at the top left, then **Remove** next to their
  name in the **Players** list and tap again to confirm. They're taken out of the room (folded if a hand is
  running) and can't rejoin it from that browser tab.
- A room closes after 5 minutes without any player action.

---

## How it works

### The pieces

- **PeerJS** handles the connections. Its free public server is only used to introduce browsers to each
  other (signaling); the game itself travels directly between browsers over WebRTC data channels.
- The **host** is the browser that created the room. It registers the peer id `p2p-holdem-v3-<ROOM CODE>`,
  runs the game engine, and is the only one allowed to change the game state.
- **Clients** send their actions (fold, call, raise, rejoin, leave) to the host. The host checks them
  against the rules and sends every player their own view of the new state.
- **Messages are compressed** (JSON packed with the browser's built-in `CompressionStream`, see
  `src/network/codec.ts`). A 10-player game state shrinks from about 5.5 KB to under 1 KB, which keeps
  relay (TURN) usage and mobile data low: measured at roughly 40 KB per player per hand, both directions,
  including network overhead. Messages over 64 KB compressed or 1 MB unpacked are dropped, so nobody can
  crash a tab with a "decompression bomb".

### Keeping cards secret

Each player receives a **masked** copy of the state: other players' hole cards are replaced with `??`, and
the deck is removed. Hole cards are only revealed at a showdown.

One exception, by design: the **standby** (below) receives the full state so it can take over the hand.
Someone in that seat with browser dev tools open could peek at other players' cards. That trade-off comes
with peer-to-peer failover. The standby's copy holds only fingerprints of players' reconnect secrets, never
the secrets themselves, so it can't be used to take over someone else's seat.

### If the host disconnects

- Every client pings the host every 2 seconds.
- The **standby** is the first connected non-host player by seat order (then queue order). It also receives
  a full snapshot of the game after every change.
- If the host is silent for 6 seconds, the standby promotes itself: it loads the snapshot, contacts every
  player directly, and keeps trying to take over the room code so new players can still join.
- A player whose own host is still answering refuses the promotion, which sends a mistaken standby back
  to being a normal player. Only players the new host contacted itself can do that.
- Players who drop out keep their seat for 60 seconds. After that they are removed from the table.

### Identity and reconnecting

Each tab gets a random id and secret, stored in `sessionStorage`. Reloading the tab sends the same id and
secret, so the host puts you back in your seat. Someone else can't take your seat with your id, because
the secret won't match. The host keeps only a SHA-256 fingerprint of each secret (`src/network/sha256.ts`,
plain JavaScript so it also works on `http://` pages). Your display name and mute setting are kept in
`localStorage`. Names are cleaned of invisible and text-reversing characters before anyone sees them.

### Rules the engine follows

- Standard no-limit Hold'em betting. Heads-up, the dealer posts the small blind and acts first before the flop.
- A raise must be at least the size of the previous raise. An all-in for less than that does not reopen
  raising for players who already acted.
- If only one player can still bet, the remaining board cards are dealt out automatically.
- Side pots are built from how much each player put in; each pot only goes to players who matched it.
  Chips from players who folded stay in the pots. An uncalled bet is returned to its owner.
- Split pots are divided evenly; odd chips go to the winner closest to the left of the dealer.
- Hands are ranked with [`pokersolver`](https://www.npmjs.com/package/pokersolver).

---

## Project layout

| Path | What's in it |
|---|---|
| `src/types/poker.ts` | Types: cards, players, pots, game state, actions |
| `src/engine/pokerEngine.ts` | The rules. Pure functions: deal, betting rounds, side pots (`buildPots`), showdown, turn timeouts (`hostTick`), per-player masking (`maskFor`) |
| `src/engine/pokerEngine.test.ts` | Engine checks (rules, side pots, hand rankings, names), run with `npm test` |
| `src/network/iceServers.ts` | Which STUN and relay (TURN) servers browsers use, including fetching Open Relay credentials |
| `src/network/codec.ts` | Compresses and decompresses messages between browsers, with size limits |
| `src/network/sha256.ts` | SHA-256, for fingerprinting reconnect secrets |
| `src/network/network.test.ts` | Checks for the codec, its size limits and SHA-256, run with `npm test` |
| `src/network/pokerNet.ts` | Host and client networking: message checks, heartbeats, standby snapshots, failover, reconnects |
| `src/App.tsx` | Home screen (create/join), table screen header and footer, invite dialog, notices |
| `src/components/PokerTable.tsx` | The table: seats around the felt, board cards, chips, pots, turn timers, showdown results |
| `src/components/ActionControls.tsx` | Fold / Check / Call / Raise panel with the raise slider |
| `src/components/InviteCard.tsx` | Room code, QR code and share button |
| `src/components/ui.ts` | Shared button and form styles |
| `src/hooks/useAudio.ts` | The "your turn" chime, switched on by the first tap (needed on iPhones) |
| `src/hooks/useWakeLock.ts` | Keeps the screen on while at a table |
| `src/index.css` | Fonts, Tailwind setup and the animations (card deals, chips, pots) |
| `../.github/workflows/deploy.yml` | Tests, builds and publishes both games to GitHub Pages on every push to `main` |
| `../.github/dependabot.yml` | Keeps the workflow's pinned actions up to date |

Built with React 18, TypeScript, Vite, Tailwind CSS 4, PeerJS, `pokersolver`, `qrcode.react`,
Phosphor icons and the Geist font (bundled with the app, no external font requests).

### Timings and limits

These live at the top of `src/engine/pokerEngine.ts` and `src/network/pokerNet.ts`:

| Setting | Value |
|---|---|
| Seats per table | 10 (`MAX_SEATS`) |
| People in a room, seated plus queued | 30 (`MAX_MEMBERS`) |
| Waiting queue | 20 (`MAX_QUEUE`) |
| Time per turn | 30 s (`TURN_MS`) |
| Pause after a showdown | 6 s (`SHOWDOWN_MS`) |
| Room closes after no player action for | 5 min (`IDLE_MS`) |
| Ping interval / host considered gone after | 2 s / 6 s (`PING_MS`, `DEAD_MS`) |
| Seat kept for a disconnected player | 60 s (`GRACE_MS`) |

### Changing the game

- **Rules or payouts:** edit `pokerEngine.ts`, then add or update a check in `pokerEngine.test.ts` and run
  `npm test`. The random-play check at a full 10-seat table catches chips being created or lost.
- **Message format:** clients and the host must run the same version. If you change messages in
  `pokerNet.ts` in a way older versions can't read, change the `PREFIX` (currently `p2p-holdem-v3-`) so old and new
  versions can't join each other's rooms.
- **Look and layout:** everything is Tailwind classes in the components. `tall:` in class names means "wide
  and tall screen" (defined in `index.css`), used so short laptop screens keep the mid-size table.

### Accessibility

Keyboard focus is visible on every control, the invite popup is a native `<dialog>` (Escape closes it and
focus stays inside), whose turn it is is announced to screen readers, and all animations are switched off
when the device is set to reduce motion.

---

## Security notes

This is a game for friends with virtual chips, and there is no server to trust, so some limits come with the
design:

- **Anyone with the room code can join.** Codes are random (6 characters), but share them only with people
  you want at the table. The room creator can remove players, though someone determined could come back
  from a new browser tab.
- **The host's browser runs the game**, so a host who edits the page's code could cheat. The standby
  player can see all cards (see [Keeping cards secret](#keeping-cards-secret)).
- **The relay API key is visible** in the site's JavaScript (see
  [Players on mobile data or strict networks](#players-on-mobile-data-or-strict-networks)).

What is protected: seats can't be taken over without their secret, messages are size-limited and checked
before use, shuffling uses the browser's cryptographic random numbers, and players only receive their own
hole cards. The deploy workflow pins every action to an exact commit, and Dependabot alerts are on.

Found a problem? Open an issue on GitHub.

---

## License

The code is released under the [MIT License](../LICENSE). The bundled Geist and Geist Mono fonts are under the
SIL Open Font License 1.1, and each dependency keeps its own license (all permissive: MIT or ISC).
