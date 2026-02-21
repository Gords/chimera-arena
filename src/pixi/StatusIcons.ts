import * as PIXI from 'pixi.js';

/**
 * Create a 16x16 pixel icon for the given status effect type using PIXI.Graphics.
 */
export function createStatusIcon(effectType: string): PIXI.Graphics {
  const g = new PIXI.Graphics();

  switch (effectType) {
    case 'burn':
      // Flame shape (orange/red)
      g.moveTo(8, 0);
      g.quadraticCurveTo(14, 6, 12, 10);
      g.quadraticCurveTo(10, 14, 8, 16);
      g.quadraticCurveTo(6, 14, 4, 10);
      g.quadraticCurveTo(2, 6, 8, 0);
      g.closePath();
      g.fill({ color: 0xff6600 });
      // Inner flame
      g.moveTo(8, 5);
      g.quadraticCurveTo(11, 9, 10, 12);
      g.quadraticCurveTo(8, 15, 6, 12);
      g.quadraticCurveTo(5, 9, 8, 5);
      g.closePath();
      g.fill({ color: 0xffcc00 });
      break;

    case 'freeze':
      // Snowflake / crystal (light blue)
      g.setStrokeStyle({ width: 2, color: 0x88ccff });
      // Vertical line
      g.moveTo(8, 1);
      g.lineTo(8, 15);
      g.stroke();
      // Diagonal lines
      g.moveTo(2, 4);
      g.lineTo(14, 12);
      g.stroke();
      g.moveTo(14, 4);
      g.lineTo(2, 12);
      g.stroke();
      // Center dot
      g.circle(8, 8, 2);
      g.fill({ color: 0xffffff });
      break;

    case 'poison':
      // Droplet shape (green)
      g.moveTo(8, 1);
      g.quadraticCurveTo(15, 9, 8, 15);
      g.quadraticCurveTo(1, 9, 8, 1);
      g.closePath();
      g.fill({ color: 0x44cc44 });
      // Inner highlight
      g.circle(6, 8, 2);
      g.fill({ color: 0x88ff88 });
      break;

    case 'stun':
      // Stars (yellow)
      drawMiniStar(g, 4, 4, 3, 0xffff00);
      drawMiniStar(g, 12, 6, 3, 0xffcc00);
      drawMiniStar(g, 7, 12, 2.5, 0xffff00);
      break;

    case 'reflect':
      // Mirror / shield shape (blue)
      g.roundRect(2, 1, 12, 14, 3);
      g.fill({ color: 0x4488ff });
      // Reflective shine
      g.setStrokeStyle({ width: 1, color: 0xaaccff });
      g.moveTo(5, 4);
      g.lineTo(8, 7);
      g.lineTo(5, 10);
      g.stroke();
      g.moveTo(8, 4);
      g.lineTo(11, 7);
      g.lineTo(8, 10);
      g.stroke();
      break;

    case 'mana_drain':
      // Swirl (purple)
      g.setStrokeStyle({ width: 2, color: 0xaa66ff });
      g.arc(8, 8, 6, 0, Math.PI * 1.5);
      g.stroke();
      g.setStrokeStyle({ width: 2, color: 0xcc88ff });
      g.arc(8, 8, 3, Math.PI, Math.PI * 2.5);
      g.stroke();
      // Center dot
      g.circle(8, 8, 1.5);
      g.fill({ color: 0xcc88ff });
      break;

    case 'lifesteal':
      // Heart shape (red/pink)
      g.moveTo(8, 14);
      g.quadraticCurveTo(0, 8, 2, 4);
      g.quadraticCurveTo(4, 1, 8, 5);
      g.quadraticCurveTo(12, 1, 14, 4);
      g.quadraticCurveTo(16, 8, 8, 14);
      g.closePath();
      g.fill({ color: 0xff3366 });
      // Inner highlight
      g.circle(5, 5, 1.5);
      g.fill({ color: 0xffaacc });
      break;

    default:
      // Generic unknown effect: question mark in a circle
      g.circle(8, 8, 7);
      g.fill({ color: 0x888888 });
      g.circle(8, 8, 5);
      g.fill({ color: 0x444444 });
      break;
  }

  return g;
}

/** Draw a small 5-pointed star into a Graphics object at (cx, cy) with radius r. */
function drawMiniStar(
  g: PIXI.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number
): void {
  const points = 5;
  const outerR = r;
  const innerR = r * 0.4;
  const step = Math.PI / points;

  g.moveTo(cx, cy - outerR);
  for (let i = 0; i < 2 * points; i++) {
    const rad = i % 2 === 0 ? outerR : innerR;
    const angle = -Math.PI / 2 + (i + 1) * step;
    g.lineTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
  }
  g.closePath();
  g.fill({ color });
}

/**
 * Draw a row of status effect icons beneath a chimera sprite.
 * Clears any previous icons in the container, then draws each active effect
 * with a small duration number below it.
 */
export function drawStatusIcons(
  container: PIXI.Container,
  effects: Array<{ type: string; duration: number }>,
  x: number,
  y: number
): void {
  // Remove old status icons
  container.removeChildren();

  const iconSpacing = 22;
  const totalWidth = effects.length * iconSpacing;
  const startX = x - totalWidth / 2 + iconSpacing / 2;

  effects.forEach((effect, i) => {
    const icon = createStatusIcon(effect.type);
    icon.position.set(startX + i * iconSpacing, y);
    container.addChild(icon);

    // Duration label below icon
    if (effect.duration > 0) {
      const durationStyle = new PIXI.TextStyle({
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 8,
        fill: '#FFFFFF',
        align: 'center',
      });
      const durationText = new PIXI.Text({
        text: `${effect.duration}`,
        style: durationStyle,
      });
      durationText.anchor.set(0.5, 0);
      durationText.position.set(startX + i * iconSpacing + 8, y + 18);
      container.addChild(durationText);
    }
  });
}
