# Hold'em P2P

Serverless, mobile-first Texas Hold'em for up to 10 players (plus a queue). Free-to-play, virtual chips only.
Peers talk over WebRTC DataChannels via PeerJS; the public PeerJS cloud is used only for signaling.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine self-checks
npm run build    # static site in dist/, deploy anywhere (HTTPS needed for phones)
```

## Layout

| File | Role |
|---|---|
| `src/types/poker.ts` | Card, Deck, Player, HandPhase, Pot, GameState |
| `src/engine/pokerEngine.ts` | Pure rules: shuffle, deal, betting rounds, side pots, `pokersolver` showdown, timers (`hostTick`), masking |
| `src/network/pokerNet.ts` | PeerJS host/client, message validation, heartbeats, hot-standby snapshots and host failover |
| `src/hooks/useAudio.ts` | Web Audio "your turn" chime |
| `src/components/PokerTable.tsx` | Hero-centric elliptical table, pots, queue overlay |
| `src/components/ActionControls.tsx` | Fold / Check-Call / Raise panel |
| `src/App.tsx` | Create / join (code, link, QR), game shell |

## How it works

- **Host** registers peer id `p2p-holdem-v1-<ROOM>` and runs the engine. Every change is broadcast as a masked
  view per player (opponents' hole cards are `??`, deck and secrets stripped). The lowest-seated connected
  non-host player is the **hot standby** and also receives the full unmasked snapshot.
- **Clients** ping every 2 s. After 6 s without a reply the standby promotes itself: it loads the snapshot,
  dials every member's peer id directly, and keeps retrying to claim the room id so new joins work. Clients
  refuse a promotion if their own host is still answering, which sends a mistaken standby back to client mode.
- **Reconnects**: identity (id + secret) lives in `sessionStorage`, so reloading the tab rejoins the same seat
  within the 60 s grace period.
- **TURN**: defaults to the public Open Relay. For reliable cellular play set `VITE_TURN_URLS`,
  `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` (see `.env.example`).

The standby holds unmasked cards in memory by design (it has to resume the hand), so a player with
dev tools open in that seat could peek. That trade-off comes with snapshot-based failover.
