import Peer, { type DataConnection } from 'peerjs';
import {
  addBot, addPlayer, addSpectator, applyAction, cleanName, hostTick, IDLE_MS, isBot, maskFor, rejoinQueue, removePlayer, setConnected, startGame, TURN_MS,
} from '../engine/pokDengEngine';
import type { GameState, PlayerAction } from '../types/pokdeng';
import { decode, encode } from './codec';
import { iceServers } from './iceServers';
import { sha256 } from './sha256';

// Bump the version whenever the wire format changes, so old and new pages never meet in one room.
const PREFIX = 'p2p-pokdeng-v2-';
const PING_MS = 2_000;
const DEAD_MS = 6_000;
const GRACE_MS = 60_000;
const MAX_MEMBERS = 30;

export interface Identity {
  id: string;
  secret: string;
  name: string;
  /** Watch without playing. */
  watch?: boolean;
}
export type NetStatus = 'hosting' | 'connected' | 'connecting' | 'reconnecting';
export interface NetEvents {
  onState(state: GameState): void;
  onStatus(status: NetStatus): void;
  onError(message: string): void;
  /** The room is gone for this player (idle timeout, or the host removed them). */
  onClosed(message: string): void;
}

const EXPIRED = 'The room closed after 5 minutes without any action.';
const REMOVED = 'The host removed you from this room.';

/** What the host knows about each person in the room. Only a fingerprint of their secret is kept. */
interface MemberInfo {
  id: string;
  name: string;
  peerId: string;
  secretHash: string;
}
interface Member extends MemberInfo {
  conn: DataConnection | null;
  lastSeen: number;
  goneAt: number | null;
}
/** Everything a standby needs to take over. It holds secret fingerprints, never the secrets themselves. */
interface Snapshot {
  state: GameState;
  members: MemberInfo[];
  removed: string[];
}

type Msg =
  | ({ t: 'hello'; peerId: string } & Identity)
  | { t: 'act'; action: PlayerAction }
  | { t: 'rejoin' | 'leave' | 'ping' | 'pong' | 'promote' | 'refuse' }
  | { t: 'closed'; message: string }
  | { t: 'state'; state: GameState; standbyId: string | null; snapshot?: Snapshot }
  | { t: 'reject' | 'error'; message: string };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const randomRoomCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join('');

/** Resolves once registered with the signaling server; rejects with the PeerError (e.g. type "unavailable-id"). */
async function openPeer(id?: string): Promise<Peer> {
  const options = { config: { iceServers: await iceServers() } };
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, options) : new Peer(options);
    const fail = (err: unknown) => {
      peer.destroy();
      reject(err);
    };
    peer.once('error', fail);
    peer.once('open', () => {
      peer.off('error', fail);
      resolve(peer);
    });
  });
}

const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;
const validAction = (a: unknown): a is PlayerAction => {
  const x = a as PlayerAction | null;
  return !!x && (['draw', 'stay', 'ready', 'clear'].includes(x.type)
    || (x.type === 'bet' && Number.isInteger(x.amount) && str(x.spot, 64) && (x.ready === undefined || typeof x.ready === 'boolean'))
    || (x.type === 'limit' && (x.amount === null || Number.isInteger(x.amount)))
    || (x.type === 'catch' && (x.cards === 2 || x.cards === 3)));
};

export class TableNet {
  role: 'host' | 'client' = 'client';
  private state: GameState | null = null; // host only
  private members = new Map<string, Member>(); // host only
  private removed = new Set<string>(); // host only: ids the host took out; they can't come back
  private promoteLinks = new WeakSet<DataConnection>(); // links this peer opened while taking over as host
  private roomPeer: Peer | null = null; // promoted host's claim on the room id
  private hostConn: DataConnection | null = null; // client only
  private lastPong = 0;
  private lastPing = 0;
  private snapshot: Snapshot | null = null; // set while we are the hot standby
  private promoted = false;
  private dialing = false;
  private joined = false; // client: initial join finished, the heartbeat may now redial
  private pendingJoin: { resolve(): void; reject(e: Error): void } | null = null;
  // Compression is asynchronous, so each connection chains its sends to keep messages in order.
  private outbox = new WeakMap<DataConnection, Promise<void>>();
  private timer: ReturnType<typeof setInterval>;
  private destroyed = false;

  private constructor(
    readonly roomCode: string,
    readonly me: Identity,
    private events: NetEvents,
    private peer: Peer,
  ) {
    this.listen(peer);
    this.timer = setInterval(() => this.tick(), 500);
  }

  static async host(roomCode: string, me: Identity, game: GameState, events: NetEvents): Promise<TableNet> {
    const net = new TableNet(roomCode, me, events, await openPeer(PREFIX + roomCode));
    net.becomeHost(game, []);
    return net;
  }

  static async join(roomCode: string, me: Identity, events: NetEvents): Promise<TableNet> {
    const net = new TableNet(roomCode, me, events, await openPeer());
    events.onStatus('connecting');
    for (let attempt = 1; ; attempt++) {
      try {
        await net.dial();
        net.joined = true;
        return net;
      } catch (err) {
        if (attempt >= 3 || (err as { rejected?: boolean }).rejected) {
          net.destroy();
          throw err;
        }
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
  }

  // ------------------------------------------------ public API

  act(action: PlayerAction) {
    this.request({ t: 'act', action });
  }

  rejoinQueue() {
    this.request({ t: 'rejoin' });
  }

  startGame() {
    if (this.role !== 'host' || !this.state) return;
    this.state = startGame(this.state, Date.now());
    this.broadcast();
  }

  addBot() {
    if (this.role !== 'host' || !this.state) return;
    this.state = addBot(this.state, Date.now());
    this.broadcast();
  }

  /** Host only: take a player out of the room. They are told, and can't rejoin with the same identity. */
  remove(id: string) {
    if (this.role !== 'host' || !this.state || id === this.me.id) return;
    const conn = this.members.get(id)?.conn;
    this.removed.add(id);
    this.members.delete(id);
    if (conn) {
      this.send(conn, { t: 'closed', message: REMOVED });
      setTimeout(() => conn.close(), 500);
    }
    this.state = removePlayer(this.state, id, Date.now());
    this.broadcast();
  }

  /** Say goodbye, then tear down. */
  leave() {
    if (this.role === 'host' && this.state) {
      this.state = removePlayer(this.state, this.me.id, Date.now());
      this.members.delete(this.me.id);
      this.broadcast(); // the standby's snapshot no longer has us; it takes over once we go quiet
    } else {
      this.send(this.hostConn, { t: 'leave' });
    }
    this.destroyed = true; // mute events right away
    setTimeout(() => this.destroy(), 300);
  }

  destroy() {
    this.destroyed = true;
    clearInterval(this.timer);
    this.peer.destroy();
    this.roomPeer?.destroy();
  }

  // ------------------------------------------------ plumbing

  private listen(peer: Peer) {
    peer.on('connection', (conn) => this.wire(conn));
    peer.on('disconnected', () => {
      if (!this.destroyed && !peer.destroyed) peer.reconnect(); // signaling dropped; data channels live on
    });
    peer.on('error', () => {}); // e.g. dialing a member that is gone; the heartbeat handles recovery
  }

  private wire(conn: DataConnection) {
    let inbox = Promise.resolve(); // decode in arrival order
    conn.on('data', (data) => {
      inbox = inbox
        .then(() => decode(data))
        .then((m) => {
          if (this.destroyed || !m || typeof (m as Msg).t !== 'string') return;
          if (this.role === 'host') this.onClientMsg(conn, m as Msg);
          else this.onHostMsg(conn, m as Msg);
        })
        .catch(() => {}); // not a valid compressed message: ignore it
    });
    const closed = () => this.onClose(conn);
    conn.on('close', closed);
    conn.on('error', closed);
  }

  private send(conn: DataConnection | null, msg: Msg) {
    if (!conn?.open) return;
    const next = (this.outbox.get(conn) ?? Promise.resolve())
      .then(() => encode(msg))
      .then((bytes) => {
        if (conn.open) conn.send(bytes);
      })
      .catch(() => {});
    this.outbox.set(conn, next);
  }

  private request(msg: Msg) {
    if (this.role === 'client') return this.send(this.hostConn, msg);
    this.handle(this.members.get(this.me.id)!, msg);
  }

  private status(s: NetStatus) {
    if (!this.destroyed) this.events.onStatus(s);
  }

  private tick() {
    if (this.destroyed) return;
    const now = Date.now();
    if (this.role === 'client') {
      if (now - this.lastPing >= PING_MS) {
        this.lastPing = now;
        this.send(this.hostConn, { t: 'ping' });
      }
      if (!this.joined || this.dialing || now - this.lastPong <= DEAD_MS) return;
      this.status('reconnecting');
      if (this.snapshot) return this.promote();
      this.dial().catch(() => {});
      return;
    }

    const before = this.state!;
    // Guarded: one unexpected error must not stop the clock, or the room would freeze for everyone.
    try {
      for (const m of this.members.values()) {
        if (m.id === this.me.id) continue;
        if (m.conn && now - m.lastSeen > DEAD_MS) {
          m.conn.close();
          this.markGone(m, now);
        }
        if (m.goneAt !== null && now - m.goneAt > GRACE_MS) {
          this.members.delete(m.id);
          this.state = removePlayer(this.state!, m.id, now);
        }
      }
      this.state = hostTick(this.state!, now);
    } catch (err) {
      console.error('Host tick failed; trying again next tick:', err);
    }
    if (now - this.state!.lastActionAt > IDLE_MS) {
      for (const m of this.members.values()) this.send(m.conn, { t: 'closed', message: EXPIRED });
      // Sending is asynchronous (compression), and the app tears the connection down as soon as it hears the room
      // closed. So stop ticking now, and only report the close (and destroy) once the goodbyes have gone out.
      this.destroyed = true;
      setTimeout(() => {
        this.events.onClosed(EXPIRED);
        this.destroy();
      }, 300);
      return;
    }
    if (this.state !== before) this.broadcast();
  }

  // ------------------------------------------------ client side

  private dial(): Promise<void> {
    this.dialing = true;
    const conn = this.peer.connect(PREFIX + this.roomCode, { reliable: true, serialization: 'raw' });
    this.wire(conn);
    conn.on('open', () => this.send(conn, { t: 'hello', ...this.me, peerId: this.peer.id }));
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.close();
        done(Object.assign(new Error('Room not found, or the host is unreachable.'), { rejected: false }));
      }, 6_000);
      const done = (err?: Error) => {
        clearTimeout(timeout);
        this.dialing = false;
        this.pendingJoin = null;
        if (err) reject(err);
        else resolve();
      };
      this.pendingJoin = { resolve: () => done(), reject: done };
    });
  }

  private onHostMsg(conn: DataConnection, msg: Msg) {
    const now = Date.now();
    switch (msg.t) {
      case 'state':
        if (this.hostConn !== conn) {
          if (this.hostConn && now - this.lastPong < DEAD_MS) return conn.close(); // stale second link
          this.hostConn?.close();
          this.hostConn = conn;
        }
        this.lastPong = now;
        this.snapshot = msg.standbyId === this.me.id ? (msg.snapshot ?? null) : null;
        this.status('connected');
        if (!this.destroyed) this.events.onState(msg.state);
        this.pendingJoin?.resolve();
        return;
      case 'pong':
        if (conn === this.hostConn) this.lastPong = now;
        return;
      case 'error':
        if (!this.destroyed) this.events.onError(msg.message);
        return;
      case 'reject':
        if (this.pendingJoin) return this.pendingJoin.reject(Object.assign(new Error(msg.message), { rejected: true }));
        this.events.onError(msg.message);
        return;
      case 'closed':
        if (conn !== this.hostConn) return;
        this.events.onClosed(typeof msg.message === 'string' ? msg.message.slice(0, 200) : EXPIRED);
        return this.destroy();
      case 'promote':
        // A standby took over. Only follow it if our own host has really gone quiet.
        if (this.hostConn?.open && now - this.lastPong < DEAD_MS) {
          this.send(conn, { t: 'refuse' });
          setTimeout(() => conn.close(), 500);
        } else {
          this.send(conn, { t: 'hello', ...this.me, peerId: this.peer.id });
        }
        return;
    }
  }

  private promote() {
    const snap = this.snapshot!;
    this.snapshot = null;
    this.removed = new Set(snap.removed);
    this.hostConn?.close();
    this.hostConn = null;
    this.promoted = true;
    const now = Date.now();
    let state = snap.state;
    for (const m of snap.members) if (m.id !== this.me.id) state = setConnected(state, m.id, false);
    if (state.deadline) state = { ...state, deadline: now + TURN_MS };
    this.becomeHost(state, snap.members);

    for (const m of this.members.values()) {
      if (m.id === this.me.id) continue;
      m.goneAt = now;
      const conn = this.peer.connect(m.peerId, { reliable: true, serialization: 'raw' });
      this.promoteLinks.add(conn);
      this.wire(conn);
      conn.on('open', () => this.send(conn, { t: 'promote' }));
    }
    this.claimRoom();
  }

  /** Keep trying to take over the room id so new players can still join by code. */
  private async claimRoom() {
    while (!this.destroyed && this.role === 'host' && !this.roomPeer) {
      try {
        const peer = await openPeer(PREFIX + this.roomCode);
        if (this.destroyed || this.role !== 'host') return peer.destroy();
        this.roomPeer = peer;
        this.listen(peer);
      } catch {
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
  }

  /** We promoted by mistake: the real host is alive. Go back to being a client. */
  private demote() {
    for (const m of this.members.values()) m.conn?.close();
    this.members.clear();
    this.removed.clear();
    this.roomPeer?.destroy();
    this.roomPeer = null;
    this.state = null;
    this.promoted = false;
    this.role = 'client';
    this.joined = true;
    this.lastPong = 0; // the next tick dials the room id
  }

  // ------------------------------------------------ host side

  private becomeHost(state: GameState, members: MemberInfo[]) {
    const now = Date.now();
    this.role = 'host';
    this.members = new Map(members.map((m) => [m.id, { ...m, conn: null, lastSeen: now, goneAt: null }]));
    const self = { id: this.me.id, name: this.me.name, peerId: this.peer.id, secretHash: sha256(this.me.secret) };
    this.members.set(this.me.id, { ...self, conn: null, lastSeen: now, goneAt: null });
    this.state = (this.me.watch ? addSpectator : addPlayer)(state, this.me.id, this.me.name, now);
    this.status('hosting');
    this.broadcast();
  }

  private markGone(m: Member, now: number) {
    m.conn = null;
    m.goneAt = now;
    this.state = setConnected(this.state!, m.id, false);
  }

  private onClose(conn: DataConnection) {
    if (this.role === 'client') {
      if (conn === this.hostConn) this.hostConn = null;
      return;
    }
    const m = [...this.members.values()].find((x) => x.conn === conn);
    if (!m) return;
    this.markGone(m, Date.now());
    this.broadcast();
  }

  private onClientMsg(conn: DataConnection, msg: Msg) {
    const now = Date.now();
    if (msg.t === 'promote') return this.send(conn, { t: 'refuse' }); // we are alive
    // Only a player we contacted while taking over can send us back to client mode; a refuse from
    // anyone else could otherwise knock a new host out of a room on demand.
    if (msg.t === 'refuse') {
      if (this.promoted && this.promoteLinks.has(conn)) this.demote();
      return;
    }
    if (msg.t === 'hello') {
      const name = cleanName(msg.name);
      if (!str(msg.id, 64) || isBot(msg.id) || !str(msg.secret, 128) || !str(msg.peerId, 128)) return conn.close();
      let m = this.members.get(msg.id);
      const reject = (message: string) => {
        this.send(conn, { t: 'reject', message });
        setTimeout(() => conn.close(), 500);
      };
      if (this.removed.has(msg.id)) return reject(REMOVED);
      const secretHash = sha256(msg.secret);
      if (m && m.secretHash !== secretHash) return reject('That seat belongs to someone else.');
      if (!m) {
        if (this.members.size >= MAX_MEMBERS) return reject('This room is full.');
        m = { id: msg.id, secretHash, name, peerId: msg.peerId, conn: null, lastSeen: now, goneAt: null };
        this.members.set(m.id, m);
      }
      if (m.conn && m.conn !== conn) m.conn.close();
      Object.assign(m, { conn, name, peerId: msg.peerId, lastSeen: now, goneAt: null });
      this.state = (msg.watch === true ? addSpectator : addPlayer)(this.state!, m.id, name, now);
      return this.broadcast();
    }
    const m = [...this.members.values()].find((x) => x.conn === conn);
    if (m) this.handle(m, msg);
  }

  private handle(m: Member, msg: Msg) {
    const now = Date.now();
    m.lastSeen = now;
    const fail = (message: string) => (m.id === this.me.id ? this.events.onError(message) : this.send(m.conn, { t: 'error', message }));
    switch (msg.t) {
      case 'ping':
        return this.send(m.conn, { t: 'pong' });
      case 'act':
        if (!validAction(msg.action)) return fail('Invalid action');
        try {
          this.state = applyAction(this.state!, m.id, msg.action, now);
        } catch (err) {
          return fail((err as Error).message);
        }
        return this.broadcast();
      case 'rejoin':
        this.state = rejoinQueue(this.state!, m.id, m.name, now);
        return this.broadcast();
      case 'leave':
        this.members.delete(m.id);
        this.state = removePlayer(this.state!, m.id, now);
        return this.broadcast();
    }
  }

  private broadcast() {
    const state = this.state!;
    const connected = (id: string) => id !== this.me.id && !!this.members.get(id)?.conn?.open;
    const standbyId = [...state.players.map((p) => p.id), ...state.queue.map((q) => q.id)].find(connected) ?? null;
    const members = [...this.members.values()].map(({ id, name, peerId, secretHash }) => ({ id, name, peerId, secretHash }));
    for (const m of this.members.values()) {
      if (m.id === this.me.id) continue;
      const snapshot = m.id === standbyId ? { state, members, removed: [...this.removed] } : undefined;
      this.send(m.conn, { t: 'state', state: maskFor(state, m.id), standbyId, snapshot });
    }
    if (!this.destroyed) this.events.onState(maskFor(state, this.me.id));
  }
}
