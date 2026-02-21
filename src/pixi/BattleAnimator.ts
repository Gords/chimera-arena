import { ArenaStage } from './ArenaStage.js';
import { spawnPixelParticles } from './PixelParticles.js';
import { showDamageNumber } from './DamageNumbers.js';
import { screenShake } from './ScreenShake.js';
import { animateCardToCenter, showAbilityName } from './CardAnimation.js';
import type { AbilityCard, CardResult } from '../types.js';

export class BattleAnimator {
  private stage: ArenaStage;

  constructor(stage: ArenaStage) {
    this.stage = stage;
  }

  /**
   * Orchestrate the full animation sequence for playing a card.
   *
   * Flow:
   * 1. Flash ability name on screen
   * 2. Play card fly-in animation
   * 3. Attacker performs attack/defend/special animation
   * 4. Spawn damage particles + shake + hurt on defender
   * 5. Spawn shield particles on attacker if shield gained
   * 6. Spawn heal particles on attacker if healing
   * 7. Spawn status effect particles on defender
   * 8. Handle reflect damage back to attacker
   * 9. Handle mana drain display
   * 10. Brief pause before next action
   */
  async animateCardPlay(
    card: AbilityCard,
    isPlayerAttacking: boolean,
    result: CardResult
  ): Promise<void> {
    const attacker = isPlayerAttacking
      ? this.stage.getPlayerSprite()
      : this.stage.getEnemySprite();
    const defender = isPlayerAttacking
      ? this.stage.getEnemySprite()
      : this.stage.getPlayerSprite();

    if (!attacker || !defender) return;

    const container = this.stage.getParticleContainer();
    const app = this.stage.app;
    const stageWidth = app.screen.width;
    const stageHeight = app.screen.height;

    // 1. Ability name flash on screen
    await showAbilityName(container, card.name, stageWidth, stageHeight);

    // 2. Card fly-in animation
    await animateCardToCenter(
      container,
      card.name,
      card.type,
      stageWidth,
      stageHeight
    );

    // 3. Attacker animation based on card type
    if (card.type === 'special') {
      await attacker.specialAnimation();
    } else if (card.type === 'attack') {
      await attacker.attackAnimation(!isPlayerAttacking);
    } else {
      await attacker.defendAnimation();
    }

    // 4. Damage effects on defender
    if (result.damage > 0) {
      spawnPixelParticles(
        container,
        defender.sprite.x,
        defender.sprite.y - 40,
        'hit'
      );
      screenShake(app.stage, Math.min(result.damage / 5, 10));
      await defender.hurtAnimation();
      showDamageNumber(
        container,
        defender.sprite.x,
        defender.sprite.y - 60,
        result.damage,
        'damage'
      );
    }

    // 5. Shield effects on attacker
    if (result.shieldGained > 0) {
      spawnPixelParticles(
        container,
        attacker.sprite.x,
        attacker.sprite.y - 40,
        'shield'
      );
      showDamageNumber(
        container,
        attacker.sprite.x,
        attacker.sprite.y - 60,
        result.shieldGained,
        'shield'
      );
    }

    // 6. Healing effects on attacker
    if (result.healing > 0) {
      spawnPixelParticles(
        container,
        attacker.sprite.x,
        attacker.sprite.y - 40,
        'heal'
      );
      showDamageNumber(
        container,
        attacker.sprite.x,
        attacker.sprite.y - 60,
        result.healing,
        'heal'
      );
    }

    // 7. Status effect particles on defender
    if (result.effectApplied) {
      spawnPixelParticles(
        container,
        defender.sprite.x,
        defender.sprite.y - 40,
        result.effectApplied
      );
    }

    // 8. Reflect damage back to attacker
    if (result.reflectDamage && result.reflectDamage > 0) {
      await new Promise((r) => setTimeout(r, 200));
      spawnPixelParticles(
        container,
        attacker.sprite.x,
        attacker.sprite.y - 40,
        'reflect'
      );
      await attacker.hurtAnimation();
      showDamageNumber(
        container,
        attacker.sprite.x,
        attacker.sprite.y - 60,
        result.reflectDamage,
        'damage'
      );
    }

    // 9. Mana drain display
    if (result.manaDrained && result.manaDrained > 0) {
      spawnPixelParticles(
        container,
        defender.sprite.x,
        defender.sprite.y - 40,
        'mana_drain'
      );
      showDamageNumber(
        container,
        defender.sprite.x,
        defender.sprite.y - 60,
        result.manaDrained,
        'mana'
      );
    }

    // 10. Brief pause before next action
    await new Promise((r) => setTimeout(r, 500));
  }

  /**
   * Play the death animation for a chimera.
   */
  async animateDeath(isPlayer: boolean): Promise<void> {
    const sprite = isPlayer
      ? this.stage.getPlayerSprite()
      : this.stage.getEnemySprite();
    if (sprite) {
      await sprite.deathAnimation();
    }
  }
}
