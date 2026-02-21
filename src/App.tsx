// ============================================================
// Chimera Arena - Main App Component
// Routes to the correct screen based on game phase.
// ============================================================

import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import Lobby from './ui/Lobby';
import WaitingRoom from './ui/WaitingRoom';
import BuildPanel from './ui/BuildPanel';
import RevealScreen from './ui/RevealScreen';
import BattleScreen from './ui/BattleScreen';
import ResultScreen from './ui/ResultScreen';

// ---- Inner router (needs context access) ----

function GameRouter() {
  const { room, phase, error, clearError, connected } = useGame();

  // Not yet in a room and not connected -> show lobby immediately
  // (no connection overlay needed for REST; the lobby handles its own state)

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
    <GameProvider>
      <GameRouter />
    </GameProvider>
  );
}
