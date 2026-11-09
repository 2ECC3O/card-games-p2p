# Traffic and gameplay analytics

The home page and all six game pages share two independently optional providers:

| Provider | Purpose | What to look at |
|---|---|---|
| Cloudflare Web Analytics | Public-page traffic and performance | Home-page versus each game's pageviews |
| Umami | Sanitized pageviews and actual interaction | Each game's pageviews versus `game_played` events |

Both are **disabled by default**. Set their public IDs once in the root `analytics-config.js`:

```js
window.cardGamesAnalytics = Object.freeze({
  cloudflareToken: "", // Cloudflare's 32-character site token
  umamiWebsiteId: "",  // Umami's website UUID
});
```

Leave either value empty to disable that provider. There are no npm analytics dependencies, Google Analytics,
tag managers, automatic click tracking, user identification, recordings, or custom events containing game state.
The loaders honor Do Not Track and Global Privacy Control and skip localhost previews.

## Read the visit-to-play numbers

In Umami, filter pageviews to a game path, for example `/card-games-p2p/poker/`. Compare those views with
`game_played` events for that path (`game: poker`). The event is emitted once per page visit, on the first
manually submitted gameplay action: a bet, check, card play, shot, or other game action. It is emitted through
the shared `TableNet.act` path, so all six games use the same measurement.

Merely opening a game, creating a room, pressing Start, adding bots, reading rules, or spectating does not
produce this event. Bots and automatic turns use the engine's tick path and do not produce it either.
An action made while the tracker is still loading is remembered in memory and sent if loading succeeds.

**Play rate ≈ game_played events ÷ that game's Umami pageviews.** This estimates visits with interaction,
not unique players, completed rounds, accepted server moves, or minutes played. Reloading begins a new visit.
The signal records an action submitted from the UI; it is not a gameplay audit. Tracking blocks and failed
requests can undercount. Compare pageviews and events within Umami; do not add or divide across the two vendors.

## Privacy boundaries

- Umami automatic collection is disabled. We send an explicit allowlist: website ID, hostname, canonical
  pathname, a generic page title, and an empty referrer. The sole event adds `name: game_played` and
  `data: { game: "poker" }` (or another fixed game name).
- Query strings and hashes are excluded. There are no room codes, player names, identity secrets, cards,
  bets, chip amounts, or per-player identifiers in our Umami payloads. Invite visitors are counted under the
  ordinary game path, never under a room URL.
- Cloudflare has no custom-payload hook. We skip its beacon on entry URLs with query strings and visits whose
  referrer includes a query string or fragment, and disable SPA tracking. These visits still get sanitized
  Umami measurements if enabled. Cloudflare traffic figures will therefore intentionally undercount invites.
- Both services receive ordinary network requests when enabled. Disclose the providers and purposes in the
  site's privacy information before activation. Ads have their own separate consent requirements.

See [Cloudflare's privacy explanation](https://www.cloudflare.com/web-analytics/),
[its lack of custom events](https://developers.cloudflare.com/web-analytics/faq/), and
[Umami's tracker configuration](https://docs.umami.is/docs/tracker-configuration).

## Enable Cloudflare

1. Sign into [Cloudflare](https://dash.cloudflare.com/), then open **Web Analytics → Add a site**.
   The site can stay on GitHub Pages; no DNS or hosting move is required for manual installation.
2. Enter `2ecc3o.github.io` (the hostname, without `/card-games-p2p/`), or your custom domain.
3. In **Manage site**, use manual snippet installation and copy `token` from `data-cf-beacon` in its snippet.
   It is a public 32-character hexadecimal site token, not an account API token.
4. Set `cloudflareToken` in `analytics-config.js`. Do not paste the script as well; our loader installs it.
   Leave Cloudflare automatic injection off to avoid duplicates and preserve opt-outs and private-URL guards.
5. After deployment, visit a page without a query string and check the Network panel for
   `static.cloudflareinsights.com/beacon.min.js` and `cloudflareinsights.com/cdn-cgi/rum`.
   Some performance metrics report when the page becomes hidden. Dashboard data may take a few minutes.

Reference: [official manual setup](https://developers.cloudflare.com/web-analytics/get-started/).

## Enable Umami

1. Create an [Umami Cloud account](https://cloud.umami.is/) and add your website in its dashboard.
2. Open the website's **Edit → Tracking code** section and copy `data-website-id` (a UUID).
   Set `umamiWebsiteId` in `analytics-config.js`. This is a public website ID, not an API credential.
3. Do not paste its tracking snippet: the shared loader uses the official `https://cloud.umami.is/script.js`
   with automatic tracking disabled. Pageviews and the one gameplay event are sent manually with sanitized data.
4. Publish when ready, open a game, then create or join a room and submit a gameplay action.
   In Umami, check that one pageview and a `game_played` event appear. The event's `game` property identifies
   the game, and repeated moves in that same page visit should not add further events.
5. To self-host later, replace the one Umami script URL in `analytics.js` with your instance's HTTPS script URL
   and use its website ID. No backend is bundled in this repository.

References: [get the tracking code](https://docs.umami.is/docs/collect-data),
[manual pageview/event payloads](https://docs.umami.is/docs/tracker-functions).

## Verify and publish

`npm test` includes the ad loader, analytics privacy guards, early/duplicate play events, all six game paths,
the shared action signal, networking, and the game engines. `npm run build` bundles analytics into each game;
the Pages workflow copies the root configuration/loader for the home page. Change IDs before building/deploying.
Empty the IDs and rebuild to disable collection. Network blocks fail quietly with no retry or bypass.
