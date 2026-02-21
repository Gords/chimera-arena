// ============================================================
// Chimera Arena - Game State Context
// Centralises all game state and server-bound actions.
// ============================================================

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useSocket } from './SocketContext';
import type {
  SerializedRoom,
  Player,
  Phase,
  Chimera,
  BattleState,
  BuildSlot,
  Team,
  BattleLogEntry,
} from '../types';

// ---- Context shape ----

interface GameContextValue {
  // State
  room: SerializedRoom | null;
  player: Player | null;
  phase: Phase | null;
  myTeam: Team | null;
  chimeras: { red: Chimera | null; blue: Chimera | null } | null;
  battleState: BattleState | null;
  winner: Team | null;
  generating: boolean;
  error: string | null;

  // Actions
  createRoom: (playerName: string) => void;
  joinRoom: (roomCode: string, playerName: string) => void;
  setReady: () => void;
  startGame: () => void;
  submitPart: (slot: BuildSlot, description: string) => void;
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
  const { socket } = useSocket();

  const [room, setRoom] = useState<SerializedRoom | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [winner, setWinner] = useState<Team | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Battle state is tracked separately so lightweight battle:state
  // events can update it without needing a full room re-serialization.
  const [liveBattleState, setLiveBattleState] = useState<BattleState | null>(null);

  // Latency tracking: timestamp of last outgoing action
  const actionTimestamp = useRef<number>(0);

  // Derived state
  const phase = room?.phase ?? null;
  const battleState = liveBattleState ?? room?.battleState ?? null;
  const chimeras = room?.chimeras ?? null;
  const myTeam = player?.team ?? null;

  // ---- Server event listeners ----

  useEffect(() => {
    if (!socket) return;

    // Full room state sync
    const onRoomState = (data: SerializedRoom) => {
      setRoom(data);

      // Update our own player record from the room
      if (socket.id && data.players[socket.id]) {
        setPlayer(data.players[socket.id]);
      }
    };

    // Room creation / join responses
    const onRoomCreated = (data: { roomId: string; room: SerializedRoom }) => {
      setRoom(data.room);
      if (socket.id && data.room.players[socket.id]) {
        setPlayer(data.room.players[socket.id]);
      }
      setError(null);
    };

    const onRoomJoined = (data: { room: SerializedRoom }) => {
      setRoom(data.room);
      if (socket.id && data.room.players[socket.id]) {
        setPlayer(data.room.players[socket.id]);
      }
      setError(null);
    };

    const onRoomError = (data: { message: string }) => {
      setError(data.message);
    };

    // Phase transitions
    const onPhaseBuild = (_data: { duration: number }) => {
      setGenerating(false);
      setWinner(null);
    };

    const onPhaseGenerating = (_data: { message: string }) => {
      setGenerating(true);
    };

    const onPhaseReveal = (_data: { red: Chimera; blue: Chimera }) => {
      setGenerating(false);
    };

    const onPhaseBattle = (_data: { battleState: BattleState }) => {
      // Room state update will carry the battleState
    };

    const onPhaseResult = (data: { winner: Team; battleLog: BattleLogEntry[] }) => {
      setWinner(data.winner);
      setLiveBattleState(null);
    };

    const onPhaseLobby = (_data: { round: number }) => {
      setWinner(null);
      setGenerating(false);
      setLiveBattleState(null);
    };

    // Lightweight battle state updates (sent during battle instead of
    // full room state to avoid resending base64 sprites every action)
    const onBattleState = (data: BattleState) => {
      setLiveBattleState(data);

      // Log round-trip time if we have an outgoing timestamp
      if (actionTimestamp.current > 0) {
        const rtt = performance.now() - actionTimestamp.current;
        actionTimestamp.current = 0;
        if (import.meta.env.DEV) {
          console.log(`[battle] action round-trip: ${rtt.toFixed(1)}ms`);
        }
      }
    };

    // Battle events
    const onBattleError = (data: { team: Team; message: string }) => {
      if (data.team === myTeam) {
        setError(data.message);
        // Auto-clear battle errors after 3 seconds
        setTimeout(() => setError(null), 3000);
      }
    };

    // Register listeners
    socket.on('room:state', onRoomState);
    socket.on('room:created', onRoomCreated);
    socket.on('room:joined', onRoomJoined);
    socket.on('room:error', onRoomError);
    socket.on('phase:build', onPhaseBuild);
    socket.on('phase:generating', onPhaseGenerating);
    socket.on('phase:reveal', onPhaseReveal);
    socket.on('phase:battle', onPhaseBattle);
    socket.on('phase:result', onPhaseResult);
    socket.on('phase:lobby', onPhaseLobby);
    socket.on('battle:state', onBattleState);
    socket.on('battle:error', onBattleError);

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('room:created', onRoomCreated);
      socket.off('room:joined', onRoomJoined);
      socket.off('room:error', onRoomError);
      socket.off('phase:build', onPhaseBuild);
      socket.off('phase:generating', onPhaseGenerating);
      socket.off('phase:reveal', onPhaseReveal);
      socket.off('phase:battle', onPhaseBattle);
      socket.off('phase:result', onPhaseResult);
      socket.off('phase:lobby', onPhaseLobby);
      socket.off('battle:state', onBattleState);
      socket.off('battle:error', onBattleError);
    };
  }, [socket, myTeam]);

  // ---- Actions ----

  const createRoom = useCallback(
    (playerName: string) => {
      if (!socket) return;
      setError(null);
      socket.emit('room:create', { playerName });
    },
    [socket]
  );

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) => {
      if (!socket) return;
      setError(null);
      socket.emit('room:join', { roomId: roomCode.toUpperCase(), playerName });
    },
    [socket]
  );

  const setReady = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('room:ready', { roomId: room.id });
  }, [socket, room]);

  const startGame = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('room:start', { roomId: room.id });
  }, [socket, room]);

  const submitPart = useCallback(
    (slot: BuildSlot, description: string) => {
      if (!socket || !room) return;
      socket.emit('build:submit_part', { roomId: room.id, slot, description });
    },
    [socket, room]
  );

  const acceptChimera = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('reveal:accept', { roomId: room.id });
  }, [socket, room]);

  const playCard = useCallback(
    (cardId: string) => {
      if (!socket || !room) return;
      setError(null);
      actionTimestamp.current = performance.now();
      socket.emit('battle:play_card', { roomId: room.id, cardId });
    },
    [socket, room]
  );

  const endTurn = useCallback(() => {
    if (!socket || !room) return;
    actionTimestamp.current = performance.now();
    socket.emit('battle:end_turn', { roomId: room.id });
  }, [socket, room]);

  const returnToLobby = useCallback(() => {
    if (!socket || !room) return;
    socket.emit('room:return_to_lobby', { roomId: room.id });
  }, [socket, room]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ---- Provide ----

  const value: GameContextValue = {
    room,
    player,
    phase,
    myTeam,
    chimeras,
    battleState,
    winner,
    generating,
    error,
    createRoom,
    joinRoom,
    setReady,
    startGame,
    submitPart,
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
