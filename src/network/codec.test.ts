import assert from 'node:assert/strict';
import { addPlayer, createGame, startGame } from '../engine/pokerEngine';
import { decode, encode } from './codec';

// A real 10-player game state survives a round trip and shrinks well below PeerJS's ~16 KB per-message ceiling.
let s = createGame('ABC123', { startingStack: 1000, blindLevels: [{ small: 10, big: 20 }], handsPerLevel: 10 }, 0);
for (let i = 0; i < 10; i++) s = addPlayer(s, `player-${i}-${'x'.repeat(10)}`, `Player ${i}`, 0);
s = startGame(s, 0);
const msg = { t: 'state', state: s, standbyId: 'player-1', snapshot: { state: s, members: [] } };

const packed = await encode(msg);
assert.deepEqual(await decode(packed), msg);
assert.deepEqual(await decode(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength)), msg, 'ArrayBuffer input');
const plain = Buffer.byteLength(JSON.stringify(msg));
assert.ok(packed.byteLength * 3 < plain, `compressed ${packed.byteLength} B vs ${plain} B plain`);

// Junk from a misbehaving peer is rejected, never half-parsed.
await assert.rejects(decode(new Uint8Array([1, 2, 3, 4])));
await assert.rejects(decode('{"t":"ping"}'));
await assert.rejects(decode(null));

console.log(`codec: all checks passed (${plain} B -> ${packed.byteLength} B)`);
