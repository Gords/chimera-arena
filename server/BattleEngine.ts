import {
  Team,
  BattleState,
  ChimeraBattleState,
  StatusEffect,
  Chimera,
  AbilityCard,
  CardResult,
  BattleLogEntry,
  Room,
} from './types.js';

// ============================================================
// Chimera Arena — Server-Side Battle Engine
// Fully authoritative: clients send requests, server validates
// and resolves all game logic.
// ============================================================

const TURN_TIMER_SECONDS = 30;
const MAX_TURNS = 20;
const POISON_DAMAGE_PER_STACK = 4;
const BURN_DAMAGE = 3;
const BURN_HEALING_PENALTY = 0.5;
const FREEZE_DAMAGE_BONUS = 0.25;
const REFLECT_RATIO = 0.3;
const LIFESTEAL_RATIO = 0.5;
const SHIELD_DECAY_RATIO = 0.5;
const MANA_DRAIN_AMOUNT = 1;

export class BattleEngine {
  private room: Room;
  private state: BattleState;
  private turnTimerHandle: NodeJS.Timeout | null = null;
  private onStateChange: (state: BattleState) => void;
  private onBattleEnd: (winner: Team | 'draw') => void;

  constructor(
    room: Room,
    onStateChange: (state: BattleState) => void,
    onBattleEnd: (winner: Team | 'draw') => void,
  ) {
    this.room = room;
    this.onStateChange = onStateChange;
    this.onBattleEnd = onBattleEnd;

    // Initialize a blank state; startBattle() fills it properly.
    this.state = {
      turn: 0,
      activeTeam: 'red',
      turnTimer: TURN_TIMER_SECONDS,
      redChimera: this.emptyChimeraBattleState(),
      blueChimera: this.emptyChimeraBattleState(),
      log: [],
    };
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /**
   * Initialize battle state from room chimeras and begin turn 1.
   * Red team goes first.
   */
  startBattle(): BattleState {
    const redChimera = this.room.chimeras.red;
    const blueChimera = this.room.chimeras.blue;

    if (!redChimera || !blueChimera) {
      throw new Error('Both teams must have a chimera to start battle');
    }

    this.state = {
      turn: 1,
      activeTeam: 'red',
      turnTimer: TURN_TIMER_SECONDS,
      redChimera: {
        hp: redChimera.stats.maxHp,
        mana: redChimera.stats.manaRegen, // start with one turn's worth
        shield: 0,
        statusEffects: [],
        cooldowns: {},
      },
      blueChimera: {
        hp: blueChimera.stats.maxHp,
        mana: blueChimera.stats.manaRegen,
        shield: 0,
        statusEffects: [],
        cooldowns: {},
      },
      log: [],
    };

    this.room.battleState = this.state;
    this.startTurnTimer();
    this.onStateChange(this.state);

    return this.state;
  }

  /**
   * Attempt to play a card for the given team.
   * Returns success/failure with optional error message and result.
   */
  playCard(
    team: Team,
    cardId: string,
  ): { success: boolean; error?: string; result?: CardResult } {
    // 1. Validate it's this team's turn
    if (team !== this.state.activeTeam) {
      return { success: false, error: 'Not your turn' };
    }

    // 2. Find the card on the team's chimera
    const chimera = this.room.chimeras[team];
    if (!chimera) {
      return { success: false, error: 'No chimera found for team' };
    }
    const card = chimera.cards.find((c) => c.id === cardId);
    if (!card) {
      return { success: false, error: 'Card not found' };
    }

    // 3. Check mana cost
    const battleState = this.getTeamState(team);
    if (battleState.mana < card.manaCost) {
      return { success: false, error: 'Not enough mana' };
    }

    // 4. Check cooldown
    const cd = battleState.cooldowns[cardId] ?? 0;
    if (cd > 0) {
      return { success: false, error: `On cooldown (${cd} turns remaining)` };
    }

    // 5. Spend mana
    battleState.mana -= card.manaCost;

    // 6. Resolve card effects
    const result = this.resolveCard(team, card);

    // 7. Set cooldown (cooldown value represents number of turns
    //    before the card can be used again AFTER this play)
    if (card.cooldown > 0) {
      battleState.cooldowns[cardId] = card.cooldown;
    }

    // 8. Add to battle log
    this.state.log.push({
      turn: this.state.turn,
      team,
      card: card.name,
      result,
    });

    // 9. Check for KO
    const gameOver = this.checkGameOver();

    // 10. Broadcast state
    this.onStateChange(this.state);

    if (gameOver) {
      this.stopTurnTimer();
    }

    return { success: true, result };
  }

  /**
   * End the current team's turn, apply end-of-turn effects,
   * switch active team, and begin the new turn.
   */
  endTurn(): void {
    const team = this.state.activeTeam;
    const chimera = this.getTeamState(team);

    // 1. Decay active team's shield by 50%
    chimera.shield = Math.floor(chimera.shield * SHIELD_DECAY_RATIO);

    // 2. Tick cooldowns for active team (reduce by 1)
    for (const cardId of Object.keys(chimera.cooldowns)) {
      if (chimera.cooldowns[cardId] > 0) {
        chimera.cooldowns[cardId]--;
      }
      if (chimera.cooldowns[cardId] <= 0) {
        delete chimera.cooldowns[cardId];
      }
    }

    // 3. Switch active team
    const nextTeam: Team = team === 'red' ? 'blue' : 'red';
    this.state.activeTeam = nextTeam;

    // 4. Increment turn counter
    this.state.turn++;

    // 5. Grant mana to new active team (manaRegen, capped at maxMana)
    const nextChimera = this.getTeamState(nextTeam);
    const nextChimeraData = this.room.chimeras[nextTeam]!;
    nextChimera.mana = Math.min(
      nextChimera.mana + nextChimeraData.stats.manaRegen,
      nextChimeraData.stats.maxMana,
    );

    // 6. Tick status effects on new active team
    //    Clear any previous frozenSkip flag first.
    this.state.frozenSkip = false;
    this.tickStatusEffects(nextTeam);

    // 7. Check for game over (status effect damage can kill)
    if (this.checkGameOver()) {
      this.onStateChange(this.state);
      this.stopTurnTimer();
      return;
    }

    // 8. If frozen or stunned, auto-skip this turn
    if (this.state.frozenSkip) {
      // Broadcast state so clients see the skip
      this.onStateChange(this.state);

      // Auto-skip: schedule endTurn for the frozen/stunned team
      // with a short delay so clients can display the skip animation
      setTimeout(() => {
        this.state.frozenSkip = false;
        this.endTurn();
      }, 1500);
      return;
    }

    // 9. Reset turn timer
    this.startTurnTimer();

    // 10. Broadcast state
    this.onStateChange(this.state);
  }

  /**
   * Return the current battle state (read-only snapshot).
   */
  getState(): BattleState {
    return this.state;
  }

  /**
   * Clean up timers. Call when the battle is abandoned or room is destroyed.
   */
  destroy(): void {
    this.stopTurnTimer();
  }

  // ----------------------------------------------------------
  // Card Resolution
  // ----------------------------------------------------------

  private resolveCard(attackerTeam: Team, card: AbilityCard): CardResult {
    const defenderTeam: Team = attackerTeam === 'red' ? 'blue' : 'red';
    const attacker = this.getTeamState(attackerTeam);
    const defender = this.getTeamState(defenderTeam);
    const attackerData = this.room.chimeras[attackerTeam]!;

    const result: CardResult = {
      damage: 0,
      healing: 0,
      shieldGained: 0,
      effectApplied: null,
    };

    // ---- DAMAGE ----
    if (card.damage > 0) {
      let dmg = card.damage;

      // Freeze bonus: +25% damage if defender is frozen
      const frozenEffect = defender.statusEffects.find(
        (e) => e.type === 'freeze',
      );
      if (frozenEffect) {
        dmg = Math.floor(dmg * (1 + FREEZE_DAMAGE_BONUS));
      }

      // On-hit passive: check attacker's passive ability
      const attackerPassive = attackerData.passiveAbility;
      if (attackerPassive && attackerPassive.trigger === 'on_hit') {
        dmg += this.resolveOnHitPassive(attackerPassive, defender, dmg);
      }

      // Shield absorption: shield takes hit first, remainder goes to HP
      if (defender.shield > 0) {
        const absorbed = Math.min(dmg, defender.shield);
        defender.shield -= absorbed;
        dmg -= absorbed;
      }

      // Apply remaining damage to HP
      defender.hp = Math.max(0, defender.hp - dmg);
      result.damage = dmg;

      // Reflect: if defender has reflect, return 30% of the card's base damage
      const reflectEffect = defender.statusEffects.find(
        (e) => e.type === 'reflect',
      );
      if (reflectEffect) {
        const reflectDmg = Math.floor(card.damage * REFLECT_RATIO);
        attacker.hp = Math.max(0, attacker.hp - reflectDmg);
        result.reflectDamage = reflectDmg;
      }

      // Lifesteal: if card effect is lifesteal, heal attacker for 50% of
      // the actual damage dealt to HP (after shield absorption)
      if (card.effect === 'lifesteal' && result.damage > 0) {
        const heal = Math.floor(result.damage * LIFESTEAL_RATIO);
        attacker.hp = Math.min(
          attacker.hp + heal,
          attackerData.stats.maxHp,
        );
        result.healing += heal;
      }
    }

    // ---- HEALING ----
    if (card.healing > 0) {
      const maxHp = attackerData.stats.maxHp;

      // Burn penalty: if attacker has burn, healing is halved
      const hasBurn = attacker.statusEffects.some((e) => e.type === 'burn');
      const burnMultiplier = hasBurn ? BURN_HEALING_PENALTY : 1;
      const heal = Math.floor(card.healing * burnMultiplier);

      attacker.hp = Math.min(attacker.hp + heal, maxHp);
      result.healing += heal;
    }

    // ---- SHIELD ----
    if (card.shield > 0) {
      attacker.shield += card.shield;
      result.shieldGained = card.shield;
    }

    // ---- STATUS EFFECTS ----
    // Lifesteal is instant and does NOT add a status effect.
    // Mana drain is handled separately below as well as adding a status marker.
    if (card.effect && card.effect !== 'lifesteal') {
      // Reflect goes on attacker (self-buff); all others go on defender
      const target =
        card.effect === 'reflect' ? attacker : defender;

      // For poison, stacks are tracked as separate status entries.
      // Other effects: we could either stack or refresh.
      // Per the spec, poison stacks. Others refresh duration.
      if (card.effect === 'poison') {
        // Poison stacks: add a new entry each time
        target.statusEffects.push({
          type: card.effect,
          duration: card.effectDuration,
          source: card.name,
        });
      } else {
        // Non-stacking effects: refresh duration if already present
        const existing = target.statusEffects.find(
          (e) => e.type === card.effect,
        );
        if (existing) {
          existing.duration = Math.max(existing.duration, card.effectDuration);
          existing.source = card.name;
        } else {
          target.statusEffects.push({
            type: card.effect,
            duration: card.effectDuration,
            source: card.name,
          });
        }
      }
      result.effectApplied = card.effect;
    }

    // ---- MANA DRAIN ----
    // Mana drain steals 1 mana from defender and gives it to attacker
    if (card.effect === 'mana_drain') {
      const stolen = Math.min(MANA_DRAIN_AMOUNT, defender.mana);
      defender.mana -= stolen;
      attacker.mana = Math.min(
        attacker.mana + stolen,
        attackerData.stats.maxMana,
      );
      result.manaDrained = stolen;
    }

    return result;
  }

  // ----------------------------------------------------------
  // Status Effect Tick
  // ----------------------------------------------------------

  private tickStatusEffects(team: Team): void {
    const chimera = this.getTeamState(team);
    const opponentTeam: Team = team === 'red' ? 'blue' : 'red';
    const opponentData = this.room.chimeras[opponentTeam];

    const expiredEffects: StatusEffect[] = [];

    for (const effect of chimera.statusEffects) {
      switch (effect.type) {
        case 'poison': {
          // Deal 4 damage per poison stack
          chimera.hp = Math.max(0, chimera.hp - POISON_DAMAGE_PER_STACK);

          // Check for opponent's passive abilities that interact with poison
          // e.g., "Venomous Ichor": poisoned enemies take extra damage per turn
          if (opponentData?.passiveAbility) {
            this.resolvePassivePoisonBonus(
              opponentData.passiveAbility,
              chimera,
            );
          }
          break;
        }
        case 'burn': {
          // Deal 3 damage per turn
          chimera.hp = Math.max(0, chimera.hp - BURN_DAMAGE);
          break;
        }
        case 'freeze': {
          // Skip this turn
          this.state.frozenSkip = true;
          break;
        }
        case 'stun': {
          // Skip this turn (one time)
          this.state.frozenSkip = true;
          break;
        }
        // reflect has no tick effect; it's checked during damage resolution
        default:
          break;
      }

      // Decrement duration
      effect.duration--;
      if (effect.duration <= 0) {
        expiredEffects.push(effect);
      }
    }

    // Remove expired effects
    chimera.statusEffects = chimera.statusEffects.filter(
      (e) => !expiredEffects.includes(e),
    );

    // Also check the current team's own chimera passive with on_turn_start
    const chimeraData = this.room.chimeras[team];
    if (chimeraData?.passiveAbility?.trigger === 'on_turn_start') {
      this.resolveTurnStartPassive(chimeraData.passiveAbility, chimera, chimeraData);
    }

    // Check for on_low_hp passive
    if (chimeraData?.passiveAbility?.trigger === 'on_low_hp') {
      const hpPercent = chimera.hp / chimeraData.stats.maxHp;
      if (hpPercent <= 0.3) {
        this.resolveLowHpPassive(chimeraData.passiveAbility, chimera, chimeraData);
      }
    }
  }

  // ----------------------------------------------------------
  // Passive Ability Resolution
  // ----------------------------------------------------------

  /**
   * Resolve on_hit passive abilities for the attacker.
   * Returns bonus damage to add.
   */
  private resolveOnHitPassive(
    passive: { name: string; description: string; trigger: string; effect: string },
    defender: ChimeraBattleState,
    _baseDmg: number,
  ): number {
    const effectLower = passive.effect.toLowerCase();

    // Bonus damage if opponent has poison
    if (effectLower.includes('poison') && effectLower.includes('bonus')) {
      const poisonStacks = defender.statusEffects.filter(
        (e) => e.type === 'poison',
      ).length;
      if (poisonStacks > 0) {
        // Extract number from effect string, default to 3
        const match = passive.effect.match(/(\d+)/);
        const bonusDmg = match ? parseInt(match[1], 10) : 3;
        return bonusDmg * poisonStacks;
      }
    }

    // Bonus damage if opponent is burning
    if (effectLower.includes('burn') && effectLower.includes('bonus')) {
      const hasBurn = defender.statusEffects.some((e) => e.type === 'burn');
      if (hasBurn) {
        const match = passive.effect.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 3;
      }
    }

    return 0;
  }

  /**
   * Resolve passive abilities that add poison bonus damage on turn tick.
   * e.g., "If opponent has poison status, deal 3 bonus damage at turn start"
   */
  private resolvePassivePoisonBonus(
    passive: { name: string; description: string; trigger: string; effect: string },
    target: ChimeraBattleState,
  ): void {
    if (passive.trigger !== 'on_turn_start' && passive.trigger !== 'always') {
      return;
    }

    const effectLower = passive.effect.toLowerCase();
    if (effectLower.includes('poison') && effectLower.includes('bonus')) {
      const match = passive.effect.match(/(\d+)/);
      const bonusDmg = match ? parseInt(match[1], 10) : 3;
      target.hp = Math.max(0, target.hp - bonusDmg);
    }
  }

  /**
   * Resolve on_turn_start passives for the active team's own chimera.
   * Examples: mana regen bonus, self-heal, etc.
   */
  private resolveTurnStartPassive(
    passive: { name: string; description: string; trigger: string; effect: string },
    chimera: ChimeraBattleState,
    chimeraData: Chimera,
  ): void {
    const effectLower = passive.effect.toLowerCase();

    // Self-heal at turn start
    if (effectLower.includes('heal') || effectLower.includes('regenerat')) {
      const match = passive.effect.match(/(\d+)/);
      const healAmt = match ? parseInt(match[1], 10) : 3;
      chimera.hp = Math.min(chimera.hp + healAmt, chimeraData.stats.maxHp);
    }

    // Bonus mana at turn start
    if (effectLower.includes('mana') && effectLower.includes('gain')) {
      const match = passive.effect.match(/(\d+)/);
      const manaAmt = match ? parseInt(match[1], 10) : 1;
      chimera.mana = Math.min(
        chimera.mana + manaAmt,
        chimeraData.stats.maxMana,
      );
    }
  }

  /**
   * Resolve on_low_hp passives (triggered when HP <= 30%).
   * Examples: damage boost, shield gain, etc.
   */
  private resolveLowHpPassive(
    passive: { name: string; description: string; trigger: string; effect: string },
    chimera: ChimeraBattleState,
    chimeraData: Chimera,
  ): void {
    const effectLower = passive.effect.toLowerCase();

    // Gain shield when low HP
    if (effectLower.includes('shield') || effectLower.includes('armor')) {
      const match = passive.effect.match(/(\d+)/);
      const shieldAmt = match ? parseInt(match[1], 10) : 5;
      chimera.shield += shieldAmt;
    }

    // Heal when low HP
    if (effectLower.includes('heal') || effectLower.includes('regenerat')) {
      const match = passive.effect.match(/(\d+)/);
      const healAmt = match ? parseInt(match[1], 10) : 5;
      chimera.hp = Math.min(chimera.hp + healAmt, chimeraData.stats.maxHp);
    }
  }

  // ----------------------------------------------------------
  // Game Over Detection
  // ----------------------------------------------------------

  private checkGameOver(): boolean {
    const redHp = this.state.redChimera.hp;
    const blueHp = this.state.blueChimera.hp;

    // Both at 0 HP (e.g., reflect killed the attacker too)
    if (redHp <= 0 && blueHp <= 0) {
      // Active team's chimera survives with 1 HP
      if (this.state.activeTeam === 'red') {
        this.state.redChimera.hp = 1;
        this.onBattleEnd('red');
      } else {
        this.state.blueChimera.hp = 1;
        this.onBattleEnd('blue');
      }
      return true;
    }

    // One chimera at 0 HP
    if (redHp <= 0) {
      this.onBattleEnd('blue');
      return true;
    }
    if (blueHp <= 0) {
      this.onBattleEnd('red');
      return true;
    }

    // Max turns reached
    if (this.state.turn >= MAX_TURNS) {
      const redData = this.room.chimeras.red!;
      const blueData = this.room.chimeras.blue!;
      const redHpPercent = redHp / redData.stats.maxHp;
      const blueHpPercent = blueHp / blueData.stats.maxHp;

      if (Math.abs(redHpPercent - blueHpPercent) < 0.001) {
        this.onBattleEnd('draw');
      } else if (redHpPercent > blueHpPercent) {
        this.onBattleEnd('red');
      } else {
        this.onBattleEnd('blue');
      }
      return true;
    }

    return false;
  }

  // ----------------------------------------------------------
  // Turn Timer
  // ----------------------------------------------------------

  private startTurnTimer(): void {
    this.stopTurnTimer();

    this.state.turnTimer = TURN_TIMER_SECONDS;

    this.turnTimerHandle = setInterval(() => {
      this.state.turnTimer--;

      if (this.state.turnTimer <= 0) {
        this.stopTurnTimer();
        // Auto end turn when timer expires
        this.endTurn();
      }
    }, 1000);
  }

  private stopTurnTimer(): void {
    if (this.turnTimerHandle !== null) {
      clearInterval(this.turnTimerHandle);
      this.turnTimerHandle = null;
    }
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  /**
   * Get the ChimeraBattleState for the given team.
   */
  private getTeamState(team: Team): ChimeraBattleState {
    return team === 'red' ? this.state.redChimera : this.state.blueChimera;
  }

  /**
   * Create an empty ChimeraBattleState (used before battle starts).
   */
  private emptyChimeraBattleState(): ChimeraBattleState {
    return {
      hp: 0,
      mana: 0,
      shield: 0,
      statusEffects: [],
      cooldowns: {},
    };
  }
}
