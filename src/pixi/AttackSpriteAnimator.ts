// ============================================================
// Chimera Arena - Attack Sprite Animator
// Slices a horizontal spritesheet strip into frames and plays
// it as a PIXI.AnimatedSprite during battle.
// ============================================================

import * as PIXI from 'pixi.js';

const FRAME_COUNT = 4;
const DISPLAY_SCALE = 1;

export interface AttackAnimationOptions {
  spritesheetBase64: string;
  container: PIXI.Container;
  x: number;
  y: number;
  animationSpeed?: number;
}

/**
 * Load a 4-frame horizontal spritesheet, slice it into frame textures,
 * and play it once as a PIXI.AnimatedSprite. Resolves when complete.
 */
export async function playAttackAnimation(
  options: AttackAnimationOptions,
): Promise<void> {
  const {
    spritesheetBase64,
    container,
    x,
    y,
    animationSpeed = 0.12,
  } = options;

  // Load the full spritesheet as a texture
  let src = spritesheetBase64;
  if (!src.startsWith('data:')) {
    src = `data:image/png;base64,${src}`;
  }

  const sheetTexture: PIXI.Texture = await PIXI.Assets.load({
    src,
    loadParser: 'loadTextures',
  });

  // Slice into individual frame textures
  const sourceWidth = sheetTexture.width;
  const sourceHeight = sheetTexture.height;
  const frameWidth = Math.floor(sourceWidth / FRAME_COUNT);
  const frameHeight = sourceHeight;

  const frameTextures: PIXI.Texture[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const rect = new PIXI.Rectangle(
      i * frameWidth,
      0,
      frameWidth,
      frameHeight,
    );
    const frameTex = new PIXI.Texture({
      source: sheetTexture.source,
      frame: rect,
    });
    frameTex.source.scaleMode = 'nearest';
    frameTextures.push(frameTex);
  }

  return new Promise<void>((resolve) => {
    const animSprite = new PIXI.AnimatedSprite(frameTextures);
    animSprite.anchor.set(0.5, 0.5);
    animSprite.position.set(x, y);
    animSprite.scale.set(DISPLAY_SCALE);
    animSprite.animationSpeed = animationSpeed;
    animSprite.loop = false;

    animSprite.onComplete = () => {
      container.removeChild(animSprite);
      animSprite.destroy();
      resolve();
    };

    container.addChild(animSprite);
    animSprite.play();
  });
}
