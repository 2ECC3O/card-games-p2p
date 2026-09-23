import { Hand, Tag, type Page } from './HowToPlay';

export const RULES: Page[] = [
  {
    title: 'Get closer to 21',
    picture: <Hand cards="10♠ 9♥ vs 10♦ 7♣" note={<Tag>19 beats 17</Tag>} />,
    text: <>Everyone plays against the dealer. Beat the dealer's total <b>without going over 21</b>.</>,
  },
  {
    title: 'Card values',
    picture: (
      <>
        <Hand cards="K♣ 5♦" note="= 15" />
        <Hand cards="A♠ K♥" note={<Tag>Blackjack</Tag>} />
      </>
    ),
    text: <>2 to 10 are their number, <b>J, Q, K are 10</b>, and an <b>ace is 1 or 11</b>, whichever helps. An ace plus a 10-card is a blackjack.</>,
  },
  {
    title: 'Place your bet',
    picture: <Tag>Bet 10</Tag>,
    text: <>Each round opens with a <b>30-second</b> betting window. Pick an amount with the slider or Min, ×2, Max. No bet, no cards this round.</>,
  },
  {
    title: 'Hit or stand',
    picture: (
      <>
        <Hand cards="10♣ 6♦ + 3♠" note="= 19" />
        <Hand cards="10♣ 6♦ + 9♠" note={<Tag>Bust</Tag>} />
      </>
    ),
    text: <><b>Hit</b> takes another card, <b>Stand</b> keeps your total. Over 21 is a bust and loses. You have 60 seconds per decision.</>,
  },
  {
    title: 'Double and split',
    picture: <Hand cards="8♠ 8♥ → 8♠ | 8♥" />,
    text: <><b>Double</b> doubles your bet for exactly one more card. <b>Split</b> turns a pair into two hands, each with its own bet.</>,
  },
  {
    title: 'Dealer plays, then payouts',
    picture: <Hand cards="10♦ ? → 10♦ 7♣" note="stands on 17" />,
    text: <>The dealer turns the hidden card over and draws until 17 or more. A win pays <b>1 to 1</b>, a blackjack <b>3 to 2</b>, a tie gives your bet back.</>,
  },
];
