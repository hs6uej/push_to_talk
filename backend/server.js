/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: 10 * 1024 * 1024 });
const buildDirectory = path.join(__dirname, '..', 'dist');

app.get('/health', (_req, res) => res.json({ ok: true, clients: wss.clients.size }));
app.use(express.static(buildDirectory));
app.get('*', (_req, res) => res.sendFile(path.join(buildDirectory, 'index.html')));

const rooms = new Map();

const publicRooms = () => [...rooms.values()].map(room => ({
  id: room.id,
  name: room.name,
  createdBy: room.createdBy,
  participants: [...room.participants.values()].map(participant => participant.displayName)
}));

const send = (client, message) => {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
};

const broadcastRooms = () => {
  const message = JSON.stringify({ type: 'room-update', payload: { rooms: publicRooms() } });
  wss.clients.forEach(client => client.readyState === WebSocket.OPEN && client.send(message));
};

const broadcastParticipants = room => {
  const message = { type: 'participant-update', payload: {
    roomId: room.id,
    participants: [...room.participants.values()].map(participant => participant.displayName)
  } };
  wss.clients.forEach(client => send(client, message));
};

wss.on('connection', ws => {
  const connectionId = crypto.randomUUID();
  let currentRoomId = null;

  const leaveCurrentRoom = () => {
    const room = currentRoomId ? rooms.get(currentRoomId) : null;
    if (room) {
      room.participants.delete(connectionId);
      broadcastParticipants(room);
    }
    currentRoomId = null;
  };

  ws.on('message', (raw, isBinary) => {
    if (isBinary) {
      const room = currentRoomId ? rooms.get(currentRoomId) : null;
      if (!room) return;
      room.participants.forEach((participant, id) => {
        if (id !== connectionId && participant.ws.readyState === WebSocket.OPEN) {
          participant.ws.send(raw, { binary: true });
        }
      });
      return;
    }

    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    const payload = data.payload || {};

    switch (data.type) {
      case 'get-initial-data':
        send(ws, { type: 'initial-data', payload: { rooms: publicRooms() } });
        break;
      case 'create-room': {
        const name = String(payload.name || '').trim().slice(0, 80);
        if (!name || !payload.createdBy) break;
        const id = `room_${crypto.randomUUID()}`;
        rooms.set(id, { id, name, createdBy: payload.createdBy, participants: new Map() });
        broadcastRooms();
        break;
      }
      case 'join-room': {
        const room = rooms.get(payload.roomId);
        const displayName = String(payload.displayName || '').trim().slice(0, 40);
        if (!room || !displayName) break;
        leaveCurrentRoom();
        currentRoomId = room.id;
        room.participants.set(connectionId, { ws, displayName });
        broadcastParticipants(room);
        break;
      }
      case 'leave-room':
        leaveCurrentRoom();
        break;
      case 'update-room-name': {
        const room = rooms.get(payload.roomId);
        const name = String(payload.newName || '').trim().slice(0, 80);
        if (room && name && (payload.isAdmin || room.createdBy === payload.userId)) {
          room.name = name;
          broadcastRooms();
        }
        break;
      }
      case 'delete-room': {
        const room = rooms.get(payload.roomId);
        if (room && (payload.isAdmin || room.createdBy === payload.userId)) {
          room.participants.forEach(participant => send(participant.ws, { type: 'room-deleted', payload: { roomId: room.id } }));
          rooms.delete(room.id);
          broadcastRooms();
        }
        break;
      }
      case 'send-transcription': {
        const room = currentRoomId ? rooms.get(currentRoomId) : null;
        if (!room || payload.roomId !== currentRoomId) break;
        room.participants.forEach(participant => send(participant.ws, { type: 'new-transcription', payload }));
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', leaveCurrentRoom);
});

const PORT = Number(process.env.PORT) || 8080;
server.listen(PORT, () => console.log(`PTT server listening on http://localhost:${PORT}`));
