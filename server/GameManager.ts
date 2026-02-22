// ============================================================
// Chimera Arena - Game Phase Manager
// ============================================================

import type { Server } from 'socket.io';
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
import { serializeRoom, serializeBattleState } from './Room.js';

// ----- Constants -----

const BUILD_PHASE_DURATION = 60; // seconds
const TURN_TIMER_DURATION = 15; // seconds
const BOT_ACTION_DELAY_MS = 1200;

// ----- Timers -----

const phaseTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const botTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function clearPhaseTimer(roomId: string): void {
  const timer = phaseTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    phaseTimers.delete(roomId);
  }
}

function clearBotTimer(roomId: string): void {
  const timer = botTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    botTimers.delete(roomId);
  }
}

// ============================================================
// AI Chimera Generation
// ============================================================

import { generateFullChimera } from './ai/generateChimera.js';
import { generateBattleBackground } from './ai/battleBackgroundGenerator.js';
import type { BuildParts } from './types.js'; // BuildParts for AI call

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
      { id: 'card_1', name: 'Claw Strike', description: 'A vicious claw attack.', manaCost: 2, damage: 20, healing: 0, shield: 0, effect: null, effectDuration: 0, cooldown: 0, cardArt: '', attackSprite: '', type: 'attack' },
      { id: 'card_2', name: 'Iron Hide', description: 'Harden your defenses.', manaCost: 2, damage: 0, healing: 0, shield: 18, effect: 'reflect', effectDuration: 1, cooldown: 2, cardArt: '', attackSprite: '', type: 'defense' },
      { id: 'card_3', name: 'Toxic Blast', description: 'Unleash a poisonous explosion.', manaCost: 4, damage: 35, healing: 0, shield: 0, effect: 'poison', effectDuration: 2, cooldown: 3, cardArt: '', attackSprite: '', type: 'special' },
    ],
    passiveAbility: { name: 'Thick Scales', description: 'Reduces incoming damage slightly.', trigger: 'on_turn_start', effect: 'reduce_damage:3' },
    weaknesses: ['ice', 'lightning'],
  };
}

const BOT_HEADS = [
  'clockwork wolf skull with ember eyes',
  'obsidian serpent mask with glowing runes',
  'mushroom-crowned frog face with golden pupils',
  'mecha raven beak with crackling sparks',
  'ice lion helm with crystal fangs',
] as const;

const BOT_TORSOS = [
  'brass-plated furnace core with vents',
  'thorny bark shell with bioluminescent moss',
  'amethyst crystal chest with pulsing veins',
  'starlit nebula torso wrapped in chains',
  'bone-and-iron ribcage with molten seams',
] as const;

const BOT_ARMS = [
  'mantis scythes dripping neon venom',
  'gorilla gauntlets made of meteor rock',
  'shadow tendrils ending in clawed hands',
  'clockwork cannons with rotating barrels',
  'phoenix wings folded into blade feathers',
] as const;

const BOT_LEGS = [
  'spider legs with brass joints',
  'raptor talons that spark on impact',
  'goat legs wrapped in storm clouds',
  'hydraulic piston legs with rune engravings',
  'lizard legs with mirrored obsidian scales',
] as const;

const BOT_WILD = [
  'a floating halo of cursed tarot cards',
  'a tiny thunderstorm trapped in a glass orb',
  'a backpack reactor leaking blue plasma',
  'an ancient crown whispering battle chants',
  'a comet tail of pixelated fireflies',
] as const;

function pickRandom<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function makeBotBuildParts(): BuildParts {
  return {
    head: pickRandom(BOT_HEADS),
    torso: pickRandom(BOT_TORSOS),
    arms: pickRandom(BOT_ARMS),
    legs: pickRandom(BOT_LEGS),
    wild: pickRandom(BOT_WILD),
  };
}

// ============================================================
// GameManager
// ============================================================

export class GameManager {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  clearRoomTimers(roomId: string): void {
    clearPhaseTimer(roomId);
    clearBotTimer(roomId);
  }

  // ----- Broadcast helper -----

  private broadcastRoomState(room: Room): void {
    this.io.to(room.id).emit('room:state', serializeRoom(room));
  }

  /** Lightweight battle-only broadcast (~1-2 KB vs ~200+ KB for full room) */
  private broadcastBattleState(room: Room): void {
    const bs = serializeBattleState(room);
    if (!bs) {
      console.error(`[GameManager] broadcastBattleState called but battleState is null for room ${room.id}`);
      return;
    }
    this.io.to(room.id).emit('battle:state', bs);
  }

  private getBotTeam(room: Room): Team | null {
    for (const playerId of room.teams.red) {
      if (room.players.get(playerId)?.isBot) return 'red';
    }
    for (const playerId of room.teams.blue) {
      if (room.players.get(playerId)?.isBot) return 'blue';
    }
    return null;
  }

  private isBotTeam(room: Room, team: Team): boolean {
    return room.teams[team].some((playerId) => room.players.get(playerId)?.isBot);
  }

  private ensureBotBuildParts(room: Room): void {
    const botTeam = this.getBotTeam(room);
    if (!botTeam) return;

    const slots: BuildSlot[] = ['head', 'torso', 'arms', 'legs', 'wild'];
    const teamParts = room.buildParts[botTeam];
    const hasMissingParts = slots.some(
      (slot) => !teamParts[slot] || !teamParts[slot]?.trim(),
    );

    if (!hasMissingParts) return;

    const botParts = makeBotBuildParts();
    for (const slot of slots) {
      const current = teamParts[slot];
      if (!current || !current.trim()) {
        teamParts[slot] = botParts[slot];
      }
    }
  }

  private autoAcceptBotIfNeeded(room: Room): void {
    const botTeam = this.getBotTeam(room);
    if (!botTeam || room.phase !== 'reveal' || room.accepted[botTeam]) return;

    room.accepted[botTeam] = true;
    this.broadcastRoomState(room);
    this.io.to(room.id).emit('reveal:accepted', { team: botTeam });
  }

  private chooseBotCardId(room: Room, team: Team): string | null {
    const bs = room.battleState;
    if (!bs) return null;

    const chimera = team === 'red' ? room.chimeras.red : room.chimeras.blue;
    if (!chimera) return null;

    const attacker = team === 'red' ? bs.redChimera : bs.blueChimera;
    const defender = team === 'red' ? bs.blueChimera : bs.redChimera;

    const playableCards = chimera.cards.filter((card) => {
      const cd = attacker.cooldowns[card.id] ?? 0;
      return attacker.mana >= card.manaCost && cd <= 0;
    });
    if (playableCards.length === 0) return null;

    const lethal = playableCards
      .filter((card) => card.damage >= defender.hp)
      .sort((a, b) => a.manaCost - b.manaCost || b.damage - a.damage);
    if (lethal.length > 0) return lethal[0].id;

    const lowHp = attacker.hp <= Math.max(25, Math.floor(chimera.stats.maxHp * 0.35));
    if (lowHp) {
      const defensive = playableCards
        .filter((card) => card.healing > 0 || card.shield > 0 || card.effect === 'reflect')
        .sort(
          (a, b) =>
            b.healing + b.shield - (a.healing + a.shield) ||
            a.manaCost - b.manaCost,
        );
      if (defensive.length > 0) return defensive[0].id;
    }

    const offensive = [...playableCards].sort(
      (a, b) =>
        b.damage + (b.type === 'special' ? 8 : 0) -
        (a.damage + (a.type === 'special' ? 8 : 0)),
    );
    return offensive[0].id;
  }

  private scheduleBotTurn(room: Room): void {
    clearBotTimer(room.id);

    if (room.phase !== 'battle' || !room.battleState) return;
    const botTeam = room.battleState.activeTeam;
    if (!this.isBotTeam(room, botTeam)) return;

    botTimers.set(
      room.id,
      setTimeout(() => {
        botTimers.delete(room.id);

        const bs = room.battleState;
        if (!bs || room.phase !== 'battle') return;
        if (bs.activeTeam !== botTeam) return;
        if (!this.isBotTeam(room, botTeam)) return;

        const cardId = this.chooseBotCardId(room, botTeam);
        if (cardId) {
          const played = this.playCard(room, botTeam, cardId);
          if (played) return;
        }

        this.endTurn(room, botTeam);
      }, BOT_ACTION_DELAY_MS),
    );
  }

  // ============================================================
  // Phase: LOBBY -> BUILD
  // ============================================================

  startGame(room: Room): void {
    if (room.phase !== 'lobby') return;

    clearBotTimer(room.id);

    room.phase = 'build';
    room.buildParts = { red: {}, blue: {} };
    room.chimeras = { red: null, blue: null };
    room.accepted = { red: false, blue: false };
    this.ensureBotBuildParts(room);

    this.broadcastRoomState(room);
    this.io.to(room.id).emit('phase:build', {
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

    this.broadcastRoomState(room);
    this.io.to(room.id).emit('build:part_updated', { team, slot });

    return true;
  }

  // ============================================================
  // Phase: BUILD -> REVEAL (AI generation)
  // ============================================================

  async endBuildPhase(room: Room): Promise<void> {
    if (room.phase !== 'build') return;

    clearPhaseTimer(room.id);
    clearBotTimer(room.id);

    this.ensureBotBuildParts(room);

    room.phase = 'reveal';
    room.accepted = { red: false, blue: false };

    this.io.to(room.id).emit('phase:generating', {
      message: 'AI is generating your chimeras...',
    });

    // Random scene description for the battle background
    const sceneDescriptions = [
      'A volcanic cave with rivers of lava and crumbling stone pillars',
      'A crystal cavern with glowing blue and purple crystal formations',
      'A floating sky temple above the clouds with ancient stone columns',
      'A dark enchanted forest with twisted trees and mystical fog',
      'A cyber grid arena with neon purple lines and digital particles',
      'An ancient colosseum with crumbling marble walls under a stormy sky',
      'A frozen tundra with ice crystals and aurora borealis in the sky',
      'A desert temple with golden sand dunes and mysterious ruins',
    ];
    const scenePrompt = sceneDescriptions[Math.floor(Math.random() * sceneDescriptions.length)];

    // Generate both chimeras AND the battle background in parallel
    const [redChimera, blueChimera, bgResult] = await Promise.all([
      generateChimera(room.buildParts.red, 'red'),
      generateChimera(room.buildParts.blue, 'blue'),
      USE_AI
        ? generateBattleBackground(scenePrompt)
        : Promise.resolve({ base64: '', mimeType: 'image/png' }),
    ]);

    room.chimeras.red = redChimera;
    room.chimeras.blue = blueChimera;
    room.battleBackground = bgResult.base64
      ? `data:${bgResult.mimeType};base64,${bgResult.base64}`
      : '';

    this.broadcastRoomState(room);
    this.io.to(room.id).emit('phase:reveal', {
      red: redChimera,
      blue: blueChimera,
    });
    this.autoAcceptBotIfNeeded(room);
  }

  // ============================================================
  // Phase: REVEAL (accept chimeras)
  // ============================================================

  acceptChimera(room: Room, team: Team): void {
    if (room.phase !== 'reveal') return;

    room.accepted[team] = true;

    this.broadcastRoomState(room);
    this.io.to(room.id).emit('reveal:accepted', { team });
    this.autoAcceptBotIfNeeded(room);

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

    clearBotTimer(room.id);

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

    this.broadcastRoomState(room);
    this.io.to(room.id).emit('phase:battle', { battleState });

    this.startTurnTimer(room);
    this.scheduleBotTurn(room);
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
    clearBotTimer(room.id);

    const chimera = team === 'red' ? room.chimeras.red : room.chimeras.blue;
    if (!chimera) return false;

    const card = chimera.cards.find((c) => c.id === cardId);
    if (!card) return false;

    const attacker = team === 'red' ? bs.redChimera : bs.blueChimera;
    const defender = team === 'red' ? bs.blueChimera : bs.redChimera;

    // Check cooldown
    if (attacker.cooldowns[cardId] && attacker.cooldowns[cardId] > 0) {
      this.io.to(room.id).emit('battle:error', {
        team,
        message: `${card.name} is on cooldown for ${attacker.cooldowns[cardId]} more turn(s).`,
      });
      return false;
    }

    // Check mana
    if (attacker.mana < card.manaCost) {
      this.io.to(room.id).emit('battle:error', {
        team,
        message: `Not enough mana. Need ${card.manaCost}, have ${attacker.mana}.`,
      });
      return false;
    }

    // Check frozen/stun — skip action
    if (isStunned(attacker)) {
      this.io.to(room.id).emit('battle:error', {
        team,
        message: 'Your chimera is stunned and cannot act!',
      });
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

    this.broadcastBattleState(room);
    this.io.to(room.id).emit('battle:card_played', {
      team,
      card,
      result,
    });

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

    // 1 attack per turn — auto-end turn after playing a card
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
    clearBotTimer(room.id);

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

    this.broadcastBattleState(room);
    this.io.to(room.id).emit('battle:turn', {
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
      this.scheduleBotTurn(room);
    }
  }

  // ============================================================
  // Phase: BATTLE -> RESULT
  // ============================================================

  endBattle(room: Room, winner: Team): void {
    clearPhaseTimer(room.id);
    clearBotTimer(room.id);

    room.phase = 'result';

    this.broadcastRoomState(room);
    this.io.to(room.id).emit('phase:result', {
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
    clearBotTimer(room.id);
    room.phase = 'lobby';
    room.round += 1;
    room.chimeras = { red: null, blue: null };
    room.buildParts = { red: {}, blue: {} };
    room.battleState = null;
    room.accepted = { red: false, blue: false };
    room.battleBackground = '';

    // Reset all players' ready state
    for (const player of room.players.values()) {
      player.ready = false;
    }

    clearPhaseTimer(room.id);

    this.broadcastRoomState(room);
    this.io.to(room.id).emit('phase:lobby', { round: room.round });
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
