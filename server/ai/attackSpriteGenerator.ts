// ============================================================
// Chimera Arena - Attack Sprite Generator (Gemini Image Output)
// Generates horizontal spritesheet strips for card attack animations.
// ============================================================

import { getAI } from "./client.js";
import { removeBackground } from "./spriteGenerator.js";

const MODEL = "gemini-2.5-flash-image";

const ATTACK_SPRITE_STYLE = `Generate a pixel art SPRITESHEET STRIP showing 4 animation frames laid out HORIZONTALLY in a single row.

CRITICAL LAYOUT REQUIREMENTS:
- The output image MUST contain EXACTLY 4 frames side by side horizontally in one row
- Each frame is 96x96 pixels (total image is 384 pixels wide x 96 pixels tall, upscaled 4x to 1536x384)
- Frames are evenly spaced with NO gaps between them
- Each frame shows a different stage of the attack animation (wind-up → launch → impact → fade)
- The background of ALL frames MUST be a single solid color (#00FF00 bright green) with NOTHING else

ART STYLE REQUIREMENTS:
- 16-bit pixel art style matching classic JRPG spell effects (Final Fantasy VI, Chrono Trigger)
- Clean pixel art with visible individual pixels, no anti-aliasing
- Limited color palette (8-12 colors, NOT including the green background)
- Vibrant, saturated colors appropriate for the attack element
- Each frame should look like a distinct animation keyframe
- The attack effect should be the ONLY element — no characters, no ground, no scenery

ANIMATION SEQUENCE:
`;

/**
 * Generate a 4-frame attack animation spritesheet from a text prompt.
 * Returns base64-encoded PNG data and its MIME type.
 */
export async function generateAttackSprite(
  attackSpritePrompt: string,
): Promise<{ base64: string; mimeType: string }> {
  try {
    const response = await getAI().models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: ATTACK_SPRITE_STYLE + attackSpritePrompt }],
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data && part.inlineData?.mimeType) {
          const rawBuffer = Buffer.from(part.inlineData.data, "base64");
          const cleanBuffer = await removeBackground(rawBuffer);
          return {
            base64: cleanBuffer.toString("base64"),
            mimeType: "image/png",
          };
        }
      }
    }

    console.warn(
      "[AttackSpriteGenerator] No image data found in response",
    );
    return { base64: "", mimeType: "image/png" };
  } catch (err) {
    console.error(
      "[AttackSpriteGenerator] Failed to generate attack sprite:",
      err instanceof Error ? err.message : String(err),
    );
    return { base64: "", mimeType: "image/png" };
  }
}
