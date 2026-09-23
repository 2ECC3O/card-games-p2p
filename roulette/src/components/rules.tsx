import { Tag, type Page } from './HowToPlay';

const COLOR = { red: '#b3261e', black: '#1d1f1e', green: '#1f7a4a' };
/** A wheel pocket for the pictures. */
const Pocket = ({ n, color, chip }: { n: number; color: keyof typeof COLOR; chip?: boolean }) => (
  <span className="htp-card" style={{ position: 'relative', background: COLOR[color], color: '#fffaf0', borderRadius: '50%', width: 46, height: 46, border: '2px solid #fffaf0' }}>
    {n}
    {chip && <span style={{ position: 'absolute', right: -6, bottom: -6, width: 20, height: 20, borderRadius: '50%', background: '#e8c581', border: '2px dashed #fffaf0' }} aria-hidden />}
  </span>
);

export const RULES: Page[] = [
  {
    title: 'Guess where the ball lands',
    picture: <div className="htp-row"><Pocket n={0} color="green" /><Pocket n={32} color="red" /><Pocket n={15} color="black" /><Pocket n={19} color="red" /></div>,
    text: <>The wheel has <b>37 pockets</b>: 1 to 36 in red and black, plus a green 0. Bet on where the ball stops.</>,
  },
  {
    title: 'Put chips on the board',
    picture: <div className="htp-row"><Pocket n={7} color="red" chip /><Pocket n={8} color="black" /><Pocket n={9} color="red" /></div>,
    text: <>Pick a chip value, then <b>tap the board</b>. Tap again to add more. <b>Clear</b> takes your chips back, <b>Repeat</b> reuses last round's bets.</>,
  },
  {
    title: 'Spin',
    picture: <Tag>Done betting</Tag>,
    text: <>Press <b>Done betting</b> (or <b>Spin</b> when you play alone). The wheel spins when everyone is done, or after <b>60 seconds</b>.</>,
  },
  {
    title: 'What bets pay',
    picture: (
      <div className="htp-row" style={{ flexDirection: 'column', gap: 8 }}>
        <Tag>One number · 35 to 1</Tag>
        <Tag>Dozen or column · 2 to 1</Tag>
        <Tag>Colour, odd/even, halves · 1 to 1</Tag>
      </div>
    ),
    text: <>The fewer numbers a bet covers, the more it pays. Halves are 1–18 and 19–36. You can bet on as many spots as you like.</>,
  },
  {
    title: 'Watch out for zero',
    picture: <Pocket n={0} color="green" />,
    text: <>When the ball lands on <b>0</b>, every bet loses except a bet on 0 itself. Out of chips? Press <b>Rejoin</b>.</>,
  },
];
