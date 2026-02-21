// ============================================================
// Chimera Arena - Chimera Stats & Cards Generator (Gemini 3 Flash)
// ============================================================

import { getAI } from './client.js';
import type { Chimera, AbilityCard, BuildParts, CardEffect, PassiveTrigger } from '../types.js';

const MODEL = 'gemini-2.5-flash-preview-05-20';

const CHIMERA_SYSTEM_PROMPT = `You are the Chimera Forge for Chimera Arena, a turn-based card battler with 16/32-bit pixel art aesthetics.

A team has described 5 body parts. Your job:
1. Interpret each part literally, creatively, and with humor.
2. Create a chimera with a name, stats, and exactly 3 ability cards.
3. Each ability card should emerge logically from the body parts.
4. Create one passive ability from the combination.
5. Balance the chimera: high attack = lower defense, etc.
6. The 3 cards should cover: 1 attack, 1 defense/utility, 1 special/ultimate.

CARD DESIGN RULES (Slay the Spire style):
- Each card has a mana cost (1-4). Bigger effects = more mana.
- Attack cards deal damage. May have secondary effects.
- Defense cards grant shield, heal, or buff.
- Special cards have powerful unique effects with longer cooldowns.
- Side effects add chaos: "also damages self", "random target", etc.
- Cards should feel thematic to the body parts that inspired them.

STAT RANGES:
- HP: 80-200 (tanky chimeras get more, glass cannons get less)
- Max Mana: 3-6 (higher = more cards per turn possible)
- Mana Regen: 1-3 per turn
- Total stat budget: the sum of (maxHp/10 + maxMana + manaRegen + avg_card_damage/2) should be roughly 30-35 to keep balance

Respond ONLY in this JSON:
{
  "name": "string",
  "description": "string (2-3 sentences, funny, pixel-art game flavor text)",
  "stats": {
    "maxHp": number,
    "maxMana": number,
    "manaRegen": number
  },
  "cards": [
    {
      "id": "card_1",
      "name": "string",
      "description": "string (card flavor text, max 15 words)",
      "manaCost": number,
      "damage": number,
      "healing": number,
      "shield": number,
      "effect": "burn" | "freeze" | "poison" | "stun" | "lifesteal" | "mana_drain" | "reflect" | null,
      "effectDuration": number,
      "cooldown": number,
      "type": "attack" | "defense" | "special",
      "cardArt": "string (short pixel art description for the card illustration)"
    }
  ],
  "passiveAbility": {
    "name": "string",
    "description": "string (max 15 words)",
    "trigger": "on_hit" | "on_turn_start" | "on_low_hp" | "on_kill" | "always",
    "effect": "string (mechanical description)"
  },
  "weaknesses": ["string"],
  "spritePrompt": "string (concise 16-bit pixel art sprite description for image generation)"
}`;

// ---- Validation helpers ----

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

const VALID_EFFECTS: CardEffect[] = [
  'burn', 'freeze', 'poison', 'stun', 'lifesteal', 'mana_drain', 'reflect', null,
];

const VALID_TRIGGERS: PassiveTrigger[] = [
  'on_hit', 'on_turn_start', 'on_low_hp', 'on_kill', 'always',
];

const VALID_CARD_TYPES = ['attack', 'defense', 'special'] as const;

function validateEffect(effect: unknown): CardEffect {
  if (effect === null || effect === 'null' || effect === undefined) return null;
  if (typeof effect === 'string' && VALID_EFFECTS.includes(effect as CardEffect)) {
    return effect as CardEffect;
  }
  return null;
}

function validateTrigger(trigger: unknown): PassiveTrigger {
  if (typeof trigger === 'string' && VALID_TRIGGERS.includes(trigger as PassiveTrigger)) {
    return trigger as PassiveTrigger;
  }
  return 'always';
}

function validateCardType(type: unknown): 'attack' | 'defense' | 'special' {
  if (typeof type === 'string' && VALID_CARD_TYPES.includes(type as typeof VALID_CARD_TYPES[number])) {
    return type as 'attack' | 'defense' | 'special';
  }
  return 'attack';
}

interface RawCard {
  id?: string;
  name?: string;
  description?: string;
  manaCost?: number;
  damage?: number;
  healing?: number;
  shield?: number;
  effect?: unknown;
  effectDuration?: number;
  cooldown?: number;
  type?: unknown;
  cardArt?: string;
}

interface RawChimeraResponse {
  name?: string;
  description?: string;
  stats?: {
    maxHp?: number;
    maxMana?: number;
    manaRegen?: number;
  };
  cards?: RawCard[];
  passiveAbility?: {
    name?: string;
    description?: string;
    trigger?: unknown;
    effect?: string;
  };
  weaknesses?: string[];
  spritePrompt?: string;
}

function validateCard(raw: RawCard, index: number): Omit<AbilityCard, 'cardArt'> & { cardArt: string } {
  return {
    id: raw.id || `card_${index + 1}`,
    name: raw.name || `Ability ${index + 1}`,
    description: raw.description || 'A mysterious ability.',
    manaCost: clamp(raw.manaCost ?? 2, 1, 4),
    damage: clamp(raw.damage ?? 0, 0, 40),
    healing: clamp(raw.healing ?? 0, 0, 25),
    shield: clamp(raw.shield ?? 0, 0, 20),
    effect: validateEffect(raw.effect),
    effectDuration: clamp(raw.effectDuration ?? 0, 0, 5),
    cooldown: clamp(raw.cooldown ?? 0, 0, 5),
    type: validateCardType(raw.type),
    cardArt: raw.cardArt || 'A glowing magical orb with sparks',
  };
}

function validateChimeraResponse(raw: RawChimeraResponse): {
  chimera: Omit<Chimera, 'sprite' | 'stats'> & { stats: { maxHp: number; maxMana: number; manaRegen: number } };
  spritePrompt: string;
  cardArtPrompts: string[];
} {
  const cards = (raw.cards || []).slice(0, 3);
  while (cards.length < 3) {
    cards.push({
      id: `card_${cards.length + 1}`,
      name: `Fallback Ability ${cards.length + 1}`,
      description: 'A basic ability.',
      manaCost: 1,
      damage: cards.length === 0 ? 10 : 0,
      healing: cards.length === 1 ? 5 : 0,
      shield: cards.length === 1 ? 5 : 0,
      type: cards.length === 0 ? 'attack' : cards.length === 1 ? 'defense' : 'special',
      cardArt: 'A glowing magical orb',
    });
  }

  const validatedCards = cards.map((c, i) => validateCard(c, i));

  // Strip out cardArt from the cards for the chimera object (cardArt is base64 image data in the final Chimera,
  // but at this stage it's a text prompt). We store the art prompts in the cardArt field temporarily;
  // the orchestrator will replace them with actual image data.
  const cardArtPrompts = validatedCards.map((c) => c.cardArt);

  const chimeraCards: AbilityCard[] = validatedCards.map((c) => ({
    ...c,
    cardArt: '', // placeholder - will be filled by sprite generator
  }));

  return {
    chimera: {
      name: raw.name || 'Unnamed Chimera',
      description: raw.description || 'A mysterious creature emerges from the forge.',
      stats: {
        maxHp: clamp(raw.stats?.maxHp ?? 120, 80, 200),
        maxMana: clamp(raw.stats?.maxMana ?? 4, 3, 6),
        manaRegen: clamp(raw.stats?.manaRegen ?? 2, 1, 3),
      },
      cards: chimeraCards,
      passiveAbility: {
        name: raw.passiveAbility?.name || 'Chimeric Resilience',
        description: raw.passiveAbility?.description || 'The chimera adapts to survive.',
        trigger: validateTrigger(raw.passiveAbility?.trigger),
        effect: raw.passiveAbility?.effect || 'Recovers 2 HP at the start of each turn.',
      },
      weaknesses: Array.isArray(raw.weaknesses) && raw.weaknesses.length > 0
        ? raw.weaknesses.map(String)
        : ['Unknown weakness'],
    },
    spritePrompt: raw.spritePrompt || 'A 16-bit pixel art chimera creature, idle battle pose',
    cardArtPrompts,
  };
}

// ---- Main generator function ----

export interface ChimeraGeneratorResult {
  chimera: Omit<Chimera, 'sprite' | 'stats'> & { stats: { maxHp: number; maxMana: number; manaRegen: number } };
  spritePrompt: string;
  cardArtPrompts: string[];
}

export async function generateChimeraStats(parts: BuildParts): Promise<ChimeraGeneratorResult> {
  const userPrompt = `Create a chimera from these body parts chosen by a player team:
- HEAD: ${parts.head}
- TORSO: ${parts.torso}
- ARMS: ${parts.arms}
- LEGS: ${parts.legs}
- WILD CARD: ${parts.wild}

Generate the chimera JSON now.`;

  let lastError: Error | null = null;

  // Attempt with 1 retry on parse failure
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await getAI().models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction: CHIMERA_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          temperature: 1.0,
        },
      });

      const text = response.text ?? '';
      const parsed: RawChimeraResponse = JSON.parse(text);
      const validated = validateChimeraResponse(parsed);

      return {
        chimera: validated.chimera,
        spritePrompt: validated.spritePrompt,
        cardArtPrompts: validated.cardArtPrompts,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[ChimeraGenerator] Attempt ${attempt + 1} failed: ${lastError.message}`,
      );
      // Only retry once
      if (attempt === 0) {
        console.log('[ChimeraGenerator] Retrying...');
      }
    }
  }

  throw new Error(
    `[ChimeraGenerator] Failed to generate chimera after 2 attempts: ${lastError?.message}`,
  );
}
