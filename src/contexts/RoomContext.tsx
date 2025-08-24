import React, { useEffect, useState, createContext, useContext, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';

// Interfaces
interface Room {
  id: string;
  name: string;
  createdBy: string;
  participants: string[];
}

interface RoomContextType {
  rooms: Room[];
  createRoom: (name: string) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  getRoom: (roomId: string) => Room | undefined;
  updateRoomName: (roomId: string, newName: string) => void;
  deleteRoom: (roomId: string) => void;
  userCanEditRoom: (roomId: string) => boolean;
  ws: WebSocket | null;
  userId: string;
}

// สร้าง Context สำหรับ WebSocket และ Room
const WebSocketContext = createContext<WebSocket | null>(null);
const RoomContext = createContext<RoomContextType | null>(null);

export const useWebSocket = () => useContext(WebSocketContext);
export const useRoom = () => {
    const context = useContext(RoomContext);
    if (!context) {
        throw new Error('useRoom must be used within a RoomProvider');
    }
    return context;
};

// Provider สำหรับจัดการการเชื่อมต่อ WebSocket
export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const wsRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        const connect = () => {
            // ในตอน dev ให้ใช้ 'ws://localhost:8080'
            const socketUrl = 'ws://localhost:8080';
            const socket = new WebSocket(socketUrl);
            wsRef.current = socket;

            socket.onopen = () => {
                console.log("WebSocket Connected");
                setIsConnected(true);
            };
            socket.onclose = () => {
                console.log("WebSocket Disconnected, attempting to reconnect...");
                setIsConnected(false);
                setTimeout(connect, 3000); // ลองต่อใหม่ใน 3 วินาที
            };
            socket.onerror = (err) => {
                console.error("WebSocket Error: ", err);
                socket.close();
            };
        };
        connect();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    return (
        <WebSocketContext.Provider value={wsRef.current}>
            {children}
        </WebSocketContext.Provider>
    );
};

// Provider สำหรับจัดการข้อมูลห้อง
export const RoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [userId, setUserId] = useState('');
    const { currentUser, isAdmin } = useAuth();
    const ws = useWebSocket();

    useEffect(() => {
        if (!ws) return;

        const handleMessage = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case 'initial-data':
                    case 'room-update':
                        setRooms(data.payload.rooms);
                        break;
                    case 'participant-update':
                        setRooms(prevRooms => prevRooms.map(r =>
                            r.id === data.payload.roomId ? { ...r, participants: data.payload.participants } : r
                        ));
                        break;
                }
            } catch (error) {
                console.error("Failed to parse WebSocket message:", error);
            }
        };

        ws.addEventListener('message', handleMessage);

        const requestInitialData = () => {
             if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'get-initial-data' }));
            }
        };

        if (ws.readyState === WebSocket.OPEN) {
            requestInitialData();
        } else {
            ws.onopen = requestInitialData;
        }

        return () => {
            ws.removeEventListener('message', handleMessage);
        };
    }, [ws]);

    const sendWsMessage = useCallback((type: string, payload: object) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, payload }));
        } else {
            console.error("WebSocket is not connected.");
        }
    }, [ws]);

    const createRoom = useCallback((name: string) => {
        if (!currentUser) return;
        sendWsMessage('create-room', { name, createdBy: currentUser.id });
    }, [currentUser, sendWsMessage]);

    const joinRoom = useCallback((roomId: string) => {
        if (!currentUser) return;
        sendWsMessage('join-room', { roomId, displayName: currentUser.username });
    }, [currentUser, sendWsMessage]);

    const leaveRoom = useCallback((roomId: string) => {
        if (!currentUser) return;
        sendWsMessage('leave-room', { roomId });
    }, [currentUser, sendWsMessage]);

    const updateRoomName = useCallback((roomId: string, newName: string) => {
        sendWsMessage('update-room-name', { roomId, newName });
    }, [sendWsMessage]);
    
    const deleteRoom = useCallback((roomId: string) => {
        sendWsMessage('delete-room', { roomId });
    }, [sendWsMessage]);

    const getRoom = (roomId: string) => rooms.find(room => room.id === roomId);

    const userCanEditRoom = useCallback((roomId: string): boolean => {
        if (!currentUser) return false;
        if (isAdmin()) return true;
        const room = getRoom(roomId);
        return room ? room.createdBy === currentUser.id : false;
    }, [currentUser, isAdmin, rooms]);


    const value = { 
        rooms, 
        createRoom, 
        joinRoom, 
        leaveRoom, 
        getRoom, 
        updateRoomName, // เพิ่มฟังก์ชันที่ขาดไป
        deleteRoom,     // เพิ่มฟังก์ชันที่ขาดไป
        userCanEditRoom,// เพิ่มฟังก์ชันที่ขาดไป
        ws, 
        userId 
    };

    return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};