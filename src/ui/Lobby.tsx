// ============================================================
// Chimera Arena - Lobby Screen
// Create or join a room with a player name.
// ============================================================

import React, { useState, useCallback } from 'react';
import { useGame } from '../context/GameContext';

type LobbyMode = 'menu' | 'create' | 'join';

export default function Lobby() {
  const { createRoom, joinRoom, error } = useGame();

  const [mode, setMode] = useState<LobbyMode>('menu');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ---- Handlers ----

  const handleCreate = useCallback(() => {
    const name = playerName.trim();
    if (!name) return;
    createRoom(name);
    // The room code will appear once room:created fires and room is set.
    // We stay on the same screen; WaitingRoom will render via App routing.
  }, [playerName, createRoom]);

  const handleJoin = useCallback(() => {
    const name = playerName.trim();
    const code = roomCode.trim().toUpperCase();
    if (!name || !code) return;
    joinRoom(code, name);
  }, [playerName, roomCode, joinRoom]);

  const handleCopyCode = useCallback(() => {
    if (createdCode) {
      navigator.clipboard.writeText(createdCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [createdCode]);

  // ---- Render ----

  return (
    <div className="screen-container">
      <div className="lobby-container animate-fade-in">
        {/* Title */}
        <h1 className="lobby-title">CHIMERA ARENA</h1>
        <p className="lobby-subtitle">Multiplayer Turn-Based Card Battler</p>

        {/* Menu mode */}
        {mode === 'menu' && (
          <>
            <div className="lobby-form">
              <input
                className="pixel-input"
                type="text"
                placeholder="ENTER YOUR NAME"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.slice(0, 16))}
                maxLength={16}
                autoFocus
              />
            </div>

            <div className="lobby-mode-toggle">
              <button
                className="btn btn-primary"
                disabled={!playerName.trim()}
                onClick={() => {
                  setMode('create');
                  handleCreate();
                }}
              >
                CREATE ROOM
              </button>
              <button
                className="btn btn-gold"
                disabled={!playerName.trim()}
                onClick={() => setMode('join')}
              >
                JOIN ROOM
              </button>
            </div>
          </>
        )}

        {/* Create mode — we show this while waiting for room:created,
            but App.tsx will swap to WaitingRoom once room is set */}
        {mode === 'create' && (
          <div className="lobby-form animate-slide-in">
            <p
              style={{
                fontSize: 9,
                color: 'var(--text-secondary)',
                textAlign: 'center',
              }}
            >
              Creating room...
            </p>
            <button
              className="btn btn-small"
              onClick={() => setMode('menu')}
            >
              BACK
            </button>
          </div>
        )}

        {/* Join mode */}
        {mode === 'join' && (
          <div className="lobby-form animate-slide-in">
            <input
              className="pixel-input"
              type="text"
              placeholder="ENTER ROOM CODE"
              value={roomCode}
              onChange={(e) =>
                setRoomCode(e.target.value.toUpperCase().slice(0, 6))
              }
              maxLength={6}
              style={{ textAlign: 'center', letterSpacing: 6, fontSize: 14 }}
              autoFocus
            />

            <button
              className="btn btn-gold"
              disabled={!roomCode.trim() || roomCode.trim().length < 4}
              onClick={handleJoin}
            >
              JOIN GAME
            </button>

            <button
              className="btn btn-small"
              onClick={() => {
                setMode('menu');
                setRoomCode('');
              }}
            >
              BACK
            </button>
          </div>
        )}

        {/* Error display */}
        {error && <p className="lobby-error">{error}</p>}

        {/* Created room code display */}
        {createdCode && (
          <div className="animate-slide-in" style={{ width: '100%' }}>
            <p
              style={{
                fontSize: 8,
                color: 'var(--text-secondary)',
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              SHARE THIS CODE WITH YOUR FRIENDS
            </p>
            <div className="room-code-display" onClick={handleCopyCode}>
              {createdCode}
            </div>
            {copied && (
              <p className="room-code-copied">COPIED TO CLIPBOARD!</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
