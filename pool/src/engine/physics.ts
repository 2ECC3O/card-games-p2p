import type { Ball, Pocket } from '../types/pool';

export const WIDTH = 1000;
export const HEIGHT = 500;
export const R = 11.5;
export const POCKETS = [[0, 0], [500, 0], [1000, 0], [0, 500], [500, 500], [1000, 500]] as const;
const STEP = 1 / 120;
const FRICTION = 0.997;

export interface ShotResult { balls: Ball[]; pocketed: { n: number; pocket: Pocket }[]; firstHit: number | null; railAfter: boolean; breakRails: number }

/** Deterministic fixed-step 2D model. Same host input always produces the same settled table. */
export function simulate(input: Ball[], angle: number, power: number, tipX: number, tipY: number): ShotResult {
  const balls = input.map((b) => ({ ...b, vx: 0, vy: 0, spin: b.n === 0 ? tipX : 0 }));
  const cue = balls.find((b) => b.n === 0);
  if (!cue) throw new Error('Cue ball is missing');
  const speed = 180 + power * 9;
  cue.vx = Math.cos(angle) * speed;
  cue.vy = Math.sin(angle) * speed;
  const pocketed: ShotResult['pocketed'] = [];
  const rails = new Set<number>();
  let firstHit: number | null = null;
  let railAfter = false;
  for (let step = 0; step < 1080; step++) {
    let moving = false;
    for (const b of balls) {
      if (b.vx * b.vx + b.vy * b.vy < 4) { b.vx = b.vy = 0; continue; }
      moving = true;
      b.x += b.vx * STEP;
      b.y += b.vy * STEP;
      let found: Pocket | null = null;
      for (let p = 0; p < POCKETS.length; p++) {
        const [x, y] = POCKETS[p];
        if (Math.hypot(b.x - x, b.y - y) < 27) { found = p as Pocket; break; }
      }
      if (found !== null) {
        pocketed.push({ n: b.n, pocket: found });
        if (firstHit !== null && b.n !== 0) railAfter = true;
        b.vx = b.vy = 0;
        b.x = -100;
        continue;
      }
      if (b.x < R || b.x > WIDTH - R) {
        b.x = Math.max(R, Math.min(WIDTH - R, b.x));
        b.vx *= -0.88;
        b.vy += b.spin * 22;
        if (b.n) rails.add(b.n);
        if (firstHit !== null) railAfter = true;
      }
      if (b.y < R || b.y > HEIGHT - R) {
        b.y = Math.max(R, Math.min(HEIGHT - R, b.y));
        b.vy *= -0.88;
        b.vx += b.spin * 22;
        if (b.n) rails.add(b.n);
        if (firstHit !== null) railAfter = true;
      }
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      b.spin *= 0.994;
    }
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      if (a.x < 0 || b.x < 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 4 * R * R || d2 < 0.0001) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      const overlap = (2 * R - d) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;
      const relative = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (relative <= 0) continue;
      const impulse = relative * 0.96;
      a.vx -= impulse * nx; a.vy -= impulse * ny;
      b.vx += impulse * nx; b.vy += impulse * ny;
      if (firstHit === null && (a.n === 0 || b.n === 0)) {
        firstHit = a.n === 0 ? b.n : a.n;
        const english = (a.n === 0 ? a : b);
        english.vx += Math.cos(angle) * tipY * 120 - Math.sin(angle) * tipX * 65;
        english.vy += Math.sin(angle) * tipY * 120 + Math.cos(angle) * tipX * 65;
      }
    }
    if (!moving) break;
  }
  return { balls: balls.filter((b) => b.x >= 0).map(({ n, x, y }) => ({ n, x, y })), pocketed, firstHit, railAfter, breakRails: rails.size };
}

export function clearPosition(balls: Ball[], x: number, y: number, exclude = 0): boolean {
  return x >= R && x <= WIDTH - R && y >= R && y <= HEIGHT - R && balls.every((b) => b.n === exclude || Math.hypot(b.x - x, b.y - y) >= 2 * R + 1);
}
