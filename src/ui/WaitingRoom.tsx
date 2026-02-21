// ============================================================
// Chimera Arena - Waiting Room (Pre-game lobby)
// Shows room code, team rosters, ready states, start button.
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import type { Player, Team } from '../types';

export default function WaitingRoom() {
  const { socket } = useSocket();
  const { room, player, setReady, startGame } = useGame();
  const [copied, setCopied] = useState(false);

  // ---- Derived data ----

  const players = useMemo(() => {
    if (!room) return [];
    return Object.values(room.players);
  }, [room]);

  const redPlayers = useMemo(
    () => players.filter((p) => p.team === 'red'),
    [players]
  );

  const bluePlayers = useMemo(
    () => players.filter((p) => p.team === 'blue'),
    [players]
  );

  const allReady = useMemo(
    () => players.length >= 2 && players.every((p) => p.ready),
    [players]
  );

  const isHost = useMemo(() => {
    if (!room || !socket?.id) return false;
    // Host is the first player in the red team (room creator)
    return room.teams.red[0] === socket.id;
  }, [room, socket]);

  // ---- Handlers ----

  const handleCopyCode = useCallback(() => {
    if (!room) return;
    navigator.clipboard.writeText(room.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [room]);

  if (!room) return null;

  // ---- Render helpers ----

  const renderPlayerList = (teamPlayers: Player[], team: Team) => (
    <ul className="player-list">
      {teamPlayers.length === 0 && (
        <li className="player-item" style={{ color: 'var(--text-muted)' }}>
          Waiting for player...
        </li>
      )}
      {teamPlayers.map((p) => (
        <li key={p.id} className="player-item">
          <span className="player-name">
            {p.name}
            {p.id === socket?.id ? ' (YOU)' : ''}
          </span>
          <span className={p.ready ? 'player-ready' : 'player-not-ready'}>
            {p.ready ? 'READY' : 'NOT READY'}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="screen-container">
      <div className="waiting-room animate-fade-in">
        <h2 className="screen-title">WAITING ROOM</h2>

        {/* Room code */}
        <div className="waiting-room-code">
          ROOM CODE:{' '}
          <span
            onClick={handleCopyCode}
            style={{ cursor: 'pointer' }}
            title="Click to copy"
          >
            {room.id}
          </span>
          {copied && (
            <span
              style={{
                fontSize: 7,
                color: 'var(--accent-green)',
                marginLeft: 8,
              }}
            >
              COPIED!
            </span>
          )}
        </div>

        {/* Player count */}
        <p className="player-count">
          {players.length} PLAYER{players.length !== 1 ? 'S' : ''} |{' '}
          RED {redPlayers.length} vs BLUE {bluePlayers.length}
        </p>

        {/* Team panels */}
        <div className="teams-container">
          <div className="panel team-panel team-panel-red">
            <h3 className="team-title team-title-red">TEAM RED</h3>
            {renderPlayerList(redPlayers, 'red')}
          </div>
          <div className="panel team-panel team-panel-blue">
            <h3 className="team-title team-title-blue">TEAM BLUE</h3>
            {renderPlayerList(bluePlayers, 'blue')}
          </div>
        </div>

        {/* Actions */}
        <div className="waiting-actions">
          <button
            className={`btn ${player?.ready ? 'btn-red' : 'btn-primary'}`}
            onClick={setReady}
          >
            {player?.ready ? 'UNREADY' : 'READY UP'}
          </button>

          {isHost && (
            <button
              className="btn btn-gold"
              disabled={!allReady}
              onClick={startGame}
              title={
                !allReady
                  ? 'All players must be ready (min 2)'
                  : 'Start the game!'
              }
            >
              START GAME
            </button>
          )}
        </div>

        {!allReady && players.length >= 2 && (
          <p
            style={{
              fontSize: 7,
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            Waiting for all players to ready up...
          </p>
        )}

        {players.length < 2 && (
          <p
            style={{
              fontSize: 7,
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            Need at least 2 players to start
          </p>
        )}
      </div>
    </div>
  );
}
