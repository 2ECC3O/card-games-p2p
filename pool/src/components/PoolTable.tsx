import type { MouseEvent } from 'react';
import type { Ball, GameState, Pocket } from '../types/pool';
import { HEIGHT, POCKETS, R, WIDTH } from '../engine/physics';

const colors = ['#f7f3de', '#e9bb42', '#3f78bf', '#b4484a', '#74549e', '#d78c3f', '#4b9d69', '#8f4e55', '#151a1b'];
const color = (n: number) => colors[n < 9 ? n : n - 8];
const names = ['Top left', 'Top middle', 'Top right', 'Bottom left', 'Bottom middle', 'Bottom right'];

function guide(balls: Ball[], angle: number): [number, number] {
  const cue = balls.find((b) => b.n === 0);
  if (!cue) return [WIDTH / 2, HEIGHT / 2];
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let distance = Math.min(dx > 0 ? (WIDTH - R - cue.x) / dx : dx < 0 ? (R - cue.x) / dx : Infinity,
    dy > 0 ? (HEIGHT - R - cue.y) / dy : dy < 0 ? (R - cue.y) / dy : Infinity);
  for (const b of balls) {
    if (b.n === 0) continue;
    const vx = b.x - cue.x, vy = b.y - cue.y;
    const projection = vx * dx + vy * dy;
    if (projection <= 0) continue;
    const side = vx * vx + vy * vy - projection * projection;
    if (side > (2 * R) ** 2) continue;
    const hit = projection - Math.sqrt((2 * R) ** 2 - side);
    if (hit > 0 && hit < distance) distance = hit;
  }
  return [cue.x + dx * distance, cue.y + dy * distance];
}

export default function PoolTable({ state, angle, active, placing, calledBall, calledPocket, onAim, onPlace, onCallBall, onCallPocket }:
  { state: GameState; angle: number; active: boolean; placing: boolean; calledBall: number | null; calledPocket: Pocket | null;
    onAim: (a: number) => void; onPlace: (x: number, y: number) => void; onCallBall: (n: number) => void; onCallPocket: (n: Pocket) => void }) {
  const cue = state.balls.find((b) => b.n === 0);
  const [endX, endY] = guide(state.balls, angle);
  const pointer = (e: MouseEvent<SVGSVGElement>) => {
    if (!active) return;
    const svg = e.currentTarget;
    const point = svg.createSVGPoint(); point.x = e.clientX; point.y = e.clientY;
    const p = point.matrixTransform(svg.getScreenCTM()!.inverse());
    if (placing) onPlace(p.x, p.y);
    else if (cue) onAim(Math.atan2(p.y - cue.y, p.x - cue.x));
  };
  return (
    <svg viewBox="-42 -42 1084 584" className="pool-board" role="img" aria-label="Eight-ball pool table. Tap to aim; tap balls and pockets to call a shot." onClick={pointer}>
      <defs><linearGradient id="wood" x2="0" y2="1"><stop stopColor="#6c4b32"/><stop offset="1" stopColor="#39271f"/></linearGradient></defs>
      <rect x="-40" y="-40" width="1080" height="580" rx="62" fill="url(#wood)" stroke="#b9985a" strokeWidth="4" />
      <rect x="-13" y="-13" width="1026" height="526" rx="29" fill="#101b15" stroke="#cba76a" strokeWidth="7" />
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} rx="20" fill="#17624d" />
      <path d="M250 0V500" stroke="#cce0bc" strokeWidth="1.5" strokeDasharray="5 9" opacity=".45" />
      <circle cx="250" cy="250" r="3" fill="#cfdfc5" opacity=".55" />
      {POCKETS.map(([x, y], i) => <g key={i} onClick={(e) => { if (active && !state.breakShot && !placing) { e.stopPropagation(); onCallPocket(i as Pocket); } }}>
        <circle cx={x} cy={y} r="29" fill="#0a110e" stroke={calledPocket === i ? '#f8d575' : '#9c784d'} strokeWidth={calledPocket === i ? 5 : 3} />
        <circle cx={x} cy={y} r="34" fill="transparent" role="button" aria-label={`Call ${names[i]} pocket`} tabIndex={active ? 0 : -1}
          onKeyDown={(e) => { if (active && (e.key === 'Enter' || e.key === ' ')) onCallPocket(i as Pocket); }} />
      </g>)}
      {active && cue && !placing && <g pointerEvents="none">
        <line x1={cue.x} y1={cue.y} x2={endX} y2={endY} stroke="#f8e9b8" strokeWidth="2.5" strokeDasharray="10 8" opacity=".9" />
        <circle cx={endX} cy={endY} r="4" fill="#ffe597" />
        <line x1={cue.x - Math.cos(angle) * 16} y1={cue.y - Math.sin(angle) * 16} x2={cue.x - Math.cos(angle) * 185} y2={cue.y - Math.sin(angle) * 185} stroke="#4f3426" strokeWidth="9" strokeLinecap="round" />
        <line x1={cue.x - Math.cos(angle) * 16} y1={cue.y - Math.sin(angle) * 16} x2={cue.x - Math.cos(angle) * 95} y2={cue.y - Math.sin(angle) * 95} stroke="#e5c58a" strokeWidth="6" strokeLinecap="round" />
      </g>}
      {state.balls.map((b) => <g key={b.n} onClick={(e) => { if (active && b.n && !state.breakShot && !placing) { e.stopPropagation(); onCallBall(b.n); } }}
        style={{ cursor: active && b.n ? 'pointer' : 'default' }}>
        <circle cx={b.x + 1.5} cy={b.y + 2} r={R + 1} fill="#092519" opacity=".45" />
        <circle cx={b.x} cy={b.y} r={R} fill={b.n > 8 ? '#f7f4e8' : color(b.n)} stroke={calledBall === b.n ? '#ffde75' : '#d8ddc8'} strokeWidth={calledBall === b.n ? 2.4 : .8} />
        {b.n > 8 && <rect x={b.x - R + 1} y={b.y - 5} width={2 * R - 2} height="10" rx="5" fill={color(b.n)} />}
        {b.n > 0 && <><circle cx={b.x} cy={b.y} r="5.8" fill="#f9f7ef"/><text x={b.x} y={b.y + 2.6} textAnchor="middle" fontSize="7.5" fontWeight="bold" fill="#172018">{b.n}</text></>}
        {b.n === 0 && <circle cx={b.x - 3} cy={b.y - 3} r="3" fill="#fff" opacity=".75" />}
      </g>)}
      {placing && active && <text x="500" y="475" textAnchor="middle" fill="#fff3c4" fontSize="18" fontWeight="bold">Tap a free spot to place the cue ball</text>}
    </svg>
  );
}
