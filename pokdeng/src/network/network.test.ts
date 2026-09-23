import assert from 'node:assert/strict';
import { addPlayer, createGame, startGame } from '../engine/pokDengEngine';
import { createHash } from 'node:crypto';
import { decode, encode, MAX_PACKED_BYTES, MAX_UNPACKED_BYTES } from './codec';
import { sha256 } from './sha256';

// sha256 matches Node's implementation, including empty input, multi-block input and non-ASCII text.
for (const text of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(1000), '0123456789abcdef'.repeat(8), 'caf' + String.fromCodePoint(0xe9) + ' ' + String.fromCodePoint(0x1f0a1)]) {
  assert.equal(sha256(text), createHash('sha256').update(text, 'utf8').digest('hex'), `sha256 of ${text.length} chars`);
}

// A real 7-player game state survives a round trip and shrinks well below PeerJS's ~16 KB per-message ceiling.
let s = createGame('ABC123', { startingStack: 1000, minBet: 10, mustDraw: false }, 0);
for (let i = 0; i < 7; i++) s = addPlayer(s, `player-${i}-${'x'.repeat(10)}`, `Player ${i}`, 0);
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

// Decompression bomb: 50 MB of zeros packs into well under the packed limit but must not be expanded.
const zeros = new Uint8Array(50 * 1024 * 1024);
const bomb = new Uint8Array(await new Response(new Blob([zeros]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
assert.ok(bomb.byteLength < MAX_PACKED_BYTES, `bomb is ${bomb.byteLength} B packed`);
const t0 = Date.now();
await assert.rejects(decode(bomb), /too large/);
assert.ok(Date.now() - t0 < 2000, 'rejected quickly, without inflating everything');
// Oversized packed data is refused before any decompression.
await assert.rejects(decode(new Uint8Array(MAX_PACKED_BYTES + 1)), /too large/);
// A legitimately large message just under the unpacked limit still works.
const big = { t: 'state', filler: 'x'.repeat(MAX_UNPACKED_BYTES - 100) };
assert.deepEqual(await decode(await encode(big)), big);

console.log(`network: all checks passed (${plain} B -> ${packed.byteLength} B)`);
