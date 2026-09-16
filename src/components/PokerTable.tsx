import { BETTING_PHASES, type Card, type GameState, type Player } from '../types/poker';

interface Props {
  state: GameState;
  heroId: string;
  onRejoin: () => void;
}

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' } as const;

const SIZE = {
  seat: 'h-12 w-9 text-base sm:h-16 sm:w-12 sm:text-xl',
  large: 'h-16 w-12 text-xl sm:h-20 sm:w-14 sm:text-2xl',
};

function CardView({ card, size, className = '', delayMs }: { card: Card; size: keyof typeof SIZE; className?: string; delayMs?: number }) {
  const base = `${SIZE[size]} ${className} rounded-md`;
  const style = delayMs === undefined ? undefined : { animationDelay: `${delayMs}ms` };
  if (card === '??') {
    return <div style={style} className={`${base} border border-white/20 bg-[repeating-linear-gradient(45deg,#1e3a8a_0_4px,#1e40af_4px_8px)]`} />;
  }
  const red = card[1] === 'h' || card[1] === 'd';
  return (
    <div style={style} className={`${base} flex flex-col items-center justify-center bg-white font-bold leading-none shadow ${red ? 'text-rose-600' : 'text-slate-900'}`}>
      <span>{card[0] === 'T' ? '10' : card[0]}</span>
      <span>{SUIT[card[1] as keyof typeof SUIT]}</span>
    </div>
  );
}

function Seat({ p, state, isHero }: { p: Player; state: GameState; isHero: boolean }) {
  const active = state.activeId === p.id;
  const won = state.phase === 'showdown' && state.pots.some((pot) => pot.winners.includes(p.id));
  const dimmed = p.folded || (state.phase !== 'waiting' && p.chips === 0 && !p.allIn && !won);
  return (
    <div className={`flex flex-col items-center ${dimmed ? 'opacity-45' : ''}`}>
      {p.hole.length > 0 && !(p.folded && !isHero) && (
        <div className="-mb-2 flex gap-0.5">
          {p.hole.map((c, i) => <CardView key={i} card={c} size={isHero ? 'large' : 'seat'} />)}
        </div>
      )}
      <div
        className={`relative min-w-20 max-w-28 rounded-xl border px-2 py-1 text-center shadow-lg ${
          active ? 'border-amber-300 bg-slate-800 ring-2 ring-amber-300' : won ? 'border-emerald-400 bg-emerald-950' : 'border-white/15 bg-slate-900'
        }`}
      >
        {state.dealerSeat === p.seat && state.phase !== 'waiting' && (
          <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-white text-[10px] font-black text-slate-900">D</span>
        )}
        <div className="truncate text-xs font-semibold">
          {!p.connected && <span title="Disconnected">⚠ </span>}
          {p.name}
          {isHero && ' (you)'}
        </div>
        <div className="font-mono text-sm font-bold text-emerald-300">{p.chips}</div>
        {p.lastAction && <div className="truncate text-[10px] uppercase tracking-wide text-slate-300">{p.lastAction}</div>}
      </div>
    </div>
  );
}

export default function PokerTable({ state, heroId, onRejoin }: Props) {
  const players = state.players;
  const heroIndex = Math.max(0, players.findIndex((p) => p.id === heroId));
  const ordered = [...players.slice(heroIndex), ...players.slice(0, heroIndex)]; // hero first, then clockwise
  const hero = players.find((p) => p.id === heroId);
  const queuePos = state.queue.findIndex((q) => q.id === heroId);
  const pot = players.reduce((n, p) => n + p.committed - p.bet, 0);
  const inHand = BETTING_PHASES.includes(state.phase);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';

  let overlay: React.ReactNode = null;
  if (queuePos >= 0) {
    overlay = <p>You're #{queuePos + 1} in the queue — you'll be dealt in when a seat opens.</p>;
  } else if (state.started && (!hero || (hero.chips === 0 && !inHand))) {
    overlay = (
      <>
        <p>You're out of chips.</p>
        <button onClick={onRejoin} className="mt-2 rounded-lg bg-emerald-500 px-4 py-2 font-bold text-slate-950">
          Rejoin with {state.config.startingStack}
        </button>
      </>
    );
  }

  return (
    <div className="relative mx-auto h-full max-h-[48rem] w-full max-w-3xl">
      <div className="absolute inset-x-[9%] inset-y-[13%] rounded-[50%] border-8 border-amber-950 bg-[radial-gradient(ellipse_at_center,#15803d_0%,#14532d_80%)] shadow-[inset_0_0_40px_rgba(0,0,0,.5)]" />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        {state.phase === 'waiting' ? (
          <p className="text-sm text-emerald-100/80">
            {state.started ? 'Waiting for more players…' : `${players.length} seated · ${state.queue.length} queued`}
          </p>
        ) : (
          <>
            <div className="flex gap-1 [perspective:600px]">
              {state.board.map((c, i) =>
                i < 3 ? (
                  <CardView key={`${state.handNumber}-${i}`} card={c} size="large" className="deal-flop" delayMs={i * 180} />
                ) : (
                  <CardView key={`${state.handNumber}-${i}`} card={c} size="large" />
                ),
              )}
            </div>
            {state.phase === 'showdown' ? (
              <div className="max-w-[60%] space-y-0.5 text-center text-xs text-emerald-50">
                {state.pots.map((p, i) => (
                  <div key={i}>
                    {p.winners.map(name).join(' & ')} win{p.winners.length === 1 ? 's' : ''} {p.amount}
                    {p.hand && <span className="text-emerald-200/80"> · {p.hand}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-full bg-black/40 px-3 py-0.5 font-mono text-sm font-bold">Pot {pot}</div>
            )}
          </>
        )}
      </div>

      {ordered.map((p, i) => {
        const angle = Math.PI / 2 + (i * 2 * Math.PI) / ordered.length;
        const at = (r: number) => ({ left: `${50 + r * 43 * Math.cos(angle)}%`, top: `${50 + r * 40 * Math.sin(angle)}%` });
        return (
          <div key={p.id}>
            <div className="absolute -translate-x-1/2 -translate-y-1/2" style={at(1)}>
              <Seat p={p} state={state} isHero={p.id === heroId} />
            </div>
            {p.bet > 0 && (
              <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 px-2 font-mono text-xs font-bold text-slate-950" style={at(0.55)}>
                {p.bet}
              </div>
            )}
          </div>
        );
      })}

      {state.queue.length > 0 && queuePos < 0 && (
        <div className="absolute left-2 top-1 text-xs text-slate-400">Queue: {state.queue.map((q) => q.name).join(', ')}</div>
      )}

      {overlay && (
        <div className="absolute inset-x-4 bottom-2 mx-auto max-w-sm rounded-xl bg-slate-900/95 p-3 text-center text-sm shadow-xl">{overlay}</div>
      )}
    </div>
  );
}
