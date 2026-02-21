// ============================================================
// Chimera Arena - Client-Side Shared Types
// (Mirrors server/types.ts for use across React UI)
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

// ---- Player ----

export interface Player {
  id: string;
  name: string;
  team: Team | null;
  ready: boolean;
}

// ---- Cards & Abilities ----

export interface AbilityCard {
  id: string;
  name: string;
  description: string;
  manaCost: number;
  damage: number;
  healing: number;
  shield: number;
  effect: CardEffect;
  effectDuration: number;
  cooldown: number;
  cardArt: string;
  attackSprite: string; // base64 spritesheet (4-frame horizontal strip)
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
  sprite: string;
  stats: {
    maxHp: number;
    hp: number;
    maxMana: number;
    mana: number;
    manaRegen: number;
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
  cooldowns: Record<string, number>;
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

// ---- Serialized Room (what the client receives) ----

export interface SerializedRoom {
  id: string;
  players: Record<string, Player>;
  teams: { red: string[]; blue: string[] };
  phase: Phase;
  round: number;
  chimeras: { red: Chimera | null; blue: Chimera | null };
  buildParts: { red: Partial<BuildParts>; blue: Partial<BuildParts> };
  battleState: BattleState | null;
  accepted: { red: boolean; blue: boolean };
  battleBackground: string;
}
