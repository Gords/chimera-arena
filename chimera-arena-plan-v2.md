# Chimera Arena — Development Plan

## Overview

A multiplayer turn-based card battler where teams collaboratively describe monster body parts, AI generates a chimera with unique ability cards, and teams fight each other in **Slay the Spire-style turn-based combat** — all rendered in a **16/32-bit pixel art style** using Pixi.js.

---

## Architecture

```
┌─────────────┐    WebSocket     ┌──────────────┐     API calls     ┌─────────────────┐
│  Client(s)  │ ◄──────────────► │  Game Server  │ ◄───────────────► │  Gemini 3 Flash  │
│  Pixi.js    │                  │  Node + WS    │                   │  (Stats/Cards/   │
│  React UI   │                  │  Game State   │                   │   Battle Logic)  │
└─────────────┘                  └──────────────┘                   └─────────────────┘
                                        │
                                        ▼
                                 ┌──────────────────┐
                                 │  Nano Banana      │
                                 │  (Sprite Gen)     │
                                 │  gemini-2.5-flash  │
                                 │  -image            │
                                 └──────────────────┘
```

---

## Game Flow

```
┌────────┐   ┌────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐
│ LOBBY  │──►│ BUILD  │──►│ REVEAL   │──►│ BATTLE   │──►│ RESULT │
│        │   │ (60s)  │   │ & ACCEPT │   │ (Turns)  │   │        │
└────────┘   └────────┘   └──────────┘   └──────────┘   └────────┘
                 │              │              │
            Players type   Nano Banana    Turn-based
            chimera parts  generates      card combat
                 │         pixel sprite   (Slay the
            Gemini 3 Flash     +          Spire style)
            generates      ability cards
            stats & cards  are shown
```

| Phase | Duration | What Happens |
|-------|----------|--------------|
| **Lobby** | Until ready | Players join room, teams assigned (2v2, 3v3, or 1v1) |
| **Build** | 60 seconds | Each team describes 5 body parts for their chimera |
| **Reveal** | 15 seconds | AI generates stats, 3 ability cards, sprite. Teams review and accept |
| **Battle** | Turn-based | Teams take turns playing cards. Mana regenerates each turn. First to 0 HP loses |
| **Result** | Until next round | Winner declared, MVP card shown, rematch option |

---

## PHASE 1 — Multiplayer Foundation

### 1.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Client | Pixi.js (battle renderer, sprites, animations) + React (UI overlays, cards, HUD) |
| Transport | WebSockets via Socket.IO |
| Server | Node.js + Express |
| State | In-memory game rooms (Redis later) |
| AI (Text) | **Gemini 3 Flash** (`gemini-3-flash-preview`) — stats, cards, AI coach |
| AI (Images) | **Nano Banana** (`gemini-2.5-flash-image`) — chimera pixel art sprites |

### 1.2 Room State

```js
class Room {
  id: string
  players: Map<socketId, Player>
  teams: { red: Player[], blue: Player[] }
  phase: 'lobby' | 'build' | 'reveal' | 'battle' | 'result'
  round: number
  chimeras: {
    red: Chimera | null,
    blue: Chimera | null
  }
  battleState: BattleState | null
}

interface Chimera {
  name: string
  description: string
  sprite: string                 // base64 pixel art image
  stats: {
    maxHp: number                // 80–200
    hp: number
    maxMana: number              // 3–6
    mana: number
    manaRegen: number            // 1–3 per turn
  }
  cards: AbilityCard[]           // exactly 3 ability cards
  passiveAbility: PassiveAbility
  weaknesses: string[]
}

interface AbilityCard {
  id: string
  name: string
  description: string
  manaCost: number               // 1–4
  damage: number                 // 0–40
  healing: number                // 0–25
  shield: number                 // 0–20
  effect: CardEffect | null      // burn, freeze, poison, stun, etc.
  effectDuration: number         // turns
  cooldown: number               // turns before reuse (0 = every turn)
  cardArt: string                // short prompt for the card illustration
  type: 'attack' | 'defense' | 'special'
}

interface PassiveAbility {
  name: string
  description: string
  trigger: 'on_hit' | 'on_turn_start' | 'on_low_hp' | 'on_kill' | 'always'
  effect: string
}

interface BattleState {
  turn: number
  activeTeam: 'red' | 'blue'
  turnTimer: number              // seconds remaining for current turn
  redChimera: ChimeraBattleState
  blueChimera: ChimeraBattleState
  log: BattleLogEntry[]
}

interface ChimeraBattleState {
  hp: number
  mana: number
  shield: number
  statusEffects: StatusEffect[]
  cooldowns: Map<cardId, turnsRemaining>
}
```

### 1.3 WebSocket Events

```
Client → Server:
  room:create           — host creates room
  room:join             — player joins with code
  room:ready            — player ready toggle
  build:submit_part     — submit a body part prompt
  reveal:accept         — team accepts chimera
  battle:play_card      — play an ability card
  battle:end_turn       — end turn without playing

Server → Client:
  room:state            — full room sync
  room:phase_change     — phase transition
  reveal:chimera        — generated chimera with sprite + cards
  battle:state          — full battle state update
  battle:card_played    — animate a card being played
  battle:turn_change    — whose turn it is
  battle:effect         — status effect applied/expired
  battle:result         — match over
```

### 1.4 Client Architecture

```
src/
├── main.ts
├── network/
│   ├── socket.ts
│   └── events.ts
├── game/
│   ├── GameManager.ts          # Phase orchestration
│   ├── BuildPhase.ts           # Part input UI
│   ├── RevealPhase.ts          # Chimera reveal animation
│   ├── BattlePhase.ts          # Turn-based battle controller
│   └── ResultPhase.ts          # Scoreboard
├── battle/
│   ├── BattleEngine.ts         # Client-side battle state mirror
│   ├── CardSystem.ts           # Card hand management
│   ├── TurnManager.ts          # Turn timer + ordering
│   ├── StatusEffects.ts        # Burn, freeze, poison, etc.
│   └── DamageCalculator.ts     # Damage formulas with effects
├── pixi/
│   ├── ArenaStage.ts           # 16-bit arena background
│   ├── ChimeraSprite.ts        # Animated chimera (idle, attack, hurt, death)
│   ├── CardAnimation.ts        # Card play VFX
│   ├── PixelParticles.ts       # Pixel-art particle effects
│   ├── DamageNumbers.ts        # Floating damage/heal numbers
│   ├── StatusIcons.ts          # Pixel status effect icons
│   ├── ScreenShake.ts          # Screen shake on big hits
│   └── SpriteAnimator.ts       # Frame-by-frame sprite animation helper
├── ui/
│   ├── Lobby.tsx
│   ├── BuildPanel.tsx          # Body part input forms
│   ├── ChimeraCard.tsx         # Full chimera stat card
│   ├── AbilityCardUI.tsx       # Individual ability card component
│   ├── CardHand.tsx            # Hand of 3 cards (Slay the Spire style)
│   ├── HPBar.tsx               # Pixel-art health bar
│   ├── ManaBar.tsx             # Pixel-art mana crystals
│   ├── TurnIndicator.tsx       # Whose turn + timer
│   ├── BattleLog.tsx           # Turn-by-turn action log
│   └── CoachBubble.tsx         # AI coach reactions
└── assets/
    ├── fonts/                  # Pixel fonts (Press Start 2P, etc.)
    ├── ui/                     # Pixel UI frames, buttons, card templates
    ├── arena/                  # Arena background tilesets
    ├── effects/                # Pre-made VFX spritesheets (fire, ice, etc.)
    └── audio/                  # 8-bit/chiptune SFX
```

---

## PHASE 2 — Build + Reveal

### 2.1 Build Phase (60 seconds)

Each team fills 5 body part slots:

```
┌──────────────────────────────────────────────────┐
│              ⚔️ BUILD YOUR CHIMERA ⚔️              │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │   HEAD   │ │  TORSO   │ │   ARMS   │         │
│  │ "dragon  │ │ "crystal │ │ "shadow  │         │
│  │  skull"  │ │  armor"  │ │  tendrils"│         │
│  └──────────┘ └──────────┘ └──────────┘         │
│  ┌──────────┐ ┌──────────┐                       │
│  │   LEGS   │ │   WILD   │                       │
│  │ "spider  │ │ "cursed  │      Timer: 34s       │
│  │  legs"   │ │  crown"  │                       │
│  └──────────┘ └──────────┘                       │
│                                                  │
│  Team members each claim a slot or vote on ideas │
└──────────────────────────────────────────────────┘
```

### 2.2 AI Generation (Gemini 3 Flash)

Two parallel API calls fire when build phase ends:

**Call 1 — Chimera Stats + Cards:**

```js
async function generateChimera(parts) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{
      role: 'user',
      parts: [{
        text: `Generate a chimera from these parts:\n` +
              `Head: "${parts.head}"\n` +
              `Torso: "${parts.torso}"\n` +
              `Arms: "${parts.arms}"\n` +
              `Legs: "${parts.legs}"\n` +
              `Wild Card: "${parts.wild}"`
      }]
    }],
    config: {
      systemInstruction: CHIMERA_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      temperature: 1.0,
      thinkingConfig: { thinkingLevel: 'minimal' }
    }
  });

  return JSON.parse(response.text);
}
```

**Chimera System Prompt:**

```
You are the Chimera Forge for Chimera Arena, a turn-based card battler
with 16/32-bit pixel art aesthetics.

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
  "spritePrompt": "string (concise 16-bit pixel art sprite description for Nano Banana)"
}
```

**Example Output:**

```json
{
  "name": "Crystalskull Shadowweaver",
  "description": "A terrifying fusion of dragon bone and living crystal, skittering on eight spider legs while shadow tendrils writhe beneath a cursed crown. It hums with dark energy.",
  "stats": {
    "maxHp": 120,
    "maxMana": 4,
    "manaRegen": 2
  },
  "cards": [
    {
      "id": "card_1",
      "name": "Shadow Lash",
      "description": "Tendrils strike from the darkness. May poison on hit.",
      "manaCost": 2,
      "damage": 22,
      "healing": 0,
      "shield": 0,
      "effect": "poison",
      "effectDuration": 2,
      "cooldown": 0,
      "type": "attack",
      "cardArt": "dark purple tendrils whipping forward with green poison droplets"
    },
    {
      "id": "card_2",
      "name": "Crystal Carapace",
      "description": "Crystal armor hardens. Reflects a portion of damage taken.",
      "manaCost": 2,
      "damage": 0,
      "healing": 0,
      "shield": 18,
      "effect": "reflect",
      "effectDuration": 1,
      "cooldown": 2,
      "type": "defense",
      "cardArt": "shimmering crystal barrier forming around a spider-like body"
    },
    {
      "id": "card_3",
      "name": "Crown of Nightmares",
      "description": "The cursed crown pulses. Drains enemy mana and deals heavy damage.",
      "manaCost": 4,
      "damage": 35,
      "healing": 0,
      "shield": 0,
      "effect": "mana_drain",
      "effectDuration": 1,
      "cooldown": 3,
      "type": "special",
      "cardArt": "a glowing cursed crown emitting dark shockwaves and purple lightning"
    }
  ],
  "passiveAbility": {
    "name": "Venomous Ichor",
    "description": "Poisoned enemies take 3 extra damage per turn.",
    "trigger": "on_turn_start",
    "effect": "If opponent has poison status, deal 3 bonus damage at turn start"
  },
  "weaknesses": ["Fire dispels shadow tendrils", "Bright light cracks crystal armor"],
  "spritePrompt": "16-bit pixel art monster sprite, dragon skull head with glowing crystal torso armor, dark shadow tentacle arms, eight spider legs, small cursed crown floating above head, dark purple and teal color palette, side view battle stance, transparent background"
}
```

### 2.3 Pixel Art Sprite Generation (Nano Banana)

**Call 2 — Sprite (runs in parallel with stats):**

```js
async function generateChimeraSprite(spritePrompt) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [{
      role: 'user',
      parts: [{
        text: `Generate a single game character sprite in the style of ` +
              `classic 16-bit / 32-bit JRPG battle sprites (like Final Fantasy VI ` +
              `or Chrono Trigger). The sprite should be:\n` +
              `- Side-view battle stance (facing right)\n` +
              `- Clean pixel art with visible individual pixels\n` +
              `- Limited color palette (12-16 colors max)\n` +
              `- Sized to look like a 64x64 or 96x96 pixel sprite upscaled\n` +
              `- Transparent/solid color background (no scenery)\n` +
              `- Slight idle animation pose (not static)\n\n` +
              `Character: ${spritePrompt}`
      }]
    }],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    }
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return {
        base64: part.inlineData.data,
        mimeType: part.inlineData.mimeType
      };
    }
  }
}
```

**Generating Card Art (also Nano Banana):**

```js
async function generateCardArt(cardArtPrompt) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [{
      role: 'user',
      parts: [{
        text: `Generate a small ability icon / card illustration in 16-bit pixel art style. ` +
              `Square format. Dark border. Vibrant colors. Fantasy RPG aesthetic. ` +
              `Subject: ${cardArtPrompt}`
      }]
    }],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    }
  });

  // ... same extraction
}
```

> All image generation runs in parallel:
> 1x chimera sprite + 3x card art icons = **4 Nano Banana calls per team, 8 total per match.**
> These run concurrently and finish in ~3-5 seconds.

### 2.4 Reveal Phase

```
┌──────────────────────────────────────────────────────────────────┐
│                    ✨ YOUR CHIMERA IS BORN ✨                     │
│                                                                  │
│   ┌──────────────┐                                               │
│   │              │   CRYSTALSKULL SHADOWWEAVER                   │
│   │  [Pixel Art  │   "A terrifying fusion of dragon bone         │
│   │   Sprite]    │    and living crystal..."                     │
│   │              │                                               │
│   │   ◄ idle ►   │   ♥ HP: 120    ◆ Mana: 4    ⟳ Regen: 2     │
│   └──────────────┘                                               │
│                                                                  │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │ ⚔️ ATTACK    │  │ 🛡️ DEFENSE  │  │ ⭐ SPECIAL   │            │
│   │             │  │             │  │             │            │
│   │ Shadow Lash │  │ Crystal     │  │ Crown of    │            │
│   │             │  │ Carapace    │  │ Nightmares  │            │
│   │ [Card Art]  │  │ [Card Art]  │  │ [Card Art]  │            │
│   │             │  │             │  │             │            │
│   │ Cost: 2 ◆   │  │ Cost: 2 ◆   │  │ Cost: 4 ◆   │            │
│   │ DMG: 22     │  │ Shield: 18  │  │ DMG: 35     │            │
│   │ ☠ Poison 2t │  │ ↩ Reflect 1t│  │ 💧 Drain 1t  │            │
│   │ CD: Ready   │  │ CD: 2 turns │  │ CD: 3 turns │            │
│   └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                  │
│   Passive: 🩸 Venomous Ichor — Poisoned foes take 3 extra/turn  │
│                                                                  │
│              [ ✓ Accept Chimera ]                                │
└──────────────────────────────────────────────────────────────────┘
```

---

## PHASE 3 — Turn-Based Battle (Core Gameplay)

### 3.1 Battle Rules (Slay the Spire Style)

```
TURN STRUCTURE:
  1. Turn starts → active player gains mana (manaRegen amount)
  2. Mana caps at maxMana (excess is wasted)
  3. Status effects tick (poison damage, burn damage, frozen = skip)
  4. Active player can play any number of cards if they have mana
  5. Active player ends turn (or 30-second timer forces end)
  6. Shield decays by 50% at end of turn (partial shield retention)
  7. Turn passes to opponent

DAMAGE FORMULA:
  finalDamage = cardDamage - (targetShield > 0 ? min(cardDamage, targetShield) : 0)
  // Shield absorbs damage first, remainder hits HP
  // Shield takes the hit, reduced by damage amount

STATUS EFFECTS:
  burn:       3 damage per turn, 50% less healing received
  freeze:     skip next turn, +25% damage from next hit, then thaws
  poison:     4 damage per turn, stacks (multiple poisons = more damage)
  stun:       skip next turn (one time, doesn't stack)
  lifesteal:  attacker heals for 50% of damage dealt
  mana_drain: steal 1 mana from opponent
  reflect:    return 30% of incoming damage to attacker

WINNING:
  - First chimera to reach 0 HP loses.
  - If both reach 0 HP same turn (reflect damage), active player's chimera survives with 1 HP.
  - Max 20 turns. If neither dies, highest HP % wins.
```

### 3.2 Server-Side Battle Engine

The server is **fully authoritative** — clients send card play requests, server validates and resolves.

```js
// server/BattleEngine.js
class BattleEngine {
  room: Room
  state: BattleState

  startBattle(redChimera, blueChimera) {
    this.state = {
      turn: 1,
      activeTeam: redChimera.stats.speed >= blueChimera.stats.speed ? 'red' : 'blue',
      turnTimer: 30,
      redChimera: {
        hp: redChimera.stats.maxHp,
        mana: redChimera.stats.manaRegen,  // start with 1 turn of regen
        shield: 0,
        statusEffects: [],
        cooldowns: new Map()
      },
      blueChimera: { /* same */ },
      log: []
    };
    this.broadcastState();
    this.startTurnTimer();
  }

  playCard(team, cardId) {
    // 1. Validate it's this team's turn
    if (team !== this.state.activeTeam) return { error: 'Not your turn' };

    // 2. Find the card
    const chimera = this.room.chimeras[team];
    const card = chimera.cards.find(c => c.id === cardId);
    if (!card) return { error: 'Card not found' };

    // 3. Check mana
    const battleState = this.state[`${team}Chimera`];
    if (battleState.mana < card.manaCost) return { error: 'Not enough mana' };

    // 4. Check cooldown
    const cd = battleState.cooldowns.get(cardId) || 0;
    if (cd > 0) return { error: `On cooldown (${cd} turns)` };

    // 5. Spend mana
    battleState.mana -= card.manaCost;

    // 6. Resolve card effects
    const result = this.resolveCard(team, card);

    // 7. Set cooldown
    if (card.cooldown > 0) {
      battleState.cooldowns.set(cardId, card.cooldown);
    }

    // 8. Log and broadcast
    this.state.log.push({
      turn: this.state.turn,
      team,
      card: card.name,
      result
    });

    this.broadcastCardPlayed(team, card, result);

    // 9. Check for KO
    if (this.checkGameOver()) {
      this.endBattle();
    }

    return { success: true, result };
  }

  resolveCard(attackerTeam, card) {
    const defenderTeam = attackerTeam === 'red' ? 'blue' : 'red';
    const attacker = this.state[`${attackerTeam}Chimera`];
    const defender = this.state[`${defenderTeam}Chimera`];
    const result = { damage: 0, healing: 0, shieldGained: 0, effectApplied: null };

    // DAMAGE
    if (card.damage > 0) {
      let dmg = card.damage;

      // Check for freeze bonus
      const frozen = defender.statusEffects.find(e => e.type === 'freeze');
      if (frozen) dmg = Math.floor(dmg * 1.25);

      // Shield absorption
      if (defender.shield > 0) {
        const absorbed = Math.min(dmg, defender.shield);
        defender.shield -= absorbed;
        dmg -= absorbed;
      }

      defender.hp = Math.max(0, defender.hp - dmg);
      result.damage = dmg;

      // Reflect check
      const reflect = defender.statusEffects.find(e => e.type === 'reflect');
      if (reflect) {
        const reflectDmg = Math.floor(card.damage * 0.3);
        attacker.hp = Math.max(0, attacker.hp - reflectDmg);
        result.reflectDamage = reflectDmg;
      }

      // Lifesteal
      if (card.effect === 'lifesteal') {
        const heal = Math.floor(result.damage * 0.5);
        attacker.hp = Math.min(attacker.hp + heal, this.room.chimeras[attackerTeam].stats.maxHp);
        result.healing = heal;
      }
    }

    // HEALING
    if (card.healing > 0) {
      const maxHp = this.room.chimeras[attackerTeam].stats.maxHp;
      const burnPenalty = attacker.statusEffects.find(e => e.type === 'burn') ? 0.5 : 1;
      const heal = Math.floor(card.healing * burnPenalty);
      attacker.hp = Math.min(attacker.hp + heal, maxHp);
      result.healing = heal;
    }

    // SHIELD
    if (card.shield > 0) {
      attacker.shield += card.shield;
      result.shieldGained = card.shield;
    }

    // STATUS EFFECT
    if (card.effect && !['lifesteal'].includes(card.effect)) {
      const target = ['reflect'].includes(card.effect) ? attacker : defender;
      target.statusEffects.push({
        type: card.effect,
        duration: card.effectDuration,
        source: card.name
      });
      result.effectApplied = card.effect;
    }

    // MANA DRAIN
    if (card.effect === 'mana_drain') {
      const stolen = Math.min(1, defender.mana);
      defender.mana -= stolen;
      attacker.mana = Math.min(attacker.mana + stolen, this.room.chimeras[attackerTeam].stats.maxMana);
    }

    return result;
  }

  endTurn() {
    const team = this.state.activeTeam;
    const chimera = this.state[`${team}Chimera`];

    // Decay shield by 50%
    chimera.shield = Math.floor(chimera.shield * 0.5);

    // Tick cooldowns
    for (const [cardId, cd] of chimera.cooldowns) {
      if (cd > 0) chimera.cooldowns.set(cardId, cd - 1);
    }

    // Switch turns
    this.state.activeTeam = team === 'red' ? 'blue' : 'red';
    this.state.turn++;

    // New turn: grant mana
    const nextTeam = this.state.activeTeam;
    const nextChimera = this.state[`${nextTeam}Chimera`];
    const maxMana = this.room.chimeras[nextTeam].stats.maxMana;
    nextChimera.mana = Math.min(nextChimera.mana + this.room.chimeras[nextTeam].stats.manaRegen, maxMana);

    // Tick status effects on the now-active chimera
    this.tickStatusEffects(nextTeam);

    this.broadcastState();
    this.startTurnTimer();
  }

  tickStatusEffects(team) {
    const chimera = this.state[`${team}Chimera`];
    const toRemove = [];

    for (const effect of chimera.statusEffects) {
      switch (effect.type) {
        case 'poison':
          chimera.hp = Math.max(0, chimera.hp - 4);
          // Check for passive: Venomous Ichor etc.
          break;
        case 'burn':
          chimera.hp = Math.max(0, chimera.hp - 3);
          break;
        case 'freeze':
          // Skip this turn
          this.state.frozenSkip = true;
          break;
        case 'stun':
          this.state.frozenSkip = true;
          break;
      }
      effect.duration--;
      if (effect.duration <= 0) toRemove.push(effect);
    }

    chimera.statusEffects = chimera.statusEffects.filter(e => !toRemove.includes(e));
  }
}
```

### 3.3 Battle UI (Client)

```
┌──────────────────────────────────────────────────────────────────┐
│  ♥♥♥♥♥♥♥♥♥♥♥♥♡♡ 85/120 HP    CRYSTALSKULL     Turn 3 - 24s   │
│  ◆◆◆◇ 2/4 Mana               SHADOWWEAVER     YOUR TURN      │
│  [🛡️ 12 Shield]  [☠ Poison 1t]                                  │
│                                                                  │
│  ┌──────────────────── ARENA ─────────────────────┐             │
│  │                                                 │             │
│  │    ████████                      ████████       │             │
│  │    █ YOUR █    >>>  VS  <<<      █ ENEMY █      │             │
│  │    █CHIMER█                      █CHIMER█       │             │
│  │    █  A   █                      █  A   █       │             │
│  │    ████████                      ████████       │             │
│  │                                                 │             │
│  │  [pixel art arena background with torches]      │             │
│  └─────────────────────────────────────────────────┘             │
│                                                                  │
│  ♥♥♥♥♥♥♥♡♡♡♡♡♡♡ 62/150 HP    MEGA CRABZILLA                   │
│  ◆◆◆◆◆ 5/5 Mana              [🔥 Burn 2t]                      │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ ⚔️ 2◆        │  │ 🛡️ 2◆        │  │ ⭐ 4◆        │             │
│  │ Shadow Lash │  │ Crystal     │  │ Crown of    │  [End Turn] │
│  │ 22 DMG      │  │ Carapace    │  │ Nightmares  │             │
│  │ ☠ Poison    │  │ 18 Shield   │  │ 35 DMG      │             │
│  │ CD: Ready ✓ │  │ CD: 1 turn  │  │ CD: Ready ✓ │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│  ▲ Drag card to arena to play ▲                                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## PHASE 4 — Pixel Art Animations (Pixi.js)

### 4.1 Art Style Guide

Target aesthetic: **Final Fantasy VI / Chrono Trigger battle scenes**

- Sprites: 64x64 or 96x96 base resolution, displayed at 2x-4x scale
- Arena: Static pixel art background with animated torches/particles
- Card effects: Pixel particle bursts, screen flash, floating damage numbers
- UI: Pixel font (Press Start 2P), bordered UI panels, mana crystals
- Color: Rich but limited palettes per sprite (12-16 colors)

### 4.2 Chimera Sprite States

Since Nano Banana generates a single static image, we create animation states by manipulating the sprite programmatically:

```js
// pixi/ChimeraSprite.ts
class ChimeraSprite {
  sprite: PIXI.Sprite;
  baseY: number;

  constructor(texture: PIXI.Texture) {
    this.sprite = new PIXI.Sprite(texture);
    this.sprite.anchor.set(0.5, 1.0);  // Bottom-center anchor
    // Apply nearest-neighbor scaling for crispy pixels
    this.sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    this.baseY = this.sprite.y;
  }

  // IDLE: gentle bob up and down
  idleAnimation() {
    gsap.to(this.sprite, {
      y: this.baseY - 4,
      duration: 0.8,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut'
    });
  }

  // ATTACK: lunge forward + flash
  async attackAnimation() {
    // Quick lunge toward enemy
    await gsap.to(this.sprite, { x: '+=60', duration: 0.15, ease: 'power2.in' });
    // Flash white
    this.flashWhite(100);
    // Return to position
    await gsap.to(this.sprite, { x: '-=60', duration: 0.3, ease: 'bounce.out' });
  }

  // HURT: red tint + knockback + shake
  async hurtAnimation(damage: number) {
    this.sprite.tint = 0xFF4444;
    await gsap.to(this.sprite, { x: '+=20', duration: 0.05, yoyo: true, repeat: 3 });
    this.sprite.tint = 0xFFFFFF;
    // Show floating damage number
    this.showDamageNumber(damage);
  }

  // DEFEND: brief blue glow
  async defendAnimation() {
    this.sprite.tint = 0x4444FF;
    await gsap.to(this.sprite.scale, { x: 1.1, y: 1.1, duration: 0.2, yoyo: true });
    this.sprite.tint = 0xFFFFFF;
  }

  // DEATH: fade + fall
  async deathAnimation() {
    await gsap.to(this.sprite, {
      alpha: 0,
      y: '+=20',
      rotation: 0.3,
      duration: 1.5,
      ease: 'power2.in'
    });
  }

  // SPECIAL: screen flash + zoom
  async specialAnimation() {
    // Brief black screen flash (JRPG style)
    screenFlash(0x000000, 150);
    this.sprite.tint = 0xFFFF00;
    await gsap.to(this.sprite.scale, { x: 1.3, y: 1.3, duration: 0.3 });
    await delay(200);
    await gsap.to(this.sprite.scale, { x: 1, y: 1, duration: 0.2 });
    this.sprite.tint = 0xFFFFFF;
  }

  flashWhite(durationMs: number) {
    this.sprite.tint = 0xFFFFFF;
    // Apply additive blending briefly
    this.sprite.blendMode = PIXI.BLEND_MODES.ADD;
    setTimeout(() => { this.sprite.blendMode = PIXI.BLEND_MODES.NORMAL; }, durationMs);
  }

  showDamageNumber(amount: number, color = 0xFF4444) {
    const text = new PIXI.BitmapText(`-${amount}`, { fontName: 'PixelFont' });
    text.tint = color;
    text.position.set(this.sprite.x, this.sprite.y - 40);
    this.sprite.parent.addChild(text);
    gsap.to(text, { y: '-=30', alpha: 0, duration: 1.0, onComplete: () => text.destroy() });
  }
}
```

### 4.3 Card Effect VFX (Pixel Particles)

```js
// pixi/PixelParticles.ts
const EFFECT_CONFIGS = {
  // Fire particles for burn effects
  burn: {
    colors: [0xFF4400, 0xFF8800, 0xFFCC00],
    count: 12,
    speed: { min: 1, max: 3 },
    lifetime: { min: 0.3, max: 0.8 },
    shape: 'square',  // Pixel squares, not circles
    size: { min: 2, max: 6 },
    gravity: -2,      // Rise upward
  },

  // Ice shards for freeze
  freeze: {
    colors: [0x88CCFF, 0xAADDFF, 0xFFFFFF],
    count: 8,
    speed: { min: 2, max: 5 },
    lifetime: { min: 0.5, max: 1.0 },
    shape: 'diamond',
    size: { min: 3, max: 8 },
    gravity: 1,
  },

  // Green drips for poison
  poison: {
    colors: [0x44CC44, 0x228822, 0x88FF88],
    count: 6,
    speed: { min: 0.5, max: 2 },
    lifetime: { min: 0.4, max: 1.2 },
    shape: 'circle',
    size: { min: 2, max: 5 },
    gravity: 3,       // Drip downward
  },

  // Purple swirl for mana drain
  mana_drain: {
    colors: [0x8844CC, 0xAA66FF, 0xCC88FF],
    count: 10,
    speed: { min: 1, max: 4 },
    lifetime: { min: 0.3, max: 0.6 },
    shape: 'square',
    size: { min: 2, max: 4 },
    gravity: 0,
    orbit: true,      // Spiral pattern
  },

  // Yellow stars for shield
  shield: {
    colors: [0x4488FF, 0x66AAFF, 0xFFFFFF],
    count: 8,
    speed: { min: 0.5, max: 1.5 },
    lifetime: { min: 0.5, max: 1.0 },
    shape: 'star',
    size: { min: 3, max: 6 },
    gravity: -0.5,
  },

  // Heal sparkles
  heal: {
    colors: [0x44FF44, 0x88FF88, 0xFFFFFF],
    count: 10,
    speed: { min: 0.5, max: 2 },
    lifetime: { min: 0.5, max: 1.5 },
    shape: 'cross',
    size: { min: 3, max: 5 },
    gravity: -1.5,
  },
};
```

### 4.4 Battle Animation Sequence

When a card is played, the client plays this sequence:

```js
// battle/CardAnimator.ts
async function animateCardPlay(card, attacker, defender, result) {
  // 1. Card flies from hand to center of screen
  await animateCardToCenter(card);

  // 2. Card name flashes on screen (JRPG style)
  await showAbilityName(card.name, 800);

  // 3. Attacker performs animation
  if (card.type === 'attack' || card.type === 'special') {
    if (card.type === 'special') {
      await attacker.specialAnimation();
    } else {
      await attacker.attackAnimation();
    }
  } else {
    await attacker.defendAnimation();
  }

  // 4. Effect particles on target
  if (card.damage > 0) {
    spawnPixelParticles(defender.sprite.position, 'hit');
    screenShake(result.damage / 5);
    await defender.hurtAnimation(result.damage);
  }

  if (card.shield > 0) {
    spawnPixelParticles(attacker.sprite.position, 'shield');
  }

  if (card.healing > 0) {
    spawnPixelParticles(attacker.sprite.position, 'heal');
    attacker.showDamageNumber(card.healing, 0x44FF44);  // green
  }

  // 5. Status effect icon appears
  if (result.effectApplied) {
    spawnPixelParticles(defender.sprite.position, result.effectApplied);
    showStatusIcon(defender, result.effectApplied);
  }

  // 6. Update HP/Mana/Shield bars with smooth animation
  await animateBars(result);

  // 7. Brief pause before next action
  await delay(500);
}
```

### 4.5 Arena Background

Pre-made pixel art arena tilesets (not AI generated — these are static assets):

```
Arenas (randomly selected each match):
  - Volcanic Colosseum (lava, torches, stone pillars)
  - Crystal Cavern (glowing crystals, dripping water)
  - Floating Sky Temple (clouds, ancient runes)
  - Dark Forest (twisted trees, fog, mushrooms)
  - Neon Cyber Arena (grid floor, holographic crowd)
```

Each arena is a static 16-bit background image with a few animated elements (torches flickering, crystals glowing) done via Pixi.js sprite animation.

---

## Cost Estimation (per match)

| API Call | Model | Count | Est. Cost |
|----------|-------|-------|-----------|
| Chimera stats + cards | Gemini 3 Flash | 2 | ~$0.01 |
| Chimera sprites | Nano Banana | 2 | ~$0.08 |
| Card art icons | Nano Banana | 6 | ~$0.24 |
| Coach commentary (optional) | Gemini 3 Flash | 1 | ~$0.005 |
| **Total per match** | | | **~$0.34** |

> **Massively cheaper than Veo 3.** No video generation = huge savings.
> Main cost is now Nano Banana for sprites and card art (~$0.04/image × 8 images).
> Text AI is negligible. This makes a free tier totally viable.
>
> **Optimization:** Cache card art for common effect types
> (fire attack, ice shield, etc.) to reduce Nano Banana calls to just 2
> per match (the chimera sprites only). That brings cost to ~$0.09/match.

---

## Implementation Roadmap

### Sprint 1 (Week 1–2): Multiplayer + Lobby
- [ ] Node.js server with Socket.IO rooms
- [ ] Client lobby: create/join room, team assignment, ready up
- [ ] Phase state machine (lobby → build → reveal → battle → result)
- [ ] Pixi.js canvas setup with pixel-art scaling (nearest-neighbor)
- [ ] Load pixel font (Press Start 2P)

### Sprint 2 (Week 3–4): Build + Reveal
- [ ] Build phase UI: 5 body part input slots per team
- [ ] Gemini 3 Flash chimera generation (stats + cards)
- [ ] Nano Banana sprite generation (chimera + card art)
- [ ] Reveal phase: animated chimera card with sprite + ability cards
- [ ] Accept button + phase transition

### Sprint 3 (Week 5–6): Battle Engine
- [ ] Server-side BattleEngine (full card resolution logic)
- [ ] Status effect system (burn, freeze, poison, stun, lifesteal, drain, reflect)
- [ ] Turn timer (30 seconds)
- [ ] Cooldown tracking
- [ ] Win/loss/draw detection
- [ ] Battle log

### Sprint 4 (Week 7–8): Battle UI + Animations
- [ ] Arena backgrounds (2-3 pixel art arenas)
- [ ] ChimeraSprite class with all animation states
- [ ] Card hand UI (drag to play, disabled when on cooldown / no mana)
- [ ] HP bar, mana crystals, shield indicator
- [ ] Pixel particle effects for all status types
- [ ] Floating damage numbers
- [ ] Screen shake
- [ ] Turn indicator + timer UI

### Sprint 5 (Week 9–10): Polish
- [ ] Chiptune SFX (card play, hit, heal, status, victory, defeat)
- [ ] AI coach reactions during battle (optional Gemini 3 Flash calls)
- [ ] Results screen with MVP card
- [ ] Match history
- [ ] Mobile responsive layout
- [ ] Card tooltip hover details
- [ ] Rematch functionality
