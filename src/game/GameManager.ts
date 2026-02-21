// ============================================================
// GameManager - Client-side game lifecycle orchestration
// Listens for server events and coordinates between network,
// UI state, and pixi renderer via a publish/subscribe model.
// ============================================================

import { socket } from '../network/socket.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../network/events.js';
import type {
  Phase,
  Team,
  BattleState,
  Chimera,
  AbilityCard,
  CardResult,
  BuildParts,
  SerializedRoom,
} from '../types.js';

// Re-export SerializedRoom so consumers can import from GameManager if needed
export type { SerializedRoom };

export type GameStateListener = (state: GameState) => void;

export interface GameState {
  connected: boolean;
  roomId: string | null;
  playerId: string | null;
  playerName: string;
  team: Team | null;
  phase: Phase | null;
  room: SerializedRoom | null;
  chimeras: { red: Chimera | null; blue: Chimera | null };
  battleState: BattleState | null;
  error: string | null;
  lastCardPlayed: { team: Team; card: AbilityCard; result: CardResult } | null;
  battleResult: { winner: Team | 'draw' } | null;
}

function createInitialState(): GameState {
  return {
    connected: false,
    roomId: null,
    playerId: null,
    playerName: '',
    team: null,
    phase: null,
    room: null,
    chimeras: { red: null, blue: null },
    battleState: null,
    error: null,
    lastCardPlayed: null,
    battleResult: null,
  };
}

export class GameManager {
  private state: GameState;
  private listeners: Set<GameStateListener> = new Set();

  constructor() {
    this.state = createInitialState();
    this.setupSocketListeners();
  }

  // ------------------------------------------------------------------
  // Pub/Sub
  // ------------------------------------------------------------------

  /** Subscribe to every state change. Returns an unsubscribe function. */
  subscribe(listener: GameStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = { ...this.state };
    this.listeners.forEach((l) => l(snapshot));
  }

  private updateState(partial: Partial<GameState>): void {
    Object.assign(this.state, partial);
    this.notify();
  }

  /** Return a shallow copy of the current state (safe to read). */
  getState(): GameState {
    return { ...this.state };
  }

  // ------------------------------------------------------------------
  // Actions (Client -> Server)
  // ------------------------------------------------------------------

  createRoom(playerName: string): void {
    this.updateState({ playerName });
    socket.emit(CLIENT_EVENTS.ROOM_CREATE, { playerName });
  }

  joinRoom(roomId: string, playerName: string): void {
    this.updateState({ playerName });
    socket.emit(CLIENT_EVENTS.ROOM_JOIN, {
      roomId: roomId.toUpperCase(),
      playerName,
    });
  }

  setReady(): void {
    socket.emit(CLIENT_EVENTS.ROOM_READY);
  }

  submitBuildPart(slot: keyof BuildParts, description: string): void {
    socket.emit(CLIENT_EVENTS.BUILD_SUBMIT_PART, { slot, description });
  }

  acceptChimera(): void {
    socket.emit(CLIENT_EVENTS.REVEAL_ACCEPT);
  }

  playCard(cardId: string): void {
    socket.emit(CLIENT_EVENTS.BATTLE_PLAY_CARD, { cardId });
  }

  endTurn(): void {
    socket.emit(CLIENT_EVENTS.BATTLE_END_TURN);
  }

  // ------------------------------------------------------------------
  // Socket Listeners (Server -> Client)
  // ------------------------------------------------------------------

  private setupSocketListeners(): void {
    socket.on('connect', () => {
      this.updateState({
        connected: true,
        playerId: socket.id,
        error: null,
      });
    });

    socket.on('disconnect', () => {
      this.updateState({ connected: false });
    });

    socket.on(SERVER_EVENTS.ROOM_STATE, (data: SerializedRoom) => {
      const myTeam = this.findMyTeam(data);
      this.updateState({
        room: data,
        roomId: data.id,
        phase: data.phase,
        team: myTeam,
        chimeras: data.chimeras,
        battleState: data.battleState,
        error: null,
      });
    });

    socket.on(SERVER_EVENTS.ROOM_PHASE_CHANGE, (data: { phase: Phase }) => {
      this.updateState({ phase: data.phase, error: null });
    });

    socket.on(SERVER_EVENTS.ROOM_ERROR, (data: { message: string }) => {
      this.updateState({ error: data.message });
    });

    socket.on(
      SERVER_EVENTS.REVEAL_CHIMERA,
      (data: { team: Team; chimera: Chimera }) => {
        const chimeras = { ...this.state.chimeras };
        chimeras[data.team] = data.chimera;
        this.updateState({ chimeras });
      },
    );

    socket.on(SERVER_EVENTS.BATTLE_STATE, (data: BattleState) => {
      this.updateState({ battleState: data });
    });

    socket.on(
      SERVER_EVENTS.BATTLE_CARD_PLAYED,
      (data: { team: Team; card: AbilityCard; result: CardResult }) => {
        this.updateState({ lastCardPlayed: data });
      },
    );

    socket.on(
      SERVER_EVENTS.BATTLE_TURN_CHANGE,
      (_data: { activeTeam: Team; turn: number }) => {
        // Turn changes are reflected through the next BATTLE_STATE update
      },
    );

    socket.on(
      SERVER_EVENTS.BATTLE_EFFECT,
      (_data: { team: Team; effect: string; applied: boolean }) => {
        // Effects are reflected through the next BATTLE_STATE update
      },
    );

    socket.on(
      SERVER_EVENTS.BATTLE_RESULT,
      (data: { winner: Team | 'draw' }) => {
        this.updateState({ battleResult: data, phase: 'result' });
      },
    );
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private findMyTeam(room: SerializedRoom): Team | null {
    const myId = this.state.playerId;
    if (!myId) return null;
    if (room.teams.red.includes(myId)) return 'red';
    if (room.teams.blue.includes(myId)) return 'blue';
    return null;
  }

  /** Tear down all socket listeners. Call when the manager is no longer needed. */
  destroy(): void {
    socket.removeAllListeners();
  }
}

// Singleton instance used across the app
export const gameManager = new GameManager();
