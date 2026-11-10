import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { encode } from './codec.ts';
import { TableNet } from './tableNet.ts';

const room = () => ({ players: [], queue: [], spectators: [], lastActionAt: 0 });
const identity = { id: 'a12b34c56d78e901', secret: '0123456789abcdef0123456789abcdef', name: 'Player' };
const hello = (extra = {}) => ({ t: 'hello', ...identity, peerId: 'claimed-peer', ...extra });

function connection(peer = 'actual-peer') {
  return Object.assign(new EventEmitter(), {
    peer, open: true,
    close() { this.open = false; this.emit('close'); },
  });
}

function fixture(t, role = 'host') {
  const peer = Object.assign(new EventEmitter(), { id: 'local-peer', destroy() {} });
  const events = [];
  const rules = {
    prefix: 'test-', validAction: (a) => a?.type === 'noop',
    addPlayer: (s, id) => ({ ...s, players: [...s.players, { id }] }),
    addSpectator: (s, id) => ({ ...s, spectators: [...s.spectators, { id }] }),
    setConnected: (s) => s,
  };
  const net = new TableNet(rules, 'ABC123', { ...identity, id: 'host' }, {
    onState: (s) => events.push(['state', s]), onStatus() {},
    onError: (message) => events.push(['error', message]),
    onClosed: (message) => events.push(['closed', message]),
  }, peer);
  clearInterval(net.timer);
  net.role = role;
  net.state = room();
  net.send = () => {};
  net.broadcast = () => events.push(['broadcast']);
  net.destroy = () => {};
  const conn = connection();
  net.wire(conn);
  t.after(() => { conn.close(); conn.removeAllListeners(); peer.removeAllListeners(); });
  return { net, conn, events };
}

// A valid message queued after the candidate drains that connection's asynchronous decode chain.
async function receive(net, conn, message) {
  const method = net.role === 'host' ? 'onClientMsg' : 'onHostMsg';
  const marker = net.role === 'host' ? 'ping' : 'pong';
  const original = net[method];
  let timeout;
  let closed;
  const drained = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Message queue did not drain')), 2000);
    conn.once('close', closed = resolve);
    net[method] = function (link, msg) {
      try { return original.call(this, link, msg); }
      finally { if (msg.t === marker) resolve(); }
    };
  });
  try {
    conn.emit('data', await encode(message));
    conn.emit('data', await encode({ t: marker }));
    await drained;
  } finally {
    clearTimeout(timeout);
    conn.off('close', closed);
    net[method] = original;
  }
}

test('hello rejects reserved player and spectator identities', async (t) => {
  for (const id of ['seat', 'last', 'bot:1']) for (const watch of [false, true]) {
    const { net, conn } = fixture(t);
    await receive(net, conn, hello({ id, watch }));
    assert.equal(net.members.size, 0, `${id}, watch=${watch}`);
    assert.equal(conn.open, false);
  }
});

test('hello rejects malformed scalars before creating a member', async (t) => {
  for (const change of [{ id: 12 }, { secret: {} }, { peerId: [] }, { name: 42 }, { watch: 'yes' }]) {
    const { net, conn } = fixture(t);
    await receive(net, conn, hello(change));
    assert.equal(net.members.size, 0, JSON.stringify(change));
    assert.equal(conn.open, false);
  }
});

test('hello retains generated identities and records the connected peer', async (t) => {
  const { net, conn } = fixture(t);
  await receive(net, conn, hello({ watch: false }));
  assert.equal(conn.open, true);
  assert.equal(net.members.get(identity.id)?.peerId, conn.peer);
  assert.equal(net.state.players[0]?.id, identity.id);
});

test('one connection cannot acquire a second member identity', async (t) => {
  const { net, conn } = fixture(t);
  await receive(net, conn, hello());
  await receive(net, conn, hello({ id: 'second-player' }));
  assert.equal(net.members.size, 1);
  assert.equal(net.members.has('second-player'), false);
  assert.equal(conn.open, false);
});

test('same identity allows profile changes and fresh-connection reconnects', async (t) => {
  const { net, conn, events } = fixture(t);
  await receive(net, conn, hello({ watch: true }));
  await receive(net, conn, hello({ watch: false, name: 'New name' }));
  assert.equal(conn.open, true);
  assert.equal(net.members.get(identity.id).name, 'New name');
  assert.equal(net.state.players[0]?.id, identity.id);
  assert.equal(events.length, 2, 'profile changes broadcast');
  await receive(net, conn, hello({ watch: false, name: 'New name', peerId: 'another-claim' }));
  assert.equal(events.length, 2, 'a changed peer claim cannot force a repeated broadcast');
  const reconnect = connection('reconnected-peer');
  t.after(() => { reconnect.close(); reconnect.removeAllListeners(); });
  net.wire(reconnect);
  await receive(net, reconnect, hello({ name: 'Reconnected' }));
  assert.equal(net.members.size, 1);
  assert.equal(net.members.get(identity.id).conn, reconnect);
  assert.equal(net.members.get(identity.id).peerId, reconnect.peer);
  assert.equal(conn.open, false);
});

test('malformed UI messages are ignored before reaching callbacks or standby storage', async (t) => {
  for (const message of [
    null, [], 42, { t: 'error', message: {} }, { t: 'reject', message: [] }, { t: 'closed', message: 7 },
    { t: 'state', state: null, standbyId: null },
    { t: 'state', state: { players: null, queue: [], lastActionAt: 0 }, standbyId: null },
    { t: 'state', state: room(), standbyId: 42 },
    { t: 'state', state: room(), standbyId: 'host', snapshot: { state: room(), members: null, removed: [] } },
    { t: 'state', state: room(), standbyId: 'host', snapshot: { state: room(), members: [], removed: [7] } },
  ]) {
    const { net, conn, events } = fixture(t, 'client');
    net.hostConn = conn;
    await receive(net, conn, message);
    assert.deepEqual(events, [], JSON.stringify(message));
    assert.equal(net.snapshot, null);
  }
});

test('well-formed state, full standby snapshot and error messages retain their existing behavior', async (t) => {
  const { net, conn, events } = fixture(t, 'client');
  const state = room();
  const snapshot = {
    state, members: [{ ...identity, peerId: 'actual-peer', secretHash: 'a'.repeat(64) }],
    removed: Array.from({ length: 100 }, (_, i) => `previous-player-${i}`),
  };
  delete snapshot.members[0].secret;
  await receive(net, conn, { t: 'state', state, standbyId: 'host', snapshot });
  assert.deepEqual(net.snapshot, snapshot);
  assert.deepEqual(events, [['state', state]]);
  await receive(net, conn, { t: 'error', message: 'Invalid action' });
  assert.deepEqual(events[1], ['error', 'Invalid action']);
});
