declare module 'pokersolver' {
  export class Hand {
    static solve(cards: string[]): Hand;
    static winners(hands: Hand[]): Hand[];
    name: string;
    descr: string;
  }
  const pokersolver: { Hand: typeof Hand };
  export default pokersolver;
}
