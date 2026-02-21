import { useState, useEffect } from 'react';
import { gameManager, GameState } from './GameManager.js';
import type { BuildParts } from '../types.js';

/**
 * React hook that subscribes to the GameManager singleton and
 * re-renders whenever the game state changes.
 */
export function useGameState(): GameState {
  const [state, setState] = useState<GameState>(gameManager.getState());

  useEffect(() => {
    const unsubscribe = gameManager.subscribe(setState);
    return unsubscribe;
  }, []);

  return state;
}

// Re-export actions for convenience so components don't need to
// import GameManager directly.
export const gameActions = {
  createRoom: (name: string) => gameManager.createRoom(name),
  joinRoom: (roomId: string, name: string) => gameManager.joinRoom(roomId, name),
  setReady: () => gameManager.setReady(),
  submitBuildPart: (slot: keyof BuildParts, desc: string) =>
    gameManager.submitBuildPart(slot, desc),
  acceptChimera: () => gameManager.acceptChimera(),
  playCard: (cardId: string) => gameManager.playCard(cardId),
  endTurn: () => gameManager.endTurn(),
};
