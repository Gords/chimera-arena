import * as PIXI from 'pixi.js';
import { ChimeraSprite } from './ChimeraSprite.js';

export class ArenaStage {
  app: PIXI.Application;
  private arenaContainer: PIXI.Container;
  private spriteContainer: PIXI.Container;
  private particleContainer: PIXI.Container;
  private uiContainer: PIXI.Container;
  private playerSprite: ChimeraSprite | null = null;
  private enemySprite: ChimeraSprite | null = null;

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
   * Set the arena background from an AI-generated base64 image.
   * Falls back to a simple dark background if no image is provided.
   */
  async setArenaBackground(base64Image?: string): Promise<void> {
    this.arenaContainer.removeChildren();

    const w = this.app.screen.width;
    const h = this.app.screen.height;

    if (base64Image) {
      try {
        const texture = await this._base64ToTexture(base64Image);
        const bgSprite = new PIXI.Sprite(texture);

        // Scale to cover the full canvas (like CSS background-size: cover)
        const scaleX = w / texture.width;
        const scaleY = h / texture.height;
        const scale = Math.max(scaleX, scaleY);
        bgSprite.scale.set(scale);

        // Center the sprite
        bgSprite.x = (w - texture.width * scale) / 2;
        bgSprite.y = (h - texture.height * scale) / 2;

        this.arenaContainer.addChild(bgSprite);
        return;
      } catch (err) {
        console.warn('[ArenaStage] Failed to load background image, using fallback', err);
      }
    }

    // Fallback: simple dark background
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, w, h);
    bg.fill({ color: 0x1a1a2e });
    this.arenaContainer.addChild(bg);

    const ground = new PIXI.Graphics();
    ground.rect(0, h * 0.75, w, 2);
    ground.fill({ color: 0x444466 });
    this.arenaContainer.addChild(ground);
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

    // Convert base64 to PIXI textures in parallel
    const [playerTexture, enemyTexture] = await Promise.all([
      this._base64ToTexture(playerSpriteBase64),
      this._base64ToTexture(enemySpriteBase64),
    ]);

    // Scale sprites to fit ~40% of arena height
    const targetHeight = h * 0.4;
    const playerScale = targetHeight / playerTexture.height;
    const enemyScale = targetHeight / enemyTexture.height;

    // Player on left (25%), enemy on right (75%), both at ground level
    const playerX = w * 0.25;
    const enemyX = w * 0.75;

    this.playerSprite = new ChimeraSprite(playerTexture, playerX, groundY, playerScale);
    this.enemySprite = new ChimeraSprite(enemyTexture, enemyX, groundY, enemyScale);

    // Flip enemy horizontally (negative scale preserves magnitude)
    this.enemySprite.sprite.scale.x = -enemyScale;

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
