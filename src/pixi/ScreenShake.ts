import * as PIXI from 'pixi.js';
import gsap from 'gsap';

/**
 * Apply a screen-shake effect to the given container.
 * Intensity scales the shake offset (higher = bigger shake, based on damage).
 */
export function screenShake(
  container: PIXI.Container,
  intensity: number = 5
): void {
  const origX = container.x;
  const origY = container.y;
  const clampedIntensity = Math.max(1, Math.min(intensity, 20));

  const tl = gsap.timeline();
  const steps = 8;
  const stepDuration = 0.3 / steps;

  for (let i = 0; i < steps; i++) {
    // Decreasing intensity over time
    const factor = 1 - i / steps;
    const offsetX = (Math.random() - 0.5) * 2 * clampedIntensity * factor;
    const offsetY = (Math.random() - 0.5) * 2 * clampedIntensity * factor;

    tl.to(container, {
      x: origX + offsetX,
      y: origY + offsetY,
      duration: stepDuration,
      ease: 'none',
    });
  }

  // Return to original position
  tl.to(container, {
    x: origX,
    y: origY,
    duration: stepDuration,
    ease: 'power1.out',
  });
}
