import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { TableNet } from './tableNet.ts';
import { encode, decode } from './codec.ts';
import * as poker from '../poker/src/engine/pokerEngine.ts';
import * as blackjack from '../blackjack/src/engine/blackjackEngine.ts';
import * as pokdeng from '../pokdeng/src/engine/pokDengEngine.ts';
import * as slave from '../slave/src/engine/slaveEngine.ts';
import { loadSigner, nonce, sign, verify } from './identity.ts';

const conn = (peer, local = 'local') => Object.assign(new EventEmitter(), {
  peer, provider: { id: local }, open: true, sent: [],
  send(bytes) { this.sent.push(bytes); },
  close() { if (this.open) { this.open = false; this.emit('close'); } },
});
async function room(values = {}) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return Object.assign(Object.create(TableNet.prototype), {
    role: 'client', roomCode: 'AUDIT1', me: { id: 'local', name: 'Local', secret: 'must-never-go-on-the-wire' },
    peer: { id: 'local' }, rules: { prefix: 'test-' },
    signer: { privateKey: keys.privateKey, publicKey: await crypto.subtle.exportKey('jwk', keys.publicKey) },
    events: { states: [], errors: [], onState(s) { this.states.push(s); }, onError(e) { this.errors.push(e); }, onStatus() {}, onClosed() {} },
    outbox: new WeakMap(), sendCounts: new WeakMap(), pendingStates: new WeakMap(), links: new Set(),
    members: new Map(), knownKeys: new Map(), removed: new Set(), promoteLinks: new WeakSet(),
    joinChallenges: new WeakMap(), pendingHellos: new WeakMap(), standby: null,
    admissions: { at: 0, count: 0 }, cryptoWork: { at: 0, count: 0 },
    ingress: { at: 0, bytes: 0, queued: 0 },
    destroyed: false, snapshot: null, hostConn: null, dialConn: null, hostPin: null, pendingJoin: null,
    refusalLinks: new Map(), promotionNonce: null, promotionStartedAt: Date.now(),
    ...values,
  });
}
async function deliver(net, connection, message) {
  const decoded = await decode(await encode(message));
  if (net.role === 'host') await net.onClientMsg(connection, decoded);
  else await net.onHostMsg(connection, decoded);
  await net.outbox.get(connection);
}
const packets = (connection) => Promise.all(connection.sent.map(decode));

test('unsolicited promotion never obtains a reconnect secret after the host times out', async () => {
  const net = await room({ lastPong: Date.now() - 7000 });
  const attacker = conn('attacker');
  await deliver(net, attacker, { t: 'promote' });
  assert.ok(!(await packets(attacker)).some((m) => 'secret' in m), 'no reusable credential is disclosed');
  assert.equal(net.hostConn, null);
});

test('unsolicited state, reject, error and pong are ignored in initial and reconnect windows', async () => {
  for (const live of [false, true]) {
    const net = await room({ hostConn: live ? conn('real-host') : null, lastPong: live ? Date.now() : 0 });
    const before = net.lastPong;
    for (const message of [
      { t: 'state', state: { forged: true }, standbyId: null },
      { t: 'reject', message: 'injected' }, { t: 'error', message: { invalidChild: true } }, { t: 'pong' },
    ]) await deliver(net, conn('attacker'), message);
    assert.equal(net.events.states.length, 0);
    assert.equal(net.events.errors.length, 0);
    assert.equal(net.lastPong, before);
  }
});

function pokerState() {
  let state = poker.createGame('AUDIT1', { startingStack: 1000, blindLevels: [{ small: 10, big: 20 }], handsPerLevel: 10 }, 0);
  for (const id of ['host', 'first', 'second']) state = poker.addPlayer(state, id, id, 0);
  state = poker.addSpectator(state, 'display', 'TOURNAMENT', 0);
  return poker.startGame(state, 1);
}
async function pokerRoom() {
  const net = await room({ role: 'host', me: { id: 'host' }, state: pokerState(), rules: { ...poker, prefix: 'test-' } });
  for (const id of ['first', 'second', 'display']) {
    const memberKeys = await room();
    net.members.set(id, { id, name: id, peerId: `${id}-peer`, publicKey: memberKeys.signer.publicKey, conn: conn(`${id}-peer`, 'host') });
  }
  return net;
}

test('automatic takeover selects the first connected player without setup; other players get no snapshot', async () => {
  const host = await pokerRoom();
  host.broadcast();
  for (const id of ['first', 'second']) {
    const connection = host.members.get(id).conn;
    await host.outbox.get(connection);
    const [message] = await packets(connection);
    assert.equal(message.standby.id, 'first');
    if (id === 'first') assert.deepEqual(message.snapshot.state, host.state);
    else assert.equal(message.snapshot, undefined);
    assert.deepEqual(message.state.deck, []);
    assert.ok(message.state.players.filter((p) => p.id !== id).every((p) => p.hole.every((c) => c === '??')));
  }
});

test('automatic takeover falls back to the next player and then a tournament display', async () => {
  const host = await pokerRoom();
  for (const expected of ['first', 'second', 'display']) {
    host.broadcast();
    const member = host.members.get(expected);
    await host.outbox.get(member.conn);
    const message = (await packets(member.conn)).at(-1);
    assert.equal(message.standby.id, expected);
    assert.deepEqual(message.snapshot.state, host.state);
    member.conn.open = false;
  }
  host.broadcast();
  assert.equal(host.standby, null);
});

async function join(host, client, claimedKey = client.signer.publicKey) {
  const toHost = conn(host.peer.id, client.peer.id);
  const toClient = conn(client.peer.id, host.peer.id);
  client.beginJoin(toHost, client.hostPin);
  let sentByClient = 0;
  let sentByHost = 0;
  for (let i = 0; i < 10; i++) {
    await client.outbox.get(toHost);
    while (sentByClient < toHost.sent.length) {
      const message = await decode(toHost.sent[sentByClient++]);
      if (message.t === 'hello') message.publicKey = claimedKey;
      await deliver(host, toClient, message);
    }
    await host.outbox.get(toClient);
    while (sentByHost < toClient.sent.length) await deliver(client, toHost, await decode(toClient.sent[sentByHost++]));
    await client.outbox.get(toHost);
    if (sentByClient === toHost.sent.length && sentByHost === toClient.sent.length) break;
  }
  return { toHost, toClient };
}
async function newHost() {
  const host = await room({ role: 'host', me: { id: 'host', name: 'Host' }, peer: { id: 'test-AUDIT1' }, rules: { ...poker, prefix: 'test-' } });
  host.becomeHost(poker.createGame('AUDIT1', { startingStack: 1000, blindLevels: [{ small: 10, big: 20 }], handsPerLevel: 10 }, 0), []);
  return host;
}

test('signed joins and reloads keep a seat without transmitting a reusable secret or signing key', async () => {
  const host = await newHost();
  const client = await room();
  const first = await join(host, client);
  assert.equal(client.events.states.length, 1, 'legitimate signed join succeeds');
  assert.equal(host.members.get('local').conn, first.toClient);
  for (const message of [...await packets(first.toHost), ...await packets(first.toClient)]) {
    assert.ok(!JSON.stringify(message).includes('must-never-go-on-the-wire'));
    assert.equal(message.secret, undefined);
    assert.equal(message.publicKey?.d, undefined);
  }
  const reloaded = await room({ signer: client.signer, hostPin: host.signer.publicKey, peer: { id: 'reloaded-peer' } });
  const second = await join(host, reloaded);
  assert.equal(reloaded.events.states.length, 1);
  assert.equal(host.members.get('local').conn, second.toClient);
  assert.equal(first.toClient.open, false);
});

test('a stolen public snapshot key cannot authenticate as its owner', async () => {
  const host = await newHost();
  const victim = await room();
  const seat = await join(host, victim);
  const attacker = await room({ peer: { id: 'attacker' } });
  // Claim the victim's public key, but try to answer its challenge with a different private key.
  const attempt = await join(host, attacker, victim.signer.publicKey);
  assert.equal(host.members.get('local').conn, seat.toClient);
  assert.equal(attempt.toClient.open, false);
});

test('a different signing identity cannot replace an existing seat', async () => {
  const host = await newHost();
  const victim = await room();
  const seat = await join(host, victim);
  const attacker = await room({ peer: { id: 'attacker' } });
  await join(host, attacker);
  assert.equal(host.members.get('local').conn, seat.toClient);
  assert.match(attacker.events.errors.join(' '), /belongs to someone else/);
});

test('leaving removes the automatic backup, and another signer cannot reclaim that identity', async () => {
  const host = await newHost();
  const victim = await room();
  const original = await join(host, victim);
  await deliver(host, original.toClient, { t: 'leave' });
  assert.equal(host.standby, null);
  const attacker = await room({ peer: { id: 'attacker' } });
  const attempt = await join(host, attacker);
  assert.equal(host.members.has('local'), false);
  assert.ok(!(await packets(attempt.toClient)).some((m) => m.snapshot));
  assert.match(attacker.events.errors.join(' '), /belongs to someone else/);
  const returning = await room({ signer: victim.signer, peer: { id: 'returning' }, hostPin: host.signer.publicKey });
  await join(host, returning);
  assert.equal(host.members.get('local').peerId, 'returning');
});

test('grace-period expiry removes a backup while preserving its original identity key', async () => {
  const host = await newHost();
  const victim = await room();
  await join(host, victim);
  Object.assign(host.members.get('local'), { conn: null, goneAt: Date.now() - 61000 });
  host.tick();
  assert.equal(host.standby, null);
  assert.equal(host.members.has('local'), false);
  assert.deepEqual(host.knownKeys.get('local'), victim.signer.publicKey);
});

test('an authentication signature cannot be replayed on a new connection or challenge', async () => {
  const host = await newHost();
  const victim = await room();
  const seat = await join(host, victim);
  const original = await packets(seat.toHost);
  const replay = conn('another-peer', host.peer.id);
  await deliver(host, replay, original.find((m) => m.t === 'hello'));
  await deliver(host, replay, original.find((m) => m.t === 'auth'));
  assert.equal(replay.open, false);
  assert.equal(host.members.get('local').conn, seat.toClient);
});

test('a host ID claimed by another signing key fails the saved host pin', async () => {
  const originalHost = await newHost();
  const impostor = await newHost();
  const victim = await room({ hostPin: originalHost.signer.publicKey });
  const attempt = await join(impostor, victim);
  assert.equal(victim.events.states.length, 0);
  assert.equal(attempt.toHost.open, false);
});

test('a legitimate advertised backup authenticates with its own key', async () => {
  const backup = await newHost();
  backup.peer.id = 'backup-peer';
  const client = await room({ hostPin: (await room()).signer.publicKey });
  client.standby = { id: 'backup', peerId: backup.peer.id, publicKey: backup.signer.publicKey };
  const toHost = conn(backup.peer.id, client.peer.id);
  await deliver(client, toHost, { t: 'promote', nonce: nonce() });
  await client.outbox.get(toHost);
  const hello = (await packets(toHost))[0];
  assert.equal(hello.t, 'hello');
  assert.equal(hello.secret, undefined);
  const server = conn(client.peer.id, backup.peer.id);
  await deliver(backup, server, hello);
  await deliver(client, toHost, (await packets(server))[0]);
  assert.equal(client.hostConn, toHost);
  assert.deepEqual(client.hostPin, backup.signer.publicKey);
});

test('takeover preserves the exact cards, bets, and tournament display without restarting the hand', async () => {
  const host = await newHost();
  const player = await room();
  await join(host, player);
  const display = await room({ me: { id: 'display', name: 'TOURNAMENT', watch: true }, peer: { id: 'display-peer' } });
  const link = await join(host, display);
  host.startGame();
  host.members.get('local').conn.open = false;
  host.broadcast();
  await host.outbox.get(link.toClient);
  const message = (await packets(link.toClient)).at(-1);
  await deliver(display, link.toHost, message);
  const before = structuredClone(host.state);
  display.rules = { ...poker, prefix: 'test-', resume: (s, now) => ({ ...s, turnDeadline: now + poker.TURN_MS }) };
  display.claimRoom = () => {};
  display.peer.connect = (id) => conn(id, 'display-peer');
  display.promote();
  assert.equal(display.role, 'host');
  assert.equal(display.state.handNumber, before.handNumber);
  assert.equal(display.state.activeId, before.activeId);
  assert.deepEqual(display.state.deck, before.deck);
  assert.deepEqual(display.state.board, before.board);
  assert.deepEqual(display.state.players.map((p) => [p.id, p.hole, p.chips, p.bet, p.committed]), before.players.map((p) => [p.id, p.hole, p.chips, p.bet, p.committed]));
  assert.ok(display.events.states.at(-1).players.every((p) => p.hole.every((c) => c !== '??')));
  for (const connection of display.links) connection.close();
});

test('a contacted member cannot knock the new host out with an unsigned refusal', async () => {
  const host = await room({ role: 'host', promoted: true, promotionNonce: nonce(), hostPin: (await room()).signer.publicKey });
  const attacker = conn('contacted-member');
  host.promoteLinks.add(attacker);
  let demoted = false;
  host.demote = () => { demoted = true; };
  await deliver(host, attacker, { t: 'refuse', nonce: host.promotionNonce });
  assert.equal(demoted, false);
});

test('a real host can prove it is alive so a mistaken takeover steps down', async () => {
  const original = await newHost();
  const successor = await room({ role: 'host', promoted: true, promotionNonce: nonce(), hostPin: original.signer.publicKey });
  const connection = conn(original.peer.id, successor.peer.id);
  successor.promoteLinks.add(connection);
  let demoted = false;
  successor.demote = () => { demoted = true; };
  const signature = await sign(original.signer, ['alive', 'test-AUDIT1', successor.peer.id, successor.promotionNonce]);
  await deliver(successor, connection, { t: 'refuse', nonce: successor.promotionNonce, signature });
  assert.equal(demoted, true);
});

test('withheld old-host evidence cannot demote a settled successor after the takeover window', async () => {
  const original = await newHost();
  const successor = await room({ role: 'host', promoted: true, promotionNonce: nonce(), promotionStartedAt: Date.now() - 60001, hostPin: original.signer.publicKey });
  const connection = conn(original.peer.id, successor.peer.id);
  successor.promoteLinks.add(connection);
  let demoted = false;
  successor.demote = () => { demoted = true; };
  const signature = await sign(original.signer, ['alive', 'test-AUDIT1', successor.peer.id, successor.promotionNonce]);
  await deliver(successor, connection, { t: 'refuse', nonce: successor.promotionNonce, signature });
  assert.equal(demoted, false);
});

test('no-op rejoin requests do not amplify room broadcasts', async () => {
  const net = await room({ role: 'host', state: { players: [], queue: [], lastActionAt: 0 }, rules: { rejoinQueue: (s) => s } });
  let broadcasts = 0;
  net.broadcast = () => { broadcasts++; };
  for (let i = 0; i < 100; i++) net.handle({ id: 'player' }, { t: 'rejoin' });
  assert.equal(broadcasts, 0);
});

test('a burst of incoming frames is disconnected before it can build an unbounded decode queue', async () => {
  const net = await room({ role: 'host' });
  const attacker = conn('attacker');
  net.wire(attacker);
  const ping = await encode({ t: 'ping' });
  for (let i = 0; i < 200; i++) attacker.emit('data', ping);
  assert.equal(attacker.open, false);
});

test('stalled connections that never open release their admission slot', async (t) => {
  const net = await room({ role: 'host' });
  const stalled = conn('stalled');
  stalled.open = false;
  stalled.close = () => {}; // PeerJS does not emit close for a connection that never opened.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  net.wire(stalled);
  t.mock.timers.tick(6001);
  assert.equal(net.links.size, 0);
});

test('a stalled PeerJS or RTC send buffer is closed rather than accumulating snapshots', async () => {
  for (const buffer of [{ bufferSize: 100 }, { dataChannel: { bufferedAmount: 10 * 1024 * 1024 } }]) {
    const net = await room();
    const receiver = Object.assign(conn('slow'), buffer);
    net.send(receiver, { t: 'pong' });
    await net.outbox.get(receiver);
    assert.equal(receiver.open, false);
    assert.equal(receiver.sent.length, 0);
  }
});

test('queued snapshots are coalesced to the latest state instead of retaining obsolete decks', async () => {
  const net = await room();
  const receiver = conn('receiver');
  for (let i = 0; i < 100; i++) net.send(receiver, { t: 'state', state: { revision: i } });
  await net.outbox.get(receiver);
  const messages = await packets(receiver);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].state.revision, 99);
});

test('native signing keys and advertised host pins survive a reload in the same tab', async (t) => {
  const storage = new Map();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key),
  } });
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  const first = await loadSigner('persisted-id', 'local-secret');
  const reloaded = await loadSigner('persisted-id', 'local-secret');
  assert.deepEqual(reloaded.publicKey, first.publicKey);
  assert.equal(reloaded.privateKey.extractable, false);
  assert.equal(await verify(first.publicKey, await sign(reloaded, ['reload']), ['reload']), true);
  const original = await newHost();
  const backup = await newHost();
  const current = await room();
  current.rememberHost(original.signer.publicKey);
  current.standby = { id: 'backup', peerId: 'backup-peer', publicKey: backup.signer.publicKey };
  current.saveStandby();
  const peer = Object.assign(new EventEmitter(), { id: 'reloaded-peer', destroy() {} });
  const fresh = new TableNet({ ...poker, prefix: 'test-' }, 'AUDIT1', current.me, current.events, peer, current.signer);
  t.after(() => fresh.destroy());
  assert.deepEqual(fresh.hostPin, original.signer.publicKey);
  assert.deepEqual(fresh.standby, current.standby);
  // A replacement that claimed the room alias must still prove the advertised backup key.
  await join(backup, fresh);
  assert.equal(fresh.events.states.length, 1);
  assert.deepEqual(fresh.hostPin, backup.signer.publicKey);

  // The original host also persists the automatically advertised successor before a reload.
  const hosting = await newHost();
  const successor = await room({ me: { id: 'successor', name: 'Successor' }, peer: { id: 'successor-peer' } });
  await join(hosting, successor);
  const restoredHost = new TableNet({ ...poker, prefix: 'test-' }, 'AUDIT1', hosting.me, hosting.events, peer, hosting.signer);
  t.after(() => restoredHost.destroy());
  assert.deepEqual(restoredHost.hostPin, hosting.signer.publicKey);
  assert.equal(restoredHost.standby.id, 'successor');
  assert.deepEqual(restoredHost.standby.publicKey, successor.signer.publicKey);
});

for (const [name, engine, config] of [
  ['blackjack', blackjack, { startingStack: 1000, minBet: 10, decks: 6 }],
  ['pokdeng', pokdeng, { startingStack: 1000, minBet: 10, mustDraw: false }],
  ['slave', slave, null],
]) test(`${name}: automatic backup receives recovery state; tournament packets retain visible hands`, async () => {
  let state = name === 'slave' ? engine.createGame('AUDIT1', 0) : engine.createGame('AUDIT1', config, 0);
  for (const id of ['host', 'first', 'second']) state = engine.addPlayer(state, id, id, 0);
  state = engine.addSpectator(state, 'display', 'TOURNAMENT', 0);
  state = engine.startGame(state, 1);
  if (name === 'blackjack') {
    state.shoe = ['2s', '3s', '4s', '5s', '2d', '3d', '4d', '5d'].reverse();
    for (const id of ['host', 'first', 'second']) state = engine.applyAction(state, id, { type: 'bet', amount: 10 }, 2);
    assert.equal(state.phase, 'playing');
  }
  if (name === 'pokdeng') {
    state.deck = ['2s', '3s', '4s', '5d', '2d', '3d'].reverse();
    for (const id of ['first', 'second']) state = engine.applyAction(state, id, { type: 'bet', amount: 10, spot: 'seat', ready: true }, 2);
    assert.equal(state.phase, 'playing');
  }
  const host = await room({ role: 'host', me: { id: 'host' }, state, rules: engine });
  for (const id of ['first', 'display']) host.members.set(id, { id, peerId: id, publicKey: host.signer.publicKey, conn: conn(id) });
  host.broadcast();
  for (const id of ['first', 'display']) {
    const link = host.members.get(id).conn;
    await host.outbox.get(link);
    const [message] = await packets(link);
    if (id === 'first') assert.deepEqual(message.snapshot.state, host.state);
    else assert.equal(message.snapshot, undefined);
    if (name === 'blackjack') {
      assert.deepEqual(message.state.shoe, []);
      assert.equal(message.state.dealer[1] === '??', id === 'first');
    } else if (name === 'pokdeng') {
      assert.deepEqual(message.state.deck, []);
      assert.equal(message.state.hands.find((h) => h.owner === 'second').cards.every((c) => c === '??'), id === 'first');
    } else {
      assert.equal(message.state.players.find((p) => p.id === 'second').hand.every((c) => c === '??'), id === 'first');
    }
  }
});

test('connection churn is bounded across distinct peer IDs', async () => {
  const net = await room({ role: 'host' });
  for (let i = 0; i < 60; i++) {
    const link = conn(`churn-${i}`);
    net.wire(link);
    link.close();
  }
  const excess = conn('excess');
  net.wire(excess);
  assert.equal(excess.open, false);
});

test('room-wide pending decode work is bounded across many connections', async () => {
  const net = await room({ role: 'host' });
  const ping = await encode({ t: 'ping' });
  const links = Array.from({ length: 10 }, (_, i) => conn(`flood-${i}`));
  for (const link of links) {
    net.wire(link);
    for (let i = 0; i < 20; i++) link.emit('data', ping);
  }
  assert.ok(net.ingress.queued <= 128);
  assert.ok(links.some((link) => !link.open));
  for (const link of links) link.close();
});

test('compressed byte allowance is shared across connections', async () => {
  const net = await room({ role: 'host' });
  const links = Array.from({ length: 6 }, (_, i) => conn(`bytes-${i}`));
  for (const link of links) {
    net.wire(link);
    for (let i = 0; i < 6; i++) link.emit('data', new Uint8Array(16 * 1024));
  }
  assert.ok(net.ingress.bytes <= 512 * 1024);
  assert.equal(links.at(-1).open, false);
  for (const link of links) link.close();
});

test('oversized inflated client commands are dropped while large authenticated host states remain valid', { timeout: 1000 }, async () => {
  const host = await room({ role: 'host' });
  const attacker = conn('compressed-command');
  host.wire(attacker);
  const rejected = new Promise((resolve) => attacker.once('close', resolve));
  attacker.emit('data', await encode({ t: 'act', filler: 'x'.repeat(20000) }));
  await rejected;
  const trusted = conn('trusted-host');
  const client = await room({ hostConn: trusted });
  const accepted = new Promise((resolve) => { client.events.onState = resolve; });
  client.wire(trusted);
  trusted.emit('data', await encode({ t: 'state', state: { players: [], queue: [], lastActionAt: 1, filler: 'x'.repeat(20000) }, standby: null }));
  const state = await accepted;
  assert.equal(state.filler.length, 20000);
  assert.equal(trusted.open, true);
  trusted.close();
});

test('unknown peers cannot force host signing work through promotion messages', async () => {
  const host = await newHost();
  const stranger = conn('stranger');
  await deliver(host, stranger, { t: 'promote', nonce: nonce() });
  assert.equal(stranger.open, false);
  assert.equal(stranger.sent.length, 0);
});

test('cryptographic work is bounded across authenticated connections', async () => {
  const host = await newHost();
  host.standby = { id: 'backup', peerId: 'backup-peer', publicKey: host.signer.publicKey };
  host.cryptoWork = { at: Date.now(), count: 60 };
  const backup = conn('backup-peer');
  await deliver(host, backup, { t: 'promote', nonce: nonce() });
  assert.equal(backup.open, false);
  assert.equal(backup.sent.length, 0);
});

test('authenticated heartbeats survive handshake saturation and new joins work after the budget resets', async () => {
  const host = await newHost();
  const player = await room();
  const link = await join(host, player);
  host.cryptoWork = { at: Date.now(), count: 60 };
  const before = link.toClient.sent.length;
  await deliver(host, link.toClient, { t: 'ping' });
  assert.equal(link.toClient.open, true);
  assert.equal((await packets(link.toClient)).at(-1).t, 'pong');
  assert.equal(link.toClient.sent.length, before + 1);
  host.cryptoWork.at = Date.now() - 1001;
  const next = await room({ me: { id: 'next', name: 'Next' }, peer: { id: 'next-peer' } });
  await join(host, next);
  assert.equal(next.events.states.length, 1);
});
