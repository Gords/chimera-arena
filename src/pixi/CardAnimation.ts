import * as PIXI from 'pixi.js';
import gsap from 'gsap';

/**
 * Animate a card flying to center stage, flash, then fade out.
 * Total duration ~0.8s.
 */
export async function animateCardToCenter(
  container: PIXI.Container,
  cardName: string,
  cardType: 'attack' | 'defense' | 'special',
  stageWidth: number,
  stageHeight: number
): Promise<void> {
  const borderColorMap: Record<string, number> = {
    attack: 0xff4444,
    defense: 0x4488ff,
    special: 0xffcc00,
  };

  const bgColorMap: Record<string, number> = {
    attack: 0x331111,
    defense: 0x112233,
    special: 0x332200,
  };

  const borderColor = borderColorMap[cardType] ?? 0xffffff;
  const bgColor = bgColorMap[cardType] ?? 0x222222;

  // Card container
  const cardContainer = new PIXI.Container();

  // Card background (rounded rectangle)
  const cardBg = new PIXI.Graphics();
  const cardW = 120;
  const cardH = 70;

  // Border
  cardBg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
  cardBg.fill({ color: bgColor });
  cardBg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
  cardBg.stroke({ color: borderColor, width: 3 });

  cardContainer.addChild(cardBg);

  // Card name text
  const nameStyle = new PIXI.TextStyle({
    fontFamily: '"Press Start 2P", monospace',
    fontSize: 10,
    fill: '#FFFFFF',
    align: 'center',
    wordWrap: true,
    wordWrapWidth: cardW - 16,
  });
  const nameText = new PIXI.Text({ text: cardName, style: nameStyle });
  nameText.anchor.set(0.5, 0.5);
  cardContainer.addChild(nameText);

  // Start from bottom center
  cardContainer.position.set(stageWidth / 2, stageHeight + cardH);
  cardContainer.alpha = 1;
  cardContainer.scale.set(0.5, 0.5);

  container.addChild(cardContainer);

  // Animate to center
  await gsap.to(cardContainer, {
    x: stageWidth / 2,
    y: stageHeight / 2 - 30,
    duration: 0.25,
    ease: 'power2.out',
  });

  // Scale up with a pop
  await gsap.to(cardContainer.scale, {
    x: 1.1,
    y: 1.1,
    duration: 0.1,
    ease: 'back.out(2)',
  });

  // Flash: briefly brighten
  cardBg.tint = 0xffffff;
  await new Promise((r) => setTimeout(r, 80));

  // Fade out and scale down together
  await gsap.to(cardContainer, {
    alpha: 0,
    duration: 0.2,
    ease: 'power2.in',
  });

  gsap.to(cardContainer.scale, {
    x: 0.8,
    y: 0.8,
    duration: 0.2,
  });

  // Wait for the scale tween to effectively finish alongside the alpha
  cardContainer.destroy({ children: true });
}

/**
 * Show ability name in large pixel text centered on screen.
 * Fades in, holds, then fades out.
 */
export async function showAbilityName(
  container: PIXI.Container,
  name: string,
  stageWidth: number,
  stageHeight: number,
  durationMs: number = 800
): Promise<void> {
  const style = new PIXI.TextStyle({
    fontFamily: '"Press Start 2P", monospace',
    fontSize: 20,
    fill: '#FFFFFF',
    stroke: { color: '#000000', width: 4 },
    align: 'center',
    dropShadow: {
      color: '#000000',
      blur: 4,
      distance: 2,
      angle: Math.PI / 4,
    },
  });

  const text = new PIXI.Text({ text: name, style });
  text.anchor.set(0.5, 0.5);
  text.position.set(stageWidth / 2, stageHeight / 2 - 60);
  text.alpha = 0;

  container.addChild(text);

  const holdDuration = durationMs / 1000;
  const fadeInDuration = 0.15;
  const fadeOutDuration = 0.2;

  // Fade in
  await gsap.to(text, {
    alpha: 1,
    duration: fadeInDuration,
    ease: 'power1.in',
  });

  // Hold
  await new Promise((r) => setTimeout(r, holdDuration * 1000 - (fadeInDuration + fadeOutDuration) * 1000));

  // Fade out + drift up
  await gsap.to(text, {
    alpha: 0,
    y: text.y - 15,
    duration: fadeOutDuration,
    ease: 'power1.out',
  });

  text.destroy();
}
