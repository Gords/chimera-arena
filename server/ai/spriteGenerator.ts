// ============================================================
// Chimera Arena - Sprite & Card Art Generator (Gemini Image Output)
// ============================================================

import { getAI } from "./client.js";
import sharp from "sharp";

const MODEL = "gemini-2.5-flash-image";

const CHIMERA_SPRITE_STYLE = `Generate a single game character sprite in the style of classic 16-bit / 32-bit JRPG battle sprites (like Final Fantasy VI or Chrono Trigger).

CRITICAL REQUIREMENTS:
- The background MUST be a single solid color (#00FF00 bright green) with NOTHING else — no ground, no shadow, no scenery, no gradient
- The character should be the ONLY element in the image
- Side-view battle stance (facing right)
- Clean pixel art with visible individual pixels, no anti-aliasing
- Limited color palette (12-16 colors max, NOT including the green background)
- Sized to look like a 96x96 pixel sprite upscaled 4x to 384x384
- Slight idle animation pose (not static)

Character: `;

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
/**
 * Remove the green-screen background from a sprite image.
 * Converts bright green (#00FF00 and nearby shades) to transparent.
 */
async function removeBackground(
  imageBuffer: Buffer,
): Promise<Buffer> {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const THRESHOLD = 80; // tolerance for green-screen detection

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    // Detect green-screen: high green, low red and blue
    if (g > 180 && r < THRESHOLD && b < THRESHOLD) {
      pixels[i + 3] = 0; // set alpha to 0
    }
    // Also catch near-white backgrounds (common AI fallback)
    if (r > 240 && g > 240 && b > 240) {
      pixels[i + 3] = 0;
    }
  }

  return sharp(Buffer.from(pixels), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

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
          // Remove the green-screen background
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
