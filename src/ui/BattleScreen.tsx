// ============================================================
// Chimera Arena - Battle Screen
// Main battle view: enemy info, arena canvas, your cards.
// ============================================================

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import HPBar from './components/HPBar';
import ManaBar from './components/ManaBar';
import CardHand from './components/CardHand';
import TurnIndicator from './components/TurnIndicator';
import BattleLog from './components/BattleLog';
import type { Team, Chimera, ChimeraBattleState, StatusEffect } from '../types';

const TURN_DURATION = 15;

export default function BattleScreen() {
  const { room, myTeam, chimeras, battleState, playCard, endTurn, cardPlaying } = useGame();

  const [logOpen, setLogOpen] = useState(false);
  const [turnTimer, setTurnTimer] = useState(TURN_DURATION);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ---- Derived state ----

  const enemyTeam: Team = myTeam === 'red' ? 'blue' : 'red';

  const myChimera: Chimera | null = chimeras?.[myTeam!] ?? null;
  const enemyChimera: Chimera | null = chimeras?.[enemyTeam] ?? null;

  const myBattleState: ChimeraBattleState | null = useMemo(() => {
    if (!battleState || !myTeam) return null;
    return myTeam === 'red' ? battleState.redChimera : battleState.blueChimera;
  }, [battleState, myTeam]);

  const enemyBattleState: ChimeraBattleState | null = useMemo(() => {
    if (!battleState) return null;
    return enemyTeam === 'red'
      ? battleState.redChimera
      : battleState.blueChimera;
  }, [battleState, enemyTeam]);

  const isMyTurn = useMemo(() => {
    return battleState?.activeTeam === myTeam;
  }, [battleState, myTeam]);

  // Cards are only playable when it's our turn AND no card play is in flight
  const canPlayCards = isMyTurn && !cardPlaying;

  const turnNumber = battleState?.turn ?? 1;
  const log = battleState?.log ?? [];

  // ---- Turn timer countdown ----

  useEffect(() => {
    // Reset timer when active team changes
    setTurnTimer(TURN_DURATION);
  }, [battleState?.activeTeam, battleState?.turn]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTurnTimer((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ---- Handlers ----

  const handlePlayCard = useCallback(
    (cardId: string) => {
      if (canPlayCards) {
        playCard(cardId);
      }
    },
    [canPlayCards, playCard]
  );

  const handleEndTurn = useCallback(() => {
    if (canPlayCards) {
      endTurn();
    }
  }, [canPlayCards, endTurn]);

  // ---- Guard ----

  if (!battleState || !myChimera || !enemyChimera || !myBattleState || !enemyBattleState) {
    return (
      <div className="screen-container">
        <p style={{ color: 'var(--text-muted)' }}>Loading battle...</p>
      </div>
    );
  }

  // ---- Render helpers ----

  const renderStatusEffects = (effects: StatusEffect[]) => {
    if (effects.length === 0) return null;
    return (
      <div className="battle-status-effects">
        {effects.map((eff, idx) => {
          const statusClass = `status-${eff.type}`;
          return (
            <span
              key={`${eff.type}-${idx}`}
              className={`status-effect-badge ${statusClass}`}
            >
              {formatStatusLabel(eff.type)} {eff.duration}t
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="battle-screen">
      {/* ---- Top: Enemy info ---- */}
      <div className="battle-top">
        <div className="battle-chimera-info">
          <div
            className={`battle-chimera-name battle-chimera-name-${enemyTeam}`}
          >
            {enemyChimera.name}
          </div>
          <HPBar
            current={enemyBattleState.hp}
            max={enemyChimera.stats.maxHp}
            showNumbers
          />
          <ManaBar
            current={enemyBattleState.mana}
            max={enemyChimera.stats.maxMana}
          />
          {enemyBattleState.shield > 0 && (
            <span
              style={{ fontSize: 8, color: 'var(--team-blue)' }}
            >
              SHIELD: {enemyBattleState.shield}
            </span>
          )}
          {renderStatusEffects(enemyBattleState.statusEffects)}
        </div>

        <TurnIndicator
          isMyTurn={isMyTurn}
          turnNumber={turnNumber}
          timeRemaining={turnTimer}
        />
      </div>

      {/* ---- Middle: Arena canvas ---- */}
      <div className="battle-arena">
        <div id="battle-canvas" ref={canvasRef}>
          {/* Pixi.js mounts here. Fallback display: */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-around',
              width: '100%',
              height: '100%',
              minHeight: 320,
              background:
                'linear-gradient(180deg, #0a0a20 0%, #1a1a3e 50%, #0f2020 100%)',
              padding: '20px 40px',
            }}
          >
            {/* Your chimera sprite */}
            <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              {myChimera.sprite ? (
                <img
                  src={
                    myChimera.sprite.startsWith('data:')
                      ? myChimera.sprite
                      : `data:image/png;base64,${myChimera.sprite}`
                  }
                  alt={myChimera.name}
                  style={{
                    maxHeight: '80%',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    imageRendering: 'pixelated',
                    animation: 'float 3s ease-in-out infinite',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 128,
                    height: 128,
                    background: 'var(--bg-secondary)',
                    border: '3px solid var(--pixel-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8,
                    color: 'var(--text-muted)',
                  }}
                >
                  YOUR
                  <br />
                  CHIMERA
                </div>
              )}
              <div
                style={{
                  fontSize: 7,
                  color: myTeam === 'red' ? 'var(--team-red)' : 'var(--team-blue)',
                  marginTop: 4,
                }}
              >
                {myChimera.name}
              </div>
            </div>

            {/* VS indicator */}
            <div
              style={{
                fontSize: 16,
                color: 'var(--accent-gold)',
                textShadow: '0 0 10px rgba(255, 215, 0, 0.5)',
                alignSelf: 'center',
                flexShrink: 0,
                padding: '0 10px',
              }}
            >
              VS
            </div>

            {/* Enemy chimera sprite */}
            <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              {enemyChimera.sprite ? (
                <img
                  src={
                    enemyChimera.sprite.startsWith('data:')
                      ? enemyChimera.sprite
                      : `data:image/png;base64,${enemyChimera.sprite}`
                  }
                  alt={enemyChimera.name}
                  style={{
                    maxHeight: '80%',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    imageRendering: 'pixelated',
                    animation: 'float 3s ease-in-out infinite',
                    animationDelay: '1.5s',
                    transform: 'scaleX(-1)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 128,
                    height: 128,
                    background: 'var(--bg-secondary)',
                    border: '3px solid var(--pixel-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8,
                    color: 'var(--text-muted)',
                  }}
                >
                  ENEMY
                  <br />
                  CHIMERA
                </div>
              )}
              <div
                style={{
                  fontSize: 7,
                  color:
                    enemyTeam === 'red'
                      ? 'var(--team-red)'
                      : 'var(--team-blue)',
                  marginTop: 4,
                }}
              >
                {enemyChimera.name}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Bottom: Your info + cards ---- */}
      <div className="battle-bottom">
        <div className="battle-your-info">
          <div className="battle-chimera-info">
            <div
              className={`battle-chimera-name battle-chimera-name-${myTeam}`}
            >
              {myChimera.name} (YOU)
            </div>
            <HPBar
              current={myBattleState.hp}
              max={myChimera.stats.maxHp}
              showNumbers
            />
            <ManaBar
              current={myBattleState.mana}
              max={myChimera.stats.maxMana}
            />
            {myBattleState.shield > 0 && (
              <span
                style={{ fontSize: 8, color: 'var(--team-blue)' }}
              >
                SHIELD: {myBattleState.shield}
              </span>
            )}
            {renderStatusEffects(myBattleState.statusEffects)}
          </div>

          <div className="end-turn-wrapper">
            <button
              className="btn btn-primary end-turn-btn"
              disabled={!canPlayCards}
              onClick={handleEndTurn}
            >
              END TURN
            </button>
            {isMyTurn && (
              <span className={`end-turn-timer${turnTimer <= 5 ? ' end-turn-timer-critical' : ''}`}>
                {turnTimer}s
              </span>
            )}
          </div>
        </div>

        {/* Card hand */}
        <div className="battle-controls">
          <CardHand
            cards={myChimera.cards}
            mana={myBattleState.mana}
            cooldowns={myBattleState.cooldowns}
            isMyTurn={canPlayCards}
            onPlayCard={handlePlayCard}
          />
        </div>
      </div>

      {/* ---- Battle log toggle ---- */}
      <button
        className="btn btn-small battle-log-toggle"
        onClick={() => setLogOpen(!logOpen)}
      >
        {logOpen ? 'CLOSE LOG' : 'BATTLE LOG'}
      </button>

      {/* ---- Battle log sidebar ---- */}
      <div
        className={`battle-sidebar ${logOpen ? 'battle-sidebar-open' : ''}`}
      >
        <BattleLog log={log} />
      </div>
    </div>
  );
}

// ---- Helpers ----

function formatStatusLabel(type: string): string {
  const labels: Record<string, string> = {
    burn: 'BURN',
    freeze: 'FREEZE',
    poison: 'POISON',
    stun: 'STUN',
    lifesteal: 'LIFESTEAL',
    mana_drain: 'DRAIN',
    reflect: 'REFLECT',
  };
  return labels[type] || type.toUpperCase();
}
