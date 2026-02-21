// ============================================================
// Chimera Arena - Sprite & Card Art Generator (Gemini Image Output)
// ============================================================

import { getAI } from "./client.js";

const MODEL = "gemini-2.5-flash-image";

const CHIMERA_SPRITE_STYLE = `Generate a 16-bit JRPG battle sprite with these requirements:
- Side-view perspective (like Final Fantasy or Chrono Trigger battle sprites)
- Clean pixel art with crisp edges, no anti-aliasing
- Limited color palette of 12-16 colors
- Size: 64x64 or 96x96 pixels, upscaled cleanly (no blur)
- Transparent background
- Idle battle pose (standing ready for combat)
- 16/32-bit retro game aesthetic

Subject: `;

const CARD_ART_STYLE = `Generate a small ability icon in 16-bit pixel art style:
- Square format, suitable for a card game ability icon
- Dark border/outline around the icon
- Vibrant, saturated colors
- Fantasy RPG aesthetic (think SNES-era spell icons)
- Clean pixel art, no anti-aliasing
- Transparent or solid dark background
- 32x32 or 48x48 pixels, upscaled cleanly

Subject: `;

/**
 * Generate a chimera battle sprite from a text prompt.
 * Returns base64-encoded image data and its MIME type.
 */
export async function generateChimeraSprite(
  spritePrompt: string,
): Promise<{ base64: string; mimeType: string }> {
  try {
    const response = await getAI().models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: CHIMERA_SPRITE_STYLE + spritePrompt }],
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    // Extract inline image data from response parts
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data && part.inlineData?.mimeType) {
          return {
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
          };
        }
      }
    }

    console.warn(
      "[SpriteGenerator] No image data found in chimera sprite response",
    );
    return { base64: "", mimeType: "image/png" };
  } catch (err) {
    console.error(
      "[SpriteGenerator] Failed to generate chimera sprite:",
      err instanceof Error ? err.message : String(err),
    );
    return { base64: "", mimeType: "image/png" };
  }
}

/**
 * Generate a card ability art icon from a text prompt.
 * Returns base64-encoded image data and its MIME type.
 */
export async function generateCardArt(
  cardArtPrompt: string,
): Promise<{ base64: string; mimeType: string }> {
  try {
    const response = await getAI().models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: CARD_ART_STYLE + cardArtPrompt }],
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    // Extract inline image data from response parts
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data && part.inlineData?.mimeType) {
          return {
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
          };
        }
      }
    }

    console.warn("[SpriteGenerator] No image data found in card art response");
    return { base64: "", mimeType: "image/png" };
  } catch (err) {
    console.error(
      "[SpriteGenerator] Failed to generate card art:",
      err instanceof Error ? err.message : String(err),
    );
    return { base64: "", mimeType: "image/png" };
  }
}
