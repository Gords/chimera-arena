// ============================================================
// Chimera Arena - Main App Component
// Routes to the correct screen based on game phase.
// ============================================================

import React from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import { GameProvider, useGame } from './context/GameContext';
import Lobby from './ui/Lobby';
import WaitingRoom from './ui/WaitingRoom';
import BuildPanel from './ui/BuildPanel';
import RevealScreen from './ui/RevealScreen';
import BattleScreen from './ui/BattleScreen';
import ResultScreen from './ui/ResultScreen';

// ---- Inner router (needs context access) ----

function GameRouter() {
  const { connected } = useSocket();
  const { room, phase, error, clearError } = useGame();

  // Connection overlay
  if (!connected) {
    return (
      <div className="screen-container">
        <div className="panel" style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--accent-cyan)', marginBottom: 12 }}>
            CONNECTING...
          </h2>
          <p style={{ fontSize: 8, color: 'var(--text-secondary)' }}>
            Establishing link to the arena server
          </p>
        </div>
      </div>
    );
  }

  // Phase routing
  const renderScreen = () => {
    // No room yet -> Lobby
    if (!room) {
      return <Lobby />;
    }

    switch (phase) {
      case 'lobby':
        return <WaitingRoom />;
      case 'build':
        return <BuildPanel />;
      case 'reveal':
        return <RevealScreen />;
      case 'battle':
        return <BattleScreen />;
      case 'result':
        return <ResultScreen />;
      default:
        return <Lobby />;
    }
  };

  return (
    <>
      {/* Floating error toast */}
      {error && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: '#441111',
            border: '2px solid var(--team-red)',
            borderRadius: 4,
            padding: '8px 16px',
            fontSize: 8,
            color: 'var(--team-red)',
            cursor: 'pointer',
            maxWidth: 400,
            textAlign: 'center',
            animation: 'slideInUp 0.3s ease-out',
          }}
          onClick={clearError}
        >
          {error}
        </div>
      )}
      {renderScreen()}
    </>
  );
}

// ---- App (wraps providers) ----

export default function App() {
  return (
    <SocketProvider>
      <GameProvider>
        <GameRouter />
      </GameProvider>
    </SocketProvider>
  );
}
