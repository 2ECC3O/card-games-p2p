import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { TableNet } from './tableNet.ts';
import { encode, decode } from './codec.ts';

let nextPeer = 0;
class Connection extends EventEmitter {
  peer = `remote-${++nextPeer}`;
  open = true;
  sent = [];
  dataChannel = { bufferedAmount: 0 };
  close() { if (this.open) { this.open = false; this.emit('close'); } }
  send(bytes) { this.sent.push(bytes); }
}
function room(t) {
  const peer = Object.assign(new EventEmitter(), { id: 'host-peer', destroy() {}, connect: () => new Connection() });
  let joins = 0;
  const net = new TableNet({ prefix: 'unchanged-', validAction: () => true,
    addPlayer(s, id, name) { joins++; return { ...s, players: [...s.players.filter(p => p.id !== id), { id, name }] }; },
    addSpectator(s) { joins++; return { ...s }; },
    setConnected: s => s, resume: s => s, hostTick: s => s, rejoinQueue: s => s,
  }, 'ABC123', { id: 'host', name: 'Host', secret: 'host-secret' },
  { onState() {}, onStatus() {}, onError() {}, onClosed() {} }, peer);
  net.becomeHost({ players: [], queue: [], lastActionAt: Date.now() }, []);
  t.after(() => net.destroy());
  return { net, joins: () => joins };
}
const flush = async net => { await net.inbox; await Promise.all([...net.links.keys()].map(c => net.outbox.get(c))); };
const state = n => ({ t: 'state', state: { players: [{ id: 'player' }], queue: [], lastActionAt: n }, standbyId: 'player',
  snapshot: { state: { players: [{ id: 'player' }], queue: [], lastActionAt: n }, members: [], removed: [] } });

test('a pending run of full snapshots keeps only its latest state and takeover snapshot', async t => {
  const { net } = room(t);
  const conn = new Connection(); net.wire(conn);
  let release;
  net.outbox.set(conn, new Promise(resolve => { release = resolve; }));
  for (let i = 0; i < 1_000; i++) net.send(conn, state(i));
  assert.equal(conn.open, true, 'superseded snapshots do not fill the bounded send queue');
  release(); await flush(net);
  assert.deepEqual(await Promise.all(conn.sent.map(decode)), [state(999)]);
  assert.equal(net.outgoing, 0); assert.equal(net.outgoingBytes, 0);
  const standby = room(t).net;
  standby.role = 'client'; standby.me = { id: 'player', name: 'Player', secret: 'secret' };
  standby.joined = true; standby.lastPong = 0; standby.snapshot = (await decode(conn.sent[0])).snapshot;
  standby.claimRoom = () => {};
  standby.tick();
  assert.equal(standby.role, 'host'); assert.equal(standby.state.lastActionAt, 999, 'takeover uses the newest complete snapshot');
});

test('replacing a pending snapshot removes stale standby-only metadata', async t => {
  const { net } = room(t);
  const conn = new Connection(); net.wire(conn);
  net.send(conn, state(1));
  const latest = { t: 'state', state: state(2).state, standbyId: 'other' };
  net.send(conn, latest); await flush(net);
  assert.deepEqual(await Promise.all(conn.sent.map(decode)), [latest]);
});

test('control messages separate snapshot runs and preserve wire order', async t => {
  const { net } = room(t);
  const conn = new Connection(); net.wire(conn);
  let release;
  net.outbox.set(conn, new Promise(resolve => { release = resolve; }));
  net.send(conn, state(1)); net.send(conn, state(2));
  net.send(conn, { t: 'pong' });
  net.send(conn, state(3)); net.send(conn, state(4));
  net.send(conn, { t: 'closed', message: 'closed' });
  release(); await flush(net);
  assert.deepEqual(await Promise.all(conn.sent.map(decode)), [state(2), { t: 'pong' }, state(4), { t: 'closed', message: 'closed' }]);
});

test('a state already being compressed is preserved and later pending states coalesce', async t => {
  const { net } = room(t);
  const conn = new Connection(); net.wire(conn);
  net.send(conn, state(1));
  await Promise.resolve();
  net.send(conn, state(2)); net.send(conn, state(3));
  await flush(net);
  assert.deepEqual(await Promise.all(conn.sent.map(decode)), [state(1), state(3)]);
});

test('repeated unchanged hellos refresh liveness without broadcasts or engine copies', async t => {
  const { net, joins } = room(t);
  const conn = new Connection(); net.wire(conn);
  const hello = { t: 'hello', id: 'player', name: 'Player', secret: 'secret', peerId: conn.peer };
  conn.emit('data', await encode(hello)); await flush(net);
  const sent = conn.sent.length; const count = joins(); const before = net.state;
  net.members.get('player').lastSeen = 0;
  conn.emit('data', await encode(hello)); await flush(net);
  assert.equal(conn.sent.length, sent); assert.equal(joins(), count); assert.equal(net.state, before);
  assert.ok(net.members.get('player').lastSeen > 0);
  conn.emit('data', await encode({ ...hello, name: 'Renamed' })); await flush(net);
  assert.equal(conn.sent.length, sent + 1); assert.equal(joins(), count + 1);
  conn.emit('data', await encode({ ...hello, name: 'Renamed', watch: true })); await flush(net);
  assert.equal(joins(), count + 2, 'a changed spectator preference reaches the engine');
  const replacement = new Connection(); net.wire(replacement);
  replacement.emit('data', await encode({ ...hello, peerId: replacement.peer })); await flush(net);
  assert.equal(conn.open, false); assert.ok(replacement.sent.length > 0, 'reconnect still receives a complete state');
});

test('unchanged rejoin requests skip broadcasts while changed queue state reaches every member', async t => {
  const { net } = room(t);
  const conn = new Connection(); net.wire(conn);
  conn.emit('data', await encode({ t: 'hello', id: 'player', name: 'Player', secret: 'secret', peerId: conn.peer })); await flush(net);
  const sent = conn.sent.length;
  net.handle(net.members.get('player'), { t: 'rejoin' }); await flush(net);
  assert.equal(conn.sent.length, sent);
  net.rules.rejoinQueue = s => ({ ...s, queue: [{ id: 'player' }] });
  net.handle(net.members.get('player'), { t: 'rejoin' }); await flush(net);
  assert.equal(conn.sent.length, sent + 1);
  const last = await decode(conn.sent.at(-1));
  assert.equal(last.standbyId, 'player'); assert.deepEqual(last.snapshot.state.queue, [{ id: 'player' }]);
});
