import { Hand, Tag, type Page } from '../../../shared/HowToPlay';

export const RULES: Page[] = [
  {
    title: 'Two cards, just for you',
    picture: <Hand cards="A♠ K♠" note="your cards" />,
    text: <>Everyone gets <b>two private cards</b>. Make the best five-card hand and win the chips in the middle (the pot).</>,
  },
  {
    title: 'Blinds start the pot',
    picture: <div className="htp-row"><Tag>Small blind 10</Tag><Tag>Big blind 20</Tag></div>,
    text: <>Two players put in forced bets, the <b>blinds</b>, before each hand. They move round the table and go up as the game goes on.</>,
  },
  {
    title: 'Five shared cards',
    picture: <Hand cards="Q♠ J♠ 2♦ | 7♣ | 10♠" />,
    text: <>Shared cards come in three steps: the <b>flop</b> (3), the <b>turn</b> (1) and the <b>river</b> (1). Everyone can use them.</>,
  },
  {
    title: 'Your turn to bet',
    picture: <div className="htp-row"><Tag>Fold</Tag><Tag>Check / Call</Tag><Tag>Bet / Raise</Tag></div>,
    text: <><b>Fold</b> gives up the hand. <b>Check</b> passes, <b>Call</b> matches a bet, <b>Raise</b> bets more. You have 60 seconds, then you check or fold.</>,
  },
  {
    title: 'Best hand wins',
    picture: <Hand cards="A♠ K♠ + Q♠ J♠ 10♠" note={<Tag>Royal flush</Tag>} />,
    text: <>At the end, the best five cards from your two plus the five shared ones take the pot. Everyone else folding wins it too.</>,
  },
  {
    title: 'Hands, best to worst',
    picture: (
      <>
        <Hand cards="9♥ 9♣ 9♦ 4♠ 4♥" note={<Tag>Full house</Tag>} />
        <Hand cards="5♦ 6♣ 7♥ 8♠ 9♦" note={<Tag>Straight</Tag>} />
      </>
    ),
    text: <>Straight flush, four of a kind, <b>full house</b>, flush, <b>straight</b>, three of a kind, two pair, pair, high card.</>,
  },
];
