// ============================================================
// BattleController - Bridges game state to the Pixi renderer
// Queues animations so rapid server updates play out in order.
// ============================================================

import type { AbilityCard, CardResult, Team } from '../types.js';
import type { ArenaStage } from '../pixi/ArenaStage.js';
import type { BattleAnimator } from '../pixi/BattleAnimator.js';

export class BattleController {
  private stage: ArenaStage;
  private animator: BattleAnimator;
  private myTeam: Team;
  private isAnimating: boolean = false;
  private animationQueue: Array<() => Promise<void>> = [];

  constructor(stage: ArenaStage, animator: BattleAnimator, myTeam: Team) {
    this.stage = stage;
    this.animator = animator;
    this.myTeam = myTeam;
  }

  /**
   * Queue a card-play animation. If nothing is currently animating it
   * plays immediately; otherwise it is appended to the queue.
   */
  async onCardPlayed(
    team: Team,
    card: AbilityCard,
    result: CardResult,
  ): Promise<void> {
    const isPlayerAttacking = team === this.myTeam;

    const animate = async () => {
      this.isAnimating = true;
      await this.animator.animateCardPlay(card, isPlayerAttacking, result);
      this.isAnimating = false;
      this.processQueue();
    };

    if (this.isAnimating) {
      this.animationQueue.push(animate);
    } else {
      await animate();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.animationQueue.length > 0) {
      const next = this.animationQueue.shift()!;
      await next();
    }
  }

  /** Play the end-of-battle death animation for the losing chimera. */
  async onBattleEnd(winner: Team | 'draw'): Promise<void> {
    if (winner === 'draw') return;
    const loserIsPlayer = winner !== this.myTeam;
    await this.animator.animateDeath(loserIsPlayer);
  }

  /** Whether an animation is currently in flight. */
  getIsAnimating(): boolean {
    return this.isAnimating;
  }

  /** Clean up resources. */
  destroy(): void {
    this.animationQueue = [];
    this.stage.destroy();
  }
}
