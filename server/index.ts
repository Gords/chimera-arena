// ============================================================
// Chimera Arena - Main Server Entry
// ============================================================

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RoomManager, serializeRoom } from './Room.js';
import { GameManager } from './GameManager.js';
import type { Player, Team, BuildSlot } from './types.js';

// ---- Path helpers (ESM has no __dirname) ----

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config ----

const PORT = Number(process.env.PORT) || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DISCONNECT_GRACE_MS = 15_000;

// ---- Express ----

const app = express();
app.use(express.json());

// In production, serve the built Vite client
if (IS_PRODUCTION) {
  const clientDist = path.resolve(__dirname, '..');
  app.use(express.static(clientDist));

  // SPA fallback
  app.get('{*path}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', rooms: roomManager.getAllRooms().length });
});

// ---- HTTP + Socket.IO ----

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: IS_PRODUCTION
      ? false
      : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  pingInterval: 10_000,
  pingTimeout: 20_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: DISCONNECT_GRACE_MS,
    skipMiddlewares: true,
  },
});

// ---- Managers ----

const roomManager = new RoomManager();
const gameManager = new GameManager(io);
const disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function clearDisconnectTimer(socketId: string): void {
  const timer = disconnectTimers.get(socketId);
  if (!timer) return;
  clearTimeout(timer);
  disconnectTimers.delete(socketId);
}

function removeDisconnectedPlayer(socketId: string): void {
  const room = roomManager.findRoomBySocket(socketId);
  if (!room) return;

  const updatedRoom = roomManager.leaveRoom(room.id, socketId);
  if (!updatedRoom) {
    gameManager.clearRoomTimers(room.id);
    return;
  }

  const hasHumanPlayer = Array.from(updatedRoom.players.values()).some(
    (player) => !player.isBot,
  );
  if (!hasHumanPlayer) {
    gameManager.clearRoomTimers(updatedRoom.id);
    roomManager.deleteRoom(updatedRoom.id);
    return;
  }

  const serialized = serializeRoom(updatedRoom);
  io.to(updatedRoom.id).emit('room:state', serialized);
  io.to(updatedRoom.id).emit('room:player_left', { socketId });
}

function scheduleDisconnectCleanup(socketId: string, reason: string): void {
  clearDisconnectTimer(socketId);

  disconnectTimers.set(
    socketId,
    setTimeout(() => {
      disconnectTimers.delete(socketId);

      // Player already recovered connection before grace period ended.
      if (io.sockets.sockets.has(socketId)) return;

      console.log(
        `[disconnect:cleanup] removing ${socketId} after ${DISCONNECT_GRACE_MS}ms (${reason})`,
      );
      removeDisconnectedPlayer(socketId);
    }, DISCONNECT_GRACE_MS),
  );
}

// ============================================================
// Socket event handlers
// ============================================================

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);
  clearDisconnectTimer(socket.id);

  const existingRoom = roomManager.findRoomBySocket(socket.id);
  if (existingRoom) {
    socket.join(existingRoom.id);
    socket.emit('room:state', serializeRoom(existingRoom));
  }

  // ----------------------------------------------------------
  // room:create
  // ----------------------------------------------------------
  socket.on('room:create', (data: { playerName: string }, ack) => {
    const playerName = (data?.playerName || 'Player').trim().slice(0, 24);

    const room = roomManager.createRoom();

    const player: Player = {
      id: socket.id,
      name: playerName,
      team: null,
      ready: false,
    };

    roomManager.joinRoom(room.id, player);
    socket.join(room.id);

    console.log(`[room:create] ${playerName} created room ${room.id}`);

    const serialized = serializeRoom(room);
    if (typeof ack === 'function') {
      ack({ ok: true, room: serialized });
    }
    io.to(room.id).emit('room:state', serialized);
  });

  // ----------------------------------------------------------
  // room:create_solo
  // ----------------------------------------------------------
  socket.on('room:create_solo', (data: { playerName: string }, ack) => {
    const playerName = (data?.playerName || 'Player').trim().slice(0, 24);

    const room = roomManager.createRoom();

    const player: Player = {
      id: socket.id,
      name: playerName,
      team: null,
      ready: true,
    };

    roomManager.joinRoom(room.id, player);
    socket.join(room.id);

    const botId = `bot:${room.id}`;
    const bot: Player = {
      id: botId,
      name: 'Arena Bot',
      team: null,
      ready: true,
      isBot: true,
    };
    roomManager.joinRoom(room.id, bot);

    const roomPlayer = room.players.get(socket.id);
    if (roomPlayer) roomPlayer.ready = true;
    const roomBot = room.players.get(botId);
    if (roomBot) roomBot.ready = true;

    console.log(`[room:create_solo] ${playerName} created solo room ${room.id}`);

    const serialized = serializeRoom(room);
    if (typeof ack === 'function') {
      ack({ ok: true, room: serialized });
    }
    io.to(room.id).emit('room:state', serialized);

    gameManager.startGame(room);
  });

  // ----------------------------------------------------------
  // room:join
  // ----------------------------------------------------------
  socket.on(
    'room:join',
    (data: { roomId: string; playerName: string }, ack) => {
      const roomId = (data?.roomId || '').trim().toUpperCase();
      const playerName = (data?.playerName || 'Player').trim().slice(0, 24);

      const existing = roomManager.getRoom(roomId);
      if (!existing) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Room not found.' });
        }
        return;
      }

      if (existing.phase !== 'lobby') {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Game already in progress.' });
        }
        return;
      }

      const player: Player = {
        id: socket.id,
        name: playerName,
        team: null,
        ready: false,
      };

      const room = roomManager.joinRoom(roomId, player);
      if (!room) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Failed to join room.' });
        }
        return;
      }

      socket.join(room.id);
      console.log(`[room:join] ${playerName} joined room ${room.id}`);

      const serialized = serializeRoom(room);
      if (typeof ack === 'function') {
        ack({ ok: true, room: serialized });
      }
      io.to(room.id).emit('room:state', serialized);
    }
  );

  // ----------------------------------------------------------
  // room:ready
  // ----------------------------------------------------------
  socket.on('room:ready', (ack) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not in a room.' });
      return;
    }

    roomManager.setReady(room.id, socket.id);

    const serialized = serializeRoom(room);
    io.to(room.id).emit('room:state', serialized);

    // Auto-start if everyone is ready
    if (roomManager.canStart(room.id)) {
      gameManager.startGame(room);
    }

    if (typeof ack === 'function') ack({ ok: true });
  });

  // ----------------------------------------------------------
  // room:start (host can force-start once everyone is ready)
  // ----------------------------------------------------------
  socket.on('room:start', (ack) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not in a room.' });
      return;
    }

    if (room.phase !== 'lobby') {
      if (typeof ack === 'function')
        ack({ ok: false, error: 'Game already started.' });
      return;
    }

    const isHost = room.teams.red[0] === socket.id;
    if (!isHost) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Only host can start.' });
      return;
    }

    if (!roomManager.canStart(room.id)) {
      if (typeof ack === 'function')
        ack({ ok: false, error: 'Need 2+ ready players to start.' });
      return;
    }

    gameManager.startGame(room);
    if (typeof ack === 'function') ack({ ok: true });
  });

  // ----------------------------------------------------------
  // build:submit_part
  // ----------------------------------------------------------
  socket.on(
    'build:submit_part',
    (data: { slot: BuildSlot; description: string }, ack) => {
      const room = roomManager.findRoomBySocket(socket.id);
      if (!room) {
        if (typeof ack === 'function')
          ack({ ok: false, error: 'Not in a room.' });
        return;
      }

      const team = roomManager.getPlayerTeam(room.id, socket.id);
      if (!team) {
        if (typeof ack === 'function')
          ack({ ok: false, error: 'No team assigned.' });
        return;
      }

      if (room.phase !== 'build') {
        if (typeof ack === 'function')
          ack({ ok: false, error: 'Not in build phase.' });
        return;
      }

      const slot = data?.slot as BuildSlot;
      const description = (data?.description || '').trim();

      if (!slot || !description) {
        if (typeof ack === 'function')
          ack({ ok: false, error: 'Slot and description are required.' });
        return;
      }

      const success = gameManager.submitBuildPart(
        room,
        team,
        slot,
        description
      );

      if (typeof ack === 'function') {
        ack({ ok: success, error: success ? undefined : 'Invalid submission.' });
      }
    }
  );

  // ----------------------------------------------------------
  // build:finish (manually end build phase early)
  // ----------------------------------------------------------
  socket.on('build:finish', () => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room || room.phase !== 'build') return;
    gameManager.endBuildPhase(room);
  });

  // ----------------------------------------------------------
  // reveal:accept
  // ----------------------------------------------------------
  socket.on('reveal:accept', (ack) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not in a room.' });
      return;
    }

    if (room.phase !== 'reveal') {
      if (typeof ack === 'function')
        ack({ ok: false, error: 'Not in reveal phase.' });
      return;
    }

    const team = roomManager.getPlayerTeam(room.id, socket.id);
    if (!team) {
      if (typeof ack === 'function')
        ack({ ok: false, error: 'No team assigned.' });
      return;
    }

    gameManager.acceptChimera(room, team);

    if (typeof ack === 'function') ack({ ok: true });
  });

  // ----------------------------------------------------------
  // battle:play_card
  // ----------------------------------------------------------
  socket.on('battle:play_card', (data: { cardId: string }, ack) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not in a room.' });
      return;
    }

    if (room.phase !== 'battle') {
      if (typeof ack === 'function')
        ack({ ok: false, error: 'Not in battle phase.' });
      return;
    }

    const team = roomManager.getPlayerTeam(room.id, socket.id);
    if (!team) {
      if (typeof ack === 'function')
        ack({ ok: false, error: 'No team assigned.' });
      return;
    }

    const cardId = data?.cardId;
    if (!cardId) {
      if (typeof ack === 'function')
        ack({ ok: false, error: 'cardId is required.' });
      return;
    }

    const success = gameManager.playCard(room, team, cardId);

    if (typeof ack === 'function') {
      ack({
        ok: success,
        error: success ? undefined : 'Could not play card.',
      });
    }
  });

  // ----------------------------------------------------------
  // battle:end_turn
  // ----------------------------------------------------------
  socket.on('battle:end_turn', (ack) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not in a room.' });
      return;
    }

    if (room.phase !== 'battle') {
      if (typeof ack === 'function')
        ack({ ok: false, error: 'Not in battle phase.' });
      return;
    }

    const team = roomManager.getPlayerTeam(room.id, socket.id);
    if (!team) {
      if (typeof ack === 'function')
        ack({ ok: false, error: 'No team assigned.' });
      return;
    }

    if (room.battleState?.activeTeam !== team) {
      if (typeof ack === 'function')
        ack({ ok: false, error: 'Not your turn.' });
      return;
    }

    gameManager.endTurn(room, team);

    if (typeof ack === 'function') ack({ ok: true });
  });

  // ----------------------------------------------------------
  // result:return_to_lobby
  // ----------------------------------------------------------
  const onReturnToLobby = () => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room || room.phase !== 'result') return;
    gameManager.returnToLobby(room);
  };

  socket.on('result:return_to_lobby', onReturnToLobby);
  socket.on('room:return_to_lobby', onReturnToLobby);

  // ----------------------------------------------------------
  // Disconnect
  // ----------------------------------------------------------
  socket.on('disconnect', (reason) => {
    console.log(`[disconnect] ${socket.id} (${reason})`);

    // Manual disconnects should be applied immediately.
    if (
      reason === 'client namespace disconnect' ||
      reason === 'server namespace disconnect'
    ) {
      clearDisconnectTimer(socket.id);
      removeDisconnectedPlayer(socket.id);
      return;
    }

    scheduleDisconnectCleanup(socket.id, reason);
  });
});

// ============================================================
// Start
// ============================================================

// Suppress EPIPE/ECONNRESET from normal WebSocket disconnects
httpServer.on('clientError', (err: NodeJS.ErrnoException, socket) => {
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
    socket.destroy();
    return;
  }
  console.error('[server] clientError:', err);
  socket.destroy();
});

httpServer.listen(PORT, () => {
  console.log(`Chimera Arena server listening on port ${PORT}`);
  if (!IS_PRODUCTION) {
    console.log(`  -> CORS enabled for http://localhost:5173`);
  }
});
