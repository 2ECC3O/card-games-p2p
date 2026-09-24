import type { Ball, Pocket } from '../types/pool';

// Units: the bed is 1000 × 500 (a 9-foot table), so one unit is about 2.5 mm.
export const WIDTH = 1000;
export const HEIGHT = 500;
export const R = 11.5;
/** Pocket centres as drawn. */
export const POCKETS = [[0, 0], [500, 0], [1000, 0], [0, 500], [500, 500], [1000, 500]] as const;
/** Where a ball drops, just behind each mouth, and how close its centre must get: [x, y, radius]. */
export const DROPS = [[-4, -4, 30], [500, -10, 19], [1004, -4, 30], [-4, 504, 30], [500, 510, 19], [1004, 504, 30]] as const;
/** Near a pocket the cushion gives way: this far along each rail from a corner, and either side of a side pocket. */
const CORNER_MOUTH = 34;
const SIDE_MOUTH = 22;

export const HZ = 480; // small steps, so a hard break can't jump a ball through another
const DT = 1 / HZ;
const MAX_STEPS = HZ * 12;
/** Replays show every 8th step: 60 frames a second. */
export const FRAME_EVERY = 8;
const SLIDE = 780; // sliding friction, units/s² (μ ≈ 0.2)
const ROLL = 110; // rolling resistance, units/s²
const DRAG = 0.25; // extra loss while rolling, proportional to speed, per second
const CUSHION = 0.78; // speed kept off a cushion
const BALL_E = 0.95; // ball-to-ball restitution
const SIDE_KICK = 0.5; // how much side spin bends a rebound

export interface Shot { dirX: number; dirY: number; power: number; tipX: number; tipY: number }
interface ShotResult { balls: Ball[]; pocketed: { n: number; pocket: Pocket }[]; firstHit: number | null; railAfter: boolean; breakRails: number; steps: number }
/** A ball in motion: velocity v, rolling velocity w (v = w when rolling without slip), and side spin. */
interface Body { n: number; x: number; y: number; vx: number; vy: number; wx: number; wy: number; side: number; down: boolean }

const speedOf = (power: number) => 30 + power * 38;
export const shotMs = (steps: number) => Math.ceil((steps * 1000) / HZ);

/**
 * Fixed-step model: balls slide until friction makes them roll, so a centre hit stops dead on a full hit (stun),
 * a low hit comes back (draw) and a high hit follows through. Side spin bends rebounds off cushions. Only + − × ÷
 * and sqrt are used, so every browser replays a shot to the very same numbers.
 * `onFrame` sees the table every `every` steps; return true to stop early.
 * ponytail: no throw, squirt, swerve or jump; add them if players ask for trick shots.
 */
export function simulate(input: Ball[], shot: Shot, onFrame?: (balls: readonly Body[], firstHit: number | null) => boolean | void, every = FRAME_EVERY): ShotResult {
  const balls: Body[] = input.map((b) => ({ n: b.n, x: b.x, y: b.y, vx: 0, vy: 0, wx: 0, wy: 0, side: 0, down: false }));
  const cue = balls.find((b) => b.n === 0);
  if (!cue) throw new Error('Cue ball is missing');
  const speed = speedOf(shot.power);
  cue.vx = shot.dirX * speed;
  cue.vy = shot.dirY * speed;
  // Striking at half a radius above centre gives a ball 1.25× the spin of a natural roll; below, backspin.
  cue.wx = cue.vx * 1.25 * shot.tipY;
  cue.wy = cue.vy * 1.25 * shot.tipY;
  cue.side = shot.tipX * speed * 0.25;
  const pocketed: ShotResult['pocketed'] = [];
  const rails = new Set<number>();
  let firstHit: number | null = null;
  let railAfter = false;
  let step = 0;
  while (step < MAX_STEPS) {
    step++;
    let moving = false;
    for (const b of balls) {
      if (b.down || (b.vx === 0 && b.vy === 0 && b.wx === 0 && b.wy === 0)) continue;
      moving = true;
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      const ux = b.vx - b.wx, uy = b.vy - b.wy;
      const slip = Math.sqrt(ux * ux + uy * uy);
      if (slip > 3.5 * SLIDE * DT) {
        const a = (SLIDE * DT) / slip; // friction slows the slide and spins the ball towards a roll
        b.vx -= ux * a;
        b.vy -= uy * a;
        b.wx += 2.5 * ux * a;
        b.wy += 2.5 * uy * a;
      } else {
        b.vx -= ux / 3.5;
        b.vy -= uy / 3.5;
        const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const next = s - (ROLL + DRAG * s) * DT;
        if (next <= 3) b.vx = b.vy = 0;
        else {
          b.vx *= next / s;
          b.vy *= next / s;
        }
        b.wx = b.vx;
        b.wy = b.vy;
      }
      b.side *= 1 - 1.5 * DT;

      for (let p = 0; p < DROPS.length; p++) {
        const [px, py, r] = DROPS[p];
        const dx = b.x - px, dy = b.y - py;
        if (dx * dx + dy * dy < r * r) {
          pocketed.push({ n: b.n, pocket: p as Pocket });
          if (firstHit !== null && b.n !== 0) railAfter = true;
          Object.assign(b, { down: true, vx: 0, vy: 0, wx: 0, wy: 0 });
          break;
        }
      }
      if (b.down) continue;

      const corner = (b.x < CORNER_MOUTH || b.x > WIDTH - CORNER_MOUTH) && (b.y < CORNER_MOUTH || b.y > HEIGHT - CORNER_MOUTH);
      const side = b.x > WIDTH / 2 - SIDE_MOUTH && b.x < WIDTH / 2 + SIDE_MOUTH;
      const minX = corner ? 0 : R, minY = corner || side ? 0 : R; // in a mouth only the jaws stop a ball
      const hitX = b.x < minX || b.x > WIDTH - minX, hitY = b.y < minY || b.y > HEIGHT - minY;
      if (hitX || hitY) {
        const inX = b.vx, inY = b.vy;
        const s = Math.sqrt(inX * inX + inY * inY) || 1;
        // Side spin pushes the rebound towards the right (or left) of the way the ball came in: (−inY, inX).
        const kick = (b.side * SIDE_KICK) / s;
        if (hitX) {
          b.x = b.x < minX ? 2 * minX - b.x : 2 * (WIDTH - minX) - b.x;
          b.vx *= -CUSHION;
          b.wx *= -CUSHION;
          b.vy += kick * inX;
        }
        if (hitY) {
          b.y = b.y < minY ? 2 * minY - b.y : 2 * (HEIGHT - minY) - b.y;
          b.vy *= -CUSHION;
          b.wy *= -CUSHION;
          b.vx -= kick * inY;
        }
        b.side *= 0.5;
        if (b.n) rails.add(b.n);
        if (firstHit !== null) railAfter = true;
      }
    }

    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.down) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.down || (a.vx === 0 && a.vy === 0 && b.vx === 0 && b.vy === 0)) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const overlap = (2 * R - d) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (closing <= 0) continue;
        // Speed along the line of centres passes over; spin stays with each ball, which is what makes draw and follow.
        const impulse = (closing * (1 + BALL_E)) / 2;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
        if (firstHit === null && (a.n === 0 || b.n === 0)) firstHit = a.n === 0 ? b.n : a.n;
      }
    }
    if (onFrame && step % every === 0 && onFrame(balls, firstHit)) break;
    if (!moving) break;
  }
  return { balls: balls.filter((b) => !b.down).map(({ n, x, y }) => ({ n, x, y })), pocketed, firstHit, railAfter, breakRails: rails.size, steps: step };
}

/** Where the cue ball will go before it touches a ball, then the first stretch of both balls after contact. */
interface Preview { path: [number, number][]; ghost: [number, number] | null; cueAfter: [number, number][]; hit: { n: number; path: [number, number][] } | null }

export function preview(balls: Ball[], shot: Shot): Preview {
  const out: Preview = { path: [], ghost: null, cueAfter: [], hit: null };
  let after = 0;
  simulate(balls, shot, (bodies, firstHit) => {
    const cue = bodies.find((b) => b.n === 0)!;
    if (firstHit === null) {
      if (!cue.down) out.path.push([cue.x, cue.y]);
      return cue.down || out.path.length > HZ * 1.5; // a miss: show a second and a half of travel
    }
    const hit = bodies.find((b) => b.n === firstHit)!;
    if (!out.hit) {
      out.ghost = [cue.x, cue.y];
      out.path.push(out.ghost);
      out.hit = { n: firstHit, path: [[hit.x, hit.y]] };
    }
    if (!cue.down) out.cueAfter.push([cue.x, cue.y]);
    if (!hit.down) out.hit.path.push([hit.x, hit.y]);
    return ++after > HZ / 2;
  }, 1);
  return out;
}

export function clearPosition(balls: Ball[], x: number, y: number, exclude = 0): boolean {
  return x >= R && x <= WIDTH - R && y >= R && y <= HEIGHT - R && balls.every((b) => b.n === exclude || Math.hypot(b.x - x, b.y - y) >= 2 * R + 1);
}
