// ============================================================
// Chimera Arena - REST API Client
// Pure fetch-based client for all server communication.
// No WebSocket / Socket.IO dependency.
// ============================================================

import type { SerializedRoom } from '../types';

const API_BASE = '/api';

// ---- Generic helpers ----

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---- Game event from the server's events array ----

export interface GameEvent {
  id: number;
  type: string;
  [key: string]: unknown;
}

// ---- Room state response (extends SerializedRoom with events) ----

export interface RoomStateResponse extends SerializedRoom {
  events?: GameEvent[];
  winner?: 'red' | 'blue' | 'draw' | null;
}

// ---- API functions ----

export const api = {
  /** Create a new room. Returns the room ID and the creator's player ID. */
  createRoom: async (playerName: string) => {
    const data = await post<{ ok: boolean; roomId: string; playerId: string }>('/rooms', { playerName });
    return { roomId: data.roomId, playerId: data.playerId };
  },

  /** Join an existing room. Returns the joining player's ID. */
  joinRoom: async (roomId: string, playerName: string) => {
    const data = await post<{ ok: boolean; playerId: string }>(`/rooms/${roomId}/join`, { playerName });
    return { playerId: data.playerId };
  },

  /** Poll room state. Pass `since` to get only new events. */
  getRoom: async (roomId: string, since?: number): Promise<RoomStateResponse> => {
    const data = await get<{ ok: boolean; room: RoomStateResponse }>(
      `/rooms/${roomId}${since != null ? `?since=${since}` : ''}`
    );
    return data.room;
  },

  /** Toggle ready status. */
  setReady: (roomId: string, playerId: string) =>
    post<void>(`/rooms/${roomId}/ready`, { playerId }),

  /** Start the game (host only). */
  startGame: (roomId: string, playerId: string) =>
    post<void>(`/rooms/${roomId}/start`, { playerId }),

  /** Submit a chimera build part. */
  submitBuildPart: (
    roomId: string,
    playerId: string,
    slot: string,
    description: string
  ) =>
    post<void>(`/rooms/${roomId}/build`, { playerId, slot, description }),

  /** End the build phase early. */
  finishBuild: (roomId: string, playerId: string) =>
    post<void>(`/rooms/${roomId}/build/finish`, { playerId }),

  /** Accept the revealed chimera. */
  acceptChimera: (roomId: string, playerId: string) =>
    post<void>(`/rooms/${roomId}/accept`, { playerId }),

  /** Play a card during battle. Returns updated room state. */
  playCard: async (roomId: string, playerId: string, cardId: string): Promise<RoomStateResponse> => {
    const data = await post<{ ok: boolean; room: RoomStateResponse }>(`/rooms/${roomId}/battle/play`, { playerId, cardId });
    return data.room;
  },

  /** End your turn during battle. Returns updated room state. */
  endTurn: async (roomId: string, playerId: string): Promise<RoomStateResponse> => {
    const data = await post<{ ok: boolean; room: RoomStateResponse }>(`/rooms/${roomId}/battle/end-turn`, { playerId });
    return data.room;
  },

  /** Return to the lobby after a match. */
  returnToLobby: (roomId: string, playerId: string) =>
    post<void>(`/rooms/${roomId}/return-to-lobby`, { playerId }),
};
