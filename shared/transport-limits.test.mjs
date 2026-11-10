import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { TableNet } from './tableNet.ts';
import { encode, decode, MAX_PACKED_BYTES } from './codec.ts';

class Connection extends EventEmitter {
  open = true;
  sent = [];
  bufferSize = 0;
  dataChannel = { bufferedAmount: 0 };
  close() { if (this.open) { this.open = false; this.emit('close'); } }
  send(bytes) { this.sent.push(bytes); }
}
function room(t) {
  const peer = Object.assign(new EventEmitter(), {
    id: 'host-peer', destroy() {}, connect() { return new Connection(); },
  });
  const rules = {
    prefix: 'unchanged-', validAction: () => true,
    addPlayer: (s, id) => s.players.some(p => p.id === id) ? s : { ...s, players: [...s.players, { id }] },
    addSpectator: s => s, setConnected: s => s, hostTick: s => s, resume: s => s,
    removePlayer: (s, id) => ({ ...s, players: s.players.filter(p => p.id !== id) }),
    applyAction: s => ({ ...s, moves: (s.moves ?? 0) + 1 }),
  };
  const net = new TableNet(rules, 'ABC123', { id: 'host', name: 'Host', secret: 'host-secret' },
    { onState() {}, onStatus() {}, onError() {}, onClosed() {} }, peer);
  net.becomeHost({ players: [], queue: [], lastActionAt: Date.now() }, []);
  t.after(() => net.destroy());
  return { net, peer };
}
const flush = async net => { await net.inbox; await Promise.all([...net.links.keys()].map(c => net.outbox.get(c))); };
const hello = id => ({ t: 'hello', id, name: id, secret: `secret-${id}`, peerId: `peer-${id}` });

test('admission bounds silent links, frees closed slots, and expires stalled handshakes', t => {
  const { net, peer } = room(t);
  const conns = Array.from({ length: 31 }, () => new Connection());
  conns.forEach(c => peer.emit('connection', c));
  assert.ok(conns.slice(0, 30).every(c => c.open), 'room-sized join bursts fit');
  assert.equal(conns[30].open, false, 'excess unauthenticated link is closed');
  conns[0].close();
  const replacement = new Connection();
  peer.emit('connection', replacement);
  assert.equal(replacement.open, true, 'closed slots are reusable');
  const realNow = Date.now;
  Date.now = () => realNow() + 7_000;
  try { net.tick(); } finally { Date.now = realNow; }
  assert.equal(replacement.open, false, 'silent handshakes cannot reserve slots forever');
});

test('admission rate survives link rotation and resets for legitimate later joins', t => {
  const { peer } = room(t);
  for (let i = 0; i < 60; i++) { const c = new Connection(); peer.emit('connection', c); c.close(); }
  const flood = new Connection(); peer.emit('connection', flood);
  assert.equal(flood.open, false);
  const realNow = Date.now; Date.now = () => realNow() + 11_000;
  try {
    const later = new Connection(); peer.emit('connection', later);
    assert.equal(later.open, true);
  } finally { Date.now = realNow; }
});

test('bad and oversized binary frames close the link before they can accumulate', async t => {
  const { net } = room(t);
  for (const data of ['not binary', new Uint8Array(), new Uint8Array(MAX_PACKED_BYTES + 1), new Uint8Array([1, 2, 3])]) {
    const c = new Connection(); net.wire(c); c.emit('data', data); await flush(net);
    assert.equal(c.open, false);
  }
});

test('queued incoming work is bounded per connection and across connections', async t => {
  const { net } = room(t);
  const ping = await encode({ t: 'ping' });
  const c = new Connection(); net.wire(c);
  for (let i = 0; i < 9; i++) c.emit('data', ping);
  assert.equal(c.open, false, 'one link cannot create an unbounded decode chain');
  const links = Array.from({ length: 12 }, () => new Connection());
  for (const link of links) { net.wire(link); for (let i = 0; i < 8; i++) link.emit('data', ping); }
  assert.ok(links.some(link => !link.open), 'aggregate queued work has a ceiling');
  await flush(net);
});

test('message rate remains bounded after each decode finishes and recovers next second', async t => {
  const { net } = room(t);
  const ping = await encode({ t: 'ping' });
  const c = new Connection(); net.wire(c);
  const realNow = Date.now; const now = realNow(); Date.now = () => now;
  try {
    for (let i = 0; i < 31; i++) { c.emit('data', ping); await net.inbox; }
    assert.equal(c.open, false, 'completed messages still count against the rate');
    Date.now = () => now + 1_001;
    const later = new Connection(); net.wire(later); later.emit('data', await encode(hello('later')));
    await flush(net);
    assert.equal(later.open, true);
    assert.ok(net.members.has('later'));
  } finally { Date.now = realNow; }
});

test('byte budgets and aggregate message rates include rotating connections', async t => {
  const { net } = room(t);
  const large = new Uint8Array(MAX_PACKED_BYTES);
  const c = new Connection(); net.wire(c);
  for (let i = 0; i < 3; i++) c.emit('data', large);
  assert.equal(c.open, false, 'packed queue bytes are bounded separately from message count');
  const ping = await encode({ t: 'ping' });
  const realNow = Date.now; const now = realNow(); Date.now = () => now;
  try {
    for (let i = 0; i < 240; i++) {
      const link = new Connection(); net.wire(link); link.emit('data', ping); link.close();
      await net.inbox;
    }
    const excess = new Connection(); net.wire(excess); excess.emit('data', ping);
    assert.equal(excess.open, false, 'link rotation does not reset aggregate message rates');
  } finally { Date.now = realNow; }
});

test('outgoing work and native buffers close slow consumers', async t => {
  const { net } = room(t);
  const c = new Connection(); net.wire(c);
  for (let i = 0; i < 33; i++) net.send(c, { t: 'pong' });
  assert.equal(c.open, false, 'pending compression has a message ceiling');
  const bytes = new Connection(); net.wire(bytes);
  for (let i = 0; i < 3; i++) net.send(bytes, { t: 'error', message: 'x'.repeat(900_000) });
  assert.equal(bytes.open, false, 'pending compression has a byte ceiling');
  for (const buffered of [{ bufferSize: 1 }, { dataChannel: { bufferedAmount: 300_000 } }]) {
    const slow = Object.assign(new Connection(), buffered); net.wire(slow);
    net.send(slow, { t: 'pong' }); await flush(net);
    assert.equal(slow.open, false);
    assert.equal(slow.sent.length, 0);
  }
});

test('outgoing aggregate queues, buffers and stalled compression are bounded', async t => {
  const { net } = room(t);
  const links = Array.from({ length: 10 }, () => new Connection());
  for (const c of links) { net.wire(c); for (let i = 0; i < 32; i++) net.send(c, { t: 'pong' }); }
  assert.ok(links.some(c => !c.open), 'aggregate pending compression is bounded');
  await flush(net);
  for (const c of links) c.close();
  const buffered = Array.from({ length: 10 }, () => Object.assign(new Connection(), { dataChannel: { bufferedAmount: 220_000 } }));
  buffered.forEach(c => net.wire(c));
  net.send(buffered[0], { t: 'pong' }); await flush(net);
  assert.equal(buffered[0].open, false, 'native buffered bytes have an aggregate ceiling');
  buffered.forEach(c => c.close());
  const stalled = new Connection(); net.wire(stalled);
  net.links.get(stalled).admitted = true;
  net.outbox.set(stalled, new Promise(() => {}));
  net.send(stalled, { t: 'pong' });
  const realNow = Date.now; Date.now = () => realNow() + 7_000;
  try { net.tick(); } finally { Date.now = realNow; }
  assert.equal(stalled.open, false, 'a stuck compressor cannot pin an admitted link forever');
});

test('normal joins, actions, reconnect identities and automatic queue standby survive limits', async t => {
  const { net } = room(t);
  const player = new Connection(); net.wire(player); player.emit('data', await encode(hello('player'))); await flush(net);
  player.emit('data', await encode({ t: 'act', action: 'move' })); await flush(net);
  assert.equal(net.state.moves, 1);
  const reconnect = new Connection(); net.wire(reconnect); reconnect.emit('data', await encode(hello('player'))); await flush(net);
  assert.equal(player.open, false); assert.equal(reconnect.open, true);
  assert.equal(net.members.size, 2, 'reconnect keeps the existing identity');
  const queued = new Connection(); net.wire(queued); queued.emit('data', await encode(hello('queued'))); await flush(net);
  net.state = { ...net.state, players: [{ id: 'host' }], queue: [{ id: 'queued' }] };
  net.broadcast(); await flush(net);
  const last = await decode(queued.sent.at(-1));
  assert.equal(last.standbyId, 'queued'); assert.ok(last.snapshot);
  const standby = room(t).net;
  standby.role = 'client'; standby.me = { id: 'queued', name: 'queued', secret: 'secret-queued' };
  standby.joined = true; standby.lastPong = 0; standby.snapshot = last.snapshot;
  standby.claimRoom = () => {};
  standby.tick();
  assert.equal(standby.role, 'host');
  assert.ok(standby.members.has('queued'), 'automatic takeover keeps the standby identity');
});
