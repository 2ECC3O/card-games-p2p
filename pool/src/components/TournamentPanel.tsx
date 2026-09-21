import { QRCodeSVG } from 'qrcode.react';
import { rackOutlook } from '../engine/poolEngine';
import type { GameState, Side } from '../types/pool';

export default function TournamentPanel({ state, url }: { state: GameState; url: string }) {
  const completed = state.teams[0].racks + state.teams[1].racks;
  const label = (side: Side) => state.players.filter((p) => p.team === side).map((p) => p.name).join(' & ') || `Team ${side + 1}`;
  return <aside className="pool-tournament" aria-label="Tournament display">
    <div className="pool-code"><QRCodeSVG value={url} bgColor="#f8fafc" fgColor="#132920" className="pool-code-qr" title={`Join room ${state.roomCode}`} />
      <div><small>SCAN TO WATCH OR PLAY</small><strong>{state.roomCode}</strong></div></div>
    <h2>Match board</h2>
    {[0, 1].map((n) => { const side = n as Side, team = state.teams[side];
      const left = team.group ? state.balls.filter((b) => team.group === 'solids' ? b.n >= 1 && b.n <= 7 : b.n >= 9 && b.n <= 15).length : null;
      return <div className={`pool-team ${state.turnTeam === side && state.phase === 'aiming' ? 'is-turn' : ''}`} key={side}>
        <div><strong>{label(side)}</strong><small>{team.group ?? 'Open table'}{left !== null ? ` · ${7 - left}/7 cleared` : ''}</small></div>
        <div className="pool-score"><strong>{rackOutlook(state, side)}%</strong><small>rack outlook</small><small>{completed ? `${Math.round(team.racks / completed * 100)}% past rack wins` : 'No completed racks'}</small></div>
      </div>;
    })}
    <p className="pool-race">Race to {state.raceTo} · Rack {state.rack || '—'} · {state.mode === 'doubles' ? 'Scotch doubles' : 'Singles'}</p>
    <p className="pool-race">Outlook is a rough clearance and turn estimate, not measured odds.</p>
    <h2>Live</h2>
    <ol className="pool-feed">{state.history.map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}</ol>
  </aside>;
}
