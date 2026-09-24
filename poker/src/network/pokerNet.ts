import * as engine from '../engine/pokerEngine';
import { TableNet as Net, type Identity, type NetEvents, type Rules } from '../../../shared/tableNet';
import type { GameState, PlayerAction } from '../types/poker';

export { randomRoomCode, type Identity, type NetStatus } from '../../../shared/tableNet';

/** Hold'em's side of the shared room: the engine, the room-id prefix and the shape of a move. */
const rules: Rules<GameState, PlayerAction> = {
  ...engine,
  prefix: 'p2p-holdem-v6-',
  validAction: (a): a is PlayerAction => {
    const x = a as PlayerAction | null;
    return !!x && (['fold', 'check', 'call'].includes(x.type) || (x.type === 'raise' && Number.isInteger(x.amount)));
  },
  resume: (s, now) => (s.turnDeadline ? { ...s, turnDeadline: now + engine.TURN_MS } : s),
};

export type PokerNet = Net<GameState, PlayerAction>;
export const PokerNet = {
  host: (roomCode: string, me: Identity, game: GameState, events: NetEvents<GameState>) => Net.host(rules, roomCode, me, game, events),
  join: (roomCode: string, me: Identity, events: NetEvents<GameState>) => Net.join(rules, roomCode, me, events),
};
