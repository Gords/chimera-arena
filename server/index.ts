// ============================================================
// Chimera Arena - Main Server Entry (Pure REST API)
// ============================================================

import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RoomManager, serializeRoom } from './Room.js';
import { GameManager } from './GameManager.js';
import type { BuildSlot } from './types.js';

// ---- Path helpers (ESM has no __dirname) ----

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config ----

const PORT = Number(process.env.PORT) || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ---- Express ----

const app = express();
app.use(express.json());

// ---- CORS middleware for dev ----

if (!IS_PRODUCTION) {
  app.use((_req, res, next) => {
    const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
    const origin = _req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
}

// ---- Managers ----

const roomManager = new RoomManager();
const gameManager = new GameManager();

// ============================================================
// Health check
// ============================================================

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', rooms: roomManager.getAllRooms().length });
});

// ============================================================
// POST /api/rooms — Create room
// ============================================================

app.post('/api/rooms', (req, res) => {
  const playerName = (req.body?.playerName || 'Player').trim().slice(0, 24);

  // Create room with a temporary hostId; joinRoom will set the real one
  const room = roomManager.createRoom('pending');

  // Join the creator into the room
  const result = roomManager.joinRoom(room.id, playerName);
  if (!result) {
    res.status(500).json({ ok: false, error: 'Failed to create room.' });
    return;
  }

  // Set the host to the creator's playerId
  room.hostId = result.playerId;

  console.log(`[POST /api/rooms] ${playerName} created room ${room.id} (player: ${result.playerId})`);

  res.status(201).json({
    ok: true,
    roomId: room.id,
    playerId: result.playerId,
    room: serializeRoom(room),
  });
});

// ============================================================
// POST /api/rooms/:id/join — Join room
// ============================================================

app.post('/api/rooms/:id/join', (req, res) => {
  const roomId = req.params.id.trim().toUpperCase();
  const playerName = (req.body?.playerName || 'Player').trim().slice(0, 24);

  const existing = roomManager.getRoom(roomId);
  if (!existing) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }

  if (existing.phase !== 'lobby') {
    res.status(400).json({ ok: false, error: 'Game already in progress.' });
    return;
  }

  const result = roomManager.joinRoom(roomId, playerName);
  if (!result) {
    res.status(500).json({ ok: false, error: 'Failed to join room.' });
    return;
  }

  console.log(`[POST /api/rooms/:id/join] ${playerName} joined room ${roomId} (player: ${result.playerId})`);

  res.json({
    ok: true,
    playerId: result.playerId,
    room: serializeRoom(result.room),
  });
});

// ============================================================
// GET /api/rooms/:id — Get full room state (polling endpoint)
// ============================================================

app.get('/api/rooms/:id', (req, res) => {
  const roomId = req.params.id.trim().toUpperCase();
  const room = roomManager.getRoom(roomId);

  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }

  // Support conditional polling: ?since=eventId
  const sinceParam = req.query.since;
  const sinceEventId = sinceParam ? Number(sinceParam) : undefined;

  // Support If-None-Match / ETag based on lastUpdated
  const etag = `"${room.lastUpdated}"`;
  res.setHeader('ETag', etag);

  if (req.headers['if-none-match'] === etag) {
    res.sendStatus(304);
    return;
  }

  const serialized = serializeRoom(room, sinceEventId);
  res.json({ ok: true, room: serialized });
});

// ============================================================
// POST /api/rooms/:id/ready — Toggle ready
// ============================================================

app.post('/api/rooms/:id/ready', (req, res) => {
  const roomId = req.params.id.trim().toUpperCase();
  const playerId = req.body?.playerId;

  if (!playerId) {
    res.status(400).json({ ok: false, error: 'playerId is required.' });
    return;
  }

  const room = roomManager.getRoom(roomId);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }

  if (!room.players.has(playerId)) {
    res.status(403).json({ ok: false, error: 'Player not in this room.' });
    return;
  }

  roomManager.setReady(roomId, playerId);

  res.json({ ok: true, room: serializeRoom(room) });
});

// ============================================================
// POST /api/rooms/:id/start — Start game (host only)
// ============================================================

app.post('/api/rooms/:id/start', (req, res) => {
  const roomId = req.params.id.trim().toUpperCase();
  const playerId = req.body?.playerId;

  if (!playerId) {
    res.status(400).json({ ok: false, error: 'playerId is required.' });
    return;
  }

  const room = roomManager.getRoom(roomId);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }

  if (room.hostId !== playerId) {
    res.status(403).json({ ok: false, error: 'Only the host can start the game.' });
    return;
  }

  if (!roomManager.canStart(roomId)) {
    res.status(400).json({ ok: false, error: 'Cannot start: need at least 2 players, balanced teams, and all players ready.' });
    return;
  }

  gameManager.startGame(room);

  res.json({ ok: true, room: serializeRoom(room) });
});

// ============================================================
// POST /api/rooms/:id/build — Submit build part
// ============================================================

app.post('/api/rooms/:id/build', (req, res) => {
  const roomId = req.params.id.trim().toUpperCase();
  const playerId = req.body?.playerId;
  const slot = req.body?.slot as BuildSlot;
  const description = (req.body?.description || '').trim();

  if (!playerId) {
    res.status(400).json({ ok: false, error: 'playerId is required.' });
    return;
  }

  const room = roomManager.getRoom(roomId);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }

  if (!room.players.has(playerId)) {
    res.status(403).json({ ok: false, error: 'Player not in this room.' });
    return;
  }

  if (room.phase !== 'build') {
    res.status(400).json({ ok: false, error: 'Not in build phase.' });
    return;
  }

  const team = roomManager.getPlayerTeam(roomId, playerId);
  if (!team) {
    res.status(400).json({ ok: false, error: 'No team assigned.' });
    return;
  }

  if (!slot || !description) {
    res.status(400).json({ ok: false, error: 'Slot and description are required.' });
    return;
  }

  const success = gameManager.submitBuildPart(room, team, slot, description);

  if (!success) {
    res.status(400).json({ ok: false, error: 'Invalid submission.' });
    return;
  }

  res.json({ ok: true, room: serializeRoom(room) });
});

// ============================================================
// POST /api/rooms/:id/build/finish — End build phase early
// ============================================================

app.post('/api/rooms/:id/build/finish', (req, res) => {
  const roomId = req.params.id.trim().toUpperCase();
  const playerId = req.body?.playerId;

  if (!playerId) {
    res.status(400).json({ ok: false, error: 'playerId is required.' });
    return;
  }

  const room = roomManager.getRoom(roomId);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }

  if (!room.players.has(playerId)) {
    res.status(403).json({ ok: false, error: 'Player not in this room.' });
    return;
  }

  if (room.phase !== 'build') {
    res.status(400).json({ ok: false, error: 'Not in build phase.' });
    return;
  }

  // Fire and forget -- endBuildPhase is async (AI generation)
  gameManager.endBuildPhase(room);

  res.json({ ok: true, message: 'Build phase ending. Chimeras are being generated.' });
});

// ============================================================
// POST /api/rooms/:id/accept — Accept chimera
// ============================================================

app.post('/api/rooms/:id/accept', (req, res) => {
  const roomId = req.params.id.trim().toUpperCase();
  const playerId = req.body?.playerId;

  if (!playerId) {
    res.status(400).json({ ok: false, error: 'playerId is required.' });
    return;
  }

  const room = roomManager.getRoom(roomId);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }

  if (!room.players.has(playerId)) {
    res.status(403).json({ ok: false, error: 'Player not in this room.' });
    return;
  }

  if (room.phase !== 'reveal') {
    res.status(400).json({ ok: false, error: 'Not in reveal phase.' });
    return;
  }

  const team = roomManager.getPlayerTeam(roomId, playerId);
  if (!team) {
    res.status(400).json({ ok: false, error: 'No team assigned.' });
    return;
  }

  gameManager.acceptChimera(room, team);

  res.json({ ok: true, room: serializeRoom(room) });
});

// ============================================================
// POST /api/rooms/:id/battle/play — Play a card
// ============================================================

app.post('/api/rooms/:id/battle/play', (req, res) => {
  const roomId = req.params.id.trim().toUpperCase();
  const playerId = req.body?.playerId;
  const cardId = req.body?.cardId;

  if (!playerId) {
    res.status(400).json({ ok: false, error: 'playerId is required.' });
    return;
  }

  if (!cardId) {
    res.status(400).json({ ok: false, error: 'cardId is required.' });
    return;
  }

  const room = roomManager.getRoom(roomId);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }

  if (!room.players.has(playerId)) {
    res.status(403).json({ ok: false, error: 'Player not in this room.' });
    return;
  }

  if (room.phase !== 'battle') {
    res.status(400).json({ ok: false, error: 'Not in battle phase.' });
    return;
  }

  const team = roomManager.getPlayerTeam(roomId, playerId);
  if (!team) {
    res.status(400).json({ ok: false, error: 'No team assigned.' });
    return;
  }

  if (room.battleState?.activeTeam !== team) {
    res.status(400).json({ ok: false, error: 'Not your turn.' });
    return;
  }

  const success = gameManager.playCard(room, team, cardId);

  if (!success) {
    // The GameManager already pushed an error event with details
    res.status(400).json({ ok: false, error: 'Could not play card. Check events for details.' });
    return;
  }

  res.json({ ok: true, room: serializeRoom(room) });
});

// ============================================================
// POST /api/rooms/:id/battle/end-turn — End turn
// ============================================================

app.post('/api/rooms/:id/battle/end-turn', (req, res) => {
  const roomId = req.params.id.trim().toUpperCase();
  const playerId = req.body?.playerId;

  if (!playerId) {
    res.status(400).json({ ok: false, error: 'playerId is required.' });
    return;
  }

  const room = roomManager.getRoom(roomId);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }

  if (!room.players.has(playerId)) {
    res.status(403).json({ ok: false, error: 'Player not in this room.' });
    return;
  }

  if (room.phase !== 'battle') {
    res.status(400).json({ ok: false, error: 'Not in battle phase.' });
    return;
  }

  const team = roomManager.getPlayerTeam(roomId, playerId);
  if (!team) {
    res.status(400).json({ ok: false, error: 'No team assigned.' });
    return;
  }

  if (room.battleState?.activeTeam !== team) {
    res.status(400).json({ ok: false, error: 'Not your turn.' });
    return;
  }

  gameManager.endTurn(room, team);

  res.json({ ok: true, room: serializeRoom(room) });
});

// ============================================================
// GET /api/rooms/:id/battle — Get current battle state
// ============================================================

app.get('/api/rooms/:id/battle', (req, res) => {
  const roomId = req.params.id.trim().toUpperCase();
  const room = roomManager.getRoom(roomId);

  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }

  if (room.phase !== 'battle' && room.phase !== 'result') {
    res.status(400).json({ ok: false, error: 'No battle in progress.' });
    return;
  }

  res.json({
    ok: true,
    battleState: room.battleState,
    phase: room.phase,
    chimeras: room.chimeras,
  });
});

// ============================================================
// POST /api/rooms/:id/return-to-lobby — Return to lobby
// ============================================================

app.post('/api/rooms/:id/return-to-lobby', (req, res) => {
  const roomId = req.params.id.trim().toUpperCase();
  const playerId = req.body?.playerId;

  if (!playerId) {
    res.status(400).json({ ok: false, error: 'playerId is required.' });
    return;
  }

  const room = roomManager.getRoom(roomId);
  if (!room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }

  if (!room.players.has(playerId)) {
    res.status(403).json({ ok: false, error: 'Player not in this room.' });
    return;
  }

  if (room.phase !== 'result') {
    res.status(400).json({ ok: false, error: 'Not in result phase.' });
    return;
  }

  gameManager.returnToLobby(room);

  res.json({ ok: true, room: serializeRoom(room) });
});

// ============================================================
// Static files (production)
// ============================================================

if (IS_PRODUCTION) {
  const clientDist = path.resolve(__dirname, '..', 'dist');
  app.use(express.static(clientDist));

  // SPA fallback -- must be after all /api routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ============================================================
// Start
// ============================================================

const httpServer = createServer(app);

httpServer.listen(PORT, () => {
  console.log(`Chimera Arena server listening on port ${PORT}`);
  if (!IS_PRODUCTION) {
    console.log(`  -> CORS enabled for http://localhost:5173`);
  }
  console.log(`  -> REST API only (no WebSocket)`);
});
