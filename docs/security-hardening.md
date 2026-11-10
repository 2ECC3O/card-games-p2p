# Architecture-preserving security hardening

This pass keeps browser-hosted peer-to-peer games, automatic standby selection/full-state takeover,
six-character room codes, spectators, existing reconnect identities and the current wire protocol.
It adds bounded transport work, snapshot backpressure/no-op suppression, malformed-input checks,
the Pok Deng reserved-identity payout fix, compatible dependency patches and release checks.

`npm test` includes local transport/validation regressions and all game-engine tests. These simulate
connections; they are not a live distributed attack or a real-device recovery test. Before publishing,
smoke-test joining, same-tab reconnect and host-disconnect takeover with two browsers.

The GitHub workflow checks pull requests, `codex/**` pushes and main. Game and video-lockfile audits fail
on high/critical advisories; moderate advisories remain visible and do not block publishing. Deployment
is limited to main. Configure the build job as a required check in GitHub's branch protection settings.
Dependabot proposes weekly npm updates; it does not merge them automatically.

This is not a replacement-host authentication redesign. The existing reconnect-secret and takeover trust
risks remain; the host and automatic full-state backup can inspect every card. Third-party ad/analytics
scripts retain page privileges when enabled. The new limits mitigate room-level resource abuse, but they
cannot protect a player's connection or the public signaling/TURN services from network-level DDoS.
