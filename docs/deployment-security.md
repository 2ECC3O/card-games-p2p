# Security for the GitHub Pages deployment

Automatic takeover is enabled with no setup. The host selects the first connected player, then a queued
participant, then a spectator/tournament display if needed. Selection updates automatically when a browser
leaves or disconnects. The selected browser keeps the full game state and resumes the same hand/rack after
the host has been silent for six seconds. Signed joins and successor-key checks protect seat identities
without adding accounts or confirmation screens.

## What the application protects

| Boundary | Current protection |
|---|---|
| Reconnects and takeover | Native ECDSA P-256 challenges bound to the room, both transport peer IDs and fresh nonces; pinned public keys; reusable secrets never sent |
| Incoming traffic per link | 60 frames/second; at most 32 queued frames and 256 KiB queued compressed bytes |
| Incoming traffic per browser/room | 128 queued frames total and 512 KiB compressed bytes/second across all links |
| New connection churn | 60 admissions/second across all peer IDs; at most 60 live/pending links; six-second unauthenticated-link timeout |
| Expensive handshake work | 60 control/handshake messages/second across the room; unknown peers cannot request signed promotion refusals |
| Client commands and unauthenticated messages | 16 KiB packed and unpacked limits; larger compressed payloads are cancelled before JSON parsing |
| Authenticated host snapshots | 64 KiB packed and 1 MiB unpacked per message |
| Outgoing traffic | Coalesce pending full states; at most 32 queued sends; close links with 32 PeerJS buffered sends or over 2 MiB buffered RTC data |
| Room membership | 30 current members; retain identity pins for up to 256 distinct identities over a room's lifetime |
| Browser navigation | No referrer URLs sent by our pages; CSP restricts base URLs and form destinations to this origin and disables plugin objects |
| Release checks | Tests/builds on pull requests; high/critical npm advisories block the game deployment; weekly npm update proposals |

Limits are centralized in `shared/tableNet.ts` and `shared/codec.ts`. They reject abusive connections rather
than introducing a global gameplay lock. Established heartbeats do not consume the handshake budget, and
the budgets reset automatically. Connection attempts and joins can still fail during overload: bounded
work is a mitigation, not a promise of availability under an attack. The CSP intentionally does not claim
to sandbox advertising or analytics scripts.

## What GitHub Pages cannot solve for this architecture

The site is static. GitHub serves the HTML/JS; PeerJS's public service performs signaling; the host browser
runs the game; optional TURN service carries relayed data. Website traffic and WebRTC traffic are different
paths. A website CDN/WAF does not sit in front of the players' direct data channels.

GitHub publishes service bandwidth limits and can rate-limit Pages traffic. You cannot deploy custom
server middleware, IP-based room admission controls, a TURN-secret broker, or your own WAF rules at the
`github.io` project URL. Public signaling availability and direct attacks on a player's internet connection
remain outside the JavaScript application's control. **These changes do not make the game DDoS-proof.**

References: [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits),
[PeerJS signaling architecture](https://peerjs.com/client/faq),
[PeerServer hosting options](https://peerjs.com/server/getting-started).

## Before publishing this branch

1. In the repository's **Settings → Pages**, enable **Enforce HTTPS**. Native room authentication needs
   HTTPS or localhost; do not remove it to support insecure LAN URLs.
2. Use a rule protecting `main`: require pull requests and the workflow's build job, restrict direct pushes,
   and retain GitHub account two-factor authentication. These are account/repository settings, not settings
   this branch can enforce by changing source files.
3. Run `npm ci`, `npm test`, `npm run build`, and `npm audit --audit-level=high --ignore-scripts`.
   The Pages workflow performs the same checks. Pull-request runs cannot enter its deployment job.
4. On two real browsers, join a room, start a hand, close the host, and verify automatic continuation and
   same-tab reconnect. Include a mobile connection and a tournament display. Automated attack regressions
   use simulated transports and are not a production traffic/load test.
5. Deploy between game nights and have everyone refresh. Protocol prefixes changed for signed authentication;
   old and new pages cannot share a room. Retest invites and all six game routes after deployment.
6. Keep ad and analytics IDs empty until the accounts, privacy disclosures and ad consent setup are ready.
   Third-party scripts execute with page privileges, including access to same-origin session storage.
7. If TURN is configured, inspect provider domain restrictions, usage alerts and quota/spending controls.
   The current static credential API configuration is public in the built JS. Never treat it as a private
   backend secret. Rotate exposed credentials when required by the provider and monitor unusual relay use.

## Trust and future infrastructure

The host and automatic full-state backup can inspect the deck. Spectators see hands intentionally. An
untrusted participant can copy information already sent to its browser. Automatic private-state recovery
does not turn this into a cash-safe or adversarial tournament system. This tradeoff is retained to preserve
the requested seamless, friends-only gameplay; stronger card secrecy needs a different game-server or
multi-party protocol design.

If abuse exceeds the room limits, the next deployment step is a controlled signaling service with admission
and per-IP limits, provider-backed network DDoS protection, and short-lived TURN credentials from a protected
backend. A custom-domain website proxy protects HTTP traffic only unless separately configured services cover
signaling and relay traffic. That infrastructure is not provisioned by this GitHub Pages branch.
