// ============================================================
// Chimera Arena - Card Hand (Slay the Spire-style fan layout)
// Displays 3 ability cards with tilt/offset fan effect.
// ============================================================

import React, { useCallback } from 'react';
import AbilityCardUI from './AbilityCardUI';
import type { AbilityCard } from '../../types';

interface CardHandProps {
  cards: AbilityCard[];
  mana: number;
  cooldowns: Record<string, number>;
  isMyTurn: boolean;
  onPlayCard: (cardId: string) => void;
}

export default function CardHand({
  cards,
  mana,
  cooldowns,
  isMyTurn,
  onPlayCard,
}: CardHandProps) {
  const isCardDisabled = useCallback(
    (card: AbilityCard): boolean => {
      if (!isMyTurn) return true;
      if (card.manaCost > mana) return true;
      const cd = cooldowns[card.id];
      if (cd && cd > 0) return true;
      return false;
    },
    [isMyTurn, mana, cooldowns]
  );

  return (
    <div className="card-hand">
      {cards.map((card) => {
        const disabled = isCardDisabled(card);
        const cd = cooldowns[card.id] || 0;

        return (
          <div key={card.id} className="card-hand-slot">
            <AbilityCardUI
              card={card}
              disabled={disabled}
              onPlay={() => onPlayCard(card.id)}
              showCooldown={cd}
            />
          </div>
        );
      })}
    </div>
  );
}
