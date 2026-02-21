// ============================================================
// Chimera Arena - Battle Log Component
// Scrollable list of battle events, color-coded by team.
// ============================================================

import React, { useEffect, useRef } from 'react';
import type { BattleLogEntry } from '../../types';

interface BattleLogProps {
  log: BattleLogEntry[];
}

export default function BattleLog({ log }: BattleLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  if (log.length === 0) {
    return (
      <div className="battle-log">
        <div
          style={{
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: 12,
          }}
        >
          BATTLE LOG
          <br />
          No actions yet...
        </div>
      </div>
    );
  }

  return (
    <div className="battle-log">
      {log.map((entry, idx) => {
        const teamClass =
          entry.team === 'red'
            ? 'battle-log-entry-red'
            : 'battle-log-entry-blue';

        const result = entry.result;
        const parts: string[] = [];

        if (result.damage > 0) {
          parts.push(`${result.damage} DMG`);
        }
        if (result.healing > 0) {
          parts.push(`${result.healing} HEAL`);
        }
        if (result.shieldGained > 0) {
          parts.push(`+${result.shieldGained} SHIELD`);
        }
        if (result.effectApplied) {
          parts.push(result.effectApplied.toUpperCase());
        }
        if (result.reflectDamage && result.reflectDamage > 0) {
          parts.push(`${result.reflectDamage} REFLECTED`);
        }
        if (result.manaDrained && result.manaDrained > 0) {
          parts.push(`${result.manaDrained} MANA DRAINED`);
        }

        return (
          <div key={idx} className={`battle-log-entry ${teamClass}`}>
            <span className="battle-log-turn">T{entry.turn}</span>{' '}
            <span
              style={{
                color:
                  entry.team === 'red'
                    ? 'var(--team-red)'
                    : 'var(--team-blue)',
              }}
            >
              {entry.team.toUpperCase()}
            </span>{' '}
            <span className="battle-log-card">{entry.card}</span>
            {parts.length > 0 && (
              <>
                {' '}
                <span style={{ color: 'var(--text-secondary)' }}>
                  {' - '}
                </span>
                {parts.map((part, pIdx) => {
                  let className = '';
                  if (part.includes('DMG')) className = 'battle-log-damage';
                  else if (part.includes('HEAL'))
                    className = 'battle-log-heal';
                  else if (part.includes('SHIELD'))
                    className = 'battle-log-shield';
                  else className = 'battle-log-effect';

                  return (
                    <span key={pIdx}>
                      {pIdx > 0 && ', '}
                      <span className={className}>{part}</span>
                    </span>
                  );
                })}
              </>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
