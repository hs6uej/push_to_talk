// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve a React App (หลังจาก build แล้ว)
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// ใช้ Memory ของ Server ในการเก็บข้อมูลห้องและผู้ใช้
let rooms = {}; // โครงสร้าง: { roomId: { id, name, createdBy, participants: { userId: { ws, displayName } } } }

wss.on('connection', (ws, req) => {
    // ใช้ key ที่ WebSocket สร้างให้เป็น ID ชั่วคราวของผู้ใช้แต่ละคน
    const userId = req.headers['sec-websocket-key']; 
    let currentRoomId = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'get-initial-data':
                // ส่งข้อมูลห้องทั้งหมดที่มีอยู่ไปให้ user ที่เพิ่งต่อเข้ามา
                const allRooms = Object.values(rooms).map(r => ({...r, participants: Object.keys(r.participants)}));
                ws.send(JSON.stringify({ type: 'initial-data', payload: { rooms: allRooms } }));
                break;

            case 'create-room':
                const newRoomId = `room_${Date.now()}`;
                const newRoom = { id: newRoomId, name: data.payload.name, createdBy: data.payload.createdBy, participants: {} };
                rooms[newRoomId] = newRoom;
                broadcastRoomUpdate();
                break;
            
            case 'join-room':
                currentRoomId = data.payload.roomId;
                if (rooms[currentRoomId]) {
                    rooms[currentRoomId].participants[userId] = { ws, displayName: data.payload.displayName };
                    broadcastParticipantUpdate(currentRoomId);
                }
                break;
            
            case 'leave-room':
                if (currentRoomId && rooms[currentRoomId] && rooms[currentRoomId].participants[userId]) {
                    delete rooms[currentRoomId].participants[userId];
                    broadcastParticipantUpdate(currentRoomId);
                }
                currentRoomId = null;
                break;

            case 'send-transcription':
                 if (currentRoomId && rooms[currentRoomId]) {
                    broadcastToRoom(currentRoomId, { type: 'new-transcription', payload: data.payload });
                }
                break;

            // ส่วนจัดการสัญญาณ WebRTC
            case 'signal':
                if (data.payload.to && currentRoomId && rooms[currentRoomId] && rooms[currentRoomId].participants[data.payload.to]) {
                    const targetWs = rooms[currentRoomId].participants[data.payload.to].ws;
                    targetWs.send(JSON.stringify({ type: 'signal', payload: { from: userId, signal: data.payload.signal } }));
                }
                break;
        }
    });

    ws.on('close', () => {
        if (currentRoomId && rooms[currentRoomId] && rooms[currentRoomId].participants[userId]) {
            delete rooms[currentRoomId].participants[userId];
            // ถ้าไม่มีคนในห้องแล้ว ให้ลบห้องทิ้ง
            if (Object.keys(rooms[currentRoomId].participants).length === 0) {
                delete rooms[currentRoomId];
                broadcastRoomUpdate();
            } else {
                broadcastParticipantUpdate(currentRoomId);
            }
        }
    });
});

// ฟังก์ชันสำหรับส่งข้อมูลไปหาทุกคนในห้องที่กำหนด
function broadcastToRoom(roomId, message) {
    if (rooms[roomId]) {
        Object.values(rooms[roomId].participants).forEach(participant => {
            if (participant.ws.readyState === WebSocket.OPEN) {
                participant.ws.send(JSON.stringify(message));
            }
        });
    }
}

// ฟังก์ชันสำหรับอัปเดตรายชื่อคนในห้อง
function broadcastParticipantUpdate(roomId) {
    if(rooms[roomId]) {
        const payload = {
            type: 'participant-update',
            payload: { roomId, participants: Object.keys(rooms[roomId].participants) }
        };
        broadcastToRoom(roomId, payload);
    }
}

// ฟังก์ชันสำหรับอัปเดตรายชื่อห้องทั้งหมดให้ทุกคน
function broadcastRoomUpdate() {
     const roomList = Object.values(rooms).map(r => ({...r, participants: Object.keys(r.participants)}));
     wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'room-update', payload: { rooms: roomList } }));
        }
    });
}

// ตั้งค่า Port ให้ Server ทำงาน
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
