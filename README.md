# Hold'em P2P

Texas Hold'em for up to 10 players (plus a waiting queue), played in the browser. Free to play with
virtual chips only: no accounts, no money, no game server. One player's browser tab hosts the table and
everyone else connects to it directly (peer to peer).

Works on phones, tablets and desktop browsers.

---

## Quick start

You need [Node.js](https://nodejs.org) 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Open http://localhost:5173, enter a name, and press **Create room**. That tab is now the host.

Other commands:

```bash
npm test         # engine self-checks (dealing, betting rules, side pots, chip conservation)
npm run build    # type-check and build the static site into dist/
npm run preview  # serve the built dist/ locally
```

---

## Playing with other people

Everyone opens the same web page. The host shares the **room code**, the **invite link** or the **QR code**
(tap the room code at the top left, or use the panel shown on the table before the game starts).

### On the same Wi-Fi (quickest way to try it)

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
GitHub Pages works too, but this repository is private and Pages on a private repository
`[UNVERIFIED]` needs a paid GitHub plan.

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

Two phones on mobile data often can't connect directly and need a relay (a TURN server). By default the
app uses the free public Open Relay servers (`[UNVERIFIED]` whether they are still running). For reliable
play, get TURN credentials from any TURN provider and set them before building:

```bash
cp .env.example .env
# then fill in:
# VITE_TURN_URLS=turn:your.turn.host:443?transport=tcp,turn:your.turn.host:80
# VITE_TURN_USERNAME=...
# VITE_TURN_CREDENTIAL=...
```

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
- A room closes after 5 minutes without any player action.

---

## How it works

### The pieces

- **PeerJS** handles the connections. Its free public server is only used to introduce browsers to each
  other (signaling); the game itself travels directly between browsers over WebRTC data channels.
- The **host** is the browser that created the room. It registers the peer id `p2p-holdem-v1-<ROOM CODE>`,
  runs the game engine, and is the only one allowed to change the game state.
- **Clients** send their actions (fold, call, raise, rejoin, leave) to the host. The host checks them
  against the rules and sends every player their own view of the new state.

### Keeping cards secret

Each player receives a **masked** copy of the state: other players' hole cards are replaced with `??`, and
the deck is removed. Hole cards are only revealed at a showdown.

One exception, by design: the **standby** (below) receives the full state so it can take over the hand.
Someone in that seat with browser dev tools open could peek at other players' cards. That trade-off comes
with peer-to-peer failover.

### If the host disconnects

- Every client pings the host every 2 seconds.
- The **standby** is the first connected non-host player by seat order (then queue order). It also receives
  a full snapshot of the game after every change.
- If the host is silent for 6 seconds, the standby promotes itself: it loads the snapshot, contacts every
  player directly, and keeps trying to take over the room code so new players can still join.
- A player whose own host is still answering refuses the promotion, which sends a mistaken standby back
  to being a normal player.
- Players who drop out keep their seat for 60 seconds. After that they are removed from the table.

### Identity and reconnecting

Each tab gets a random id and secret, stored in `sessionStorage`. Reloading the tab sends the same id and
secret, so the host puts you back in your seat. Someone else can't take your seat with your id, because
the secret won't match. Your display name and mute setting are kept in `localStorage`.

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
| `src/engine/pokerEngine.test.ts` | Engine checks, run with `npm test` |
| `src/network/pokerNet.ts` | Host and client networking: message checks, heartbeats, standby snapshots, failover, reconnects |
| `src/App.tsx` | Home screen (create/join), table screen header and footer, invite dialog, notices |
| `src/components/PokerTable.tsx` | The table: seats around the felt, board cards, chips, pots, turn timers, showdown results |
| `src/components/ActionControls.tsx` | Fold / Check / Call / Raise panel with the raise slider |
| `src/components/InviteCard.tsx` | Room code, QR code and share button |
| `src/components/ui.ts` | Shared button and form styles |
| `src/hooks/useAudio.ts` | The "your turn" chime, switched on by the first tap (needed on iPhones) |
| `src/hooks/useWakeLock.ts` | Keeps the screen on while at a table |
| `src/inAppBrowser.ts` | Detects social apps' built-in browsers for the "open in your browser" notice |
| `src/index.css` | Fonts, Tailwind setup and the animations (card deals, chips, pots) |

Built with React 18, TypeScript, Vite, Tailwind CSS 4, PeerJS, `pokersolver`, `qrcode.react`,
Phosphor icons and the Geist font (bundled with the app, no external font requests).

### Timings and limits

These live at the top of `src/engine/pokerEngine.ts` and `src/network/pokerNet.ts`:

| Setting | Value |
|---|---|
| Seats per table | 10 (`MAX_SEATS`) |
| People in a room, seated plus queued | 30 (`MAX_MEMBERS`) |
| Time per turn | 30 s (`TURN_MS`) |
| Pause after a showdown | 6 s (`SHOWDOWN_MS`) |
| Room closes after no player action for | 5 min (`IDLE_MS`) |
| Ping interval / host considered gone after | 2 s / 6 s (`PING_MS`, `DEAD_MS`) |
| Seat kept for a disconnected player | 60 s (`GRACE_MS`) |

### Changing the game

- **Rules or payouts:** edit `pokerEngine.ts`, then add or update a check in `pokerEngine.test.ts` and run
  `npm test`. The random-play check at a full 10-seat table catches chips being created or lost.
- **Message format:** clients and the host must run the same version. If you change messages in
  `pokerNet.ts` in a way older versions can't read, change the `PREFIX` (`p2p-holdem-v1-`) so old and new
  versions can't join each other's rooms.
- **Look and layout:** everything is Tailwind classes in the components. `tall:` in class names means "wide
  and tall screen" (defined in `index.css`), used so short laptop screens keep the mid-size table.

### Accessibility

Keyboard focus is visible on every control, the invite popup is a native `<dialog>` (Escape closes it and
focus stays inside), whose turn it is is announced to screen readers, and all animations are switched off
when the device is set to reduce motion.
