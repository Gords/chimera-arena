// ============================================================
// Chimera Arena - Room Manager
// ============================================================

import type { Room, Player, Team, SerializedRoom } from './types.js';

/**
 * Convert a Room (which uses Map for players) into a plain-object
 * representation safe for JSON / socket.io emission.
 */
export function serializeRoom(room: Room): SerializedRoom {
  const players: Record<string, Player> = {};
  for (const [id, player] of room.players) {
    players[id] = { ...player };
  }

  return {
    id: room.id,
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
function makeRoom(id: string): Room {
  return {
    id,
    players: new Map(),
    teams: { red: [], blue: [] },
    phase: 'lobby',
    round: 1,
    chimeras: { red: null, blue: null },
    buildParts: { red: {}, blue: {} },
    battleState: null,
    accepted: { red: false, blue: false },
  };
}

// ============================================================
// RoomManager — singleton-style class backed by a Map
// ============================================================

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  // ----- Creation / lookup -----

  createRoom(): Room {
    const id = generateRoomCode(this.rooms);
    const room = makeRoom(id);
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
   * Add a player to the room. Automatically assigns them to the team with
   * fewer members (red wins ties — first player always goes red).
   * Returns the updated Room or null if the room doesn't exist.
   */
  joinRoom(roomId: string, player: Player): Room | null {
    const room = this.getRoom(roomId);
    if (!room) return null;

    // Prevent duplicate joins
    if (room.players.has(player.id)) return room;

    // Auto-assign team: prefer whichever team has fewer members
    let assignedTeam: Team;
    if (room.teams.red.length <= room.teams.blue.length) {
      assignedTeam = 'red';
    } else {
      assignedTeam = 'blue';
    }

    player.team = assignedTeam;
    room.players.set(player.id, player);
    room.teams[assignedTeam].push(player.id);

    return room;
  }

  /**
   * Remove a player from the room.
   * If the room becomes empty, it is automatically deleted.
   * Returns the updated Room, or null if the room was deleted / not found.
   */
  leaveRoom(roomId: string, socketId: string): Room | null {
    const room = this.getRoom(roomId);
    if (!room) return null;

    const player = room.players.get(socketId);
    if (!player) return room;

    // Remove from team roster
    if (player.team) {
      const teamList = room.teams[player.team];
      const idx = teamList.indexOf(socketId);
      if (idx !== -1) teamList.splice(idx, 1);
    }

    room.players.delete(socketId);

    // Clean up empty rooms
    if (room.players.size === 0) {
      this.rooms.delete(room.id);
      return null;
    }

    return room;
  }

  // ----- Ready state -----

  /**
   * Toggle the ready flag on a player. Returns the updated Room or null.
   */
  setReady(roomId: string, socketId: string): Room | null {
    const room = this.getRoom(roomId);
    if (!room) return null;

    const player = room.players.get(socketId);
    if (!player) return null;

    player.ready = !player.ready;
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
   * Find which room a socket is currently in (if any).
   */
  findRoomBySocket(socketId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.has(socketId)) return room;
    }
    return undefined;
  }

  /**
   * Get the team a socket belongs to inside a room.
   */
  getPlayerTeam(roomId: string, socketId: string): Team | null {
    const room = this.getRoom(roomId);
    if (!room) return null;
    const player = room.players.get(socketId);
    return player?.team ?? null;
  }
}
