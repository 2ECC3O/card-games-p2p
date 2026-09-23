import { Hand, Tag, type Page } from './HowToPlay';

export const RULES: Page[] = [
  {
    title: 'Beat the dealer',
    picture: <Hand cards="? ? vs ? ?" />,
    text: <>Everyone plays against the dealer. Place a bet, and you and the dealer each get <b>two cards</b>. Only you see yours.</>,
  },
  {
    title: 'Count your score',
    picture: (
      <>
        <Hand cards="7♥ + 8♠" note="= 15 → scores 5" />
        <Hand cards="K♣ + 9♦" note="= scores 9" />
      </>
    ),
    text: <>Ace is 1, 2 to 9 are their number, 10 and picture cards are 0. <b>Only the last digit counts.</b> Highest score is 9.</>,
  },
  {
    title: 'Pok wins on the spot',
    picture: <Hand cards="4♣ 5♦" note={<Tag>Pok 9</Tag>} />,
    text: <>Two cards scoring <b>8 or 9</b> is a <b>Pok</b>. It's shown right away and beats any three-card hand. If the dealer has Pok, the round ends at once.</>,
  },
  {
    title: 'Draw one, or stay',
    picture: <Hand cards="2♠ 3♥ + 4♦" note="= 9" />,
    text: <>On your turn, <b>Draw a card</b> (only one) or <b>Stay</b>. You have 60 seconds. Then the dealer draws on 4 or less, and every hand is shown.</>,
  },
  {
    title: 'Special three-card hands',
    picture: (
      <>
        <Hand cards="7♣ 7♦ 7♥" note={<Tag>Tong</Tag>} />
        <Hand cards="5♥ 6♥ 7♥" note={<Tag>Straight flush</Tag>} />
      </>
    ),
    text: <>These beat any plain score: <b>Tong</b> (three of a kind), <b>straight flush</b>, <b>straight</b>, then <b>three picture cards</b>.</>,
  },
  {
    title: 'Deng multiplies the bet',
    picture: (
      <>
        <Hand cards="3♥ 5♥" note={<Tag>×2</Tag>} />
        <Hand cards="2♠ 6♠ K♠" note={<Tag>×3</Tag>} />
      </>
    ),
    text: <>Win and you're paid your bet × your <b>deng</b>: ×2 for a pair or two cards of one suit, ×3 for three of one suit, a straight or three pictures, ×5 for Tong or a straight flush. Lose and you pay the dealer's deng.</>,
  },
  {
    title: 'Ties and chips',
    picture: <Hand cards="3♠ 4♦ vs 2♣ 5♥" note={<Tag>Push</Tag>} />,
    text: <>Same score: the hand with more deng wins the difference, otherwise it's a push. You can never lose more chips than you have. Out of chips? Press <b>Rejoin</b>.</>,
  },
];
