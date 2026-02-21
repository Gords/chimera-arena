import * as PIXI from 'pixi.js';
import gsap from 'gsap';
import { ChimeraSprite } from './ChimeraSprite.js';

export class ArenaStage {
  app: PIXI.Application;
  private arenaContainer: PIXI.Container;
  private spriteContainer: PIXI.Container;
  private particleContainer: PIXI.Container;
  private uiContainer: PIXI.Container;
  private playerSprite: ChimeraSprite | null = null;
  private enemySprite: ChimeraSprite | null = null;
  private bgAnimTweens: Array<gsap.core.Tween> = [];

  constructor() {
    this.app = new PIXI.Application();
    this.arenaContainer = new PIXI.Container();
    this.spriteContainer = new PIXI.Container();
    this.particleContainer = new PIXI.Container();
    this.uiContainer = new PIXI.Container();
  }

  /**
   * Initialize the PIXI Application and set up layer containers.
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      background: '#1a1a2e',
      resolution: window.devicePixelRatio || 1,
      antialias: false, // Pixel art - no smoothing
      autoDensity: true,
      width: canvas.parentElement?.clientWidth ?? 800,
      height: canvas.parentElement?.clientHeight ?? 600,
    });

    // Layer order: background -> sprites -> particles -> UI overlay
    this.app.stage.addChild(this.arenaContainer);
    this.app.stage.addChild(this.spriteContainer);
    this.app.stage.addChild(this.particleContainer);
    this.app.stage.addChild(this.uiContainer);
  }

  /**
   * Create a procedural pixel-art arena background using PIXI.Graphics.
   * Each type uses different colors and simple geometric patterns.
   */
  setArenaBackground(
    type: 'volcanic' | 'crystal' | 'sky' | 'forest' | 'cyber'
  ): void {
    // Clean up previous background
    this.arenaContainer.removeChildren();
    this.bgAnimTweens.forEach((t) => t.kill());
    this.bgAnimTweens = [];

    const w = this.app.screen.width;
    const h = this.app.screen.height;

    switch (type) {
      case 'volcanic':
        this._drawVolcanic(w, h);
        break;
      case 'crystal':
        this._drawCrystal(w, h);
        break;
      case 'sky':
        this._drawSky(w, h);
        break;
      case 'forest':
        this._drawForest(w, h);
        break;
      case 'cyber':
        this._drawCyber(w, h);
        break;
    }

    // Ground platform line
    const ground = new PIXI.Graphics();
    ground.rect(0, h * 0.75, w, 2);
    ground.fill({ color: 0x444466 });
    this.arenaContainer.addChild(ground);
  }

  // ---------- Background Generators ----------

  private _drawVolcanic(w: number, h: number): void {
    // Dark red / dark background
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, w, h);
    bg.fill({ color: 0x1a0808 });
    this.arenaContainer.addChild(bg);

    // Stone floor
    const floor = new PIXI.Graphics();
    floor.rect(0, h * 0.75, w, h * 0.25);
    floor.fill({ color: 0x2a1a1a });
    this.arenaContainer.addChild(floor);

    // Lava pools with flicker
    for (let i = 0; i < 3; i++) {
      const lava = new PIXI.Graphics();
      const lx = w * (0.15 + i * 0.3) + (Math.random() - 0.5) * 40;
      const ly = h * 0.82 + Math.random() * 30;
      const lw = 30 + Math.random() * 50;
      const lh = 8 + Math.random() * 6;
      lava.ellipse(lx, ly, lw, lh);
      lava.fill({ color: 0xff6600 });
      this.arenaContainer.addChild(lava);

      const tween = gsap.to(lava, {
        alpha: 0.5 + Math.random() * 0.3,
        duration: 0.3 + Math.random() * 0.5,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      this.bgAnimTweens.push(tween);
    }

    // Stone pillars
    for (let i = 0; i < 2; i++) {
      const pillar = new PIXI.Graphics();
      const px = w * (0.1 + i * 0.8);
      const pw = 20 + Math.random() * 15;
      const ph = 80 + Math.random() * 60;
      pillar.rect(px - pw / 2, h * 0.75 - ph, pw, ph);
      pillar.fill({ color: 0x3d2222 });
      // Pillar highlight edge
      pillar.rect(px - pw / 2, h * 0.75 - ph, 4, ph);
      pillar.fill({ color: 0x5a3333 });
      this.arenaContainer.addChild(pillar);
    }
  }

  private _drawCrystal(w: number, h: number): void {
    // Deep blue background
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, w, h);
    bg.fill({ color: 0x0a0a2e });
    this.arenaContainer.addChild(bg);

    // Crystal floor
    const floor = new PIXI.Graphics();
    floor.rect(0, h * 0.75, w, h * 0.25);
    floor.fill({ color: 0x112244 });
    this.arenaContainer.addChild(floor);

    // Crystal formations (diamond shapes)
    const crystalColors = [0x4488cc, 0x66aaff, 0x88ccff];
    for (let i = 0; i < 5; i++) {
      const crystal = new PIXI.Graphics();
      const cx = w * (0.1 + Math.random() * 0.8);
      const cy = h * 0.45 + Math.random() * (h * 0.3);
      const cSize = 10 + Math.random() * 25;

      crystal.moveTo(cx, cy - cSize);
      crystal.lineTo(cx + cSize * 0.5, cy);
      crystal.lineTo(cx, cy + cSize * 0.5);
      crystal.lineTo(cx - cSize * 0.5, cy);
      crystal.closePath();
      crystal.fill({ color: crystalColors[i % 3] });
      this.arenaContainer.addChild(crystal);

      // Sparkle / glow animation
      const tween = gsap.to(crystal, {
        alpha: 0.4 + Math.random() * 0.3,
        duration: 0.8 + Math.random() * 1.2,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
        delay: Math.random() * 2,
      });
      this.bgAnimTweens.push(tween);
    }
  }

  private _drawSky(w: number, h: number): void {
    // Light blue top, slightly darker lower
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, w, h * 0.5);
    bg.fill({ color: 0x6688cc });
    bg.rect(0, h * 0.5, w, h * 0.25);
    bg.fill({ color: 0x8899bb });
    this.arenaContainer.addChild(bg);

    // Platform / floor
    const floor = new PIXI.Graphics();
    floor.rect(0, h * 0.75, w, h * 0.25);
    floor.fill({ color: 0xccbbaa });
    this.arenaContainer.addChild(floor);

    // Clouds with gentle drift
    for (let i = 0; i < 4; i++) {
      const cloud = new PIXI.Graphics();
      const cx = w * (0.1 + i * 0.25);
      const cy = h * (0.1 + Math.random() * 0.25);
      cloud.ellipse(cx, cy, 40 + Math.random() * 30, 12 + Math.random() * 8);
      cloud.fill({ color: 0xffffff });
      cloud.alpha = 0.6 + Math.random() * 0.3;
      this.arenaContainer.addChild(cloud);

      const tween = gsap.to(cloud, {
        x: '+=20',
        duration: 4 + Math.random() * 3,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      this.bgAnimTweens.push(tween);
    }

    // Ancient pillar columns
    for (let i = 0; i < 3; i++) {
      const pillar = new PIXI.Graphics();
      const px = w * (0.15 + i * 0.35);
      const pw = 16;
      const ph = 100 + Math.random() * 40;
      pillar.rect(px - pw / 2, h * 0.75 - ph, pw, ph);
      pillar.fill({ color: 0x998877 });
      // Column capital (top block)
      pillar.rect(px - pw, h * 0.75 - ph - 6, pw * 2, 6);
      pillar.fill({ color: 0xaa9988 });
      this.arenaContainer.addChild(pillar);
    }
  }

  private _drawForest(w: number, h: number): void {
    // Dark green background
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, w, h);
    bg.fill({ color: 0x0a1a0a });
    this.arenaContainer.addChild(bg);

    // Forest floor
    const floor = new PIXI.Graphics();
    floor.rect(0, h * 0.75, w, h * 0.25);
    floor.fill({ color: 0x1a2a12 });
    this.arenaContainer.addChild(floor);

    // Tree trunks with canopy
    for (let i = 0; i < 4; i++) {
      const tree = new PIXI.Graphics();
      const tx = w * (0.05 + i * 0.28) + (Math.random() - 0.5) * 30;
      const tw = 14 + Math.random() * 10;
      const th = 120 + Math.random() * 80;
      // Trunk
      tree.rect(tx - tw / 2, h * 0.75 - th, tw, th);
      tree.fill({ color: 0x3d2a1a });
      // Canopy (simple circle)
      tree.circle(tx, h * 0.75 - th - 20, 30 + Math.random() * 20);
      tree.fill({ color: 0x224422 });
      this.arenaContainer.addChild(tree);
    }

    // Fog overlay with breathing animation
    const fog = new PIXI.Graphics();
    fog.rect(0, h * 0.4, w, h * 0.35);
    fog.fill({ color: 0x88aa88 });
    fog.alpha = 0.08;
    this.arenaContainer.addChild(fog);

    const fogTween = gsap.to(fog, {
      alpha: 0.15,
      duration: 3,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
    this.bgAnimTweens.push(fogTween);
  }

  private _drawCyber(w: number, h: number): void {
    // Dark purple background
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, w, h);
    bg.fill({ color: 0x0a0a1e });
    this.arenaContainer.addChild(bg);

    // Cyber floor
    const floor = new PIXI.Graphics();
    floor.rect(0, h * 0.75, w, h * 0.25);
    floor.fill({ color: 0x110022 });
    this.arenaContainer.addChild(floor);

    // Neon grid lines (vertical)
    const gridSpacingX = 60;
    for (let i = 0; i < Math.floor(w / gridSpacingX) + 1; i++) {
      const line = new PIXI.Graphics();
      const lx = i * gridSpacingX;
      line.rect(lx, h * 0.75, 1, h * 0.25);
      line.fill({ color: 0x8844cc });
      line.alpha = 0.3;
      this.arenaContainer.addChild(line);
    }

    // Neon grid lines (horizontal)
    const gridSpacingY = 30;
    for (let i = 0; i < Math.floor((h * 0.25) / gridSpacingY) + 1; i++) {
      const line = new PIXI.Graphics();
      const ly = h * 0.75 + i * gridSpacingY;
      line.rect(0, ly, w, 1);
      line.fill({ color: 0x8844cc });
      line.alpha = 0.3;
      this.arenaContainer.addChild(line);
    }

    // Glowing borders (top and bottom of arena area)
    const topBorder = new PIXI.Graphics();
    topBorder.rect(0, h * 0.75 - 2, w, 2);
    topBorder.fill({ color: 0xcc44ff });
    this.arenaContainer.addChild(topBorder);

    const bottomBorder = new PIXI.Graphics();
    bottomBorder.rect(0, h - 2, w, 2);
    bottomBorder.fill({ color: 0xcc44ff });
    this.arenaContainer.addChild(bottomBorder);

    // Side neon borders
    const leftBorder = new PIXI.Graphics();
    leftBorder.rect(0, 0, 2, h);
    leftBorder.fill({ color: 0xcc44ff });
    leftBorder.alpha = 0.5;
    this.arenaContainer.addChild(leftBorder);

    const rightBorder = new PIXI.Graphics();
    rightBorder.rect(w - 2, 0, 2, h);
    rightBorder.fill({ color: 0xcc44ff });
    rightBorder.alpha = 0.5;
    this.arenaContainer.addChild(rightBorder);

    // Pulse animation on glowing borders
    const pulseTween = gsap.to([topBorder, bottomBorder], {
      alpha: 0.4,
      duration: 0.8,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
    this.bgAnimTweens.push(pulseTween);
  }

  /**
   * Load chimera sprites from base64-encoded images, create ChimeraSprite
   * instances, and position them on the battle stage.
   */
  async loadChimeras(
    playerSpriteBase64: string,
    enemySpriteBase64: string
  ): Promise<void> {
    // Clean up existing sprites
    if (this.playerSprite) {
      this.spriteContainer.removeChild(this.playerSprite.sprite);
      this.playerSprite.destroy();
      this.playerSprite = null;
    }
    if (this.enemySprite) {
      this.spriteContainer.removeChild(this.enemySprite.sprite);
      this.enemySprite.destroy();
      this.enemySprite = null;
    }

    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const groundY = h * 0.75;

    // Convert base64 to PIXI textures
    const playerTexture = await this._base64ToTexture(playerSpriteBase64);
    const enemyTexture = await this._base64ToTexture(enemySpriteBase64);

    // Player on left (25%), enemy on right (75%), both at ground level
    const playerX = w * 0.25;
    const enemyX = w * 0.75;

    this.playerSprite = new ChimeraSprite(playerTexture, playerX, groundY);
    this.enemySprite = new ChimeraSprite(enemyTexture, enemyX, groundY);

    // Flip enemy horizontally (negative scale preserves magnitude)
    this.enemySprite.sprite.scale.x = -4;

    // Add to sprite container
    this.spriteContainer.addChild(this.playerSprite.sprite);
    this.spriteContainer.addChild(this.enemySprite.sprite);

    // Start idle animations
    this.playerSprite.startIdle();
    this.enemySprite.startIdle();
  }

  /**
   * Convert a base64-encoded image string to a PIXI.Texture.
   * Handles both raw base64 and data URI formats.
   */
  private async _base64ToTexture(base64: string): Promise<PIXI.Texture> {
    let src = base64;
    if (!src.startsWith('data:')) {
      src = `data:image/png;base64,${src}`;
    }

    const texture = await PIXI.Assets.load({
      src,
      loadParser: 'loadTextures',
    });
    return texture;
  }

  getPlayerSprite(): ChimeraSprite | null {
    return this.playerSprite;
  }

  getEnemySprite(): ChimeraSprite | null {
    return this.enemySprite;
  }

  getParticleContainer(): PIXI.Container {
    return this.particleContainer;
  }

  getUIContainer(): PIXI.Container {
    return this.uiContainer;
  }

  /**
   * Responsive resize of the PIXI application.
   */
  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
  }

  /**
   * Clean up and destroy the PIXI application and all resources.
   */
  destroy(): void {
    this.bgAnimTweens.forEach((t) => t.kill());
    this.bgAnimTweens = [];

    if (this.playerSprite) {
      this.playerSprite.destroy();
      this.playerSprite = null;
    }
    if (this.enemySprite) {
      this.enemySprite.destroy();
      this.enemySprite = null;
    }

    this.arenaContainer.destroy({ children: true });
    this.spriteContainer.destroy({ children: true });
    this.particleContainer.destroy({ children: true });
    this.uiContainer.destroy({ children: true });

    this.app.destroy(true, { children: true });
  }
}
