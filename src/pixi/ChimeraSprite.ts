import * as PIXI from 'pixi.js';
import gsap from 'gsap';

export class ChimeraSprite {
  sprite: PIXI.Sprite;
  private baseX: number;
  private baseY: number;
  private idleTween: gsap.core.Tween | null = null;

  constructor(texture: PIXI.Texture, x: number, y: number, scale: number = 1) {
    this.sprite = new PIXI.Sprite(texture);
    this.sprite.anchor.set(0.5, 1.0); // Bottom-center
    this.sprite.texture.source.scaleMode = 'nearest'; // Crispy pixels (Pixi v8)
    this.sprite.position.set(x, y);
    this.sprite.scale.set(scale, scale);
    this.baseX = x;
    this.baseY = y;
  }

  /** IDLE: gentle bob up and down */
  startIdle(): void {
    this.idleTween = gsap.to(this.sprite, {
      y: this.baseY - 6,
      duration: 0.8,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
  }

  stopIdle(): void {
    if (this.idleTween) {
      this.idleTween.kill();
      this.idleTween = null;
    }
    this.sprite.position.set(this.baseX, this.baseY);
  }

  /** ATTACK: lunge forward + flash */
  async attackAnimation(isFlipped: boolean): Promise<void> {
    this.stopIdle();
    const dir = isFlipped ? -60 : 60;

    await gsap.to(this.sprite, {
      x: this.baseX + dir,
      duration: 0.15,
      ease: 'power2.in',
    });

    this.flashWhite(100);

    await gsap.to(this.sprite, {
      x: this.baseX,
      duration: 0.3,
      ease: 'bounce.out',
    });

    this.startIdle();
  }

  /** HURT: red tint + knockback shake */
  async hurtAnimation(): Promise<void> {
    const origTint = this.sprite.tint;
    this.sprite.tint = 0xff4444;

    await gsap.to(this.sprite, {
      x: '+=15',
      duration: 0.04,
      yoyo: true,
      repeat: 5,
    });

    this.sprite.tint = origTint;
  }

  /** DEFEND: blue glow + scale pulse */
  async defendAnimation(): Promise<void> {
    const origScaleX = Math.abs(this.sprite.scale.x);
    const signX = this.sprite.scale.x < 0 ? -1 : 1;

    this.sprite.tint = 0x4488ff;

    await gsap.to(this.sprite.scale, {
      x: signX * (origScaleX + 0.3),
      y: origScaleX + 0.3,
      duration: 0.2,
      yoyo: true,
      repeat: 1,
    });

    this.sprite.tint = 0xffffff;
  }

  /** SPECIAL: screen flash + big zoom */
  async specialAnimation(): Promise<void> {
    this.stopIdle();
    const origScaleX = Math.abs(this.sprite.scale.x);
    const signX = this.sprite.scale.x < 0 ? -1 : 1;

    this.sprite.tint = 0xffff00;

    await gsap.to(this.sprite.scale, {
      x: signX * (origScaleX + 0.6),
      y: origScaleX + 0.6,
      duration: 0.3,
    });

    await new Promise((r) => setTimeout(r, 200));

    await gsap.to(this.sprite.scale, {
      x: signX * origScaleX,
      y: origScaleX,
      duration: 0.2,
    });

    this.sprite.tint = 0xffffff;
    this.startIdle();
  }

  /** DEATH: fade + fall */
  async deathAnimation(): Promise<void> {
    this.stopIdle();

    await gsap.to(this.sprite, {
      alpha: 0,
      y: this.baseY + 20,
      rotation: 0.3,
      duration: 1.5,
      ease: 'power2.in',
    });
  }

  /** Flash white (additive blend briefly) */
  flashWhite(durationMs: number): void {
    this.sprite.tint = 0xffffff;
    this.sprite.blendMode = 'add';
    setTimeout(() => {
      this.sprite.blendMode = 'normal';
    }, durationMs);
  }

  destroy(): void {
    this.stopIdle();
    this.sprite.destroy();
  }
}
