// ============================================================
// Chimera Arena - Battle Screen
// Main battle view: enemy info, arena canvas, your cards.
// ============================================================

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import { useSocket } from '../context/SocketContext';
import { useBattleCanvas } from '../hooks/useBattleCanvas';
import HPBar from './components/HPBar';
import ManaBar from './components/ManaBar';
import CardHand from './components/CardHand';
import TurnIndicator from './components/TurnIndicator';
import BattleLog from './components/BattleLog';
import type { Team, Chimera, ChimeraBattleState, StatusEffect } from '../types';

const TURN_DURATION = 15;

export default function BattleScreen() {
  const { room, myTeam, chimeras, battleState, playCard, endTurn } = useGame();
  const { socket } = useSocket();

  const [logOpen, setLogOpen] = useState(false);
  const [turnTimer, setTurnTimer] = useState(TURN_DURATION);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ---- Derived state ----

  const enemyTeam: Team = myTeam === 'red' ? 'blue' : 'red';

  const myChimera: Chimera | null = chimeras?.[myTeam!] ?? null;
  const enemyChimera: Chimera | null = chimeras?.[enemyTeam] ?? null;

  // Mount PixiJS battle canvas with attack sprite animations
  const battleBackground = room?.battleBackground ?? '';
  useBattleCanvas(canvasRef, socket, myTeam, myChimera, enemyChimera, battleBackground);

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
      if (isMyTurn) {
        playCard(cardId);
      }
    },
    [isMyTurn, playCard]
  );

  const handleEndTurn = useCallback(() => {
    if (isMyTurn) {
      endTurn();
    }
  }, [isMyTurn, endTurn]);

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

      {/* ---- Middle: Arena canvas (PixiJS mounts here) ---- */}
      <div className="battle-arena">
        <div
          id="battle-canvas"
          ref={canvasRef}
          style={{ width: '100%', height: '100%' }}
        />
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
              disabled={!isMyTurn}
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
            isMyTurn={isMyTurn}
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
