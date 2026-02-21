// ============================================================
// Chimera Arena - Game State Context (REST + Polling)
// Centralises all game state and server-bound actions.
// No WebSocket / Socket.IO dependency.
// ============================================================

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useReducer,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { api, type GameEvent, type RoomStateResponse } from '../network/api';
import type {
  SerializedRoom,
  Player,
  Phase,
  Chimera,
  BattleState,
  BuildSlot,
  Team,
} from '../types';

// ---- Polling intervals (ms) ----

const POLL_LOBBY = 2000;
const POLL_BUILD = 1500;
const POLL_BATTLE = 250;
const POLL_DEFAULT = 1000;

function pollIntervalForPhase(phase: Phase | null): number {
  switch (phase) {
    case 'lobby':
      return POLL_LOBBY;
    case 'build':
      return POLL_BUILD;
    case 'battle':
      return POLL_BATTLE;
    case 'reveal':
    case 'result':
      return POLL_DEFAULT;
    default:
      return POLL_DEFAULT;
  }
}

// ---- State shape ----

interface GameState {
  roomId: string | null;
  playerId: string | null;
  playerName: string | null;
  room: SerializedRoom | null;
  winner: Team | 'draw' | null;
  generating: boolean;
  error: string | null;
  lastEventId: number;
  /** Recent events from the last poll (for animation triggers). */
  recentEvents: GameEvent[];
  /** True once the initial poll after create/join has succeeded. */
  connected: boolean;
}

const initialState: GameState = {
  roomId: null,
  playerId: null,
  playerName: null,
  room: null,
  winner: null,
  generating: false,
  error: null,
  lastEventId: 0,
  recentEvents: [],
  connected: false,
};

// ---- Actions ----

type Action =
  | { type: 'JOINED'; roomId: string; playerId: string; playerName: string }
  | { type: 'ROOM_STATE'; room: RoomStateResponse; playerId: string }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'JOINED':
      return {
        ...state,
        roomId: action.roomId,
        playerId: action.playerId,
        playerName: action.playerName,
        error: null,
        connected: false, // will become true after first successful poll
      };

    case 'ROOM_STATE': {
      const room = action.room;
      const events = room.events ?? [];
      const lastEventId =
        events.length > 0
          ? Math.max(state.lastEventId, ...events.map((e) => e.id))
          : state.lastEventId;

      // Determine generating state:
      // If we are in the 'reveal' phase but our chimera is not yet set,
      // or in the 'build' phase and an event says generating started.
      const myTeam = findMyTeam(room, action.playerId);
      const generating =
        (room.phase === 'reveal' &&
          myTeam != null &&
          room.chimeras[myTeam] == null) ||
        // Also stay in generating if phase is still build but all parts
        // are submitted. The server might emit a 'generating' event.
        events.some((e) => e.type === 'generating');

      // Determine winner from room state or events
      let winner = state.winner;
      if (room.winner != null) {
        winner = room.winner as Team | 'draw';
      }
      const resultEvent = events.find((e) => e.type === 'battle_result');
      if (resultEvent && resultEvent.winner) {
        winner = resultEvent.winner as Team | 'draw';
      }

      // Reset winner when returning to lobby
      if (room.phase === 'lobby') {
        winner = null;
      }

      return {
        ...state,
        room,
        winner,
        generating,
        lastEventId,
        recentEvents: events,
        error: null,
        connected: true,
      };
    }

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

// ---- Helpers ----

function findMyTeam(room: SerializedRoom, playerId: string | null): Team | null {
  if (!playerId) return null;
  if (room.teams.red.includes(playerId)) return 'red';
  if (room.teams.blue.includes(playerId)) return 'blue';
  return null;
}

// ---- Context shape (public API) ----

interface GameContextValue {
  // State
  room: SerializedRoom | null;
  player: Player | null;
  phase: Phase | null;
  myTeam: Team | null;
  chimeras: { red: Chimera | null; blue: Chimera | null } | null;
  battleState: BattleState | null;
  winner: Team | 'draw' | null;
  generating: boolean;
  error: string | null;
  connected: boolean;
  recentEvents: GameEvent[];
  /** True while a card play request is in flight (prevents double-clicks). */
  cardPlaying: boolean;

  // Actions
  createRoom: (playerName: string) => void;
  joinRoom: (roomCode: string, playerName: string) => void;
  setReady: () => void;
  startGame: () => void;
  submitPart: (slot: BuildSlot, description: string) => void;
  finishBuild: () => void;
  acceptChimera: () => void;
  playCard: (cardId: string) => void;
  endTurn: () => void;
  returnToLobby: () => void;
  clearError: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

// ---- Provider ----

interface GameProviderProps {
  children: ReactNode;
}

export function GameProvider({ children }: GameProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Refs so polling callbacks always have the latest values
  // without needing to restart the interval.
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---- Polling ----

  useEffect(() => {
    const { roomId, playerId } = stateRef.current;
    if (!roomId || !playerId) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;

      const { roomId: rid, lastEventId } = stateRef.current;
      if (!rid) return;

      try {
        const room = await api.getRoom(
          rid,
          lastEventId > 0 ? lastEventId : undefined
        );
        if (!cancelled) {
          dispatch({ type: 'ROOM_STATE', room, playerId: stateRef.current.playerId! });
        }
      } catch (err) {
        // Silently ignore poll errors (network hiccups, etc.)
        // The next poll will retry.
        console.warn('[poll] error:', (err as Error).message);
      }

      if (!cancelled) {
        const interval = pollIntervalForPhase(stateRef.current.room?.phase ?? null);
        timeoutId = setTimeout(poll, interval);
      }
    }

    // Start polling immediately
    poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [state.roomId, state.playerId]);

  // ---- Actions ----

  const createRoom = useCallback(async (playerName: string) => {
    dispatch({ type: 'CLEAR_ERROR' });
    try {
      const { roomId, playerId } = await api.createRoom(playerName);
      dispatch({ type: 'JOINED', roomId, playerId, playerName });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: (err as Error).message });
    }
  }, []);

  const joinRoom = useCallback(async (roomCode: string, playerName: string) => {
    dispatch({ type: 'CLEAR_ERROR' });
    try {
      const code = roomCode.toUpperCase();
      const { playerId } = await api.joinRoom(code, playerName);
      dispatch({ type: 'JOINED', roomId: code, playerId, playerName });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: (err as Error).message });
    }
  }, []);

  const setReady = useCallback(async () => {
    const { roomId, playerId } = stateRef.current;
    if (!roomId || !playerId) return;
    try {
      await api.setReady(roomId, playerId);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: (err as Error).message });
    }
  }, []);

  const startGame = useCallback(async () => {
    const { roomId, playerId } = stateRef.current;
    if (!roomId || !playerId) return;
    try {
      await api.startGame(roomId, playerId);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: (err as Error).message });
    }
  }, []);

  const submitPart = useCallback(async (slot: BuildSlot, description: string) => {
    const { roomId, playerId } = stateRef.current;
    if (!roomId || !playerId) return;
    try {
      await api.submitBuildPart(roomId, playerId, slot, description);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: (err as Error).message });
    }
  }, []);

  const finishBuild = useCallback(async () => {
    const { roomId, playerId } = stateRef.current;
    if (!roomId || !playerId) return;
    try {
      await api.finishBuild(roomId, playerId);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: (err as Error).message });
    }
  }, []);

  const acceptChimera = useCallback(async () => {
    const { roomId, playerId } = stateRef.current;
    if (!roomId || !playerId) return;
    try {
      await api.acceptChimera(roomId, playerId);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: (err as Error).message });
    }
  }, []);

  const [cardPlaying, setCardPlaying] = React.useState(false);

  const playCard = useCallback(async (cardId: string) => {
    const { roomId, playerId } = stateRef.current;
    if (!roomId || !playerId) return;
    setCardPlaying(true);
    dispatch({ type: 'CLEAR_ERROR' });
    try {
      const room = await api.playCard(roomId, playerId, cardId);
      // Immediately update state with the server's response (turn already switched)
      dispatch({ type: 'ROOM_STATE', room, playerId });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: (err as Error).message });
      setTimeout(() => dispatch({ type: 'CLEAR_ERROR' }), 3000);
    } finally {
      setCardPlaying(false);
    }
  }, []);

  const endTurn = useCallback(async () => {
    const { roomId, playerId } = stateRef.current;
    if (!roomId || !playerId) return;
    try {
      const room = await api.endTurn(roomId, playerId);
      dispatch({ type: 'ROOM_STATE', room, playerId });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: (err as Error).message });
    }
  }, []);

  const returnToLobby = useCallback(async () => {
    const { roomId, playerId } = stateRef.current;
    if (!roomId || !playerId) return;
    try {
      await api.returnToLobby(roomId, playerId);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: (err as Error).message });
    }
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // ---- Derived state ----

  const phase = state.room?.phase ?? null;
  const battleState = state.room?.battleState ?? null;
  const chimeras = state.room?.chimeras ?? null;
  const myTeam = useMemo(
    () => (state.room && state.playerId ? findMyTeam(state.room, state.playerId) : null),
    [state.room, state.playerId]
  );

  const player: Player | null = useMemo(() => {
    if (!state.room || !state.playerId) return null;
    return state.room.players[state.playerId] ?? null;
  }, [state.room, state.playerId]);

  // ---- Provide ----

  const value: GameContextValue = {
    room: state.room,
    player,
    phase,
    myTeam,
    chimeras,
    battleState,
    winner: state.winner,
    generating: state.generating,
    error: state.error,
    connected: state.connected,
    recentEvents: state.recentEvents,
    cardPlaying,
    createRoom,
    joinRoom,
    setReady,
    startGame,
    submitPart,
    finishBuild,
    acceptChimera,
    playCard,
    endTurn,
    returnToLobby,
    clearError,
  };

  return (
    <GameContext.Provider value={value}>{children}</GameContext.Provider>
  );
}

// ---- Hook ----

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used inside a <GameProvider>');
  }
  return ctx;
}

export default GameContext;
