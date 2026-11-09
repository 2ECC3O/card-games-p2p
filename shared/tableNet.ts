import Peer, { type DataConnection } from 'peerjs';
import { decode, encode, MAX_PACKED_BYTES } from './codec';
import { iceServers } from './iceServers';
import { cleanName, IDLE_MS, isBot } from './lobby';
import { loadSigner, nonce, sameKey, sign, validNonce, validPublicKey, verify, type Signer } from './identity';

/** The least a game's state needs for the room to run: who's in it, and when anyone last did anything. */
export interface RoomState {
  players: { id: string }[];
  queue: { id: string }[];
  spectators?: { id: string }[];
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
const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024;

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

/** Public verification keys can be backed up without allowing the backup to impersonate a player. */
interface MemberInfo {
  id: string;
  name: string;
  peerId: string;
  publicKey: JsonWebKey;
}
interface Member extends MemberInfo {
  conn: DataConnection | null;
  lastSeen: number;
  goneAt: number | null;
}
/** Automatic takeover requires one connected browser to retain the full private game state. */
interface Snapshot<S> {
  state: S;
  members: MemberInfo[];
  knownKeys: [string, JsonWebKey][];
  removed: string[];
}
interface Standby { id: string; peerId: string; publicKey: JsonWebKey }
interface Hello { id: string; name: string; watch?: boolean; publicKey: JsonWebKey; nonce: string }
interface PendingHello { hello: Hello; nonce: string }

type Msg<S, A> =
  | ({ t: 'hello' } & Hello)
  | { t: 'challenge'; nonce: string; publicKey: JsonWebKey; signature: string }
  | { t: 'auth'; signature: string }
  | { t: 'act'; action: A }
  | { t: 'rejoin' | 'leave' | 'ping' | 'pong' }
  | { t: 'promote'; nonce: string }
  | { t: 'refuse'; nonce: string; signature: string }
  | { t: 'witness'; nonce: string; peerId: string; signature?: string }
  | { t: 'closed'; message: string }
  | { t: 'state'; state: S; standby: Standby | null; snapshot?: Snapshot<S> }
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
  private knownKeys = new Map<string, JsonWebKey>(); // retain identity pins after leave/expiry
  private removed = new Set<string>(); // host only: ids the host took out; they can't come back
  private promoteLinks = new WeakSet<DataConnection>(); // links this peer opened while taking over as host
  private promotionNonce: string | null = null;
  private promotionStartedAt = 0;
  private refusalLinks = new Map<string, DataConnection>();
  private roomPeer: Peer | null = null; // promoted host's claim on the room id
  private hostConn: DataConnection | null = null; // client only
  private dialConn: DataConnection | null = null;
  private hostPin: JsonWebKey | null = null;
  private standby: Standby | null = null;
  private joinChallenges = new WeakMap<DataConnection, { nonce: string; expectedKey: JsonWebKey | null }>();
  private pendingHellos = new WeakMap<DataConnection, PendingHello>();
  private lastPong = 0;
  private lastPing = 0;
  private snapshot: Snapshot<S> | null = null; // set while we are the hot standby
  private promoted = false;
  private dialing = false;
  private joined = false; // client: initial join finished, the heartbeat may now redial
  private pendingJoin: { resolve(): void; reject(e: Error): void } | null = null;
  // Compression is asynchronous, so each connection chains its sends to keep messages in order.
  private outbox = new WeakMap<DataConnection, Promise<void>>();
  private sendCounts = new WeakMap<DataConnection, number>();
  private pendingStates = new WeakMap<DataConnection, Msg<S, A>>();
  private links = new Set<DataConnection>();
  private admissions = { at: 0, count: 0 };
  private cryptoWork = { at: 0, count: 0 };
  private ingress = { at: 0, bytes: 0, queued: 0 };
  private timer: ReturnType<typeof setInterval>;
  private destroyed = false;

  private constructor(
    private rules: Rules<S, A>,
    readonly roomCode: string,
    readonly me: Identity,
    private events: NetEvents<S>,
    private peer: Peer,
    private signer: Signer,
  ) {
    const key: unknown = JSON.parse(sessionStorage.getItem(`${rules.prefix}${roomCode}.host-key`) ?? 'null');
    if (key !== null && !validPublicKey(key)) throw new Error('The saved host identity is invalid. Use a new room.');
    this.hostPin = key;
    const backup: Standby | null = JSON.parse(sessionStorage.getItem(`${rules.prefix}${roomCode}.standby`) ?? 'null');
    if (backup && str(backup.id, 64) && str(backup.peerId, 128) && validPublicKey(backup.publicKey)) this.standby = backup;
    this.listen(peer);
    this.timer = setInterval(() => this.tick(), 500);
  }

  static async host<S extends RoomState, A>(rules: Rules<S, A>, roomCode: string, me: Identity, game: S, events: NetEvents<S>): Promise<TableNet<S, A>> {
    const signer = await loadSigner(me.id, me.secret);
    const net = new TableNet(rules, roomCode, me, events, await openPeer(rules.prefix + roomCode), signer);
    net.becomeHost(game, []);
    return net;
  }

  static async join<S extends RoomState, A>(rules: Rules<S, A>, roomCode: string, me: Identity, events: NetEvents<S>): Promise<TableNet<S, A>> {
    const signer = await loadSigner(me.id, me.secret);
    const net = new TableNet(rules, roomCode, me, events, await openPeer(), signer);
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
    this.dropMember(id);
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
      this.dropMember(this.me.id);
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
    if (this.destroyed || this.links.size >= MAX_MEMBERS * 2 || !this.takeBudget(this.admissions, 60)) return conn.close();
    this.links.add(conn);
    const helloTimeout = setTimeout(() => {
      if (conn !== this.hostConn && ![...this.members.values()].some((m) => m.conn === conn)) {
        this.links.delete(conn); // PeerJS emits no close event for a link that never opened.
        conn.close();
      }
    }, DEAD_MS);
    let inbox = Promise.resolve(); // decode in arrival order
    let queued = 0;
    let queuedBytes = 0;
    let windowAt = Date.now();
    let received = 0;
    conn.on('data', (data) => {
      if (this.destroyed || !conn.open) return;
      const size = data instanceof Uint8Array || data instanceof ArrayBuffer ? data.byteLength : 0;
      const now = Date.now();
      if (now - windowAt >= 1000) { windowAt = now; received = 0; }
      if (now - this.ingress.at >= 1000 || now < this.ingress.at) {
        this.ingress.at = now;
        this.ingress.bytes = 0;
      }
      const maxBytes = this.role === 'host' || conn !== this.hostConn ? MAX_CLIENT_MESSAGE_BYTES : MAX_PACKED_BYTES;
      // ponytail: generous room-wide gameplay allowance per connection; close instead of buffering abuse.
      if (!size || size > maxBytes || ++received > 60 || queued >= 32 || queuedBytes + size > MAX_PACKED_BYTES * 4
        || this.ingress.queued >= 128 || this.ingress.bytes + size > 512 * 1024) return conn.close();
      queued++;
      queuedBytes += size;
      this.ingress.queued++;
      this.ingress.bytes += size;
      inbox = inbox
        .then(() => !this.destroyed && conn.open
          ? decode(data, { maxUnpacked: this.role === 'host' || conn !== this.hostConn ? MAX_CLIENT_MESSAGE_BYTES : undefined }) : null)
        .then((m) => {
          if (this.destroyed || !m || typeof (m as Msg<S, A>).t !== 'string') return;
          if (this.role === 'host') return this.onClientMsg(conn, m as Msg<S, A>);
          return this.onHostMsg(conn, m as Msg<S, A>);
        })
        .catch(() => conn.close())
        .finally(() => { queued--; queuedBytes -= size; this.ingress.queued--; });
    });
    const closed = () => {
      clearTimeout(helloTimeout);
      this.links.delete(conn);
      this.onClose(conn);
    };
    conn.on('close', closed);
    conn.on('error', closed);
  }

  private takeBudget(budget: { at: number; count: number }, limit: number) {
    const now = Date.now();
    if (now - budget.at >= 1000 || now < budget.at) { budget.at = now; budget.count = 0; }
    return ++budget.count <= limit;
  }

  private send(conn: DataConnection | null, msg: Msg<S, A>) {
    if (!conn?.open) return;
    if (msg.t === 'state' && this.pendingStates.has(conn)) {
      this.pendingStates.set(conn, msg);
      return;
    }
    const count = this.sendCounts.get(conn) ?? 0;
    if (count >= 32) return conn.close();
    this.sendCounts.set(conn, count + 1);
    if (msg.t === 'state') this.pendingStates.set(conn, msg);
    const next = (this.outbox.get(conn) ?? Promise.resolve())
      .then(() => {
        const current = msg.t === 'state' ? this.pendingStates.get(conn)! : msg;
        if (msg.t === 'state') this.pendingStates.delete(conn);
        return conn.open ? encode(current) : null;
      })
      .then((bytes) => {
        if (('bufferSize' in conn && typeof conn.bufferSize === 'number' && conn.bufferSize >= 32)
          || conn.dataChannel?.bufferedAmount > 2 * 1024 * 1024) return conn.close();
        if (conn.open && bytes) conn.send(bytes);
      })
      .catch(() => conn.close())
      .finally(() => this.sendCounts.set(conn, (this.sendCounts.get(conn) ?? 1) - 1));
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
          this.dropMember(m.id);
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
    conn.on('open', () => this.beginJoin(conn, this.hostPin));
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

  private beginJoin(conn: DataConnection, expectedKey: JsonWebKey | null) {
    if (this.dialConn !== conn) this.dialConn?.close();
    this.dialConn = conn;
    const challenge = nonce();
    this.joinChallenges.set(conn, { nonce: challenge, expectedKey });
    this.send(conn, { t: 'hello', id: this.me.id, name: this.me.name, watch: this.me.watch, publicKey: this.signer.publicKey, nonce: challenge });
  }

  private authText(role: string, conn: DataConnection, clientNonce: string, hostNonce: string): string[] {
    const host = role === 'server' ? conn.provider.id : conn.peer;
    const client = role === 'server' ? conn.peer : conn.provider.id;
    return [this.rules.prefix + this.roomCode, host, client, clientNonce, hostNonce];
  }

  private rememberHost(key: JsonWebKey) {
    this.hostPin = key;
    try { sessionStorage.setItem(`${this.rules.prefix}${this.roomCode}.host-key`, JSON.stringify(key)); }
    catch { /* The active connection is still pinned if browser storage is unavailable. */ }
  }

  private async onHostMsg(conn: DataConnection, msg: Msg<S, A>) {
    const now = Date.now();
    if (msg.t === 'promote') {
      if (conn.peer !== this.standby?.peerId || !validNonce(msg.nonce)) return conn.close();
      if (this.hostConn?.open && now - this.lastPong < DEAD_MS) {
        this.refusalLinks.clear();
        this.refusalLinks.set(msg.nonce, conn);
        this.send(this.hostConn, { t: 'witness', nonce: msg.nonce, peerId: conn.peer });
      } else this.beginJoin(conn, this.standby.publicKey);
      return;
    }
    if (msg.t === 'challenge') {
      const challenge = this.joinChallenges.get(conn);
      if (conn !== this.dialConn || !challenge) return conn.close();
      this.joinChallenges.delete(conn); // a challenge is single-use, including on failure
      const valid = validNonce(msg.nonce) && validPublicKey(msg.publicKey)
        && (!challenge.expectedKey || sameKey(challenge.expectedKey, msg.publicKey)
          || (conn.peer === this.rules.prefix + this.roomCode && sameKey(this.standby?.publicKey ?? null, msg.publicKey)))
        && await verify(msg.publicKey, msg.signature, ['server', ...this.authText('client', conn, challenge.nonce, msg.nonce)]);
      if (!valid || this.destroyed || !conn.open || conn !== this.dialConn || this.role !== 'client') {
        conn.close();
        this.pendingJoin?.reject(Object.assign(new Error('The host could not prove its identity.'), { rejected: true }));
        return;
      }
      if (this.hostConn !== conn) this.hostConn?.close();
      this.hostConn = conn;
      this.rememberHost(msg.publicKey);
      this.send(conn, { t: 'auth', signature: await sign(this.signer, ['client', ...this.authText('client', conn, challenge.nonce, msg.nonce)]) });
      return;
    }
    if (conn !== this.hostConn) return conn.close();
    switch (msg.t) {
      case 'state':
        if (!msg.state || !Array.isArray(msg.state.players) || !Array.isArray(msg.state.queue)
          || !Number.isFinite(msg.state.lastActionAt)
          || !(msg.standby === null || (str(msg.standby?.id, 64) && str(msg.standby?.peerId, 128) && validPublicKey(msg.standby?.publicKey)))) return;
        this.lastPong = now;
        this.standby = msg.standby;
        // Advertised successor keys are pinned before a host disappears, including across page reloads.
        if (this.standby) this.saveStandby();
        else this.clearStandby();
        this.snapshot = msg.standby?.id === this.me.id
          && msg.snapshot && Array.isArray(msg.snapshot.members) && Array.isArray(msg.snapshot.removed)
          && Array.isArray(msg.snapshot.knownKeys) && msg.snapshot.knownKeys.length <= 256
          && msg.snapshot.knownKeys.every((entry) => Array.isArray(entry) && str(entry[0], 64) && validPublicKey(entry[1]))
          ? msg.snapshot : null;
        this.status('connected');
        if (!this.destroyed) this.events.onState(msg.state);
        this.pendingJoin?.resolve();
        return;
      case 'pong':
        if (conn === this.hostConn) this.lastPong = now;
        return;
      case 'witness': {
        const link = this.refusalLinks.get(msg.nonce);
        this.refusalLinks.delete(msg.nonce);
        if (link && link.peer === msg.peerId && typeof msg.signature === 'string') {
          this.send(link, { t: 'refuse', nonce: msg.nonce, signature: msg.signature });
          setTimeout(() => link.close(), 500);
        }
        return;
      }
      case 'error':
        if (!this.destroyed && typeof msg.message === 'string') this.events.onError(msg.message.slice(0, 200));
        return;
      case 'reject':
        if (typeof msg.message !== 'string') return;
        if (this.pendingJoin) return this.pendingJoin.reject(Object.assign(new Error(msg.message), { rejected: true }));
        this.events.onError(msg.message);
        return;
      case 'closed':
        if (conn !== this.hostConn) return;
        this.events.onClosed(typeof msg.message === 'string' ? msg.message.slice(0, 200) : EXPIRED);
        return this.destroy();
    }
  }

  private saveStandby() {
    try { sessionStorage.setItem(`${this.rules.prefix}${this.roomCode}.standby`, JSON.stringify(this.standby)); }
    catch { /* Keep the live successor even when storage is unavailable. */ }
  }

  private clearStandby() {
    try { sessionStorage.removeItem(`${this.rules.prefix}${this.roomCode}.standby`); }
    catch { /* No persisted successor to clear. */ }
  }

  private promote() {
    const snap = this.snapshot!;
    this.snapshot = null;
    this.removed = new Set(snap.removed);
    this.knownKeys = new Map(snap.knownKeys);
    this.hostConn?.close();
    this.hostConn = null;
    this.promoted = true;
    this.promotionNonce = nonce();
    const now = Date.now();
    this.promotionStartedAt = now;
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
      conn.on('open', () => this.send(conn, { t: 'promote', nonce: this.promotionNonce! }));
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
    if (!this.promoted) this.rememberHost(this.signer.publicKey);
    this.members = new Map(members.map((m) => [m.id, { ...m, conn: null, lastSeen: now, goneAt: null }]));
    const self = { id: this.me.id, name: this.me.name, peerId: this.peer.id, publicKey: this.signer.publicKey };
    this.members.set(this.me.id, { ...self, conn: null, lastSeen: now, goneAt: null });
    for (const m of this.members.values()) this.knownKeys.set(m.id, m.publicKey);
    this.state = (this.me.watch ? this.rules.addSpectator : this.rules.addPlayer)(state, this.me.id, this.me.name, now);
    this.status('hosting');
    this.broadcast();
  }

  private markGone(m: Member, now: number) {
    m.conn = null;
    m.goneAt = now;
    this.state = this.rules.setConnected(this.state!, m.id, false);
  }

  private dropMember(id: string) {
    this.members.delete(id);
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

  private async onClientMsg(conn: DataConnection, msg: Msg<S, A>) {
    const now = Date.now();
    // ponytail: cap expensive authentication across the room, not just each attacker-controlled link.
    if (['promote', 'refuse', 'hello', 'auth', 'witness'].includes(msg.t)
      && !this.takeBudget(this.cryptoWork, 60)) return conn.close();
    if (msg.t === 'promote') {
      if (conn.peer !== this.standby?.peerId || !validNonce(msg.nonce)) return conn.close();
      const signature = await sign(this.signer, ['alive', this.rules.prefix + this.roomCode, conn.peer, msg.nonce]);
      return this.send(conn, { t: 'refuse', nonce: msg.nonce, signature });
    }
    // Contacted members must prove the original host is alive, rather than merely asserting it.
    if (msg.t === 'refuse') {
      if (this.promoted && this.promoteLinks.has(conn) && this.hostPin && msg.nonce === this.promotionNonce
        && now >= this.promotionStartedAt && now - this.promotionStartedAt <= DEAD_MS
        && await verify(this.hostPin, msg.signature, ['alive', this.rules.prefix + this.roomCode, this.peer.id, msg.nonce])
        && this.role === 'host' && this.promoted && Date.now() - this.promotionStartedAt <= DEAD_MS) this.demote();
      return;
    }
    if (msg.t === 'hello') {
      const name = cleanName(msg.name);
      if (!str(msg.id, 64) || isBot(msg.id) || ['seat', 'last'].includes(msg.id)
        || !validPublicKey(msg.publicKey) || !validNonce(msg.nonce)) return conn.close();
      // One connection cannot collect several identities, or replace an authenticated identity midstream.
      if (this.pendingHellos.has(conn) || [...this.members.values()].some((m) => m.conn === conn)) return;
      const challenge = nonce();
      this.pendingHellos.set(conn, { hello: { ...msg, name }, nonce: challenge });
      const signature = await sign(this.signer, ['server', ...this.authText('server', conn, msg.nonce, challenge)]);
      this.send(conn, { t: 'challenge', nonce: challenge, publicKey: this.signer.publicKey, signature });
      return;
    }
    if (msg.t === 'auth') {
      const pending = this.pendingHellos.get(conn);
      if (!pending) return conn.close();
      this.pendingHellos.delete(conn);
      const { hello, nonce: challenge } = pending;
      if (!await verify(hello.publicKey, msg.signature, ['client', ...this.authText('server', conn, hello.nonce, challenge)])
        || this.destroyed || !conn.open || this.role !== 'host') return conn.close();
      let m = this.members.get(hello.id);
      const reject = (message: string) => {
        this.send(conn, { t: 'reject', message });
        setTimeout(() => conn.close(), 500);
      };
      if (this.removed.has(hello.id)) return reject(REMOVED);
      const knownKey = this.knownKeys.get(hello.id) ?? m?.publicKey;
      if (knownKey && !sameKey(knownKey, hello.publicKey)) return reject('That seat belongs to someone else.');
      if (!m) {
        if (this.members.size >= MAX_MEMBERS) return reject('This room is full.');
        // ponytail: cap lifetime identity pins; start a new room after 256 distinct identities.
        if (!knownKey && this.knownKeys.size >= 256) return reject('This room has reached its identity limit. Create a new room.');
        m = { id: hello.id, publicKey: hello.publicKey, name: hello.name, peerId: conn.peer, conn: null, lastSeen: now, goneAt: null };
        this.members.set(m.id, m);
      }
      this.knownKeys.set(hello.id, hello.publicKey);
      if (m.conn && m.conn !== conn) m.conn.close();
      Object.assign(m, { conn, name: hello.name, peerId: conn.peer, lastSeen: now, goneAt: null });
      this.state = (hello.watch === true ? this.rules.addSpectator : this.rules.addPlayer)(this.state!, m.id, hello.name, now);
      return this.broadcast();
    }
    const m = [...this.members.values()].find((x) => x.conn === conn);
    if (m && msg.t === 'witness' && validNonce(msg.nonce) && msg.peerId === this.standby?.peerId) {
      m.lastSeen = now;
      const signature = await sign(this.signer, ['alive', this.rules.prefix + this.roomCode, msg.peerId, msg.nonce]);
      return this.send(conn, { t: 'witness', nonce: msg.nonce, peerId: msg.peerId, signature });
    }
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
        const before = this.state;
        this.state = this.rules.rejoinQueue(this.state!, m.id, m.name, now);
        if (this.state !== before) this.broadcast();
        return;
      case 'leave':
        this.dropMember(m.id);
        this.state = this.rules.removePlayer(this.state!, m.id, now);
        return this.broadcast();
    }
  }

  private broadcast() {
    const state = this.state!;
    const connected = (id: string) => id !== this.me.id && !!this.members.get(id)?.conn?.open;
    const candidate = [...state.players, ...state.queue, ...(state.spectators ?? [])].find((p) => connected(p.id));
    const backup = candidate ? this.members.get(candidate.id)! : null;
    const standby = backup ? { id: backup.id, peerId: backup.peerId, publicKey: backup.publicKey } : null;
    this.standby = standby;
    if (standby) this.saveStandby();
    else this.clearStandby();
    const mask = (id: string) => this.rules.maskFor?.(state, id) ?? state;
    const members = [...this.members.values()].map(({ id, name, peerId, publicKey }) => ({ id, name, peerId, publicKey }));
    for (const m of this.members.values()) {
      if (m.id === this.me.id) continue;
      const snapshot = m.id === standby?.id ? { state, members, knownKeys: [...this.knownKeys], removed: [...this.removed] } : undefined;
      this.send(m.conn, { t: 'state', state: mask(m.id), standby, snapshot });
    }
    if (!this.destroyed) this.events.onState(mask(this.me.id));
  }
}
