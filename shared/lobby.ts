/** Room housekeeping every game's engine shares: names, randomness, copies, and who is connected or watching. */

/** A room closes after this long without anyone doing anything. */
export const IDLE_MS = 5 * 60_000;
export const isBot = (id: string) => /^bot:\d+$/.test(id);

interface Person {
  id: string;
  name: string;
  connected: boolean;
}
interface Room {
  players: Person[];
  queue: Person[];
  spectators: Person[];
  lastActionAt: number;
}

/**
 * Display names as shown to everyone: invisible and control characters removed (they can reverse or hide
 * text next to the name), whitespace trimmed, at most 20 characters. Zero-width joiners stay, so emoji
 * sequences still render. Empty result: "Player".
 */
export function cleanName(name: unknown): string {
  const text = typeof name === 'string' ? name : '';
  return [...text.replace(/(?!\u200D)[\p{Cc}\p{Cf}\u2028\u2029]/gu, '').trim()].slice(0, 20).join('').trim() || 'Player';
}

/** Unbiased crypto-random integer in [0, n). */
export function randomInt(n: number): number {
  const limit = 2 ** 32 - (2 ** 32 % n);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

/** A changed copy: engines never mutate the state they're given. */
export const update = <S>(state: S, fn: (s: S) => void): S => {
  const s = structuredClone(state);
  fn(s);
  return s;
};

/** Watching the table, not playing. */
export const isSpectator = (s: Room, id: string) => s.spectators.some((w) => w.id === id);

export function setConnected<S extends Room>(state: S, id: string, connected: boolean): S {
  return update(state, (s) => {
    const p = [...s.players, ...s.queue, ...s.spectators].find((x) => x.id === id);
    if (p) p.connected = connected;
  });
}

/** Join to watch. A seated or queued player who comes back this way stays a player, through the game's `addPlayer`. */
export function addSpectator<S extends Room>(state: S, id: string, rawName: string, now: number, addPlayer: (s: S, id: string, name: string, now: number) => S): S {
  if (state.players.some((p) => p.id === id) || state.queue.some((q) => q.id === id)) return addPlayer(state, id, rawName, now);
  const name = cleanName(rawName);
  return update(state, (s) => {
    s.lastActionAt = now;
    const known = s.spectators.find((w) => w.id === id);
    if (known) Object.assign(known, { name, connected: true });
    else s.spectators.push({ id, name, connected: true });
  });
}
