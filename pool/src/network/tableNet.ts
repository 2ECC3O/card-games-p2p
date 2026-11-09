import * as engine from '../engine/poolEngine';
import { TableNet as Net, type Identity, type NetEvents, type Rules } from '../../../shared/tableNet';
import type { GameState, PlayerAction } from '../types/pool';

export { randomRoomCode, type Identity, type NetStatus } from '../../../shared/tableNet';

/** Pool's side of the shared room: the engine, the room-id prefix and the shape of a move. */
const rules: Rules<GameState, PlayerAction> = {
  ...engine,
  prefix: 'p2p-pool-v2-',
  validAction: (a): a is PlayerAction => {
    const x = a as PlayerAction | null;
    return !!x && (x.type === 'nextRack'
      || (x.type === 'place' && Number.isFinite(x.x) && Number.isFinite(x.y))
      || (x.type === 'choice' && ['accept', 'head', 'spot', 'rebreak-self', 'rebreak-other'].includes(x.option))
      || (x.type === 'shot' && [x.angle, x.power, x.tipX, x.tipY].every(Number.isFinite)
        && (x.ball === null || Number.isInteger(x.ball)) && (x.pocket === null || Number.isInteger(x.pocket)) && typeof x.safety === 'boolean'));
  },
  resume: (s, now) => ({ ...s, turnStartedAt: now }), // restart the shot clock
};

export type TableNet = Net<GameState, PlayerAction>;
export const TableNet = {
  host: (roomCode: string, me: Identity, game: GameState, events: NetEvents<GameState>) => Net.host(rules, roomCode, me, game, events),
  join: (roomCode: string, me: Identity, events: NetEvents<GameState>) => Net.join(rules, roomCode, me, events),
};
