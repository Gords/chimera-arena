import * as PIXI from 'pixi.js';
import gsap from 'gsap';

/**
 * Spawn a floating damage/heal number that drifts upward and fades out.
 */
export function showDamageNumber(
  container: PIXI.Container,
  x: number,
  y: number,
  amount: number,
  type: 'damage' | 'heal' | 'shield' | 'mana'
): void {
  const colorMap: Record<string, string> = {
    damage: '#FF4444',
    heal: '#44FF44',
    shield: '#4488FF',
    mana: '#AA66FF',
  };

  const prefixMap: Record<string, string> = {
    damage: '-',
    heal: '+',
    shield: '\u{1F6E1}\uFE0F+',
    mana: '\u25C6+',
  };

  const prefix = prefixMap[type] ?? '';
  const displayText = `${prefix}${amount}`;

  const style = new PIXI.TextStyle({
    fontFamily: '"Press Start 2P", monospace',
    fontSize: 16,
    fill: colorMap[type] ?? '#FFFFFF',
    stroke: { color: '#000000', width: 3 },
    align: 'center',
  });

  const text = new PIXI.Text({ text: displayText, style });
  text.anchor.set(0.5, 0.5);

  // Slight random X offset so simultaneous numbers don't overlap
  const offsetX = (Math.random() - 0.5) * 40;
  text.position.set(x + offsetX, y);
  text.alpha = 1;

  container.addChild(text);

  // Float upward 40px and fade out over 1.2s
  gsap.to(text, {
    y: y - 40,
    alpha: 0,
    duration: 1.2,
    ease: 'power1.out',
    onComplete: () => {
      text.destroy();
    },
  });

  // Slight scale pop at start
  text.scale.set(0.6, 0.6);
  gsap.to(text.scale, {
    x: 1,
    y: 1,
    duration: 0.15,
    ease: 'back.out(2)',
  });
}
