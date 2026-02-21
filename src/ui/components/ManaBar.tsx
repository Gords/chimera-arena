// ============================================================
// Chimera Arena - Mana Bar Component
// Diamond/crystal symbols: filled = available, empty = spent.
// ============================================================

import React from 'react';

interface ManaBarProps {
  current: number;
  max: number;
}

export default function ManaBar({ current, max }: ManaBarProps) {
  const crystals = Array.from({ length: max }, (_, i) => {
    const filled = i < current;
    return (
      <div
        key={i}
        className={`mana-crystal ${
          filled ? 'mana-crystal-filled' : 'mana-crystal-empty'
        }`}
      />
    );
  });

  return (
    <div className="mana-bar">
      {crystals}
      <span className="mana-text">
        {current}/{max}
      </span>
    </div>
  );
}
