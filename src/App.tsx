import { QrCodeIcon, SignOutIcon, SpeakerHighIcon, SpeakerSlashIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import ActionControls from './components/ActionControls';
import InviteCard from './components/InviteCard';
import PokerTable from './components/PokerTable';
import { button, field, label } from './components/ui';
import { BETTING_PHASES, type BlindLevel, type GameState, type PlayerAction, type TableConfig } from './types/poker';
import { createGame } from './engine/pokerEngine';
import { useAudio } from './hooks/useAudio';
import { PokerNet, randomRoomCode, type Identity, type NetStatus } from './network/pokerNet';

const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

/** Per-tab identity so a reload reconnects to the same seat within the grace period. */
function identity(name: string): Identity {
  const read = (key: string, size: number) => {
    let v = sessionStorage.getItem(key);
    if (!v) sessionStorage.setItem(key, (v = randomHex(size)));
    return v;
  };
  return { id: read('poker.id', 8), secret: read('poker.secret', 16), name };
}

function parseBlinds(text: string): BlindLevel[] | null {
  const levels = text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => /^(\d+)\s*\/\s*(\d+)$/.exec(s))
    .map((m) => (m ? { small: Number(m[1]), big: Number(m[2]) } : null));
  if (levels.length === 0 || levels.some((l) => !l || l.small < 1 || l.big < l.small)) return null;
  return levels as BlindLevel[];
}

const DEFAULT_BLINDS = '10/20, 20/40, 30/60, 50/100, 100/200, 200/400, 500/1000';
const PACES = [
  { id: 'fast', label: 'Fast', hands: 5 },
  { id: 'standard', label: 'Standard', hands: 10 },
  { id: 'slow', label: 'Slow', hands: 20 },
  { id: 'custom', label: 'Custom', hands: 0 },
] as const;
type Pace = (typeof PACES)[number]['id'];

const joinUrl = (code: string) => `${location.origin}${location.pathname}?room=${code}`;

export default function App() {
  const urlRoom = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
  const [name, setName] = useState(() => localStorage.getItem('poker.name') ?? '');
  const [code, setCode] = useState(urlRoom);
  const [stack, setStack] = useState('1000');
  const [pace, setPace] = useState<Pace>('standard');
  const [blinds, setBlinds] = useState(DEFAULT_BLINDS);
  const [handsPerLevel, setHandsPerLevel] = useState('10');
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [net, setNet] = useState<PokerNet | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [status, setStatus] = useState<NetStatus>('connecting');
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [muted, setMuted] = useState(() => localStorage.getItem('poker.muted') === '1');
  const { chime } = useAudio();
  const netRef = useRef<PokerNet | null>(null);
  const inviteRef = useRef<HTMLDialogElement>(null);
  const autoJoined = useRef(false); // StrictMode runs mount effects twice; join once

  const leaveToHome = useCallback((message: string | null) => {
    netRef.current?.destroy();
    netRef.current = null;
    setNet(null);
    setGame(null);
    setNotice(message);
    sessionStorage.removeItem('poker.room');
    history.replaceState(null, '', location.pathname);
  }, []);

  const events = {
    onState: setGame,
    onStatus: setStatus,
    onError: (text: string) => setToast({ text, error: true }),
    onExpired: () => leaveToHome('The room closed after 5 minutes without any action.'),
  };

  const enter = (n: PokerNet) => {
    netRef.current = n;
    setNet(n);
    sessionStorage.setItem('poker.room', n.roomCode);
    history.replaceState(null, '', `?room=${n.roomCode}`);
  };

  const validName = () => {
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) {
      setNotice('Enter a display name first.');
      return null;
    }
    localStorage.setItem('poker.name', trimmed);
    return trimmed;
  };

  const createRoom = async (e: FormEvent) => {
    e.preventDefault();
    const player = validName();
    if (!player) return;
    const custom = pace === 'custom';
    const levels = custom ? parseBlinds(blinds) : parseBlinds(DEFAULT_BLINDS);
    const startingStack = Number(stack);
    const hands = custom ? Number(handsPerLevel) : PACES.find((p) => p.id === pace)!.hands;
    if (!levels) return setNotice('Write blind levels as small/big pairs, like "10/20, 20/40".');
    if (!Number.isInteger(startingStack) || startingStack < levels[0].big * 2)
      return setNotice(`The starting stack must be a whole number of at least ${levels[0].big * 2} (two big blinds).`);
    if (!Number.isInteger(hands) || hands < 1) return setNotice('Hands per level must be at least 1.');
    const config: TableConfig = { startingStack, blindLevels: levels, handsPerLevel: hands };

    setBusy('create');
    setNotice(null);
    for (let attempt = 0; attempt < 3; attempt++) {
      const roomCode = randomRoomCode();
      try {
        enter(await PokerNet.host(roomCode, identity(player), createGame(roomCode, config, Date.now()), events));
        break;
      } catch (err) {
        if ((err as { type?: string }).type !== 'unavailable-id') {
          setNotice("Couldn't reach the matchmaking server. Check your connection and try again.");
          break;
        }
      }
    }
    setBusy(null);
  };

  const joinRoom = async (roomCode: string, player: string) => {
    setBusy('join');
    setNotice(null);
    try {
      enter(await PokerNet.join(roomCode, identity(player), events));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't join the room.");
    }
    setBusy(null);
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    const player = validName();
    const roomCode = code.trim().toUpperCase();
    if (!player) return;
    if (!/^[A-Z0-9]{6}$/.test(roomCode)) return setNotice('Room codes are 6 letters or digits.');
    void joinRoom(roomCode, player);
  };

  // Reload during a game: reconnect to the same room with the same identity.
  useEffect(() => {
    const stored = localStorage.getItem('poker.name');
    if (!autoJoined.current && urlRoom && stored && sessionStorage.getItem('poker.room') === urlRoom) {
      void joinRoom(urlRoom, stored);
    }
    autoJoined.current = true;
    return () => netRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chime once per turn when the action reaches us.
  const myTurn = !!game && !!net && game.activeId === net.me.id && BETTING_PHASES.includes(game.phase);
  const turnKey = myTurn ? `${game!.handNumber}-${game!.phase}-${game!.turnDeadline}` : null;
  useEffect(() => {
    if (turnKey && !muted) chime();
  }, [turnKey, muted, chime]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ------------------------------------------------ home
  if (!net || !game) {
    const card = 'rounded-2xl bg-slate-900/60 p-4 ring-1 ring-white/10 backdrop-blur-sm sm:p-5 lg:p-6';
    return (
      <main className="min-h-dvh bg-[radial-gradient(ellipse_at_top,#14532d_0%,#020617_62%)] px-4 py-10 text-slate-50 sm:px-6 md:flex md:items-center md:py-12">
        <div className="mx-auto grid w-full max-w-md gap-4 md:max-w-4xl md:grid-cols-2 md:items-end md:gap-8 lg:max-w-5xl lg:gap-12">
          <div className="flex flex-col gap-4">
            <header className="mb-2">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Hold'em <span className="text-emerald-400">P2P</span>
              </h1>
              <p className="mt-2 max-w-[38ch] text-balance text-slate-300 lg:mt-3 lg:text-lg">
                Texas Hold'em with friends, right in the browser. Virtual chips, no sign-up.
              </p>
            </header>

            {notice && (
              <p className="rise-in rounded-xl bg-amber-300/10 px-3.5 py-2.5 text-sm text-amber-100 ring-1 ring-amber-300/30" role="alert">
                {notice}
              </p>
            )}

            <div>
              <label className={label} htmlFor="name">
                Display name
              </label>
              <input id="name" className={field} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
            </div>

            <form onSubmit={onJoin} className={card} aria-busy={busy === 'join'}>
              <h2 className="mb-3 text-lg font-semibold">Join a room</h2>
              <label className={label} htmlFor="code">
                Room code
              </label>
              <div className="flex gap-2">
                <input
                  id="code"
                  className={`${field} font-mono text-lg tracking-[0.3em] uppercase placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:normal-case`}
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="6 letters or digits"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button disabled={busy !== null} className={`${button.primary} min-h-11 shrink-0 px-5`}>
                  {busy === 'join' ? 'Joining…' : 'Join'}
                </button>
              </div>
            </form>
          </div>

          <form onSubmit={createRoom} className={card} aria-busy={busy === 'create'}>
            <h2 className="mb-3 text-lg font-semibold">Create a room</h2>
            <label className={label} htmlFor="stack">
              Starting stack
            </label>
            <input id="stack" className={`${field} font-mono`} inputMode="numeric" value={stack} onChange={(e) => setStack(e.target.value)} />

            <fieldset className="mt-4">
              <legend className={label}>Blind speed</legend>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-950/60 p-1 ring-1 ring-white/10 sm:grid-cols-4">
                {PACES.map((p) => (
                  <label key={p.id} className="relative">
                    <input type="radio" name="pace" value={p.id} checked={pace === p.id} onChange={() => setPace(p.id)} className="peer sr-only" />
                    <span className="block cursor-pointer rounded-lg py-2 text-center text-sm font-medium text-slate-300 transition peer-checked:bg-slate-100 peer-checked:text-slate-900 peer-focus-visible:outline-2 peer-focus-visible:outline-emerald-300 hover:text-slate-50 peer-checked:hover:text-slate-900">
                      {p.label}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {pace === 'custom'
                  ? 'Set your own blind levels and how often they go up.'
                  : `Blinds start at 10/20 and go up every ${PACES.find((p) => p.id === pace)!.hands} hands.`}
              </p>
            </fieldset>

            {pace === 'custom' && (
              <div className="rise-in mt-3 grid gap-3">
                <div>
                  <label className={label} htmlFor="hpl">
                    Hands per level
                  </label>
                  <input id="hpl" className={`${field} font-mono`} inputMode="numeric" value={handsPerLevel} onChange={(e) => setHandsPerLevel(e.target.value)} />
                </div>
                <div>
                  <label className={label} htmlFor="blinds">
                    Blind levels (small/big)
                  </label>
                  <textarea id="blinds" rows={2} className={`${field} font-mono text-sm`} value={blinds} onChange={(e) => setBlinds(e.target.value)} />
                </div>
              </div>
            )}

            <button disabled={busy !== null} className={`${button.secondary} mt-4 min-h-12 w-full`}>
              {busy === 'create' ? 'Creating room…' : 'Create room'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ------------------------------------------------ table
  const isHost = net.role === 'host';
  const me = game.players.find((p) => p.id === net.me.id);
  const queuePos = game.queue.findIndex((q) => q.id === net.me.id);
  const outOfChips = game.started && (!me || (me.chips === 0 && !BETTING_PHASES.includes(game.phase)));
  const seated = game.players.filter((p) => p.chips > 0).length;
  const url = joinUrl(game.roomCode);
  const statusColor = { hosting: 'bg-emerald-400', connected: 'bg-emerald-400', connecting: 'bg-amber-300', reconnecting: 'bg-rose-400' }[status];
  const act = (action: PlayerAction) => net.act(action);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Hold'em P2P", text: `Join my poker room ${game.roomCode}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setToast({ text: 'Invite link copied', error: false });
      }
    } catch {
      /* share sheet dismissed */
    }
  };
  const toggleMute = () => {
    localStorage.setItem('poker.muted', muted ? '0' : '1');
    setMuted(!muted);
  };

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,#1e293b_0%,#020617_75%)] text-slate-50">
      <header className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 sm:px-5 sm:pt-3">
        <button onClick={() => inviteRef.current?.showModal()} className={`${button.quiet} min-h-10 px-3`}>
          <span className={`size-2 rounded-full ${statusColor}`} aria-hidden />
          <span className="sr-only">Connection: {status}. </span>
          <span className="font-mono tracking-widest">{game.roomCode}</span>
          <QrCodeIcon size={18} aria-hidden />
          <span className="sr-only sm:not-sr-only">Invite</span>
        </button>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-xs leading-tight text-slate-400 sm:flex-row sm:gap-4 sm:text-sm">
          {status === 'reconnecting' ? (
            <span className="rounded-full bg-rose-400/15 px-2.5 py-0.5 text-rose-200">Reconnecting…</span>
          ) : (
            game.handNumber > 0 && (
              <>
                <span>Hand {game.handNumber}</span>
                <span>
                  Blinds <span className="font-mono text-slate-200">{game.blinds.small}/{game.blinds.big}</span>
                </span>
              </>
            )
          )}
        </div>

        <button onClick={toggleMute} className={`${button.quiet} size-10`} aria-pressed={muted} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
          {muted ? <SpeakerSlashIcon size={18} aria-hidden /> : <SpeakerHighIcon size={18} aria-hidden />}
        </button>
        <button
          onClick={() => {
            net.leave(); // tears itself down after the goodbye is sent
            netRef.current = null;
            leaveToHome(null);
          }}
          className={`${button.quiet} min-h-10 px-3`}
          aria-label="Leave room"
        >
          <SignOutIcon size={18} aria-hidden />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </header>

      <section className="relative min-h-0 flex-1 px-1 sm:px-4" aria-label="Poker table">
        <PokerTable
          state={game}
          heroId={net.me.id}
          invite={<InviteCard compact code={game.roomCode} url={url} onShare={share} />}
        />
      </section>

      <footer className="min-h-[4.5rem] pt-1">
        {myTurn ? (
          <ActionControls key={`${game.handNumber}-${game.phase}-${game.turnDeadline}`} state={game} heroId={net.me.id} onAction={act} />
        ) : isHost && !game.started ? (
          <div className="mx-auto max-w-2xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <button disabled={seated < 2} onClick={() => net.startGame()} className={`${button.primary} min-h-12 w-full text-base sm:min-h-14 sm:text-lg`}>
              {seated < 2 ? 'Waiting for a second player' : `Start game with ${seated} players`}
            </button>
          </div>
        ) : queuePos >= 0 ? (
          <p className="px-3 pb-3 text-center text-sm text-slate-300 sm:text-base" aria-live="polite">
            You're number {queuePos + 1} in the queue. You'll be dealt in when a seat opens.
          </p>
        ) : outOfChips ? (
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <p className="text-sm text-slate-300 sm:text-base">You're out of chips.</p>
            <button onClick={() => net.rejoinQueue()} className={`${button.primary} min-h-11 px-5`}>
              Rejoin with {game.config.startingStack}
            </button>
          </div>
        ) : (
          <p className="px-3 pb-3 text-center text-sm text-slate-400 sm:text-base" aria-live="polite">
            {game.activeId
              ? `Waiting for ${game.players.find((p) => p.id === game.activeId)?.name ?? 'another player'}…`
              : game.phase === 'showdown'
                ? 'Next hand starts in a few seconds'
                : !game.started
                  ? 'Waiting for the host to start'
                  : ''}
          </p>
        )}
      </footer>

      <dialog
        ref={inviteRef}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.close()} // some embedded browsers skip the native Esc close
        className="m-auto w-[min(22rem,calc(100%-2rem))] rounded-2xl bg-slate-900 p-0 text-slate-50 shadow-2xl ring-1 ring-white/10 backdrop:bg-slate-950/75 backdrop:backdrop-blur-sm"
        aria-label="Invite players"
      >
        <div className="p-5">
          <InviteCard code={game.roomCode} url={url} onShare={share}>
            <button onClick={() => inviteRef.current?.close()} className={`${button.quiet} min-h-11 flex-1`}>
              Close
            </button>
          </InviteCard>
        </div>
      </dialog>

      {toast && (
        <div
          className={`rise-in fixed inset-x-0 top-16 z-50 mx-auto w-fit max-w-[90vw] rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.error ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-900'
          }`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.text}
        </div>
      )}
    </main>
  );
}
