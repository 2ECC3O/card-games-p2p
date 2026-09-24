import { staked } from '../engine/rouletteEngine';
import type { GameState, PlayerAction } from '../types/roulette';
import { button } from '../../../shared/ui';

/** Chip values, in minimum bets. */
export const CHIPS = [1, 5, 25, 100] as const;
const CHIP_TONE = [
  'bg-slate-100 text-slate-900 border-slate-400',
  'bg-red-500 text-white border-red-200',
  'bg-emerald-600 text-white border-emerald-200',
  'bg-slate-900 text-amber-200 border-amber-300',
];

interface Props {
  state: GameState;
  heroId: string;
  chip: number;
  onChip: (index: number) => void;
  onAction: (action: PlayerAction) => void;
}

const big = 'min-h-12 flex-1 px-3 text-base sm:min-h-14 sm:text-lg';

/** Pick a chip, then tap the board (in the table) to place it. */
export function BetControls({ state, heroId, chip, onChip, onAction }: Props) {
  const hero = state.players.find((p) => p.id === heroId)!;
  const min = state.config.minBet;
  const stake = staked(hero.bets);
  const last = staked(hero.lastBets);

  return (
    <div className="rise-in mx-auto max-w-2xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
      <div className="mb-2 flex items-center gap-2 sm:gap-3">
        <div className="flex gap-1.5 sm:gap-2" role="radiogroup" aria-label="Chip value">
          {CHIPS.map((m, i) => (
            <button
              key={m}
              role="radio"
              aria-checked={chip === i}
              onClick={() => onChip(i)}
              className={`grid size-11 place-items-center rounded-full border-[3px] border-dashed font-mono text-xs font-bold shadow-md shadow-black/40 transition select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 motion-reduce:transition-none ${CHIP_TONE[i]} ${
                chip === i ? '-translate-y-1 ring-2 ring-red-300 ring-offset-2 ring-offset-slate-950' : 'opacity-80 hover:opacity-100'
              }`}
            >
              {m * min >= 1000 ? `${(m * min) / 1000}k` : m * min}
            </button>
          ))}
        </div>
        <p className="ml-auto text-right text-xs leading-tight text-slate-400 sm:text-sm">
          On the table
          <span className="block font-mono text-sm font-semibold text-slate-50 sm:text-base">{stake}</span>
        </p>
      </div>
      <div className="flex gap-2">
        {stake === 0 && last > 0 ? (
          <button disabled={last > hero.chips} onClick={() => onAction({ type: 'repeat' })} className={`${button.quiet} ${big}`}>
            Repeat <span className="font-mono text-sm text-slate-300">{last}</span>
          </button>
        ) : (
          <button disabled={stake === 0} onClick={() => onAction({ type: 'clear' })} className={`${button.quiet} ${big}`}>
            Clear
          </button>
        )}
        <button onClick={() => onAction({ type: 'done' })} className={`${stake ? button.primary : button.secondary} ${big}`}>
          {!stake ? 'Skip round' : state.players.length === 1 ? 'Spin' : 'Done betting'}
        </button>
      </div>
    </div>
  );
}
