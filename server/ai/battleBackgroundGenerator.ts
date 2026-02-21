// ============================================================
// Chimera Arena - Battle Background Generator (Gemini Image Output)
// Generates pixel art arena backgrounds for battle scenes.
// ============================================================

import { getAI } from "./client.js";

const MODEL = "gemini-2.5-flash-image";

const BATTLE_BACKGROUND_STYLE = `Generate a 16-bit pixel art battle arena background in the style of classic JRPG battle screens (Final Fantasy VI, Chrono Trigger).

CRITICAL REQUIREMENTS:
- Landscape orientation, approximately 2:1 width-to-height ratio
- NO characters, creatures, or fighters — this is an empty arena backdrop
- Clean pixel art with visible individual pixels, no anti-aliasing
- Limited color palette (16-24 colors max)
- Include a visible ground/platform area in the lower ~25% of the image where characters would stand
- Atmospheric and moody lighting appropriate for a battle scene
- No text, UI elements, or HUD overlays

Scene description: `;

/**
 * Generate a pixel art battle background from a scene description.
 * Returns base64-encoded image data and its MIME type.
 */
export async function generateBattleBackground(
  scenePrompt: string,
): Promise<{ base64: string; mimeType: string }> {
  try {
    const response = await getAI().models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: BATTLE_BACKGROUND_STYLE + scenePrompt }],
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
          return {
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
          };
        }
      }
    }

    console.warn(
      "[BattleBackgroundGenerator] No image data found in response",
    );
    return { base64: "", mimeType: "image/png" };
  } catch (err) {
    console.error(
      "[BattleBackgroundGenerator] Failed to generate background:",
      err instanceof Error ? err.message : String(err),
    );
    return { base64: "", mimeType: "image/png" };
  }
}
