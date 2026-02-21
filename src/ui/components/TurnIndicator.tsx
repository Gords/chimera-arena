// ============================================================
// Chimera Arena - Turn Indicator Component
// Shows whose turn it is, turn number, and countdown timer.
// ============================================================

import React from 'react';

interface TurnIndicatorProps {
  isMyTurn: boolean;
  turnNumber: number;
  timeRemaining: number;
}

export default function TurnIndicator({
  isMyTurn,
  turnNumber,
  timeRemaining,
}: TurnIndicatorProps) {
  const isUrgent = timeRemaining <= 10;

  return (
    <div className="turn-indicator">
      <div
        className={`turn-label ${
          isMyTurn ? 'turn-label-yours' : 'turn-label-opponent'
        }`}
      >
        {isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN"}
      </div>
      <div className="turn-number">TURN {turnNumber}</div>
      <div
        className={`turn-timer ${isUrgent ? 'turn-timer-urgent' : ''}`}
      >
        {timeRemaining}s
      </div>
    </div>
  );
}
