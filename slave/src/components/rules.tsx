import { Hand, Tag, type Page } from './HowToPlay';

export const RULES: Page[] = [
  {
    title: 'Get rid of your cards',
    picture: <Hand cards="? ? ? ? ?" />,
    text: <>The whole deck is dealt out. <b>Be first to play all your cards.</b> The order you finish in sets your title for the next round.</>,
  },
  {
    title: '2 is the highest card',
    picture: <Hand cards="3♣ 4♦ … K♥ A♠ 2♣" />,
    text: <>From lowest to highest: 3, 4, 5 up to K, A, then <b>2 at the top</b>. Within a rank the suit decides: {'♣ < ♦ < ♥ < ♠'}, so <b>2♠ is the highest card</b>. There are no jokers.</>,
  },
  {
    title: 'Play one rank at a time',
    picture: (
      <>
        <Hand cards="9♥" />
        <Hand cards="9♥ 9♠" />
        <Hand cards="9♣ 9♦ 9♥" />
      </>
    ),
    text: <>Play a <b>single</b>, a <b>pair</b>, <b>three of a kind</b> (ตอง) or <b>four of a kind</b>. No runs. Every round, whoever holds <b>3♣</b> leads.</>,
  },
  {
    title: 'Beat the pile, or pass',
    picture: <Hand cards="7♠ 7♥ → 10♣ 10♦" />,
    text: <>Play the same number of cards, higher: a higher rank, or the same rank with a higher suit (for a pair, compare the top card). Three of a kind also beats <b>any single</b>, and four of a kind beats <b>any pair</b>. You have 30 seconds; run out and you pass, or play your lowest card if it's your lead.</>,
  },
  {
    title: 'A pass lasts until the pile clears',
    picture: <div className="htp-row"><Tag>Pass</Tag><Tag>Pass</Tag><Tag>Pass</Tag></div>,
    text: <>Once you pass, you're out until the pile clears. When everyone else has passed, the pile clears and the last player to play <b>leads</b> anything. If they're already out, the next player leads.</>,
  },
  {
    title: 'Titles',
    picture: <div className="htp-row"><Tag>King</Tag><Tag>Queen</Tag><Tag>Citizen</Tag><Tag>Serf</Tag><Tag>Slave</Tag></div>,
    text: <>First out is <b>King</b>, second <b>Queen</b>, last <b>Slave</b> and second-last <b>Serf</b> (รองสลาฟ). Everyone else is a Citizen. With three players there's no Queen or Serf. Each round earns points: first of 5 gets 4, last gets 0.</>,
  },
  {
    title: 'The exchange',
    picture: <div className="htp-row"><Tag>Slave → King: best 2</Tag><Tag>King → Slave: any 2</Tag></div>,
    text: <>At each deal the Slave hands the King their <b>two best cards</b>, and the Serf hands the Queen their <b>best one</b>. The King and Queen then choose the same number of cards to give back. Then whoever holds 3♣ leads, and turns go whichever way round reaches the Slave sooner (clockwise on a tie).</>,
  },
  {
    title: 'Keep your crown',
    picture: <div className="htp-row"><Tag>King</Tag><span className="htp-note">not first →</span><Tag>Slave</Tag></div>,
    text: <>A King who isn't first out <b>falls to Slave</b>. A Queen who doesn't finish first or second <b>falls to Serf</b>.</>,
  },
];
