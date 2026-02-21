import * as PIXI from 'pixi.js';
import gsap from 'gsap';

interface ParticleConfig {
  colors: number[];
  count: number;
  speed: { min: number; max: number };
  lifetime: { min: number; max: number };
  size: { min: number; max: number };
  gravity: number;
  shape: 'square' | 'diamond' | 'circle' | 'cross' | 'star';
  orbit?: boolean;
}

const EFFECT_CONFIGS: Record<string, ParticleConfig> = {
  burn: {
    colors: [0xff4400, 0xff8800, 0xffcc00],
    count: 12,
    speed: { min: 1, max: 3 },
    lifetime: { min: 0.3, max: 0.8 },
    size: { min: 2, max: 6 },
    gravity: -2,
    shape: 'square',
  },
  freeze: {
    colors: [0x88ccff, 0xaaddff, 0xffffff],
    count: 8,
    speed: { min: 2, max: 5 },
    lifetime: { min: 0.5, max: 1.0 },
    size: { min: 3, max: 8 },
    gravity: 1,
    shape: 'diamond',
  },
  poison: {
    colors: [0x44cc44, 0x228822, 0x88ff88],
    count: 6,
    speed: { min: 0.5, max: 2 },
    lifetime: { min: 0.4, max: 1.2 },
    size: { min: 2, max: 5 },
    gravity: 3,
    shape: 'circle',
  },
  mana_drain: {
    colors: [0x8844cc, 0xaa66ff, 0xcc88ff],
    count: 10,
    speed: { min: 1, max: 4 },
    lifetime: { min: 0.3, max: 0.6 },
    size: { min: 2, max: 4 },
    gravity: 0,
    shape: 'square',
    orbit: true,
  },
  shield: {
    colors: [0x4488ff, 0x66aaff, 0xffffff],
    count: 8,
    speed: { min: 0.5, max: 1.5 },
    lifetime: { min: 0.5, max: 1.0 },
    size: { min: 3, max: 6 },
    gravity: -0.5,
    shape: 'star',
  },
  heal: {
    colors: [0x44ff44, 0x88ff88, 0xffffff],
    count: 10,
    speed: { min: 0.5, max: 2 },
    lifetime: { min: 0.5, max: 1.5 },
    size: { min: 3, max: 5 },
    gravity: -1.5,
    shape: 'cross',
  },
  hit: {
    colors: [0xffffff, 0xffff00, 0xff8800],
    count: 8,
    speed: { min: 2, max: 5 },
    lifetime: { min: 0.2, max: 0.5 },
    size: { min: 2, max: 4 },
    gravity: 1,
    shape: 'square',
  },
  stun: {
    colors: [0xffff00, 0xffcc00, 0xffffff],
    count: 6,
    speed: { min: 1, max: 2 },
    lifetime: { min: 0.4, max: 0.8 },
    size: { min: 3, max: 5 },
    gravity: -0.5,
    shape: 'star',
  },
  lifesteal: {
    colors: [0xff0044, 0xff4488, 0xffaacc],
    count: 8,
    speed: { min: 1, max: 3 },
    lifetime: { min: 0.5, max: 1.0 },
    size: { min: 2, max: 5 },
    gravity: -2,
    shape: 'cross',
  },
  reflect: {
    colors: [0x4488ff, 0x88aaff, 0xffffff],
    count: 10,
    speed: { min: 1, max: 3 },
    lifetime: { min: 0.3, max: 0.7 },
    size: { min: 2, max: 5 },
    gravity: 0,
    shape: 'diamond',
  },
};

/** Helper: random float between min and max */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Helper: pick a random element from an array */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Draw a particle shape into a PIXI.Graphics object */
function drawParticleShape(
  g: PIXI.Graphics,
  shape: ParticleConfig['shape'],
  size: number,
  color: number
): void {
  g.clear();

  switch (shape) {
    case 'square':
      g.rect(-size / 2, -size / 2, size, size);
      g.fill({ color });
      break;

    case 'diamond':
      g.moveTo(0, -size);
      g.lineTo(size * 0.7, 0);
      g.lineTo(0, size);
      g.lineTo(-size * 0.7, 0);
      g.closePath();
      g.fill({ color });
      break;

    case 'circle':
      g.circle(0, 0, size / 2);
      g.fill({ color });
      break;

    case 'cross': {
      const arm = size * 0.3;
      // Vertical bar
      g.rect(-arm / 2, -size / 2, arm, size);
      g.fill({ color });
      // Horizontal bar
      g.rect(-size / 2, -arm / 2, size, arm);
      g.fill({ color });
      break;
    }

    case 'star': {
      const outerR = size;
      const innerR = size * 0.4;
      const points = 5;
      const step = Math.PI / points;
      g.moveTo(0, -outerR);
      for (let i = 0; i < 2 * points; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = -Math.PI / 2 + (i + 1) * step;
        g.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      g.closePath();
      g.fill({ color });
      break;
    }
  }
}

/**
 * Spawn pixel-art particles at (x, y) with the given effect type.
 */
export function spawnPixelParticles(
  container: PIXI.Container,
  x: number,
  y: number,
  effectType: string
): void {
  const config = EFFECT_CONFIGS[effectType];
  if (!config) return;

  for (let i = 0; i < config.count; i++) {
    const g = new PIXI.Graphics();
    const color = pick(config.colors);
    const size = rand(config.size.min, config.size.max);
    drawParticleShape(g, config.shape, size, color);

    // Slight random spawn offset
    const spawnOffsetX = (Math.random() - 0.5) * 20;
    const spawnOffsetY = (Math.random() - 0.5) * 20;
    g.position.set(x + spawnOffsetX, y + spawnOffsetY);
    g.alpha = 1;

    container.addChild(g);

    const lifetime = rand(config.lifetime.min, config.lifetime.max);
    const speed = rand(config.speed.min, config.speed.max);

    if (config.orbit) {
      // Orbital motion: particles circle around the origin point
      const angle = Math.random() * Math.PI * 2;
      const radius = 15 + Math.random() * 25;
      const startAngle = angle;

      const proxy = { angle: startAngle, alpha: 1 };
      gsap.to(proxy, {
        angle: startAngle + Math.PI * 2 * (Math.random() > 0.5 ? 1 : -1),
        alpha: 0,
        duration: lifetime,
        ease: 'power1.out',
        onUpdate: () => {
          g.position.set(
            x + Math.cos(proxy.angle) * radius,
            y + Math.sin(proxy.angle) * radius
          );
          g.alpha = proxy.alpha;
        },
        onComplete: () => {
          g.destroy();
        },
      });
    } else {
      // Linear motion with gravity
      const velocityAngle = Math.random() * Math.PI * 2;
      const vx = Math.cos(velocityAngle) * speed * 60; // px per second
      const vy = Math.sin(velocityAngle) * speed * 60;

      const proxy = { t: 0, alpha: 1 };
      const startX = g.x;
      const startY = g.y;

      gsap.to(proxy, {
        t: lifetime,
        alpha: 0,
        duration: lifetime,
        ease: 'power1.out',
        onUpdate: () => {
          const t = proxy.t;
          g.x = startX + vx * t;
          g.y = startY + vy * t + 0.5 * config.gravity * 60 * t * t;
          g.alpha = proxy.alpha;
        },
        onComplete: () => {
          g.destroy();
        },
      });
    }
  }
}

export { EFFECT_CONFIGS };
export type { ParticleConfig };
