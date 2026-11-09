# Security audit — Card Games P2P

Date: 9 November 2026 (Asia/Bangkok). Baseline commit: `647e160bd71fc999994f22fe8164f556f4516563`, plus the working tree inspected during the audit.

The original audit identified two High and three Medium findings. Follow-up changes are implemented locally; they have not been deployed. Automatic takeover has subsequently been restored at the user's request. The original evidence below describes the vulnerable baseline. Severity reflects this application's virtual-chip, friends-only context; there is no demonstrated cash or payment impact.

## Follow-up fixes

- **Seat theft:** raw reconnect secrets were replaced on the wire by native ECDSA P-256 challenge signatures bound to the room, both transport peer IDs, and fresh nonces. Public identity keys are retained after leave/expiry and copied to the trusted backup; they cannot be used to sign as another player. Host and advertised successor keys are pinned across reloads. Unauthorized host messages, signature replay, and delayed old-host liveness evidence are rejected.
- **Private snapshots — accepted residual risk:** automatic backup selection and seamless takeover are restored without a selector or opt-in. A connected player, queued participant, or spectator/tournament display receives the full state and can inspect it. Other ordinary views remain masked. Exact-hand recovery is preserved. The original private-snapshot secrecy finding is therefore not fully remediated; it remains a documented trust tradeoff rather than being marked fixed.
- **Pok Deng payouts:** reserved position names are rejected as remote identities, and dealing-order filters are mutually exclusive so each hand is dealt and settled once, even for an old malformed identity.
- **Resource amplification:** per-link and aggregate room input queues/bytes, connection churn, expensive control work, active links, and outgoing buffers are bounded. Unauthenticated/client commands have a 16 KiB decompression ceiling, while legitimate recovery snapshots retain the larger allowance. Pending states are coalesced and no-op rejoin requests do not broadcast. These mitigate room-level abuse; they do not stop distributed network attacks or protect the public signaling/TURN providers.
- **Dependencies:** the game workspace audit now reports zero vulnerabilities. Compatible video tooling updates remove all High/Low findings; eight Moderate package-chain findings remain from upstream lint tooling's minimatch dependency. No incompatible override was introduced. Video lint passes, but its bundle build is blocked by Windows Application Control rejecting Rspack's native binary. All six game builds pass.

The normal `npm test` runs network/security regressions, codec/hash checks, landing-page tests, and all six engine suites. The network regressions now assert automatic selection, fallback and exact-hand takeover in addition to signed identity protections, replay rejection and resource ceilings. The manual backup control and its test were removed. These are local simulated transports, not live production attacks. See [GitHub Pages deployment security](../docs/deployment-security.md) for the protection boundaries and release steps.

Run the focused checks with `node --import tsx --test shared/tableNet.test.mjs`, or use the updated `node --import tsx security-audit/reproduce.mjs` runner for network and Pok Deng attack regressions. The runner now asserts that the attacks fail, rather than asserting the old vulnerable behavior.

Secure connections now require **HTTPS or localhost** for native browser signatures. All six protocol prefixes were bumped, so old and updated pages do not share a room. The trusted host, automatic full-state backup, open spectator visibility, public TURN credentials, and third-party-script trust assumptions remain as described in the READMEs.

## Original audit evidence

## Scope and verification

Reviewed the shared PeerJS/WebRTC room protocol, message compression and limits, identities and reconnects, all six games' network adapters and engine action/masking paths, browser input/rendering paths, dependency lockfiles, and GitHub Pages deployment configuration. The new home advertisement and analytics loaders were also reviewed as they appeared in the working tree.

Verification completed at the original audit, before fixes:

- `npm test`: passed the home-advertisement and analytics checks, shared codec/hash checks, and all six engine suites.
- The original version of `node --import tsx security-audit/reproduce.mjs` confirmed the four application findings below using local objects and actual message encoding/decoding. Those historical probes asserted vulnerable behavior. The runner has since been replaced by the protection checks described above.
- Root `npm audit --json --ignore-scripts`: two affected packages, both rated High by npm.
- Root `npm audit --omit=dev --json --ignore-scripts`: zero reported vulnerabilities.
- Separate `ad-video` audit: 21 affected packages, including dependency-chain propagation: 10 High, 9 Moderate, 2 Low. These are package counts, not 21 independently demonstrated exploits.

This was a source and dependency audit with local reproductions. Live player sessions, the deployed asset revision, signaling/TURN infrastructure configuration, account billing, and production HTTP headers were not tested. Concurrent changes to the landing page, advertising/analytics code, package test script, and deployment workflow were observed; those changes were preserved. Only this report and its reproduction script were added. No application fixes were made.

## 1. High — Replacement hosts are not authenticated before credentials or state are accepted

Evidence: `shared/tableNet.ts:224`, `339–375`, `471–489`.

Every incoming connection is wired into the same client message handler. When the current host has been silent for six seconds, any connection that sends `promote` receives the client's complete `hello`, including its reusable reconnect secret. The sender is not checked against the previously advertised standby. An unsolicited `state` is likewise accepted once the old host is absent or stale. Even while the host is healthy, `error` and `reject` messages are accepted from unrelated connections without validating their payload type.

An attacker must know the target's PeerJS ID. A room participant selected as standby receives every member's PeerJS ID in its snapshot, providing a concrete route to that information. During a disconnect/reconnect window, the attacker can obtain the target's secret, reconnect to the real room using the target's identity, disconnect its existing seat connection, and act as that player. It can also supply forged game state to the target. Normal transport encryption does not authenticate application-level authority to replace the host.

The local reproduction confirms disclosure of the secret, successful use of that secret to replace a seat connection, acceptance of forged state, and delivery of an object-valued error from an unrelated peer. It does not perform a live takeover.

**Remediation:** Pin the current host and advertised standby to their transport peer identities, authenticate a replacement before sending reconnect credentials, and reject messages from every other connection. Derive each member's reconnect destination from `conn.peer` rather than the client-supplied `hello.peerId`. Validate accepted host-message shapes before updating the UI or promotion snapshot. Add transport-level tests for unsolicited connections during normal play and recovery.

## 2. High — An automatically selected playing standby receives the entire secret game state

Evidence: `shared/tableNet.ts:522–531`; compare the masking in `poker/src/engine/pokerEngine.ts:391`, `blackjack/src/engine/blackjackEngine.ts:356`, `pokdeng/src/engine/pokDengEngine.ts:407`, and `slave/src/engine/slaveEngine.ts:354`.

The first connected player or queued player is automatically selected as standby. Its `state` property is masked, but the same message includes `snapshot.state` containing the original unmasked state. In card games this exposes opponents' hidden cards and, where applicable, the full remaining deck or shoe while the original host is still present. A waiting queued client can receive it too.

The reproduction starts a normal poker hand and confirms that the standby's ordinary view contains `??` and an empty deck, while its snapshot contains the real cards and remaining deck. No host failure or special spectator role is required. This bypasses the documented expectation that ordinary players receive only permitted cards. Spectators intentionally seeing hands and the host intentionally controlling the deck are separate, documented trust decisions.

**Remediation:** Make full-state standby an explicit trusted role chosen by the host and disclosed to players; do not silently assign it to an ordinary player or queued entrant. Disabling automatic full-state backup is the smallest immediate containment. Preserving seamless mid-hand recovery without trusting another participant requires a different recovery/trust design; masking only the normal `state` field cannot provide that guarantee.

## 3. Medium — Pok Deng player IDs collide with reserved betting positions

Evidence: `shared/tableNet.ts:473`; `pokdeng/src/engine/pokDengEngine.ts:221–243`, `268–284`; reserved spot semantics in `pokdeng/src/types/pokdeng.ts:27`.

The network accepts arbitrary nonempty player IDs up to 64 characters, except bot IDs. Pok Deng uses the same string namespace for player IDs and the special betting positions `seat` and `last`. A modified client can join with ID `seat`. The dealing-order filters then include another player's normal seat hand both as a cut before that identity and as the owner's own hand. The same hand appears twice, receives four cards, and is processed twice by settlement.

The deterministic reproduction uses three 1000-chip players, one reserved identity, and a single 100-chip bet. A push returns the same stake twice: the bettor ends with 1100 chips and the room total rises from 3000 to 3100. An attacker can arrange a second controlled identity to benefit. The supplied deterministic cards make the result reproducible; the duplicate-hand bug does not require control over the production shuffle.

**Remediation:** Reject identities that overlap reserved game tokens, or enforce the generated identity format at the shared network boundary. Also make the dealing-order categories mutually exclusive so each hand appears exactly once. Verify hand uniqueness, card counts, and conservation of chips with a reserved-identity case.

## 4. Medium — Unbounded incoming and outgoing queues permit room-wide resource amplification

Evidence: `shared/tableNet.ts:232–260`, `503–514`, `522–531`.

Each connection appends incoming work to an unlimited promise chain. Outgoing compression/sends use another unlimited chain. There are per-message byte limits and a 30-member cap, but no per-connection message rate, queued-work limit, or broadcast backpressure. A member can repeatedly issue a no-op `rejoin`; even when its engine returns the identical state, every request broadcasts another snapshot to the room. Repeated `hello` also broadcasts without a rate limit.

The local probe confirms that 100 unchanged rejoin requests produce 100 room-wide broadcasts. At higher sustained rates, pending decode/compression work and retained state messages can consume the host's CPU, memory, and relay bandwidth, degrading the entire room. This amplification is confirmed; a browser crash or production outage was not load-tested.

**Remediation:** Apply per-connection input and queued-byte limits, close abusive connections, skip broadcasts when state has not changed, and coalesce pending full-state updates instead of retaining every obsolete snapshot. Keep control messages ordered and reliable while bounding state-update backlog.

## 5. Medium — Development and video tooling have published dependency advisories

Evidence: root `package-lock.json:2172` and `2274`; `ad-video/package.json:9` and `22`; current npm audit responses.

The game workspace resolves Vite **8.3.0** and source-map-js **1.2.1**. npm rates both affected packages High. The Vite findings include Windows editor command-injection issues and development-server file exposure; these concern a running development server and its exploit prerequisites, rather than the static GitHub Pages build. The Windows existence-check advisory identifies **8.3.3** as a patched Vite release. [Vite advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [maintainer advisory](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm).

source-map-js **1.2.2** fixes denial of service from hostile indexed source-map offsets. No path from a player's normal game message into this build dependency was identified. [Advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [maintainer issue](https://github.com/7rulnik/source-map-js/issues/76).

The separate video project pins Remotion **4.0.528** and ESLint **9.19.0**. Its audit includes Zod collection-validation memory exhaustion, source-map-js, minimatch, fast-uri, and ESLint plugin-kit findings, with propagation through Remotion and TypeScript ESLint packages. npm offers a Remotion **4.0.541** update for the affected Remotion dependency chain and ESLint **9.39.5** for plugin-kit; some minimatch-related chains report no automatic fix. Zod's advisory identifies **4.6.6** as patched. [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

**Remediation:** Update Vite and source-map-js within the workspace constraints, regenerate the lockfile, then rerun the audit, tests, and builds. Update the video project's aligned Remotion packages and ESLint separately, and reassess remaining transitive advisories without forcing incompatible major upgrades. Keep development/Studio services restricted to intended local users. The production-only game audit reported zero advisories; the video project is excluded from the Pages deployment.

## Documented and conditional risks

- `shared/iceServers.ts:16–21` intentionally embeds the TURN credential API key in browser JavaScript. Anyone who obtains a deployed key can request relay credentials and consume quota. The poker README acknowledges this tradeoff. Actual deployment key presence, provider restrictions, quota, and billing were not verified. Use a scoped/restricted public credential mechanism or a credential broker if quota abuse becomes unacceptable.
- Spectators intentionally see hidden hands; room-code holders can join as spectators. This permits collusion by opening another client and is part of the current friends-only trust model. Private competitive play would require host approval or delayed/masked spectator views.
- `home-ads.js` conditionally loads third-party advertising scripts with origin privileges. Ads were unconfigured/disabled in the reviewed landing page. If enabled, provider code becomes part of the trusted browser code and could access same-origin storage. No active provider compromise or current injection flaw was demonstrated.
- `analytics.js` has the same conditional third-party-script trust boundary (the initial audit referred to its former name, `home-analytics.js`). Its configured analytics IDs were empty, so it did not load a provider beacon. The current loader also supports Umami with explicit sanitized event payloads. It validates configured token syntax and skips query-string pages, sensitive referring URLs, and supported browser privacy opt-outs. No attacker-controlled script URL or injection sink was found in the loader.
- No raw HTML/eval sink was found in the reviewed game rendering paths. Names are cleaned and displayed through React text. Game shuffles use cryptographic random integers; incoming compressed messages have packed and unpacked byte limits; reconnect secrets are represented as hashes in standby membership lists. These controls do not fix the findings above.
- Deployment actions are commit-pinned, installs use the lockfile via `npm ci`, and the publishing job separates its elevated permissions from the build. These checks did not establish the deployed revision or GitHub account security.

## Original recommended order (snapshot policy superseded by the restoration above)

1. Authenticate all host/recovery messages and protect reconnect secrets.
2. Disable automatic full-state standby for ordinary players until an explicit trusted-backup role exists.
3. Reject reserved identities and correct Pok Deng's duplicate dealing/settlement path.
4. Bound network queues and broadcast work.
5. Update affected tooling, rerun dependency audits, and run the complete tests and builds.
