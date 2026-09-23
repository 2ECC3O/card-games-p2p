import { Hand, Tag, type Page } from './HowToPlay';

export const RULES: Page[] = [
  {
    title: 'Take turns dealing',
    picture: <div className="htp-row"><Tag>Dealer</Tag><Hand cards="? ? vs ? ?" /></div>,
    text: <>The <b>dealer</b> passes clockwise every round. Everyone else bets against the dealer, who pays and collects from their own chips. Alone at the table? The app deals.</>,
  },
  {
    title: 'Count your score',
    picture: (
      <>
        <Hand cards="7♥ + 8♠" note="= 15 → scores 5" />
        <Hand cards="K♣ + 9♦" note="= scores 9" />
      </>
    ),
    text: <>Ace is 1, 2 to 9 are their number, 10 and picture cards count 0. <b>Only the last digit counts.</b> Highest score is 9.</>,
  },
  {
    title: 'Pok wins on the spot',
    picture: <Hand cards="4♣ 5♦" note={<Tag>Pok 9</Tag>} />,
    text: <>Two cards scoring <b>8 or 9</b> is a <b>Pok</b>. It's shown at once and beats any three-card hand. If the dealer has Pok, every hand is compared straight away; an equal Pok is a tie.</>,
  },
  {
    title: 'Draw one, or stay',
    picture: <Hand cards="2♠ 3♥ + 4♦" note="= 9" />,
    text: <>On your turn, <b>Draw a card</b> (only one) or <b>Stay</b>. You have 60 seconds. Some rooms use the house rule that under 4 on two cards you must draw.</>,
  },
  {
    title: "The dealer's turn",
    picture: <div className="htp-row"><Tag>Catch 3-card hands</Tag><Tag>Catch 2-card hands</Tag></div>,
    text: <>The dealer may first <b>catch</b> (จับ) everyone who drew, or everyone who stayed, and settle with them on the dealer's two cards. Then the dealer draws or stays against the rest.</>,
  },
  {
    title: 'Special three-card hands',
    picture: (
      <>
        <Hand cards="7♣ 7♦ 7♥" note={<Tag>Tong</Tag>} />
        <Hand cards="Q♠ K♦ A♣" note={<Tag>Straight</Tag>} />
        <Hand cards="J♣ J♦ K♥" note={<Tag>Three faces</Tag>} />
      </>
    ),
    text: <>These beat any plain score: <b>Tong</b> (three of a kind), then a <b>straight</b>, then <b>three picture cards</b>. The ace is high: Q-K-A is a straight, A-2-3 and K-A-2 aren't.</>,
  },
  {
    title: 'Deng multiplies the bet',
    picture: (
      <>
        <Hand cards="3♥ 5♥" note={<Tag>×2</Tag>} />
        <Hand cards="2♠ 6♠ K♠" note={<Tag>×3</Tag>} />
      </>
    ),
    text: <>A win pays your bet × your <b>deng</b>: ×2 for a pair or two cards of one suit, ×3 for three of one suit, a straight or three picture cards, ×5 for Tong. A loss pays the dealer's deng.</>,
  },
  {
    title: 'More than one hand',
    picture: <div className="htp-row"><Tag>At my seat</Tag><Tag>Cut in before Bob</Tag><Tag>Last, after the dealer</Tag></div>,
    text: <>Bet on up to <b>3 hands</b> (ขา). Put one at your seat, <b>cut in</b> before another player to take their cards (ตัดขา), or sit <b>last</b>, dealt after the dealer (ขาบ๊วย).</>,
  },
  {
    title: 'Ties, limits and chips',
    picture: <Hand cards="3♠ 4♦ vs 2♣ 5♥" note={<Tag>Tie</Tag>} />,
    text: <>Same score is a tie: nobody pays. The dealer may set a <b>bet limit</b> (อั้น). A dealer who runs out of chips pays winners in turn until empty, and nobody loses more than they have.</>,
  },
];
