// ============================================================
// Chimera Arena - Shared TypeScript Types
// ============================================================

export type Phase = 'lobby' | 'build' | 'reveal' | 'battle' | 'result';
export type Team = 'red' | 'blue';
export type CardType = 'attack' | 'defense' | 'special';
export type CardEffect =
  | 'burn'
  | 'freeze'
  | 'poison'
  | 'stun'
  | 'lifesteal'
  | 'mana_drain'
  | 'reflect'
  | null;
export type PassiveTrigger =
  | 'on_hit'
  | 'on_turn_start'
  | 'on_low_hp'
  | 'on_kill'
  | 'always';

// ---- Game Event (replaces socket emissions) ----

export type GameEventType =
  | 'phase_change'
  | 'card_played'
  | 'turn_change'
  | 'chimera_revealed'
  | 'error'
  | 'player_joined'
  | 'player_left'
  | 'player_ready'
  | 'battle_result'
  | 'build_part_updated'
  | 'chimera_accepted'
  | 'generating'
  | 'frozen_skip';

export interface GameEvent {
  id: number;
  type: GameEventType;
  team?: Team;
  data: any;
  timestamp: number;
}

// ---- Player ----

export interface Player {
  id: string; // UUID (generated on create/join)
  name: string;
  team: Team | null;
  ready: boolean;
}

// ---- Cards & Abilities ----

export interface AbilityCard {
  id: string;
  name: string;
  description: string;
  manaCost: number; // 1-4
  damage: number; // 0-40
  healing: number; // 0-25
  shield: number; // 0-20
  effect: CardEffect;
  effectDuration: number;
  cooldown: number; // turns before reuse
  cardArt: string; // base64 image data
  type: CardType;
}

export interface PassiveAbility {
  name: string;
  description: string;
  trigger: PassiveTrigger;
  effect: string;
}

// ---- Chimera ----

export interface Chimera {
  name: string;
  description: string;
  sprite: string; // base64 image
  stats: {
    maxHp: number; // 80-200
    hp: number;
    maxMana: number; // 3-6
    mana: number;
    manaRegen: number; // 1-3
  };
  cards: AbilityCard[];
  passiveAbility: PassiveAbility;
  weaknesses: string[];
}

// ---- Battle State ----

export interface StatusEffect {
  type: string;
  duration: number;
  source: string;
}

export interface CardResult {
  damage: number;
  healing: number;
  shieldGained: number;
  effectApplied: string | null;
  reflectDamage?: number;
  manaDrained?: number;
}

export interface BattleLogEntry {
  turn: number;
  team: Team;
  card: string;
  result: CardResult;
}

export interface ChimeraBattleState {
  hp: number;
  mana: number;
  shield: number;
  statusEffects: StatusEffect[];
  cooldowns: Record<string, number>; // cardId -> turns remaining
}

export interface BattleState {
  turn: number;
  activeTeam: Team;
  turnTimer: number;
  redChimera: ChimeraBattleState;
  blueChimera: ChimeraBattleState;
  log: BattleLogEntry[];
  frozenSkip?: boolean;
}

// ---- Build Phase ----

export interface BuildParts {
  head: string;
  torso: string;
  arms: string;
  legs: string;
  wild: string;
}

export type BuildSlot = keyof BuildParts;

// ---- Room ----

export interface Room {
  id: string;
  hostId: string; // player UUID of the room creator
  players: Map<string, Player>; // keyed by player UUID
  teams: { red: string[]; blue: string[] }; // player UUIDs
  phase: Phase;
  round: number;
  chimeras: { red: Chimera | null; blue: Chimera | null };
  buildParts: { red: Partial<BuildParts>; blue: Partial<BuildParts> };
  battleState: BattleState | null;
  accepted: { red: boolean; blue: boolean };
  events: GameEvent[];
  lastUpdated: number; // Date.now() timestamp
}

// ---- Serialized Room (for REST responses) ----

export interface SerializedPlayer {
  id: string;
  name: string;
  team: Team | null;
  ready: boolean;
}

export interface SerializedRoom {
  id: string;
  hostId: string;
  players: Record<string, SerializedPlayer>;
  teams: { red: string[]; blue: string[] };
  phase: Phase;
  round: number;
  chimeras: { red: Chimera | null; blue: Chimera | null };
  buildParts: { red: Partial<BuildParts>; blue: Partial<BuildParts> };
  battleState: BattleState | null;
  accepted: { red: boolean; blue: boolean };
  events: GameEvent[];
  lastUpdated: number;
}
