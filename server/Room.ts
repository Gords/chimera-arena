// ============================================================
// Chimera Arena - Room Manager
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { Room, Player, Team, SerializedRoom, GameEvent, GameEventType } from './types.js';

// ---- Max events kept in the room ----
const MAX_EVENTS = 50;

// ---- Event counter (global, monotonically increasing per-room) ----
const eventCounters: Map<string, number> = new Map();

function nextEventId(roomId: string): number {
  const current = eventCounters.get(roomId) || 0;
  const next = current + 1;
  eventCounters.set(roomId, next);
  return next;
}

// ============================================================
// Event helpers
// ============================================================

/**
 * Append a game event to the room's event log.
 * Caps the events array at the last MAX_EVENTS entries.
 * Also updates room.lastUpdated.
 */
export function addEvent(
  room: Room,
  type: GameEventType,
  data: any,
  team?: Team
): GameEvent {
  const event: GameEvent = {
    id: nextEventId(room.id),
    type,
    team,
    data,
    timestamp: Date.now(),
  };

  room.events.push(event);

  // Keep only the last MAX_EVENTS
  if (room.events.length > MAX_EVENTS) {
    room.events = room.events.slice(-MAX_EVENTS);
  }

  room.lastUpdated = Date.now();

  return event;
}

/**
 * Convert a Room (which uses Map for players) into a plain-object
 * representation safe for JSON responses.
 *
 * Optionally filter events to only those after a given eventId (for polling).
 */
export function serializeRoom(room: Room, sinceEventId?: number): SerializedRoom {
  const players: Record<string, Player> = {};
  for (const [id, player] of room.players) {
    players[id] = { ...player };
  }

  let events = room.events;
  if (sinceEventId !== undefined && sinceEventId > 0) {
    events = room.events.filter((e) => e.id > sinceEventId);
  }

  return {
    id: room.id,
    hostId: room.hostId,
    players,
    teams: {
      red: [...room.teams.red],
      blue: [...room.teams.blue],
    },
    phase: room.phase,
    round: room.round,
    chimeras: {
      red: room.chimeras.red ? { ...room.chimeras.red } : null,
      blue: room.chimeras.blue ? { ...room.chimeras.blue } : null,
    },
    buildParts: {
      red: { ...room.buildParts.red },
      blue: { ...room.buildParts.blue },
    },
    battleState: room.battleState ? { ...room.battleState } : null,
    accepted: { ...room.accepted },
    events,
    lastUpdated: room.lastUpdated,
  };
}

/**
 * Generate a random 6-character uppercase room code.
 * Keeps generating until a code that is not already in use is found.
 */
function generateRoomCode(existing: Map<string, Room>): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code: string;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (existing.has(code));
  return code;
}

/**
 * Create a fresh Room object with all fields initialised.
 */
function makeRoom(id: string, hostId: string): Room {
  return {
    id,
    hostId,
    players: new Map(),
    teams: { red: [], blue: [] },
    phase: 'lobby',
    round: 1,
    chimeras: { red: null, blue: null },
    buildParts: { red: {}, blue: {} },
    battleState: null,
    accepted: { red: false, blue: false },
    events: [],
    lastUpdated: Date.now(),
  };
}

// ============================================================
// RoomManager -- singleton-style class backed by a Map
// ============================================================

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  // ----- Creation / lookup -----

  /**
   * Create a new room. The hostId is the UUID of the player who creates it.
   * The player is NOT automatically added -- call joinRoom after this.
   */
  createRoom(hostId: string): Room {
    const id = generateRoomCode(this.rooms);
    const room = makeRoom(id, hostId);
    this.rooms.set(id, room);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  deleteRoom(roomId: string): boolean {
    return this.rooms.delete(roomId.toUpperCase());
  }

  // ----- Player management -----

  /**
   * Add a player to the room. Generates a UUID for the player and assigns
   * them to the team with fewer members (red wins ties).
   * Returns { room, playerId } or null if room doesn't exist.
   */
  joinRoom(roomId: string, playerName: string): { room: Room; playerId: string } | null {
    const room = this.getRoom(roomId);
    if (!room) return null;

    const playerId = uuidv4();

    // Auto-assign team: prefer whichever team has fewer members
    let assignedTeam: Team;
    if (room.teams.red.length <= room.teams.blue.length) {
      assignedTeam = 'red';
    } else {
      assignedTeam = 'blue';
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      team: assignedTeam,
      ready: false,
    };

    room.players.set(playerId, player);
    room.teams[assignedTeam].push(playerId);
    room.lastUpdated = Date.now();

    addEvent(room, 'player_joined', { playerId, playerName, team: assignedTeam });

    return { room, playerId };
  }

  /**
   * Remove a player from the room.
   * If the room becomes empty, it is automatically deleted.
   * Returns the updated Room, or null if the room was deleted / not found.
   */
  leaveRoom(roomId: string, playerId: string): Room | null {
    const room = this.getRoom(roomId);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (!player) return room;

    // Remove from team roster
    if (player.team) {
      const teamList = room.teams[player.team];
      const idx = teamList.indexOf(playerId);
      if (idx !== -1) teamList.splice(idx, 1);
    }

    room.players.delete(playerId);

    // Clean up empty rooms
    if (room.players.size === 0) {
      this.rooms.delete(room.id);
      return null;
    }

    // If the host left, assign a new host
    if (room.hostId === playerId) {
      const firstPlayer = room.players.values().next().value;
      if (firstPlayer) {
        room.hostId = firstPlayer.id;
      }
    }

    room.lastUpdated = Date.now();
    addEvent(room, 'player_left', { playerId, playerName: player.name });

    return room;
  }

  // ----- Ready state -----

  /**
   * Toggle the ready flag on a player. Returns the updated Room or null.
   */
  setReady(roomId: string, playerId: string): Room | null {
    const room = this.getRoom(roomId);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (!player) return null;

    player.ready = !player.ready;
    room.lastUpdated = Date.now();

    addEvent(room, 'player_ready', {
      playerId,
      playerName: player.name,
      ready: player.ready,
    });

    return room;
  }

  // ----- Pre-start validation -----

  /**
   * A room can start when:
   *  1. There are at least 2 players.
   *  2. Teams are balanced (equal size, or differ by at most 1).
   *  3. Every player is marked ready.
   */
  canStart(roomId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room) return false;

    if (room.players.size < 2) return false;

    // Team balance check
    const diff = Math.abs(room.teams.red.length - room.teams.blue.length);
    if (diff > 1) return false;

    // All players ready
    for (const player of room.players.values()) {
      if (!player.ready) return false;
    }

    return true;
  }

  // ----- Helpers -----

  /**
   * Look up a player by UUID in a specific room.
   */
  getPlayerById(roomId: string, playerId: string): Player | null {
    const room = this.getRoom(roomId);
    if (!room) return null;
    return room.players.get(playerId) ?? null;
  }

  /**
   * Get the team a player belongs to inside a room.
   */
  getPlayerTeam(roomId: string, playerId: string): Team | null {
    const room = this.getRoom(roomId);
    if (!room) return null;
    const player = room.players.get(playerId);
    return player?.team ?? null;
  }
}
