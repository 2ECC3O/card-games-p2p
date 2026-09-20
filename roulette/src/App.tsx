import { EyeIcon, QrCodeIcon, SignOutIcon, SpeakerHighIcon, SpeakerSlashIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BetControls, CHIPS } from './components/ActionControls';
import RouletteTable from './components/RouletteTable';
import InviteCard from './components/InviteCard';
import Tournament from './components/Tournament';
import { button, field, label } from './components/ui';
import type { GameState, Spot, TableConfig } from './types/roulette';
import { createGame, isBroke } from './engine/rouletteEngine';
import { useAudio } from './hooks/useAudio';
import { useWakeLock } from './hooks/useWakeLock';
import { randomRoomCode, TableNet, type Identity, type NetStatus } from './network/tableNet';

const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

/** Per-tab identity so a reload reconnects to the same seat within the grace period. */
function identity(name: string, watch = false): Identity {
  const read = (key: string, size: number) => {
    let v = sessionStorage.getItem(key);
    if (!v) sessionStorage.setItem(key, (v = randomHex(size)));
    return v;
  };
  return { id: read('roulette.id', 8), secret: read('roulette.secret', 16), name, watch };
}

const MIN_BETS = [5, 10, 25, 100] as const;

/**
 * Browsers built into social apps (Instagram, Facebook/Messenger, LINE, Snapchat, TikTok, WeChat, Android app
 * web views) can block peer-to-peer connections, so those players are asked to open the page in a real
 * browser. Best-effort user-agent check; add patterns if players report other apps.
 */
const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|\bLine\/|Snapchat|TikTok|musical_ly|Bytedance|MicroMessenger|; wv\)/i;

const joinUrl = (code: string) => `${location.origin}${location.pathname}?room=${code}`;

/** Typing this as your name joins (or creates) a room as a big-screen display for viewers and commentators. */
const isTournament = (name: string) => name.trim().toUpperCase() === 'TOURNAMENT';

/** Segmented radio buttons, as in the create-room form. */
function Segmented<T extends number>({ name, options, value, onChange }: { name: string; options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-950/60 p-1 ring-1 ring-white/10">
      {options.map((o) => (
        <label key={o} className="relative">
          <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="peer sr-only" />
          <span className="block cursor-pointer rounded-lg py-2 text-center font-mono text-sm font-medium text-slate-300 transition peer-checked:bg-slate-100 peer-checked:text-slate-900 peer-focus-visible:outline-2 peer-focus-visible:outline-red-300 hover:text-slate-50 peer-checked:hover:text-slate-900">
            {o}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function App() {
  const urlRoom = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
  const [name, setName] = useState(() => localStorage.getItem('roulette.name') ?? '');
  const [code, setCode] = useState(urlRoom);
  const [stack, setStack] = useState('1000');
  const [minBet, setMinBet] = useState<(typeof MIN_BETS)[number]>(10);
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [net, setNet] = useState<TableNet | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [status, setStatus] = useState<NetStatus>('connecting');
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [muted, setMuted] = useState(() => localStorage.getItem('roulette.muted') === '1');
  const [inAppHint, setInAppHint] = useState(() => IN_APP_BROWSER.test(navigator.userAgent));
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null); // host: first tap on Remove
  const [chip, setChip] = useState(0); // index into CHIPS
  const { chime } = useAudio();
  const netRef = useRef<TableNet | null>(null);
  const inviteRef = useRef<HTMLDialogElement>(null);
  const autoJoined = useRef(false); // StrictMode runs mount effects twice; join once

  const leaveToHome = useCallback((message: string | null) => {
    netRef.current?.destroy();
    netRef.current = null;
    setNet(null);
    setGame(null);
    setNotice(message);
    sessionStorage.removeItem('roulette.room');
    sessionStorage.removeItem('roulette.watch');
    history.replaceState(null, '', location.pathname);
  }, []);

  const events = {
    onState: setGame,
    onStatus: setStatus,
    onError: (text: string) => setToast({ text, error: true }),
    onClosed: (message: string) => leaveToHome(message),
  };

  const enter = (n: TableNet) => {
    netRef.current = n;
    setNet(n);
    sessionStorage.setItem('roulette.room', n.roomCode);
    if (n.me.watch) sessionStorage.setItem('roulette.watch', '1');
    history.replaceState(null, '', `?room=${n.roomCode}`);
  };

  const validName = () => {
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) {
      setNotice('Enter a display name first.');
      return null;
    }
    localStorage.setItem('roulette.name', trimmed);
    return trimmed;
  };

  const createRoom = async (e: FormEvent) => {
    e.preventDefault();
    const player = validName();
    if (!player) return;
    const startingStack = Number(stack);
    if (!Number.isInteger(startingStack) || startingStack < minBet * 2)
      return setNotice(`The starting stack must be a whole number of at least ${minBet * 2} (two minimum bets).`);
    const config: TableConfig = { startingStack, minBet };

    setBusy('create');
    setNotice(null);
    for (let attempt = 0; attempt < 3; attempt++) {
      const roomCode = randomRoomCode();
      try {
        enter(await TableNet.host(roomCode, identity(player, isTournament(player)), createGame(roomCode, config, Date.now()), events));
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

  const joinRoom = async (roomCode: string, player: string, watch = false) => {
    setBusy('join');
    setNotice(null);
    try {
      enter(await TableNet.join(roomCode, identity(player, watch || isTournament(player)), events));
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
    void joinRoom(roomCode, player, (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'watch');
  };

  // Reload during a game: reconnect to the same room with the same identity.
  useEffect(() => {
    const stored = localStorage.getItem('roulette.name');
    if (!autoJoined.current && urlRoom && stored && sessionStorage.getItem('roulette.room') === urlRoom) {
      void joinRoom(urlRoom, stored, sessionStorage.getItem('roulette.watch') === '1');
    }
    autoJoined.current = true;
    return () => netRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const me = game && net ? game.players.find((p) => p.id === net.me.id) : undefined;
  const myBet = !!game && !!me && game.phase === 'betting' && !me.done;

  // Chime once when betting opens for us.
  const chimeKey = myBet ? game!.round : null;
  useEffect(() => {
    if (chimeKey && !muted) chime();
  }, [chimeKey, muted, chime]);

  // Keep the phone screen on while at a table; a locked screen pauses the page and costs turns.
  useWakeLock(!!net && !!game);

  useEffect(() => {
    if (!confirmRemove) return;
    const t = setTimeout(() => setConfirmRemove(null), 3000);
    return () => clearTimeout(t);
  }, [confirmRemove]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ------------------------------------------------ home
  if (!net || !game) {
    const card = 'lobby-section';
    return (
      <main className="lobby" style={{ '--accent': '#a03d32', '--felt': '#672c29' } as import('react').CSSProperties}>
        <nav className="room-nav" aria-label="Game navigation"><a href="../">← Card Games</a><span>Table 03 / Roulette</span></nav>
        <div className="lobby-layout">
          <div className="flex flex-col gap-4">
            <header className="lobby-intro" data-mark="◎"><p className="edition">1–10 players · Single zero</p>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Roulette <span className="text-red-400">P2P</span>
              </h1>
              <p className="mt-2 max-w-[38ch] text-balance text-slate-300 lg:mt-3 lg:text-lg">
                Roulette with friends, right in the browser. Virtual chips, no sign-up.
              </p>
            </header>

            {inAppHint && (
              <div className="rise-in flex items-start gap-3 rounded-xl bg-slate-900/80 px-3.5 py-3 text-sm text-slate-200 ring-1 ring-white/15" role="note">
                <p className="flex-1">
                  You're in an app's built-in browser, which can block the connection to other players. Open this page in Safari or
                  Chrome instead: use the app's menu and choose <span className="font-semibold text-slate-50">Open in browser</span>.
                </p>
                <button onClick={() => setInAppHint(false)} className={`${button.quiet} min-h-9 shrink-0 px-3 text-sm`}>
                  Dismiss
                </button>
              </div>
            )}

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
              <div className="join-controls">
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
                <button name="mode" value="join" disabled={busy !== null} className={`${button.primary} min-h-11 shrink-0 px-5`}>
                  {busy === 'join' ? 'Joining…' : 'Join'}
                </button>
                <button name="mode" value="watch" disabled={busy !== null} className={`${button.quiet} min-h-11 shrink-0 px-4`}>
                  Watch
                </button>
              </div>
              <p className="mt-2 text-sm text-slate-400">Watch follows without taking a seat. Use TOURNAMENT as your name for the scoreboard display.</p>
            </form>
          </div>

          <form onSubmit={createRoom} className={`${card} lobby-create`} aria-busy={busy === 'create'}>
            <h2 className="mb-3 text-lg font-semibold">Create a room</h2>
            <label className={label} htmlFor="stack">
              Starting stack
            </label>
            <input id="stack" className={`${field} font-mono`} inputMode="numeric" value={stack} onChange={(e) => setStack(e.target.value)} />

            <fieldset className="mt-4">
              <legend className={label}>Minimum bet</legend>
              <Segmented name="minBet" options={MIN_BETS} value={minBet} onChange={setMinBet} />
              <p className="mt-2 text-sm text-slate-400">
                Single-zero wheel. A number pays 35 to 1, dozens and columns 2 to 1, red or black, odd or even and high or low 1 to 1.
              </p>
            </fieldset>

            <button disabled={busy !== null} className={`${button.secondary} mt-4 min-h-12 w-full`}>
              {busy === 'create' ? 'Creating room…' : 'Create room'}
            </button>
          </form>
        </div>
        <div className="lobby-foot"><span>Friends only. Virtual chips. No sign-up.</span><span>Create a room, share the link, settle in.</span></div>
      </main>
    );
  }

  // ------------------------------------------------ table
  const isHost = net.role === 'host';
  const queuePos = game.queue.findIndex((q) => q.id === net.me.id);
  const watching = game.spectators.some((w) => w.id === net.me.id);
  const display = watching && isTournament(net.me.name);
  const broke = game.started && !watching && game.phase !== 'settled' && (!me || isBroke(game, me)); // not while the wheel spins
  const seated = game.players.length;
  const url = joinUrl(game.roomCode);
  const statusColor = { hosting: 'bg-emerald-400', connected: 'bg-emerald-400', connecting: 'bg-amber-300', reconnecting: 'bg-rose-400' }[status];
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Roulette P2P', text: `Join my roulette table ${game.roomCode}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setToast({ text: 'Invite link copied', error: false });
      }
    } catch {
      /* share sheet dismissed */
    }
  };
  const toggleMute = () => {
    localStorage.setItem('roulette.muted', muted ? '0' : '1');
    setMuted(!muted);
  };
  const place = (spot: Spot) => net.act({ type: 'bet', spot, amount: Math.min(CHIPS[chip] * game.config.minBet, me?.chips ?? 0) });

  return (
    <main className="table-room flex h-dvh flex-col overflow-hidden" style={{ '--accent': '#a03d32', '--felt': '#672c29' } as import('react').CSSProperties}>
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
            game.round > 0 && (
              <>
                <span>Round {game.round}</span>
                <span>
                  Min bet <span className="font-mono text-slate-200">{game.config.minBet}</span>
                </span>
              </>
            )
          )}
        </div>

        {game.spectators.length > 0 && (
          <span className="hidden items-center gap-1.5 text-sm text-slate-400 sm:flex" title={game.spectators.map((w) => w.name).join(', ')}>
            <EyeIcon size={16} aria-hidden />
            {game.spectators.length}
            <span className="sr-only"> watching</span>
          </span>
        )}
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

      <div className={`flex min-h-0 flex-1 ${display ? 'flex-col overflow-y-auto lg:flex-row lg:overflow-hidden' : ''}`}>
        <section className={`relative flex-1 overflow-y-auto pt-1 ${display ? 'min-h-[60dvh] shrink-0 lg:min-h-0 lg:shrink' : 'min-h-0'}`} aria-label="Roulette table">
          <RouletteTable
            state={game}
            heroId={net.me.id}
            invite={<InviteCard compact code={game.roomCode} url={url} onShare={share} />}
            canBet={myBet}
            onPlace={place}
          />
        </section>
        {display && <Tournament state={game} url={url} />}
      </div>

      {(!display || (isHost && !game.started)) && <footer className="min-h-[4.5rem] pt-1">
        {myBet ? (
          <BetControls state={game} heroId={net.me.id} chip={chip} onChip={setChip} onAction={(a) => net.act(a)} />
        ) : isHost && !game.started ? (
          <div className="mx-auto max-w-2xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <button disabled={seated < 1} onClick={() => net.startGame()} className={`${button.primary} min-h-12 w-full text-base sm:min-h-14 sm:text-lg`}>
              {seated === 0 ? 'Waiting for players' : seated === 1 && !watching ? 'Start playing alone' : `Start game with ${seated} player${seated === 1 ? '' : 's'}`}
            </button>
          </div>
        ) : watching ? (
          <p className="px-3 pb-3 text-center text-sm text-slate-400 sm:text-base" aria-live="polite">
            {game.started ? "You're watching. You see every player's cards." : "You're watching. The game starts when the host presses Start."}
          </p>
        ) : queuePos >= 0 ? (
          <p className="px-3 pb-3 text-center text-sm text-slate-300 sm:text-base" aria-live="polite">
            You're number {queuePos + 1} in the queue. You'll join at the next round when a seat opens.
          </p>
        ) : broke ? (
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <p className="text-sm text-slate-300 sm:text-base">You're out of chips.</p>
            <button onClick={() => net.rejoinQueue()} className={`${button.primary} min-h-11 px-5`}>
              Rejoin with {game.config.startingStack}
            </button>
          </div>
        ) : (
          <p className="px-3 pb-3 text-center text-sm text-slate-400 sm:text-base" aria-live="polite">
            {game.phase === 'betting'
              ? 'Waiting for the other bets…'
              : game.phase === 'settled'
                ? 'Next round opens in a few seconds'
                : !game.started
                  ? 'Waiting for the host to start'
                  : ''}
          </p>
        )}
      </footer>}

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

          {isHost && (
            <div className="mt-5 border-t border-white/10 pt-4">
              <h2 className="mb-2 text-sm font-medium text-slate-300">Players</h2>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {[
                  ...game.players.map((p) => ({ id: p.id, name: p.name, place: `Seat ${p.seat + 1}` })),
                  ...game.queue.map((q, i) => ({ id: q.id, name: q.name, place: `Queue ${i + 1}` })),
                  ...game.spectators.map((w) => ({ id: w.id, name: w.name, place: 'Watching' })),
                ].map(({ id, name, place }) => (
                  <li key={id} className="flex min-h-10 items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{id === net.me.id ? 'You' : name}</span>
                    <span className="text-xs text-slate-400">{place}</span>
                    {id !== net.me.id && (
                      // Two taps: the first arms the button for 3 seconds, the second removes.
                      <button
                        onClick={() => (confirmRemove === id ? (net.remove(id), setConfirmRemove(null)) : setConfirmRemove(id))}
                        className={`${confirmRemove === id ? button.danger : button.quiet} min-h-9 px-3 text-xs`}
                      >
                        {confirmRemove === id ? 'Tap to remove' : 'Remove'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
