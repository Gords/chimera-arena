// ============================================================
// useBattleCanvas - Mounts the PixiJS ArenaStage into a DOM
// container and wires up battle:card_played socket events to
// the BattleAnimator / BattleController animation pipeline.
// ============================================================

import { useEffect, useRef } from 'react';
import { ArenaStage } from '../pixi/ArenaStage.js';
import { BattleAnimator } from '../pixi/BattleAnimator.js';
import { BattleController } from '../game/BattleController.js';
import type { Socket } from 'socket.io-client';
import type { Team, Chimera, AbilityCard, CardResult } from '../types.js';

const ARENA_BACKGROUNDS = ['volcanic', 'crystal', 'sky', 'forest', 'cyber'] as const;

export function useBattleCanvas(
  containerRef: React.RefObject<HTMLDivElement | null>,
  socket: Socket | null,
  myTeam: Team | null,
  myChimera: Chimera | null,
  enemyChimera: Chimera | null,
): void {
  const stageRef = useRef<ArenaStage | null>(null);
  const controllerRef = useRef<BattleController | null>(null);
  const readyRef = useRef(false);

  // --- Mount PixiJS stage and load chimera sprites ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !myTeam || !myChimera || !enemyChimera) return;

    // Prevent double-init
    if (stageRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    // Replace any fallback HTML content
    container.innerHTML = '';
    container.appendChild(canvas);

    const stage = new ArenaStage();
    stageRef.current = stage;

    stage.init(canvas).then(async () => {
      // Random arena background
      const bgType =
        ARENA_BACKGROUNDS[Math.floor(Math.random() * ARENA_BACKGROUNDS.length)];
      stage.setArenaBackground(bgType);

      // Load chimera sprites (empty string handled gracefully by PixiJS)
      if (myChimera.sprite && enemyChimera.sprite) {
        await stage.loadChimeras(myChimera.sprite, enemyChimera.sprite);
      }

      // Create animation pipeline
      const animator = new BattleAnimator(stage);
      controllerRef.current = new BattleController(stage, animator, myTeam);
      readyRef.current = true;
    });

    // Resize handler
    const onResize = () => {
      if (!stageRef.current || !container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      stageRef.current.resize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      readyRef.current = false;
      controllerRef.current?.destroy();
      controllerRef.current = null;
      stageRef.current = null;
    };
  }, [myTeam, myChimera, enemyChimera]);

  // --- Listen for battle:card_played events ---
  useEffect(() => {
    if (!socket) return;

    const onCardPlayed = (data: {
      team: Team;
      card: AbilityCard;
      result: CardResult;
    }) => {
      if (readyRef.current && controllerRef.current) {
        controllerRef.current.onCardPlayed(data.team, data.card, data.result);
      }
    };

    socket.on('battle:card_played', onCardPlayed);
    return () => {
      socket.off('battle:card_played', onCardPlayed);
    };
  }, [socket]);

  // --- Listen for battle end (death animation) ---
  useEffect(() => {
    if (!socket) return;

    const onPhaseResult = (data: { winner: Team }) => {
      if (readyRef.current && controllerRef.current) {
        controllerRef.current.onBattleEnd(data.winner);
      }
    };

    socket.on('phase:result', onPhaseResult);
    return () => {
      socket.off('phase:result', onPhaseResult);
    };
  }, [socket]);
}
