import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import ActionControls from './components/ActionControls';
import PokerTable from './components/PokerTable';
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

const joinUrl = (code: string) => `${location.origin}${location.pathname}?room=${code}`;
const input =
  'w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2.5 text-white outline-none focus:border-emerald-400';
const label = 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400';

export default function App() {
  const urlRoom = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
  const [name, setName] = useState(() => localStorage.getItem('poker.name') ?? '');
  const [code, setCode] = useState(urlRoom);
  const [stack, setStack] = useState('1000');
  const [blinds, setBlinds] = useState('10/20, 20/40, 30/60, 50/100, 100/200, 200/400, 500/1000');
  const [handsPerLevel, setHandsPerLevel] = useState('10');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [net, setNet] = useState<PokerNet | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [status, setStatus] = useState<NetStatus>('connecting');
  const [toast, setToast] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const { chime } = useAudio();
  const netRef = useRef<PokerNet | null>(null);
  const autoJoined = useRef(false); // StrictMode runs mount effects twice; join once

  const leaveToHome = useCallback((message: string | null) => {
    netRef.current?.destroy();
    netRef.current = null;
    setNet(null);
    setGame(null);
    setShowInvite(false);
    setNotice(message);
    sessionStorage.removeItem('poker.room');
    history.replaceState(null, '', location.pathname);
  }, []);

  const events = {
    onState: setGame,
    onStatus: setStatus,
    onError: setToast,
    onExpired: () => leaveToHome('Room closed after 5 minutes without any action.'),
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
    const levels = parseBlinds(blinds);
    const startingStack = Number(stack);
    const hands = Number(handsPerLevel);
    if (!levels) return setNotice('Blind levels must look like "10/20, 20/40" with big ≥ small.');
    if (!Number.isInteger(startingStack) || startingStack < levels[0].big * 2)
      return setNotice('Starting stack must be a whole number of at least two big blinds.');
    if (!Number.isInteger(hands) || hands < 1) return setNotice('Hands per level must be at least 1.');
    const config: TableConfig = { startingStack, blindLevels: levels, handsPerLevel: hands };

    setBusy(true);
    setNotice(null);
    for (let attempt = 0; attempt < 3; attempt++) {
      const roomCode = randomRoomCode();
      try {
        enter(await PokerNet.host(roomCode, identity(player), createGame(roomCode, config, Date.now()), events));
        break;
      } catch (err) {
        if ((err as { type?: string }).type !== 'unavailable-id') {
          setNotice('Could not reach the matchmaking server. Check your connection.');
          break;
        }
      }
    }
    setBusy(false);
  };

  const joinRoom = async (roomCode: string, player: string) => {
    setBusy(true);
    setNotice(null);
    try {
      enter(await PokerNet.join(roomCode, identity(player), events));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not join the room.');
    }
    setBusy(false);
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
    if (turnKey) chime();
  }, [turnKey, chime]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ------------------------------------------------ home
  if (!net || !game) {
    return (
      <main className="min-h-dvh bg-[radial-gradient(ellipse_at_top,#14532d_0%,#020617_65%)] px-4 py-8 text-white">
        <div className="mx-auto max-w-md">
          <h1 className="text-center text-4xl font-black tracking-tight">
            Hold'em <span className="text-emerald-400">P2P</span>
          </h1>
          <p className="mt-1 text-center text-sm text-slate-300">
            Free-to-play Texas Hold'em · virtual chips only · no server, just peers
          </p>

          {notice && (
            <div className="mt-5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200" role="alert">
              {notice}
            </div>
          )}
          {busy && net === null && (
            <div className="mt-5 text-center text-sm text-slate-300">Connecting…</div>
          )}

          <div className="mt-6">
            <label className={label} htmlFor="name">Display name</label>
            <input id="name" className={input} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>

          <form onSubmit={onJoin} className="mt-6 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-lg font-bold">Join a room</h2>
            <label className={label} htmlFor="code">Room code</label>
            <div className="flex gap-2">
              <input
                id="code"
                className={`${input} font-mono text-lg uppercase tracking-[0.3em]`}
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                autoCapitalize="characters"
                autoComplete="off"
              />
              <button disabled={busy} className="rounded-lg bg-sky-500 px-5 font-bold text-slate-950 disabled:opacity-50">
                Join
              </button>
            </div>
          </form>

          <form onSubmit={createRoom} className="mt-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-lg font-bold">Create a room</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="stack">Starting stack</label>
                <input id="stack" className={input} inputMode="numeric" value={stack} onChange={(e) => setStack(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="hpl">Hands per level</label>
                <input id="hpl" className={input} inputMode="numeric" value={handsPerLevel} onChange={(e) => setHandsPerLevel(e.target.value)} />
              </div>
            </div>
            <label className={`${label} mt-3`} htmlFor="blinds">Blind levels (small/big)</label>
            <textarea id="blinds" rows={2} className={input} value={blinds} onChange={(e) => setBlinds(e.target.value)} />
            <button disabled={busy} className="mt-3 w-full rounded-lg bg-emerald-500 py-3 font-bold text-slate-950 disabled:opacity-50">
              Create room
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ------------------------------------------------ table
  const isHost = net.role === 'host';
  const seated = game.players.filter((p) => p.chips > 0).length;
  const url = joinUrl(game.roomCode);
  const statusColor = { hosting: 'bg-emerald-400', connected: 'bg-emerald-400', connecting: 'bg-amber-400', reconnecting: 'bg-rose-500 animate-pulse' }[status];
  const act = (action: PlayerAction) => net.act(action);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Hold'em P2P", text: `Join my poker room ${game.roomCode}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setToast('Invite link copied');
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,#1e293b_0%,#020617_75%)] text-white">
      <header className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 text-sm">
        <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 rounded-lg bg-slate-800 px-2.5 py-1.5">
          <span className={`size-2 rounded-full ${statusColor}`} title={status} />
          <span className="font-mono font-bold tracking-widest">{game.roomCode}</span>
          <span className="text-slate-400">Invite</span>
        </button>
        <div className="min-w-0 flex-1 truncate text-center text-xs text-slate-300">
          {game.handNumber > 0 && `Hand ${game.handNumber} · Blinds ${game.blinds.small}/${game.blinds.big}`}
          {status === 'reconnecting' && <span className="text-rose-300"> · Reconnecting…</span>}
        </div>
        <button
          onClick={() => {
            net.leave(); // tears itself down after the goodbye is sent
            netRef.current = null;
            leaveToHome(null);
          }}
          className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-slate-300"
        >
          Leave
        </button>
      </header>

      <section className="relative min-h-0 flex-1 px-1">
        <PokerTable state={game} heroId={net.me.id} onRejoin={() => net.rejoinQueue()} />
      </section>

      <footer className="min-h-[4.5rem] pt-1">
        {myTurn ? (
          <ActionControls key={`${game.handNumber}-${game.phase}-${game.turnDeadline}`} state={game} heroId={net.me.id} onAction={act} />
        ) : isHost && !game.started ? (
          <div className="mx-auto max-w-xl px-3 pb-3">
            <button
              disabled={seated < 2}
              onClick={() => net.startGame()}
              className="min-h-12 w-full rounded-xl bg-emerald-500 font-bold text-slate-950 disabled:opacity-40"
            >
              {seated < 2 ? 'Waiting for at least 2 players…' : `Start game (${seated} players)`}
            </button>
          </div>
        ) : (
          <div className="px-3 pb-3 text-center text-sm text-slate-400">
            {game.activeId
              ? `Waiting for ${game.players.find((p) => p.id === game.activeId)?.name ?? 'player'}…`
              : game.phase === 'showdown'
                ? 'Next hand starting soon'
                : ' '}
          </div>
        )}
      </footer>

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowInvite(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-slate-900 p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-xs uppercase tracking-wide text-slate-400">Room code</div>
            <div className="font-mono text-3xl font-black tracking-[0.3em]">{game.roomCode}</div>
            <div className="mx-auto mt-4 w-fit rounded-xl bg-white p-3">
              <QRCodeSVG value={url} size={180} />
            </div>
            <div className="mt-3 break-all text-xs text-slate-400">{url}</div>
            <div className="mt-4 flex gap-2">
              <button onClick={share} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-bold text-slate-950">
                Share link
              </button>
              <button onClick={() => setShowInvite(false)} className="flex-1 rounded-lg bg-slate-700 py-2.5 font-semibold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 top-14 z-50 mx-auto w-fit max-w-[90vw] rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium shadow-lg" role="alert">
          {toast}
        </div>
      )}
    </main>
  );
}
