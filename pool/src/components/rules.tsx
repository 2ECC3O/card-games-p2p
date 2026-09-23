import type { ReactNode } from 'react';
import { type Page } from './HowToPlay';

const COLORS = ['#f7f3de', '#e9bb42', '#3f78bf', '#b4484a', '#74549e', '#d78c3f', '#4b9d69', '#8f4e55', '#151a1b'];
type B = [n: number, x: number, y: number];

/** A little table for the pictures: balls [number, x, y] on a 200×100 bed, plus optional extras (aim lines). */
function Table({ balls, children }: { balls: B[]; children?: ReactNode }) {
  return (
    <svg viewBox="-8 -8 216 116" width="100%" style={{ maxWidth: 300 }} aria-hidden>
      <rect x="-8" y="-8" width="216" height="116" rx="12" fill="#4f3426" />
      <rect x="0" y="0" width="200" height="100" rx="4" fill="#17624d" />
      {[[0, 0], [100, 0], [200, 0], [0, 100], [100, 100], [200, 100]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="7" fill="#0a110e" />)}
      {children}
      {balls.map(([n, x, y]) => (
        <g key={n}>
          <circle cx={x} cy={y} r="5" fill={n > 8 ? '#f7f4e8' : COLORS[n]} stroke="#0004" strokeWidth=".5" />
          {n > 8 && <rect x={x - 5} y={y - 2} width="10" height="4" fill={COLORS[n - 8]} />}
        </g>
      ))}
    </svg>
  );
}

const RACK: B[] = [[1, 140, 50], [9, 149, 45], [2, 149, 55], [3, 158, 40], [8, 158, 50], [10, 158, 60]];

export const RULES: Page[] = [
  {
    title: 'Break the rack',
    picture: <Table balls={[[0, 45, 50], ...RACK]}><path d="M50 0V100" stroke="#cce0bc" strokeDasharray="3 4" opacity=".6" /></Table>,
    text: <>Place the white cue ball <b>behind the line</b> and smash the rack. Pocket a ball, or send at least four balls to a cushion.</>,
  },
  {
    title: 'Aim and shoot',
    picture: <Table balls={[[0, 50, 70], [3, 120, 40]]}><line x1="50" y1="70" x2="115" y2="42" stroke="#f8e9b8" strokeDasharray="4 3" /></Table>,
    text: <><b>Drag on the table</b> to aim; the line shows where the white goes and what it hits. Set the <b>power</b>, tap the big white ball to pick where to strike it (spin), then <b>Shoot</b>.</>,
  },
  {
    title: 'Call your shot',
    picture: <Table balls={[[0, 60, 60], [5, 170, 25]]}><circle cx="200" cy="0" r="10" fill="none" stroke="#ffde75" strokeWidth="2" /><line x1="60" y1="60" x2="165" y2="27" stroke="#f8e9b8" strokeDasharray="4 3" /></Table>,
    text: <>Before each shot, <b>tap a ball and a pocket</b>. Make it and you shoot again. Or choose <b>Safety</b> to play defence. You have <b>90 seconds</b> a shot; run out and it's a foul.</>,
  },
  {
    title: 'Solids or stripes',
    picture: <Table balls={[[1, 40, 35], [2, 60, 35], [3, 80, 35], [9, 120, 65], [10, 140, 65], [11, 160, 65]]} />,
    text: <>The first called ball you make decides your group: <b>solids</b> (1–7) or <b>stripes</b> (9–15). Always hit one of yours first.</>,
  },
  {
    title: 'Fouls',
    picture: <Table balls={[[0, 196, 96], [4, 100, 50]]} />,
    text: <>Sinking the white, hitting the wrong ball first, or no ball reaching a cushion after contact is a foul. Your opponent gets <b>ball in hand</b>: they place the white anywhere.</>,
  },
  {
    title: 'Win with the 8',
    picture: <Table balls={[[0, 70, 50], [8, 150, 50]]}><line x1="70" y1="50" x2="145" y2="50" stroke="#f8e9b8" strokeDasharray="4 3" /></Table>,
    text: <>Clear your group, then <b>call and sink the 8</b>. Sinking the 8 early or in the wrong pocket loses the rack.</>,
  },
];
