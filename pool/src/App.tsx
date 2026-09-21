import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import PoolTable from './components/PoolTable';
import TournamentPanel from './components/TournamentPanel';
import InviteCard from './components/InviteCard';
import { button, field, label } from './components/ui';
import { createGame, rackOutlook } from './engine/poolEngine';
import { useWakeLock } from './hooks/useWakeLock';
import { randomRoomCode, TableNet, type Identity, type NetStatus } from './network/tableNet';
import type { GameState, Pocket, Side } from './types/pool';

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const isTournament = (name: string) => name.trim().toUpperCase() === 'TOURNAMENT';
const joinUrl = (code: string) => `${location.origin}${location.pathname}?room=${code}`;
function identity(name: string, watch: boolean): Identity {
  const get = (key: string, n: number) => { let value = sessionStorage.getItem(key); if (!value) sessionStorage.setItem(key, (value = hex(n))); return value; };
  return { id: get('pool.id', 8), secret: get('pool.secret', 16), name, watch };
}

const pocketNames = ['Top left', 'Top middle', 'Top right', 'Bottom left', 'Bottom middle', 'Bottom right'];

export default function App() {
  const urlRoom = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
  const [name, setName] = useState(() => localStorage.getItem('pool.name') ?? '');
  const [code, setCode] = useState(urlRoom);
  const [mode, setMode] = useState<GameState['mode']>('singles');
  const [raceTo, setRaceTo] = useState(3);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [net, setNet] = useState<TableNet | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [status, setStatus] = useState<NetStatus>('connecting');
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(60);
  const [tipX, setTipX] = useState(0);
  const [tipY, setTipY] = useState(0);
  const [calledBall, setCalledBall] = useState<number | null>(null);
  const [calledPocket, setCalledPocket] = useState<Pocket | null>(null);
  const [safety, setSafety] = useState(false);
  const [placing, setPlacing] = useState(false);
  const netRef = useRef<TableNet | null>(null);
  const autoJoined = useRef(false);
  const inviteRef = useRef<HTMLDialogElement>(null);
  useWakeLock(!!net && !!game);

  const leaveHome = useCallback((message = '') => {
    netRef.current?.destroy(); netRef.current = null;
    setNet(null); setGame(null); setNotice(message);
    sessionStorage.removeItem('pool.room'); sessionStorage.removeItem('pool.watch');
    history.replaceState(null, '', location.pathname);
  }, []);
  const events = {
    onState: setGame, onStatus: setStatus, onError: (message: string) => setNotice(message), onClosed: (message: string) => leaveHome(message),
  };
  const enter = (connection: TableNet) => {
    netRef.current = connection; setNet(connection);
    sessionStorage.setItem('pool.room', connection.roomCode);
    if (connection.me.watch) sessionStorage.setItem('pool.watch', '1');
    history.replaceState(null, '', `?room=${connection.roomCode}`);
  };
  const playerName = () => {
    const value = name.trim().slice(0, 20);
    if (!value) { setNotice('Enter a display name first.'); return null; }
    localStorage.setItem('pool.name', value);
    return value;
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const player = playerName(); if (!player) return;
    setBusy(true); setNotice('');
    for (let attempt = 0; attempt < 3; attempt++) {
      const roomCode = randomRoomCode();
      try { enter(await TableNet.host(roomCode, identity(player, isTournament(player)), createGame(roomCode, mode, raceTo, Date.now()), events)); break; }
      catch (err) { if ((err as { type?: string }).type !== 'unavailable-id') { setNotice("Couldn't reach the matchmaking server."); break; } }
    }
    setBusy(false);
  };
  const join = async (roomCode: string, player: string, watch: boolean) => {
    setBusy(true); setNotice('');
    try { enter(await TableNet.join(roomCode, identity(player, watch || isTournament(player)), events)); }
    catch (err) { setNotice(err instanceof Error ? err.message : "Couldn't join the room."); }
    setBusy(false);
  };
  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    const player = playerName(); if (!player) return;
    const roomCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(roomCode)) return setNotice('Room codes have six letters or digits.');
    void join(roomCode, player, (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'watch');
  };
  useEffect(() => {
    const stored = localStorage.getItem('pool.name');
    if (!autoJoined.current && urlRoom && stored && sessionStorage.getItem('pool.room') === urlRoom)
      void join(urlRoom, stored, sessionStorage.getItem('pool.watch') === '1');
    autoJoined.current = true;
    return () => netRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setCalledBall(null); setCalledPocket(null); setSafety(false); setPlacing(false);
    if (game) setPower(game.breakShot ? 95 : 60);
  }, [game?.turnStartedAt]);

  if (!net || !game) return <main className="pool-home">
    <nav className="room-nav"><a href="../">← Card Games</a><span>Table 04 / Eight-Ball</span></nav>
    <div className="pool-home-grid">
      <header className="pool-intro"><p className="pool-eyebrow">P2P / POCKET BILLIARDS</p><h1>Eight-Ball<br/><em>Pool</em></h1>
        <p>Call your shot. Clear your group. Sink the eight. Play singles or Scotch doubles, with friends or bots.</p>
        <div className="pool-intro-card"><span className="pool-demo-ball">8</span><div><strong>A proper match in your browser.</strong><small>Virtual table · WPA-style rules · No account</small></div></div>
      </header>
      <div className="pool-lobby-panel">
        <label className={label} htmlFor="pool-name">Display name</label>
        <input id="pool-name" className={field} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        <form onSubmit={onJoin} className="pool-form"><h2>Join a room</h2><label className={label} htmlFor="pool-code">Room code</label>
          <input id="pool-code" className={field} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" autoCapitalize="characters" />
          <div className="pool-form-actions"><button className={button.secondary} disabled={busy} value="join">Join to play</button><button className={button.quiet} disabled={busy} value="watch">Watch</button></div>
          <p className="pool-help">Name yourself TOURNAMENT for the full display.</p></form>
        <form onSubmit={create} className="pool-form"><h2>Create a room</h2><div className="pool-inline"><label className={label} htmlFor="pool-mode">Format<select id="pool-mode" className={field} value={mode} onChange={(e) => setMode(e.target.value as GameState['mode'])}><option value="singles">Singles · 1 v 1</option><option value="doubles">Doubles · 2 v 2</option></select></label>
          <label className={label} htmlFor="pool-race">Match<select id="pool-race" className={field} value={raceTo} onChange={(e) => setRaceTo(Number(e.target.value))}><option value={1}>One rack</option><option value={3}>Race to 3</option><option value={5}>Race to 5</option></select></label></div>
          <button className={button.primary} disabled={busy}>{busy ? 'Connecting…' : 'Create room'}</button>
          <p className="pool-help">Start with one person and the empty seats become bots.</p></form>
        {notice && <p className="pool-notice" role="alert">{notice}</p>}
      </div>
    </div>
  </main>;

  const watching = game.spectators.some((p) => p.id === net.me.id);
  const display = watching && isTournament(net.me.name);
  const active = game.phase === 'aiming' && game.activeId === net.me.id;
  const deciding = game.phase === 'choice' && game.activeId === net.me.id;
  const isHost = net.role === 'host';
  const cue = game.balls.find((b) => b.n === 0);
  const group = game.teams[game.turnTeam].group;
  const remaining = group ? game.balls.some((b) => group === 'solids' ? b.n >= 1 && b.n <= 7 : b.n >= 9 && b.n <= 15) : false;
  const legalBalls = game.balls.filter((b) => b.n && (group ? (remaining ? (group === 'solids' ? b.n <= 7 : b.n >= 9) : b.n === 8) : b.n !== 8));
  const canShoot = game.breakShot || safety || (calledBall !== null && calledPocket !== null && legalBalls.some((b) => b.n === calledBall));
  const current = game.players.find((p) => p.id === game.activeId)?.name ?? 'Player';
  const url = joinUrl(game.roomCode);
  const share = async () => { try { if (navigator.share) await navigator.share({ title: 'Eight-Ball Pool', url }); else { await navigator.clipboard.writeText(url); setNotice('Invite link copied.'); } } catch { /* share dismissed */ } };
  const labelTeam = (side: Side) => game.players.filter((p) => p.team === side).map((p) => p.name).join(' & ') || `Team ${side + 1}`;
  const choiceOptions = game.choice?.type === 'illegal' ? [['accept', 'Accept table'], ['rebreak-self', 'We re-break'], ['rebreak-other', 'They re-break']]
    : game.choice?.type === 'eight' ? [['spot', 'Spot the 8'], ['rebreak-self', 'Re-break']]
      : game.choice?.type === 'eight-foul' ? [['spot', 'Spot 8 · cue in hand'], ['rebreak-self', 'We re-break']]
        : [['accept', 'Accept table'], ['head', 'Cue in hand']];
  return <main className="pool-room">
    <header className="pool-header"><button className={button.quiet} onClick={() => inviteRef.current?.showModal()} aria-label={`Invite to room ${game.roomCode}`}><span className="pool-status" data-state={status} />{game.roomCode} ▣</button>
      <div className="pool-header-center">Rack {game.rack || '—'} <span>·</span> {game.mode === 'doubles' ? 'Doubles' : 'Singles'} <span>·</span> Race to {game.raceTo}</div>
      <button className={button.quiet} onClick={() => { net.leave(); netRef.current = null; leaveHome(); }}>Leave</button></header>
    <div className={`pool-room-body ${display ? 'pool-display' : ''}`}><section className="pool-main" aria-label="Pool table and cue controls">
      <div className="pool-scorebar"><div><strong>{labelTeam(0)}</strong><span>{watching ? `${rackOutlook(game, 0)}% outlook` : game.teams[0].group ?? 'Open'}</span></div><b>{game.teams[0].racks} : {game.teams[1].racks}</b><div><strong>{labelTeam(1)}</strong><span>{watching ? `${rackOutlook(game, 1)}% outlook` : game.teams[1].group ?? 'Open'}</span></div></div>
      <PoolTable state={game} angle={angle} active={active} placing={placing} calledBall={calledBall} calledPocket={calledPocket}
        onAim={setAngle} onPlace={(x, y) => { net.act({ type: 'place', x, y }); setPlacing(false); }} onCallBall={setCalledBall} onCallPocket={setCalledPocket} />
      <p className="pool-event" aria-live="polite">{game.phase === 'finished' ? `${labelTeam(game.winner!)} wins the match!` : game.lastEvent || 'Waiting to start.'}</p>
      {active && <div className="pool-controls">
        <div className="pool-controls-top"><strong>Your shot</strong><span>{game.breakShot ? 'Break · no call needed' : `${current} · ${group ?? 'open table'}`}</span></div>
        <div className="pool-control-grid"><div className="pool-control-block"><label htmlFor="pool-power">Power <b>{power}%</b></label><input id="pool-power" type="range" min="1" max="100" value={power} onChange={(e) => setPower(Number(e.target.value))} />
          <div className="pool-fine"><span>Fine cue angle</span><button onClick={() => setAngle(angle - Math.PI / 180)} aria-label="Aim left one degree">−1°</button><button onClick={() => setAngle(angle - Math.PI / 900)} aria-label="Aim left 0.2 degrees">−.2°</button><button onClick={() => setAngle(angle + Math.PI / 900)} aria-label="Aim right 0.2 degrees">+.2°</button><button onClick={() => setAngle(angle + Math.PI / 180)} aria-label="Aim right one degree">+1°</button></div>
          <p className="pool-help">Tap the table to aim. Dashed line predicts the first contact.</p></div>
          <div className="pool-control-block"><label htmlFor="pool-side">Cue ball hit position</label><div className="pool-spin"><label htmlFor="pool-side">Left / right</label><input id="pool-side" type="range" min="-100" max="100" value={tipX * 100} onChange={(e) => setTipX(Number(e.target.value) / 100)} /></div>
            <div className="pool-spin"><label htmlFor="pool-vertical">Bottom / top</label><input id="pool-vertical" type="range" min="-100" max="100" value={tipY * 100} onChange={(e) => setTipY(Number(e.target.value) / 100)} /></div>
            <button className={button.quiet} onClick={() => { setTipX(0); setTipY(0); }}>Center hit</button></div></div>
        {!game.breakShot && <div className="pool-call"><label>Call ball<select className={field} value={calledBall ?? ''} onChange={(e) => setCalledBall(e.target.value ? Number(e.target.value) : null)} disabled={safety}><option value="">Select ball</option>{legalBalls.map((b) => <option key={b.n} value={b.n}>{b.n}</option>)}</select></label>
          <label>Call pocket<select className={field} value={calledPocket ?? ''} onChange={(e) => setCalledPocket(e.target.value ? Number(e.target.value) as Pocket : null)} disabled={safety}><option value="">Select pocket</option>{pocketNames.map((p, i) => <option key={p} value={i}>{p}</option>)}</select></label>
          <label className="pool-safety"><input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} /> Safety</label></div>}
        <div className="pool-shoot-row">{game.ballInHand && <button className={button.secondary} onClick={() => setPlacing(!placing)} aria-pressed={placing}>{placing ? 'Aim cue' : 'Move cue ball'}</button>}
          <button className={button.primary} disabled={!canShoot || !cue || placing} onClick={() => net.act({ type: 'shot', angle, power, tipX, tipY, ball: calledBall, pocket: calledPocket, safety })}>Shoot</button></div>
      </div>}
      {deciding && <div className="pool-controls"><strong>Break decision</strong><p>{game.lastEvent}</p><div className="pool-form-actions">{choiceOptions.map(([option, text]) => <button key={option} className={button.secondary} onClick={() => net.act({ type: 'choice', option: option as 'accept' | 'head' | 'spot' | 'rebreak-self' | 'rebreak-other' })}>{text}</button>)}</div></div>}
      {game.phase === 'between' && <div className="pool-controls pool-center"><p>Next rack begins shortly.</p><button className={button.primary} disabled={watching} onClick={() => net.act({ type: 'nextRack' })}>Next rack now</button></div>}
      {!game.started && isHost && <div className="pool-controls pool-center"><p>{game.players.length} of {game.mode === 'singles' ? 2 : 4} seats filled. Start fills empty seats with bots.</p><div className="pool-form-actions"><button className={button.primary} onClick={() => net.startGame()}>Start {game.mode} match</button><button className={button.secondary} disabled={game.players.length >= (game.mode === 'singles' ? 2 : 4)} onClick={() => net.addBot()}>Add bot</button></div></div>}
      {watching && !display && <p className="pool-watch">You're watching. Outlook is a rough progress estimate, not measured odds.</p>}
      {notice && <p className="pool-notice" role="status">{notice}</p>}
    </section>{display && <TournamentPanel state={game} url={url} />}</div>
    <dialog ref={inviteRef} className="pool-dialog" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }} aria-label="Invite players"><InviteCard code={game.roomCode} url={url} onShare={share}><button className={button.quiet} onClick={() => inviteRef.current?.close()}>Close</button></InviteCard>
      <p className="pool-help">{game.players.map((p) => `${p.name} (Team ${p.team + 1})`).join(' · ') || 'No players seated yet.'}</p>
      {isHost && !game.started && <button className={button.secondary} disabled={game.players.length >= (game.mode === 'singles' ? 2 : 4)} onClick={() => net.addBot()}>Add bot</button>}</dialog>
  </main>;
}
