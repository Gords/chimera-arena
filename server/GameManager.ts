// ============================================================
// Chimera Arena - Game Phase Manager
// ============================================================

import type {
  Room,
  Team,
  Chimera,
  BattleState,
  ChimeraBattleState,
  AbilityCard,
  CardResult,
  BattleLogEntry,
  BuildSlot,
  StatusEffect,
} from './types.js';
import { addEvent } from './Room.js';

// ----- Constants -----

const BUILD_PHASE_DURATION = 60; // seconds
const TURN_TIMER_DURATION = 15; // seconds

// ----- Timers -----

const phaseTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function clearPhaseTimer(roomId: string): void {
  const timer = phaseTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    phaseTimers.delete(roomId);
  }
}

// ============================================================
// AI Chimera Generation
// ============================================================

import { generateFullChimera } from './ai/generateChimera.js';
import type { BuildParts } from './types.js';

const USE_AI = !!process.env.GEMINI_API_KEY;

async function generateChimera(
  parts: Partial<Record<BuildSlot, string>>,
  _team: Team
): Promise<Chimera> {
  const buildParts: BuildParts = {
    head: parts.head || 'mysterious head',
    torso: parts.torso || 'armored torso',
    arms: parts.arms || 'strong arms',
    legs: parts.legs || 'swift legs',
    wild: parts.wild || 'hidden power',
  };

  if (USE_AI) {
    try {
      return await generateFullChimera(buildParts);
    } catch (err) {
      console.error('[GameManager] AI generation failed, using fallback:', err);
    }
  }

  // Fallback: deterministic test chimera
  return createFallbackChimera(buildParts);
}

function createFallbackChimera(parts: BuildParts): Chimera {
  const desc = Object.values(parts).join(', ');
  return {
    name: `Chimera of ${parts.head}`,
    description: `A fearsome chimera assembled from: ${desc}.`,
    sprite: '',
    stats: { maxHp: 150, hp: 150, maxMana: 4, mana: 2, manaRegen: 2 },
    cards: [
      { id: 'card_1', name: 'Claw Strike', description: 'A vicious claw attack.', manaCost: 2, damage: 20, healing: 0, shield: 0, effect: null, effectDuration: 0, cooldown: 0, cardArt: '', type: 'attack' },
      { id: 'card_2', name: 'Iron Hide', description: 'Harden your defenses.', manaCost: 2, damage: 0, healing: 0, shield: 18, effect: 'reflect', effectDuration: 1, cooldown: 2, cardArt: '', type: 'defense' },
      { id: 'card_3', name: 'Toxic Blast', description: 'Unleash a poisonous explosion.', manaCost: 4, damage: 35, healing: 0, shield: 0, effect: 'poison', effectDuration: 2, cooldown: 3, cardArt: '', type: 'special' },
    ],
    passiveAbility: { name: 'Thick Scales', description: 'Reduces incoming damage slightly.', trigger: 'on_turn_start', effect: 'reduce_damage:3' },
    weaknesses: ['ice', 'lightning'],
  };
}

// ============================================================
// GameManager
// ============================================================

export class GameManager {
  constructor() {
    // No dependencies -- all communication is through the room's event log
  }

  // ============================================================
  // Phase: LOBBY -> BUILD
  // ============================================================

  startGame(room: Room): void {
    if (room.phase !== 'lobby') return;

    room.phase = 'build';
    room.buildParts = { red: {}, blue: {} };
    room.chimeras = { red: null, blue: null };
    room.accepted = { red: false, blue: false };

    addEvent(room, 'phase_change', {
      phase: 'build',
      duration: BUILD_PHASE_DURATION,
    });

    // Auto-end build phase after timer expires
    clearPhaseTimer(room.id);
    phaseTimers.set(
      room.id,
      setTimeout(() => {
        this.endBuildPhase(room);
      }, BUILD_PHASE_DURATION * 1000)
    );
  }

  // ============================================================
  // Phase: BUILD (collecting part descriptions)
  // ============================================================

  submitBuildPart(
    room: Room,
    team: Team,
    slot: BuildSlot,
    description: string
  ): boolean {
    if (room.phase !== 'build') return false;

    const validSlots: BuildSlot[] = ['head', 'torso', 'arms', 'legs', 'wild'];
    if (!validSlots.includes(slot)) return false;

    if (!description || description.trim().length === 0) return false;

    room.buildParts[team][slot] = description.trim();

    addEvent(room, 'build_part_updated', { team, slot });

    return true;
  }

  // ============================================================
  // Phase: BUILD -> REVEAL (AI generation)
  // ============================================================

  async endBuildPhase(room: Room): Promise<void> {
    if (room.phase !== 'build') return;

    clearPhaseTimer(room.id);

    room.phase = 'reveal';
    room.accepted = { red: false, blue: false };

    addEvent(room, 'generating', {
      message: 'AI is generating your chimeras...',
    });

    // Generate both chimeras in parallel
    const [redChimera, blueChimera] = await Promise.all([
      generateChimera(room.buildParts.red, 'red'),
      generateChimera(room.buildParts.blue, 'blue'),
    ]);

    room.chimeras.red = redChimera;
    room.chimeras.blue = blueChimera;

    addEvent(room, 'chimera_revealed', {
      phase: 'reveal',
      red: redChimera,
      blue: blueChimera,
    });
  }

  // ============================================================
  // Phase: REVEAL (accept chimeras)
  // ============================================================

  acceptChimera(room: Room, team: Team): void {
    if (room.phase !== 'reveal') return;

    room.accepted[team] = true;

    addEvent(room, 'chimera_accepted', { team }, team);

    // If both teams accepted, proceed to battle
    if (room.accepted.red && room.accepted.blue) {
      this.startBattle(room);
    }
  }

  // ============================================================
  // Phase: REVEAL -> BATTLE
  // ============================================================

  startBattle(room: Room): void {
    if (!room.chimeras.red || !room.chimeras.blue) return;

    room.phase = 'battle';

    const battleState: BattleState = {
      turn: 1,
      activeTeam: 'red', // red always goes first
      turnTimer: TURN_TIMER_DURATION,
      redChimera: initChimeraBattleState(room.chimeras.red),
      blueChimera: initChimeraBattleState(room.chimeras.blue),
      log: [],
      frozenSkip: false,
    };

    room.battleState = battleState;

    addEvent(room, 'phase_change', {
      phase: 'battle',
      battleState,
    });

    this.startTurnTimer(room);
  }

  // ============================================================
  // Phase: BATTLE (card play + turn logic)
  // ============================================================

  /**
   * Play a card for the active team. Returns true on success.
   */
  playCard(room: Room, team: Team, cardId: string): boolean {
    const bs = room.battleState;
    if (!bs || room.phase !== 'battle') return false;
    if (bs.activeTeam !== team) return false;

    const chimera = team === 'red' ? room.chimeras.red : room.chimeras.blue;
    if (!chimera) return false;

    const card = chimera.cards.find((c) => c.id === cardId);
    if (!card) return false;

    const attacker = team === 'red' ? bs.redChimera : bs.blueChimera;
    const defender = team === 'red' ? bs.blueChimera : bs.redChimera;

    // Check cooldown
    if (attacker.cooldowns[cardId] && attacker.cooldowns[cardId] > 0) {
      addEvent(room, 'error', {
        team,
        message: `${card.name} is on cooldown for ${attacker.cooldowns[cardId]} more turn(s).`,
      }, team);
      return false;
    }

    // Check mana
    if (attacker.mana < card.manaCost) {
      addEvent(room, 'error', {
        team,
        message: `Not enough mana. Need ${card.manaCost}, have ${attacker.mana}.`,
      }, team);
      return false;
    }

    // Check frozen/stun -- skip action
    if (isStunned(attacker)) {
      addEvent(room, 'error', {
        team,
        message: 'Your chimera is stunned and cannot act!',
      }, team);
      return false;
    }

    // Spend mana
    attacker.mana -= card.manaCost;

    // Set cooldown (if card has one)
    if (card.cooldown > 0) {
      attacker.cooldowns[cardId] = card.cooldown;
    }

    // Resolve card
    const result = resolveCard(card, attacker, defender);

    // Build log entry
    const logEntry: BattleLogEntry = {
      turn: bs.turn,
      team,
      card: card.name,
      result,
    };
    bs.log.push(logEntry);

    addEvent(room, 'card_played', {
      team,
      card,
      result,
    }, team);

    // Check win condition
    if (defender.hp <= 0) {
      this.endBattle(room, team);
      return true;
    }
    if (attacker.hp <= 0) {
      const otherTeam: Team = team === 'red' ? 'blue' : 'red';
      this.endBattle(room, otherTeam);
      return true;
    }

    // 1 attack per turn -- auto-end turn after playing a card
    this.endTurn(room, team);

    return true;
  }

  /**
   * End the current team's turn, advance to the other team.
   */
  endTurn(room: Room, team: Team): void {
    const bs = room.battleState;
    if (!bs || room.phase !== 'battle') return;
    if (bs.activeTeam !== team) return;

    clearPhaseTimer(room.id);

    // Tick status effects for the team that just finished
    const active = team === 'red' ? bs.redChimera : bs.blueChimera;
    tickStatusEffects(active);
    tickCooldowns(active);

    // Switch active team
    const nextTeam: Team = team === 'red' ? 'blue' : 'red';
    bs.activeTeam = nextTeam;

    // If we've cycled back to red, increment the turn counter
    if (nextTeam === 'red') {
      bs.turn += 1;
    }

    // Mana regen for the next team's chimera
    const nextChimera =
      nextTeam === 'red' ? room.chimeras.red : room.chimeras.blue;
    const nextState =
      nextTeam === 'red' ? bs.redChimera : bs.blueChimera;
    if (nextChimera && nextState) {
      nextState.mana = Math.min(
        nextState.mana + nextChimera.stats.manaRegen,
        nextChimera.stats.maxMana
      );
    }

    // Apply start-of-turn status damage (burn, poison) to the new active
    applyStartOfTurnEffects(nextState);

    // Check for death from status effects
    if (nextState.hp <= 0) {
      const winner: Team = nextTeam === 'red' ? 'blue' : 'red';
      this.endBattle(room, winner);
      return;
    }

    // Check frozen skip
    bs.frozenSkip = isFrozen(nextState);

    bs.turnTimer = TURN_TIMER_DURATION;

    addEvent(room, 'turn_change', {
      activeTeam: nextTeam,
      turn: bs.turn,
      frozenSkip: bs.frozenSkip,
    });

    // If frozen, auto-end after a short delay
    if (bs.frozenSkip) {
      clearPhaseTimer(room.id);
      phaseTimers.set(
        room.id,
        setTimeout(() => {
          this.endTurn(room, nextTeam);
        }, 2000)
      );
    } else {
      this.startTurnTimer(room);
    }
  }

  // ============================================================
  // Phase: BATTLE -> RESULT
  // ============================================================

  endBattle(room: Room, winner: Team): void {
    clearPhaseTimer(room.id);

    room.phase = 'result';

    addEvent(room, 'battle_result', {
      winner,
      battleLog: room.battleState?.log ?? [],
    });
  }

  // ============================================================
  // Result -> next round or back to lobby
  // ============================================================

  /**
   * Reset the room for another round (or back to lobby).
   */
  returnToLobby(room: Room): void {
    room.phase = 'lobby';
    room.round += 1;
    room.chimeras = { red: null, blue: null };
    room.buildParts = { red: {}, blue: {} };
    room.battleState = null;
    room.accepted = { red: false, blue: false };

    // Reset all players' ready state
    for (const player of room.players.values()) {
      player.ready = false;
    }

    clearPhaseTimer(room.id);

    addEvent(room, 'phase_change', {
      phase: 'lobby',
      round: room.round,
    });
  }

  // ============================================================
  // Turn timer
  // ============================================================

  private startTurnTimer(room: Room): void {
    clearPhaseTimer(room.id);

    phaseTimers.set(
      room.id,
      setTimeout(() => {
        const bs = room.battleState;
        if (!bs || room.phase !== 'battle') return;

        // Time ran out -- auto end the turn
        this.endTurn(room, bs.activeTeam);
      }, TURN_TIMER_DURATION * 1000)
    );
  }
}

// ============================================================
// Battle helpers (pure functions)
// ============================================================

function initChimeraBattleState(chimera: Chimera): ChimeraBattleState {
  return {
    hp: chimera.stats.hp,
    mana: chimera.stats.mana,
    shield: 0,
    statusEffects: [],
    cooldowns: {},
  };
}

/**
 * Resolve a card being played. Mutates attacker/defender states.
 */
function resolveCard(
  card: AbilityCard,
  attacker: ChimeraBattleState,
  defender: ChimeraBattleState
): CardResult {
  const result: CardResult = {
    damage: 0,
    healing: 0,
    shieldGained: 0,
    effectApplied: null,
  };

  // --- Damage ---
  if (card.damage > 0) {
    let dmg = card.damage;

    // Check if defender has a reflect effect active
    const reflectEffect = defender.statusEffects.find(
      (e) => e.type === 'reflect'
    );
    if (reflectEffect) {
      const reflected = Math.floor(dmg * 0.3);
      attacker.hp = Math.max(0, attacker.hp - reflected);
      result.reflectDamage = reflected;
    }

    // Shield absorbs damage first
    if (defender.shield > 0) {
      const absorbed = Math.min(defender.shield, dmg);
      defender.shield -= absorbed;
      dmg -= absorbed;
    }

    defender.hp = Math.max(0, defender.hp - dmg);
    result.damage = card.damage; // report full damage value

    // Lifesteal
    if (card.effect === 'lifesteal') {
      const stolen = Math.floor(card.damage * 0.3);
      attacker.hp = Math.min(attacker.hp + stolen, attacker.hp + 50); // cap heal at +50
      result.healing += stolen;
    }
  }

  // --- Healing ---
  if (card.healing > 0) {
    attacker.hp += card.healing;
    result.healing += card.healing;
  }

  // --- Shield ---
  if (card.shield > 0) {
    attacker.shield += card.shield;
    result.shieldGained = card.shield;
  }

  // --- Status effects ---
  if (card.effect && card.effect !== 'lifesteal') {
    const effectEntry: StatusEffect = {
      type: card.effect,
      duration: card.effectDuration || 2,
      source: card.id,
    };

    if (card.effect === 'reflect') {
      // Reflect goes on the attacker (self-buff)
      attacker.statusEffects.push(effectEntry);
    } else {
      defender.statusEffects.push(effectEntry);
    }

    result.effectApplied = card.effect;
  }

  // --- Mana drain ---
  if (card.effect === 'mana_drain') {
    const drained = Math.min(2, defender.mana);
    defender.mana -= drained;
    attacker.mana += drained;
    result.manaDrained = drained;
  }

  return result;
}

function tickStatusEffects(state: ChimeraBattleState): void {
  state.statusEffects = state.statusEffects
    .map((e) => ({ ...e, duration: e.duration - 1 }))
    .filter((e) => e.duration > 0);
}

function tickCooldowns(state: ChimeraBattleState): void {
  for (const cardId of Object.keys(state.cooldowns)) {
    state.cooldowns[cardId] -= 1;
    if (state.cooldowns[cardId] <= 0) {
      delete state.cooldowns[cardId];
    }
  }
}

function applyStartOfTurnEffects(state: ChimeraBattleState): void {
  for (const effect of state.statusEffects) {
    switch (effect.type) {
      case 'burn':
        state.hp = Math.max(0, state.hp - 8);
        break;
      case 'poison':
        state.hp = Math.max(0, state.hp - 5);
        break;
    }
  }
}

function isStunned(state: ChimeraBattleState): boolean {
  return state.statusEffects.some((e) => e.type === 'stun');
}

function isFrozen(state: ChimeraBattleState): boolean {
  return state.statusEffects.some((e) => e.type === 'freeze');
}
