// ============================================================
// Chimera Arena - Full Chimera Generation Orchestrator
// ============================================================

import type { Chimera, BuildParts } from '../types.js';
import { generateChimeraStats } from './chimeraGenerator.js';
import { generateChimeraSprite, generateCardArt } from './spriteGenerator.js';
import { generateAttackSprite } from './attackSpriteGenerator.js';

/**
 * Orchestrates the full chimera generation pipeline:
 * 1. Generate stats + cards via Gemini (text/JSON)
 * 2. In parallel: generate chimera sprite + all 3 card art images
 * 3. Assemble and return the complete Chimera object
 */
export async function generateFullChimera(parts: BuildParts): Promise<Chimera> {
  // Step 1: Generate stats, cards, and get sprite/card art prompts
  console.log('[GenerateChimera] Generating chimera stats and cards...');
  const { chimera: chimeraData, spritePrompt, cardArtPrompts, attackSpritePrompts } =
    await generateChimeraStats(parts);

  // Step 2: Generate all images in parallel
  // 1 chimera sprite + 3 card art + 3 attack spritesheets = 7 parallel requests
  console.log('[GenerateChimera] Generating images in parallel (1 sprite + 3 card arts + 3 attack sprites)...');

  const [spriteResult, ...imageResults] = await Promise.all([
    generateChimeraSprite(spritePrompt),
    ...cardArtPrompts.map((prompt) => generateCardArt(prompt)),
    ...attackSpritePrompts.map((prompt) => generateAttackSprite(prompt)),
  ]);

  // imageResults: indices 0-2 are card art, indices 3-5 are attack sprites
  const cardArtResults = imageResults.slice(0, 3);
  const attackSpriteResults = imageResults.slice(3, 6);

  // Step 3: Assemble the final Chimera object
  const sprite = spriteResult.base64
    ? `data:${spriteResult.mimeType};base64,${spriteResult.base64}`
    : '';

  const cards = chimeraData.cards.map((card, index) => {
    const artResult = cardArtResults[index];
    const cardArt = artResult?.base64
      ? `data:${artResult.mimeType};base64,${artResult.base64}`
      : '';

    const attackResult = attackSpriteResults[index];
    const attackSprite = attackResult?.base64
      ? `data:${attackResult.mimeType};base64,${attackResult.base64}`
      : '';

    return {
      ...card,
      cardArt,
      attackSprite,
    };
  });

  const chimera: Chimera = {
    name: chimeraData.name,
    description: chimeraData.description,
    sprite,
    stats: {
      maxHp: chimeraData.stats.maxHp,
      hp: chimeraData.stats.maxHp, // start at full HP
      maxMana: chimeraData.stats.maxMana,
      mana: chimeraData.stats.manaRegen, // start with manaRegen amount of mana
      manaRegen: chimeraData.stats.manaRegen,
    },
    cards,
    passiveAbility: chimeraData.passiveAbility,
    weaknesses: chimeraData.weaknesses,
  };

  console.log(
    `[GenerateChimera] Successfully generated "${chimera.name}" ` +
    `(HP: ${chimera.stats.maxHp}, Mana: ${chimera.stats.maxMana}, ` +
    `Cards: ${chimera.cards.map((c) => c.name).join(', ')})`,
  );

  return chimera;
}
