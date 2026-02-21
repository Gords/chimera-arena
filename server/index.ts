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

// ---- Express ----

const app = express();
app.use(express.json());

// In production, serve the built Vite client
if (IS_PRODUCTION) {
  const clientDist = path.resolve(__dirname, '..', 'dist');
  app.use(express.static(clientDist));

  // SPA fallback
  app.get('*', (_req, res) => {
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
});

// ---- Managers ----

const roomManager = new RoomManager();
const gameManager = new GameManager(io);

// ============================================================
// Socket event handlers
// ============================================================

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

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
  socket.on('result:return_to_lobby', () => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room || room.phase !== 'result') return;
    gameManager.returnToLobby(room);
  });

  // ----------------------------------------------------------
  // Disconnect
  // ----------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);

    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) return;

    const updatedRoom = roomManager.leaveRoom(room.id, socket.id);
    if (updatedRoom) {
      const serialized = serializeRoom(updatedRoom);
      io.to(updatedRoom.id).emit('room:state', serialized);
      io.to(updatedRoom.id).emit('room:player_left', {
        socketId: socket.id,
      });
    }
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
