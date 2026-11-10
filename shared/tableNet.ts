import Peer, { type DataConnection } from 'peerjs';
import { decode, encode, MAX_PACKED_BYTES, MAX_UNPACKED_BYTES } from './codec';
import { iceServers } from './iceServers';
import { cleanName, IDLE_MS, isBot } from './lobby';
import { sha256 } from './sha256';

/** The least a game's state needs for the room to run: who's in it, and when anyone last did anything. */
export interface RoomState {
  players: { id: string }[];
  queue: { id: string }[];
  lastActionAt: number;
}

/** One game's side of the room: its engine, its room-id prefix and what counts as a well-formed move. */
export interface Rules<S extends RoomState, A> {
  /** Bump the version whenever the wire format changes, so old and new pages never meet in one room. */
  prefix: string;
  /** Shape check on a move from the wire; the engine checks the rules. */
  validAction(a: unknown): a is A;
  addPlayer(s: S, id: string, name: string, now: number): S;
  addSpectator(s: S, id: string, name: string, now: number): S;
  addBot(s: S, now: number): S;
  applyAction(s: S, id: string, a: A, now: number): S;
  hostTick(s: S, now: number): S;
  removePlayer(s: S, id: string, now: number): S;
  setConnected(s: S, id: string, connected: boolean): S;
  startGame(s: S, now: number): S;
  /** Broke players asking back in; games without chips leave it out. */
  rejoinQueue?(s: S, id: string, name: string, now: number): S;
  /** What one viewer may see; games with nothing hidden leave it out. */
  maskFor?(s: S, viewerId: string): S;
  /** A standby just took over: restart the running clock, since our clock may differ from the old host's. */
  resume(s: S, now: number): S;
}

/** Shape-check helper for `validAction`: a non-empty string of at most `max` characters. */
export const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;

const PING_MS = 2_000;
const DEAD_MS = 6_000;
const GRACE_MS = 60_000;
const MAX_MEMBERS = 30;
const MAX_LINKS = MAX_MEMBERS * 2; // includes reconnects and outgoing takeover links
const MAX_BUFFER_BYTES = 256 * 1024;

interface Link {
  admitted: boolean;
  watch?: boolean;
  since: number;
  incoming: number;
  incomingBytes: number;
  outgoing: number;
  outgoingBytes: number;
  sendingSince: number;
  rate: { at: number; messages: number; bytes: number };
}

export interface Identity {
  id: string;
  secret: string;
  name: string;
  /** Watch without playing. */
  watch?: boolean;
}
export type NetStatus = 'hosting' | 'connected' | 'connecting' | 'reconnecting';
export interface NetEvents<S> {
  onState(state: S): void;
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
interface Snapshot<S> {
  state: S;
  members: MemberInfo[];
  removed: string[];
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const memberId = (v: unknown) => str(v, 64) && v !== 'seat' && v !== 'last' && !isBot(v as string);
const roomState = (v: unknown) => object(v)
  && Array.isArray(v.players) && v.players.every((p) => object(p) && str(p.id, 64))
  && Array.isArray(v.queue) && v.queue.every((p) => object(p) && str(p.id, 64))
  && typeof v.lastActionAt === 'number' && Number.isFinite(v.lastActionAt);
const snapshot = (v: unknown) => object(v) && roomState(v.state)
  && Array.isArray(v.members) && v.members.every((m) => object(m) && memberId(m.id)
    && typeof m.name === 'string' && str(m.peerId, 128)
    && typeof m.secretHash === 'string' && /^[a-f0-9]{64}$/.test(m.secretHash))
  && Array.isArray(v.removed) && v.removed.every((id) => str(id, 64));

type Msg<S, A> =
  | ({ t: 'hello'; peerId: string } & Identity)
  | { t: 'act'; action: A }
  | { t: 'rejoin' | 'leave' | 'ping' | 'pong' | 'promote' | 'refuse' }
  | { t: 'closed'; message: string }
  | { t: 'state'; state: S; standbyId: string | null; snapshot?: Snapshot<S> }
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

export class TableNet<S extends RoomState, A> {
  role: 'host' | 'client' = 'client';
  private state: S | null = null; // host only
  private members = new Map<string, Member>(); // host only
  private removed = new Set<string>(); // host only: ids the host took out; they can't come back
  private promoteLinks = new WeakSet<DataConnection>(); // links this peer opened while taking over as host
  private roomPeer: Peer | null = null; // promoted host's claim on the room id
  private hostConn: DataConnection | null = null; // client only
  private lastPong = 0;
  private lastPing = 0;
  private snapshot: Snapshot<S> | null = null; // set while we are the hot standby
  private promoted = false;
  private dialing = false;
  private joined = false; // client: initial join finished, the heartbeat may now redial
  private pendingJoin: { resolve(): void; reject(e: Error): void } | null = null;
  // Compression is asynchronous, so each connection chains its sends to keep messages in order.
  private outbox = new WeakMap<DataConnection, Promise<void>>();
  private pendingState = new WeakMap<DataConnection, { msg: Msg<S, A>; size: number }>();
  private links = new Map<DataConnection, Link>();
  private admission = { at: 0, count: 0 };
  private rate = { at: 0, messages: 0, bytes: 0 };
  // ponytail: one bounded decode chain caps aggregate decompression work; parallelize only if measured slow.
  private inbox = Promise.resolve();
  private incoming = 0;
  private incomingBytes = 0;
  private outgoing = 0;
  private outgoingBytes = 0;
  private timer: ReturnType<typeof setInterval>;
  private destroyed = false;

  private constructor(
    private rules: Rules<S, A>,
    readonly roomCode: string,
    readonly me: Identity,
    private events: NetEvents<S>,
    private peer: Peer,
  ) {
    this.listen(peer);
    this.timer = setInterval(() => this.tick(), 500);
  }

  static async host<S extends RoomState, A>(rules: Rules<S, A>, roomCode: string, me: Identity, game: S, events: NetEvents<S>): Promise<TableNet<S, A>> {
    const net = new TableNet(rules, roomCode, me, events, await openPeer(rules.prefix + roomCode));
    net.becomeHost(game, []);
    return net;
  }

  static async join<S extends RoomState, A>(rules: Rules<S, A>, roomCode: string, me: Identity, events: NetEvents<S>): Promise<TableNet<S, A>> {
    const net = new TableNet(rules, roomCode, me, events, await openPeer());
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

  act(action: A) {
    this.request({ t: 'act', action });
    if (!this.destroyed && !this.me.watch && this.rules.validAction(action)) {
      window.dispatchEvent(new Event('card-games:play'));
    }
  }

  rejoinQueue() {
    this.request({ t: 'rejoin' });
  }

  startGame() {
    if (this.role !== 'host' || !this.state) return;
    this.state = this.rules.startGame(this.state, Date.now());
    this.broadcast();
  }

  addBot() {
    if (this.role !== 'host' || !this.state) return;
    this.state = this.rules.addBot(this.state, Date.now());
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
    this.state = this.rules.removePlayer(this.state, id, Date.now());
    this.broadcast();
  }

  /** Say goodbye, then tear down. */
  leave() {
    if (this.role === 'host' && this.state) {
      this.state = this.rules.removePlayer(this.state, this.me.id, Date.now());
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
    for (const conn of this.links.keys()) this.drop(conn);
    this.peer.destroy();
    this.roomPeer?.destroy();
  }

  // ------------------------------------------------ plumbing

  private listen(peer: Peer) {
    peer.on('connection', (conn) => this.wire(conn, true));
    peer.on('disconnected', () => {
      if (!this.destroyed && !peer.destroyed) peer.reconnect(); // signaling dropped; data channels live on
    });
    peer.on('error', () => {}); // e.g. dialing a member that is gone; the heartbeat handles recovery
  }

  private wire(conn: DataConnection, incoming = false) {
    const now = Date.now();
    if (now - this.admission.at >= 10_000) this.admission = { at: now, count: 0 };
    if (this.destroyed || this.links.size >= MAX_LINKS ||
      (incoming && (++this.admission.count > MAX_LINKS || [...this.links.values()].filter((l) => !l.admitted).length >= MAX_MEMBERS))) {
      conn.close();
      return;
    }
    const link: Link = { admitted: false, since: now, incoming: 0, incomingBytes: 0, outgoing: 0, outgoingBytes: 0,
      sendingSince: 0, rate: { at: now, messages: 0, bytes: 0 } };
    this.links.set(conn, link);
    conn.on('data', (data) => {
      if (!this.links.has(conn) || this.destroyed) return;
      const size = data instanceof Uint8Array || data instanceof ArrayBuffer ? data.byteLength : 0;
      const now = Date.now();
      for (const rate of [link.rate, this.rate]) {
        if (now - rate.at >= 1_000) Object.assign(rate, { at: now, messages: 0, bytes: 0 });
        rate.messages++;
        rate.bytes += size;
      }
      if (!size || size > MAX_PACKED_BYTES || link.incoming >= 8 || this.incoming >= 64 ||
        link.incomingBytes + size > MAX_PACKED_BYTES * 2 || this.incomingBytes + size > MAX_UNPACKED_BYTES ||
        link.rate.messages > 30 || link.rate.bytes > MAX_BUFFER_BYTES || this.rate.messages > 240 || this.rate.bytes > MAX_BUFFER_BYTES * 8) {
        this.drop(conn);
        return;
      }
      link.incoming++; link.incomingBytes += size;
      this.incoming++; this.incomingBytes += size;
      this.inbox = this.inbox
        .then(() => this.links.has(conn) && !this.destroyed ? decode(data) : null)
        .then((m) => {
          if (this.destroyed || !this.links.has(conn)) return;
          if (!object(m) || typeof m.t !== 'string') return this.drop(conn);
          if (this.role === 'host') this.onClientMsg(conn, m as Msg<S, A>);
          else this.onHostMsg(conn, m as Msg<S, A>);
        })
        .catch(() => this.drop(conn))
        .finally(() => {
          link.incoming--; link.incomingBytes -= size;
          this.incoming--; this.incomingBytes -= size;
        });
    });
    const closed = () => { this.links.delete(conn); this.onClose(conn); };
    conn.on('close', closed);
    conn.on('error', closed);
  }

  private drop(conn: DataConnection) {
    this.links.delete(conn);
    conn.close();
    this.onClose(conn);
  }

  private send(conn: DataConnection | null, msg: Msg<S, A>) {
    if (!conn?.open) return;
    const link = this.links.get(conn);
    if (!link) return;
    const size = new TextEncoder().encode(JSON.stringify(msg)).byteLength;
    // Only the trailing pending state can be replaced: control messages are ordering boundaries.
    const pending = msg.t === 'state' ? this.pendingState.get(conn) : undefined;
    const added = size - (pending?.size ?? 0);
    if (size > MAX_UNPACKED_BYTES || (!pending && (link.outgoing >= 32 || this.outgoing >= 256)) ||
      link.outgoingBytes + added > MAX_UNPACKED_BYTES * 2 || this.outgoingBytes + added > MAX_UNPACKED_BYTES * 8) return this.drop(conn);
    link.outgoingBytes += added; this.outgoingBytes += added;
    if (pending) {
      Object.assign(pending, { msg, size });
      return;
    }
    const entry = { msg, size };
    if (msg.t === 'state') this.pendingState.set(conn, entry);
    else this.pendingState.delete(conn);
    if (!link.outgoing) link.sendingSince = Date.now();
    link.outgoing++; this.outgoing++;
    const next = (this.outbox.get(conn) ?? Promise.resolve())
      .then(() => {
        if (this.pendingState.get(conn) === entry) this.pendingState.delete(conn);
        return this.links.has(conn) && conn.open ? encode(entry.msg) : null;
      })
      .then((bytes) => {
        if (!bytes || !this.links.has(conn) || !conn.open) return;
        const buffered = conn.dataChannel?.bufferedAmount ?? 0;
        const queued = (conn as DataConnection & { bufferSize?: number }).bufferSize ?? 0;
        const totalBuffered = [...this.links.keys()].reduce((sum, c) => sum + (c.dataChannel?.bufferedAmount ?? 0), 0);
        if (bytes.byteLength > MAX_PACKED_BYTES || queued > 0 || buffered + bytes.byteLength > MAX_BUFFER_BYTES ||
          totalBuffered + bytes.byteLength > MAX_BUFFER_BYTES * 8) return this.drop(conn);
        conn.send(bytes);
      })
      .catch(() => this.drop(conn))
      .finally(() => {
        link.outgoing--; link.outgoingBytes -= entry.size;
        this.outgoing--; this.outgoingBytes -= entry.size;
      });
    this.outbox.set(conn, next);
  }

  private request(msg: Msg<S, A>) {
    if (this.role === 'client') return this.send(this.hostConn, msg);
    this.handle(this.members.get(this.me.id)!, msg);
  }

  private status(s: NetStatus) {
    if (!this.destroyed) this.events.onStatus(s);
  }

  private tick() {
    if (this.destroyed) return;
    const now = Date.now();
    for (const [conn, link] of this.links) {
      if ((!link.admitted && now - link.since > DEAD_MS) || (link.outgoing && now - link.sendingSince > DEAD_MS)) this.drop(conn);
    }
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
          this.state = this.rules.removePlayer(this.state!, m.id, now);
        }
      }
      this.state = this.rules.hostTick(this.state!, now);
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
    const conn = this.peer.connect(this.rules.prefix + this.roomCode, { reliable: true, serialization: 'raw' });
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

  private onHostMsg(conn: DataConnection, msg: Msg<S, A>) {
    if ((msg.t === 'error' || msg.t === 'reject' || msg.t === 'closed') && typeof msg.message !== 'string') return;
    const now = Date.now();
    switch (msg.t) {
      case 'state':
        if (!roomState(msg.state) || (msg.standbyId !== null && !memberId(msg.standbyId))
          || (msg.snapshot !== undefined && !snapshot(msg.snapshot))) return;
        if (this.hostConn !== conn) {
          if (this.hostConn && now - this.lastPong < DEAD_MS) return conn.close(); // stale second link
          this.hostConn?.close();
          this.hostConn = conn;
        }
        this.lastPong = now;
        const link = this.links.get(conn);
        if (link) link.admitted = true;
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
        this.events.onClosed(msg.message.slice(0, 200));
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
    for (const m of snap.members) if (m.id !== this.me.id) state = this.rules.setConnected(state, m.id, false);
    state = this.rules.resume(state, now);
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
        const peer = await openPeer(this.rules.prefix + this.roomCode);
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

  private becomeHost(state: S, members: MemberInfo[]) {
    const now = Date.now();
    this.role = 'host';
    this.members = new Map(members.map((m) => [m.id, { ...m, conn: null, lastSeen: now, goneAt: null }]));
    const self = { id: this.me.id, name: this.me.name, peerId: this.peer.id, secretHash: sha256(this.me.secret) };
    this.members.set(this.me.id, { ...self, conn: null, lastSeen: now, goneAt: null });
    this.state = (this.me.watch ? this.rules.addSpectator : this.rules.addPlayer)(state, this.me.id, this.me.name, now);
    this.status('hosting');
    this.broadcast();
  }

  private markGone(m: Member, now: number) {
    m.conn = null;
    m.goneAt = now;
    this.state = this.rules.setConnected(this.state!, m.id, false);
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

  private onClientMsg(conn: DataConnection, msg: Msg<S, A>) {
    const now = Date.now();
    if (msg.t === 'promote') return this.send(conn, { t: 'refuse' }); // we are alive
    // Only a player we contacted while taking over can send us back to client mode; a refuse from
    // anyone else could otherwise knock a new host out of a room on demand.
    if (msg.t === 'refuse') {
      if (this.promoted && this.promoteLinks.has(conn)) this.demote();
      return;
    }
    if (msg.t === 'hello') {
      if (!memberId(msg.id) || !str(msg.secret, 128) || !str(msg.peerId, 128) || !str(conn.peer, 128)
        || typeof msg.name !== 'string' || (msg.watch !== undefined && typeof msg.watch !== 'boolean')) return conn.close();
      if ([...this.members.values()].some((m) => m.conn === conn && m.id !== msg.id)) return conn.close();
      const name = cleanName(msg.name);
      let m = this.members.get(msg.id);
      const reject = (message: string) => {
        this.send(conn, { t: 'reject', message });
        setTimeout(() => conn.close(), 500);
      };
      if (this.removed.has(msg.id)) return reject(REMOVED);
      const secretHash = sha256(msg.secret);
      if (m && m.secretHash !== secretHash) return reject('That seat belongs to someone else.');
      const link = this.links.get(conn);
      if (m?.conn === conn && m.name === name && m.peerId === conn.peer && link?.watch === (msg.watch === true)) {
        m.lastSeen = now;
        return;
      }
      if (!m) {
        if (this.members.size >= MAX_MEMBERS) return reject('This room is full.');
        m = { id: msg.id, secretHash, name, peerId: conn.peer, conn: null, lastSeen: now, goneAt: null };
        this.members.set(m.id, m);
      }
      if (m.conn && m.conn !== conn) m.conn.close();
      Object.assign(m, { conn, name, peerId: conn.peer, lastSeen: now, goneAt: null });
      if (link) { link.admitted = true; link.watch = msg.watch === true; }
      this.state = (msg.watch === true ? this.rules.addSpectator : this.rules.addPlayer)(this.state!, m.id, name, now);
      return this.broadcast();
    }
    const m = [...this.members.values()].find((x) => x.conn === conn);
    if (m) this.handle(m, msg);
  }

  private handle(m: Member, msg: Msg<S, A>) {
    const now = Date.now();
    m.lastSeen = now;
    const fail = (message: string) => (m.id === this.me.id ? this.events.onError(message) : this.send(m.conn, { t: 'error', message }));
    switch (msg.t) {
      case 'ping':
        return this.send(m.conn, { t: 'pong' });
      case 'act':
        if (!this.rules.validAction(msg.action)) return fail('Invalid action');
        try {
          this.state = this.rules.applyAction(this.state!, m.id, msg.action, now);
        } catch (err) {
          return fail((err as Error).message);
        }
        return this.broadcast();
      case 'rejoin':
        if (!this.rules.rejoinQueue) return;
        const next = this.rules.rejoinQueue(this.state!, m.id, m.name, now);
        if (next === this.state) return;
        this.state = next;
        return this.broadcast();
      case 'leave':
        this.members.delete(m.id);
        this.state = this.rules.removePlayer(this.state!, m.id, now);
        return this.broadcast();
    }
  }

  private broadcast() {
    const state = this.state!;
    const connected = (id: string) => id !== this.me.id && !!this.members.get(id)?.conn?.open;
    const standbyId = [...state.players.map((p) => p.id), ...state.queue.map((q) => q.id)].find(connected) ?? null;
    const mask = (id: string) => this.rules.maskFor?.(state, id) ?? state;
    const members = [...this.members.values()].map(({ id, name, peerId, secretHash }) => ({ id, name, peerId, secretHash }));
    for (const m of this.members.values()) {
      if (m.id === this.me.id) continue;
      const snapshot = m.id === standbyId ? { state, members, removed: [...this.removed] } : undefined;
      this.send(m.conn, { t: 'state', state: mask(m.id), standbyId, snapshot });
    }
    if (!this.destroyed) this.events.onState(mask(this.me.id));
  }
}
