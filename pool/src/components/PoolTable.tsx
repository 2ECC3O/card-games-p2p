import { useMemo, useRef, type PointerEvent } from 'react';
import type { Ball, GameState, Pocket } from '../types/pool';
import { HEIGHT, POCKETS, preview, R, WIDTH } from '../engine/physics';

const colors = ['#f7f3de', '#e9bb42', '#3f78bf', '#b4484a', '#74549e', '#d78c3f', '#4b9d69', '#8f4e55', '#151a1b'];
const color = (n: number) => colors[n < 9 ? n : n - 8];
const names = ['Top left', 'Top middle', 'Top right', 'Bottom left', 'Bottom middle', 'Bottom right'];
type Point = [number, number];

/** The first `max` units of a path, as SVG points. */
function clip(points: Point[], max: number) {
  const out: Point[] = points.slice(0, 1);
  for (let i = 1; i < points.length && max > 0; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    const step = Math.hypot(x1 - x0, y1 - y0);
    const t = Math.min(1, max / (step || 1));
    out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    max -= step;
  }
  return out.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

interface Props {
  state: GameState;
  /** What to draw: the balls mid-replay, or the table at rest. */
  balls: Ball[];
  angle: number;
  power: number;
  tipX: number;
  tipY: number;
  active: boolean;
  placing: boolean;
  calledBall: number | null;
  calledPocket: Pocket | null;
  onAim: (a: number) => void;
  onPlace: (x: number, y: number) => void;
  onCallBall: (n: number) => void;
  onCallPocket: (n: Pocket) => void;
}

export default function PoolTable({ state, balls, angle, power, tipX, tipY, active, placing, calledBall, calledPocket, onAim, onPlace, onCallBall, onCallPocket }: Props) {
  const cue = balls.find((b) => b.n === 0);
  const aiming = active && !placing && !!cue;
  // The same physics the host runs, so the line shows where this shot really goes (up to first contact and a little after).
  const guide = useMemo(
    () => (aiming ? preview(balls, { dirX: Math.cos(angle), dirY: Math.sin(angle), power, tipX, tipY }) : null),
    [aiming, balls, angle, power, tipX, tipY],
  );
  const calling = active && !placing && !state.breakShot;
  const drag = useRef<{ x: number; y: number; moved: boolean; ball: number | null; pocket: Pocket | null } | null>(null);

  const toTable = (e: PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    return point.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const aimAt = (e: PointerEvent<SVGSVGElement>) => {
    const p = toTable(e);
    if (cue && Math.hypot(p.x - cue.x, p.y - cue.y) > R) onAim(Math.atan2(p.y - cue.y, p.x - cue.x)); // on the cue ball itself there's no direction
  };

  return (
    <svg
      viewBox="-42 -42 1084 584"
      className="pool-board"
      style={{ touchAction: active ? 'none' : 'manipulation' }}
      role="img"
      aria-label="Eight-ball pool table. Drag to aim; tap a ball and a pocket to call your shot."
      onPointerDown={(e) => {
        if (!active) return;
        const hit = (e.target as Element).closest('[data-ball],[data-pocket]');
        const ball = hit?.getAttribute('data-ball'), pocket = hit?.getAttribute('data-pocket');
        drag.current = { x: e.clientX, y: e.clientY, moved: false, ball: ball ? Number(ball) : null, pocket: pocket ? (Number(pocket) as Pocket) : null };
        e.currentTarget.setPointerCapture(e.pointerId);
        if (!placing && !hit) aimAt(e); // tap the felt to aim there; taps on balls and pockets call the shot instead
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || placing) return;
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
        d.moved = true;
        aimAt(e);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.moved) return;
        if (placing) {
          const p = toTable(e);
          return onPlace(p.x, p.y);
        }
        if (calling && d.ball) onCallBall(d.ball);
        else if (calling && d.pocket !== null) onCallPocket(d.pocket);
      }}
      onPointerCancel={() => (drag.current = null)}
    >
      <defs>
        <linearGradient id="wood" x2="0" y2="1">
          <stop stopColor="#6c4b32" />
          <stop offset="1" stopColor="#39271f" />
        </linearGradient>
      </defs>
      <rect x="-40" y="-40" width="1080" height="580" rx="62" fill="url(#wood)" stroke="#b9985a" strokeWidth="4" />
      <rect x="-13" y="-13" width="1026" height="526" rx="29" fill="#101b15" stroke="#cba76a" strokeWidth="7" />
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} rx="20" fill="#17624d" />
      <path d="M250 0V500" stroke="#cce0bc" strokeWidth="1.5" strokeDasharray="5 9" opacity=".45" />
      <circle cx="250" cy="250" r="3" fill="#cfdfc5" opacity=".55" />
      {POCKETS.map(([x, y], i) => (
        <g key={i} data-pocket={i}>
          <circle cx={x} cy={y} r="29" fill="#0a110e" stroke={calledPocket === i ? '#f8d575' : '#9c784d'} strokeWidth={calledPocket === i ? 5 : 3} />
          <circle
            cx={x} cy={y} r="34" fill="transparent" role="button" aria-label={`Call ${names[i]} pocket`} tabIndex={calling ? 0 : -1}
            onKeyDown={(e) => {
              if (calling && (e.key === 'Enter' || e.key === ' ')) onCallPocket(i as Pocket);
            }}
          />
        </g>
      ))}
      {aiming && guide && (
        <g pointerEvents="none">
          <polyline points={clip(guide.path, 1400)} fill="none" stroke="#f8e9b8" strokeWidth="2.5" strokeDasharray="10 8" opacity=".9" />
          {guide.ghost && <circle cx={guide.ghost[0]} cy={guide.ghost[1]} r={R} fill="none" stroke="#f8e9b8" strokeWidth="2" opacity=".85" />}
          {guide.cueAfter.length > 1 && <polyline points={clip(guide.cueAfter, 140)} fill="none" stroke="#f8e9b8" strokeWidth="2" strokeDasharray="3 6" opacity=".7" />}
          {guide.hit && guide.hit.path.length > 1 && <polyline points={clip(guide.hit.path, 190)} fill="none" stroke={guide.hit.n === 8 ? '#f8e9b8' : color(guide.hit.n)} strokeWidth="3" opacity=".9" />}
          <line x1={cue!.x - Math.cos(angle) * (16 + power / 3)} y1={cue!.y - Math.sin(angle) * (16 + power / 3)} x2={cue!.x - Math.cos(angle) * (185 + power / 3)} y2={cue!.y - Math.sin(angle) * (185 + power / 3)} stroke="#4f3426" strokeWidth="9" strokeLinecap="round" />
          <line x1={cue!.x - Math.cos(angle) * (16 + power / 3)} y1={cue!.y - Math.sin(angle) * (16 + power / 3)} x2={cue!.x - Math.cos(angle) * (95 + power / 3)} y2={cue!.y - Math.sin(angle) * (95 + power / 3)} stroke="#e5c58a" strokeWidth="6" strokeLinecap="round" />
        </g>
      )}
      {balls.map((b) => (
        <g key={b.n} data-ball={b.n || undefined} style={{ cursor: calling && b.n ? 'pointer' : 'default' }}>
          <circle cx={b.x + 1.5} cy={b.y + 2} r={R + 1} fill="#092519" opacity=".45" />
          <circle cx={b.x} cy={b.y} r={R} fill={b.n > 8 ? '#f7f4e8' : color(b.n)} stroke={calledBall === b.n ? '#ffde75' : '#d8ddc8'} strokeWidth={calledBall === b.n ? 2.4 : 0.8} />
          {b.n > 8 && <rect x={b.x - R + 1} y={b.y - 5} width={2 * R - 2} height="10" rx="5" fill={color(b.n)} />}
          {b.n > 0 && (
            <>
              <circle cx={b.x} cy={b.y} r="5.8" fill="#f9f7ef" />
              <text x={b.x} y={b.y + 2.6} textAnchor="middle" fontSize="7.5" fontWeight="bold" fill="#172018">{b.n}</text>
            </>
          )}
          {b.n === 0 && <circle cx={b.x - 3} cy={b.y - 3} r="3" fill="#fff" opacity=".75" />}
        </g>
      ))}
      {placing && active && <text x="500" y="475" textAnchor="middle" fill="#fff3c4" fontSize="18" fontWeight="bold">Tap a free spot to place the cue ball</text>}
    </svg>
  );
}
