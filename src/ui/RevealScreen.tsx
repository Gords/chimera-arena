// ============================================================
// Chimera Arena - Reveal Screen
// Shows the AI-generated chimera, stats, cards, passive.
// ============================================================

import React, { useMemo } from 'react';
import { useGame } from '../context/GameContext';
import AbilityCardUI from './components/AbilityCardUI';
import HPBar from './components/HPBar';
import ManaBar from './components/ManaBar';

export default function RevealScreen() {
  const { room, myTeam, chimeras, acceptChimera, generating } = useGame();

  // ---- Derived state ----

  const myChimera = useMemo(() => {
    if (!chimeras || !myTeam) return null;
    return chimeras[myTeam];
  }, [chimeras, myTeam]);

  const accepted = useMemo(() => {
    if (!room || !myTeam) return false;
    return room.accepted[myTeam];
  }, [room, myTeam]);

  const otherAccepted = useMemo(() => {
    if (!room || !myTeam) return false;
    const otherTeam = myTeam === 'red' ? 'blue' : 'red';
    return room.accepted[otherTeam];
  }, [room, myTeam]);

  const bothAccepted = accepted && otherAccepted;

  // ---- Generating state ----

  if (generating || !myChimera) {
    return (
      <div className="screen-container">
        <div className="reveal-generating">
          AI IS FORGING YOUR CHIMERA...
          <br />
          <span style={{ fontSize: 8, color: 'var(--text-secondary)' }}>
            Interpreting your team's wild creations
          </span>
        </div>
      </div>
    );
  }

  // ---- Render ----

  return (
    <div className="screen-container">
      <div className="reveal-container animate-fade-in">
        <h2 className="screen-title">YOUR CHIMERA IS BORN!</h2>

        <div className="reveal-chimera">
          {/* Sprite */}
          {myChimera.sprite ? (
            <img
              className="reveal-sprite"
              src={
                myChimera.sprite.startsWith('data:')
                  ? myChimera.sprite
                  : `data:image/png;base64,${myChimera.sprite}`
              }
              alt={myChimera.name}
            />
          ) : (
            <div className="reveal-sprite-placeholder">
              NO SPRITE
            </div>
          )}

          {/* Name & description */}
          <h3 className="reveal-name">{myChimera.name}</h3>
          <p className="reveal-description">{myChimera.description}</p>

          {/* Stats */}
          <div className="reveal-stats">
            <div className="reveal-stat">
              <span style={{ color: 'var(--hp-green)' }}>HP</span>
              <HPBar
                current={myChimera.stats.hp}
                max={myChimera.stats.maxHp}
                showNumbers
              />
            </div>
            <div className="reveal-stat">
              <span style={{ color: 'var(--mana-fill)' }}>MANA</span>
              <ManaBar
                current={myChimera.stats.mana}
                max={myChimera.stats.maxMana}
              />
            </div>
            <div className="reveal-stat">
              <span className="reveal-stat-label">REGEN</span>
              <span style={{ color: 'var(--accent-cyan)' }}>
                +{myChimera.stats.manaRegen}/turn
              </span>
            </div>
          </div>

          {/* Ability Cards */}
          <div className="reveal-cards-row">
            {myChimera.cards.map((card) => (
              <AbilityCardUI key={card.id} card={card} />
            ))}
          </div>

          {/* Passive Ability */}
          <div className="reveal-passive">
            <span className="reveal-passive-name">
              {myChimera.passiveAbility.name}:
            </span>
            {myChimera.passiveAbility.description}
          </div>
        </div>

        {/* Accept button */}
        {!accepted ? (
          <button className="btn btn-gold" onClick={acceptChimera}>
            ACCEPT CHIMERA
          </button>
        ) : !bothAccepted ? (
          <p className="reveal-waiting">
            WAITING FOR OTHER TEAM TO ACCEPT...
          </p>
        ) : (
          <p className="reveal-waiting">ENTERING BATTLE...</p>
        )}
      </div>
    </div>
  );
}
