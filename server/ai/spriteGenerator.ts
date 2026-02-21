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
 * Remove the background from a sprite image by detecting the dominant
 * corner color and flood-filling from edges. Works regardless of what
 * background color the AI actually generates.
 */
async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixels = new Uint8Array(data);

  // Step 1: Sample corners to detect the background color
  const cornerSamples: Array<[number, number, number]> = [];
  const sampleSize = Math.max(4, Math.floor(Math.min(width, height) * 0.05));

  for (let y = 0; y < sampleSize; y++) {
    for (let x = 0; x < sampleSize; x++) {
      // All 4 corners
      for (const [sx, sy] of [
        [x, y],
        [width - 1 - x, y],
        [x, height - 1 - y],
        [width - 1 - x, height - 1 - y],
      ]) {
        const i = (sy * width + sx) * channels;
        cornerSamples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
      }
    }
  }

  // Find the most common color among corner samples (bucket by rounding to nearest 8)
  const colorCounts = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (const [r, g, b] of cornerSamples) {
    const key = `${r >> 3},${g >> 3},${b >> 3}`;
    const entry = colorCounts.get(key);
    if (entry) {
      entry.count++;
      entry.r += r;
      entry.g += g;
      entry.b += b;
    } else {
      colorCounts.set(key, { count: 1, r, g, b });
    }
  }

  let best = { count: 0, r: 0, g: 0, b: 0 };
  for (const entry of colorCounts.values()) {
    if (entry.count > best.count) best = entry;
  }

  // Average of the winning bucket
  const bgR = Math.round(best.r / best.count);
  const bgG = Math.round(best.g / best.count);
  const bgB = Math.round(best.b / best.count);

  console.log(`[SpriteGenerator] Detected background color: rgb(${bgR}, ${bgG}, ${bgB})`);

  // Step 2: Flood-fill from all edge pixels that match the background color.
  // This avoids removing interior pixels that happen to be similar.
  const TOLERANCE = 55;
  const visited = new Uint8Array(width * height); // 0 = unvisited, 1 = visited
  const toRemove = new Uint8Array(width * height); // 1 = mark transparent

  function colorDist(i: number): number {
    const dr = pixels[i] - bgR;
    const dg = pixels[i + 1] - bgG;
    const db = pixels[i + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // BFS flood-fill from edges
  const queue: number[] = []; // flat indices (y * width + x)

  // Seed with all edge pixels
  for (let x = 0; x < width; x++) {
    queue.push(x);                          // top row
    queue.push((height - 1) * width + x);   // bottom row
  }
  for (let y = 1; y < height - 1; y++) {
    queue.push(y * width);                  // left column
    queue.push(y * width + (width - 1));    // right column
  }

  while (queue.length > 0) {
    const idx = queue.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const pi = idx * channels;
    if (colorDist(pi) > TOLERANCE) continue;

    toRemove[idx] = 1;

    const x = idx % width;
    const y = (idx - x) / width;

    // 4-connected neighbors
    if (x > 0 && !visited[idx - 1]) queue.push(idx - 1);
    if (x < width - 1 && !visited[idx + 1]) queue.push(idx + 1);
    if (y > 0 && !visited[idx - width]) queue.push(idx - width);
    if (y < height - 1 && !visited[idx + width]) queue.push(idx + width);
  }

  // Step 3: Apply transparency and soften edges
  for (let i = 0; i < width * height; i++) {
    if (toRemove[i]) {
      pixels[i * channels + 3] = 0;
    }
  }

  // Step 4: Anti-alias the edges — partially transparent pixels next to removed ones
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (toRemove[idx]) continue; // already removed

      // Count how many neighbors were removed
      let removedNeighbors = 0;
      if (toRemove[idx - 1]) removedNeighbors++;
      if (toRemove[idx + 1]) removedNeighbors++;
      if (toRemove[idx - width]) removedNeighbors++;
      if (toRemove[idx + width]) removedNeighbors++;

      if (removedNeighbors > 0) {
        const pi = idx * channels;
        const dist = colorDist(pi);
        if (dist < TOLERANCE * 1.5) {
          // Fade alpha based on distance from bg color
          const fade = Math.min(1, dist / (TOLERANCE * 1.5));
          pixels[pi + 3] = Math.round(pixels[pi + 3] * fade);
        }
      }
    }
  }

  return sharp(Buffer.from(pixels), {
    raw: { width, height, channels: 4 },
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
