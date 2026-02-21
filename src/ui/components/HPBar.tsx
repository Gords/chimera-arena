// ============================================================
// Chimera Arena - HP Bar Component
// Pixel-art health bar with color transitions.
// ============================================================

import React, { useMemo } from 'react';

interface HPBarProps {
  current: number;
  max: number;
  showNumbers?: boolean;
}

export default function HPBar({ current, max, showNumbers = false }: HPBarProps) {
  const percentage = useMemo(
    () => Math.max(0, Math.min(100, (current / max) * 100)),
    [current, max]
  );

  const color = useMemo(() => {
    if (percentage > 60) return 'var(--hp-green)';
    if (percentage > 30) return 'var(--hp-yellow)';
    return 'var(--hp-red)';
  }, [percentage]);

  return (
    <div className="hp-bar-container">
      <div className="hp-bar">
        <div
          className="hp-bar-fill"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
      {showNumbers && (
        <span className="hp-bar-text">
          {current}/{max}
        </span>
      )}
    </div>
  );
}
