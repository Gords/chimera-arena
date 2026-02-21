// ============================================================
// Chimera Arena - Result Screen
// Winner announcement, final stats, rematch options.
// ============================================================

import React, { useMemo } from 'react';
import { useGame } from '../context/GameContext';
import type { Team } from '../types';

export default function ResultScreen() {
  const { room, myTeam, chimeras, battleState, winner, returnToLobby } =
    useGame();

  // ---- Derived data ----

  const isWinner = winner === myTeam;

  const redChimera = chimeras?.red ?? null;
  const blueChimera = chimeras?.blue ?? null;

  const redBattle = battleState?.redChimera ?? null;
  const blueBattle = battleState?.blueChimera ?? null;

  const totalTurns = battleState?.turn ?? 0;

  const logStats = useMemo(() => {
    if (!battleState) return { redDmg: 0, blueDmg: 0, redHeal: 0, blueHeal: 0 };

    let redDmg = 0;
    let blueDmg = 0;
    let redHeal = 0;
    let blueHeal = 0;

    for (const entry of battleState.log) {
      if (entry.team === 'red') {
        redDmg += entry.result.damage;
        redHeal += entry.result.healing;
      } else {
        blueDmg += entry.result.damage;
        blueHeal += entry.result.healing;
      }
    }

    return { redDmg, blueDmg, redHeal, blueHeal };
  }, [battleState]);

  // ---- Render ----

  return (
    <div className="screen-container">
      <div className="result-container animate-fade-in">
        {/* Winner announcement */}
        <h1
          className={`result-winner ${
            winner === 'red' ? 'result-winner-red' : 'result-winner-blue'
          }`}
        >
          {winner?.toUpperCase()} TEAM WINS!
        </h1>

        {isWinner !== null && (
          <p
            style={{
              fontSize: 10,
              color: isWinner ? 'var(--accent-gold)' : 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            {isWinner ? 'VICTORY!' : 'DEFEAT...'}
          </p>
        )}

        {/* Final stats comparison */}
        <div className="panel" style={{ width: '100%' }}>
          <h3
            style={{
              textAlign: 'center',
              color: 'var(--accent-cyan)',
              marginBottom: 16,
            }}
          >
            BATTLE SUMMARY
          </h3>

          <div className="result-stats">
            {/* Red column */}
            <div className="result-stat-col">
              <span
                className="result-stat-value"
                style={{ color: 'var(--team-red)' }}
              >
                {redChimera?.name ?? 'Red Chimera'}
              </span>

              <div>
                <span className="result-stat-label">FINAL HP: </span>
                <span
                  className="result-stat-value"
                  style={{
                    color:
                      redBattle && redBattle.hp > 0
                        ? 'var(--hp-green)'
                        : 'var(--hp-red)',
                  }}
                >
                  {redBattle?.hp ?? 0}/{redChimera?.stats.maxHp ?? 0}
                </span>
              </div>

              <div>
                <span className="result-stat-label">TOTAL DAMAGE: </span>
                <span className="result-stat-value" style={{ color: 'var(--team-red)' }}>
                  {logStats.redDmg}
                </span>
              </div>

              <div>
                <span className="result-stat-label">TOTAL HEALING: </span>
                <span className="result-stat-value" style={{ color: 'var(--accent-green)' }}>
                  {logStats.redHeal}
                </span>
              </div>
            </div>

            {/* Divider */}
            <div
              style={{
                width: 2,
                background: 'var(--pixel-border)',
                alignSelf: 'stretch',
              }}
            />

            {/* Blue column */}
            <div className="result-stat-col">
              <span
                className="result-stat-value"
                style={{ color: 'var(--team-blue)' }}
              >
                {blueChimera?.name ?? 'Blue Chimera'}
              </span>

              <div>
                <span className="result-stat-label">FINAL HP: </span>
                <span
                  className="result-stat-value"
                  style={{
                    color:
                      blueBattle && blueBattle.hp > 0
                        ? 'var(--hp-green)'
                        : 'var(--hp-red)',
                  }}
                >
                  {blueBattle?.hp ?? 0}/{blueChimera?.stats.maxHp ?? 0}
                </span>
              </div>

              <div>
                <span className="result-stat-label">TOTAL DAMAGE: </span>
                <span className="result-stat-value" style={{ color: 'var(--team-red)' }}>
                  {logStats.blueDmg}
                </span>
              </div>

              <div>
                <span className="result-stat-label">TOTAL HEALING: </span>
                <span className="result-stat-value" style={{ color: 'var(--accent-green)' }}>
                  {logStats.blueHeal}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              textAlign: 'center',
              marginTop: 12,
              fontSize: 8,
              color: 'var(--text-muted)',
            }}
          >
            TOTAL TURNS: {totalTurns} | CARDS PLAYED: {battleState?.log.length ?? 0}
          </div>
        </div>

        {/* Actions */}
        <div className="result-actions">
          <button className="btn btn-gold" onClick={returnToLobby}>
            PLAY AGAIN
          </button>
          <button
            className="btn"
            onClick={() => {
              // Reload to go back to lobby from scratch
              window.location.reload();
            }}
          >
            BACK TO LOBBY
          </button>
        </div>
      </div>
    </div>
  );
}
