// ============================================================
// Chimera Arena - Ability Card UI Component
// Displays a single ability card with art, stats, effects.
// ============================================================

import React, { useCallback } from 'react';
import type { AbilityCard } from '../../types';

// ---- Type icons ----

const TYPE_ICONS: Record<string, string> = {
  attack: '\u2694\uFE0F',   // crossed swords
  defense: '\uD83D\uDEE1\uFE0F', // shield
  special: '\u2B50',        // star
};

const TYPE_LABELS: Record<string, string> = {
  attack: 'Attack',
  defense: 'Defense',
  special: 'Special',
};

// ---- Props ----

interface AbilityCardUIProps {
  card: AbilityCard;
  disabled?: boolean;
  onPlay?: () => void;
  showCooldown?: number; // turns remaining
}

export default function AbilityCardUI({
  card,
  disabled = false,
  onPlay,
  showCooldown,
}: AbilityCardUIProps) {
  const handleClick = useCallback(() => {
    if (!disabled && onPlay) {
      onPlay();
    }
  }, [disabled, onPlay]);

  const typeClass = `ability-card-${card.type}`;
  const typeColorClass = `card-type-${card.type}`;

  // ---- Mana diamonds ----
  const manaDiamonds = Array.from({ length: card.manaCost }, (_, i) => (
    <span key={i} style={{ fontSize: 10 }}>
      {'\u25C6'}
    </span>
  ));

  // ---- Effect label ----
  const effectLabel = card.effect
    ? `${formatEffect(card.effect)} ${card.effectDuration}t`
    : null;

  return (
    <div
      className={`ability-card ${typeClass} ${
        disabled ? 'ability-card-disabled' : ''
      }`}
      onClick={handleClick}
      title={card.description}
    >
      {/* Card art */}
      {card.cardArt ? (
        <img
          className="card-art"
          src={
            card.cardArt.startsWith('data:')
              ? card.cardArt
              : card.cardArt.startsWith('http')
              ? card.cardArt
              : undefined
          }
          alt={card.name}
          onError={(e) => {
            // Fallback to placeholder if base64 image fails
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="card-art-placeholder">
          {TYPE_ICONS[card.type] || '\u2728'}
        </div>
      )}

      {/* Card name */}
      <div className="card-name">{card.name}</div>

      {/* Type indicator */}
      <div className={`card-type-indicator ${typeColorClass}`}>
        {TYPE_ICONS[card.type]} {TYPE_LABELS[card.type]}
      </div>

      {/* Mana cost */}
      <div className="card-mana-cost">{manaDiamonds}</div>

      {/* Stats (only show non-zero) */}
      <div className="card-stats">
        {card.damage > 0 && (
          <span className="card-stat-damage">DMG: {card.damage}</span>
        )}
        {card.healing > 0 && (
          <span className="card-stat-healing">HEAL: {card.healing}</span>
        )}
        {card.shield > 0 && (
          <span className="card-stat-shield">SHIELD: {card.shield}</span>
        )}
      </div>

      {/* Effect */}
      {effectLabel && <div className="card-effect">{effectLabel}</div>}

      {/* Cooldown */}
      {card.cooldown > 0 && (
        <div
          className={`card-cooldown ${
            showCooldown && showCooldown > 0 ? 'card-cooldown-active' : ''
          }`}
        >
          {showCooldown && showCooldown > 0
            ? `CD: ${showCooldown} turn${showCooldown > 1 ? 's' : ''}`
            : `CD: ${card.cooldown} turn${card.cooldown > 1 ? 's' : ''}`}
        </div>
      )}
    </div>
  );
}

// ---- Helpers ----

function formatEffect(effect: string): string {
  const labels: Record<string, string> = {
    burn: 'BURN',
    freeze: 'FREEZE',
    poison: 'POISON',
    stun: 'STUN',
    lifesteal: 'LIFESTEAL',
    mana_drain: 'MANA DRAIN',
    reflect: 'REFLECT',
  };
  return labels[effect] || effect.toUpperCase();
}
