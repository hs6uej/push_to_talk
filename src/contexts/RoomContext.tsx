import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

export interface Room {
  id: string;
  name: string;
  createdBy: string;
  participants: string[];
}

interface SocketContextValue {
  socket: WebSocket | null;
  status: 'connecting' | 'connected' | 'disconnected';
}

interface RoomContextType {
  rooms: Room[];
  isLoading: boolean;
  connectionStatus: SocketContextValue['status'];
  createRoom: (name: string) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  getRoom: (roomId: string) => Room | undefined;
  updateRoomName: (roomId: string, newName: string) => void;
  deleteRoom: (roomId: string) => void;
  userCanEditRoom: (roomId: string) => boolean;
  ws: WebSocket | null;
}

const WebSocketContext = createContext<SocketContextValue>({ socket: null, status: 'connecting' });
const RoomContext = createContext<RoomContextType | null>(null);

export const useWebSocket = () => useContext(WebSocketContext);
export const useRoom = () => {
  const context = useContext(RoomContext);
  if (!context) throw new Error('useRoom must be used within a RoomProvider');
  return context;
};

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [value, setValue] = useState<SocketContextValue>({ socket: null, status: 'connecting' });
  const reconnectTimer = useRef<number>();

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (!active) return;
      const configuredUrl = import.meta.env.VITE_WS_URL as string | undefined;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = configuredUrl || `${protocol}//${window.location.hostname}:8080`;
      socket = new WebSocket(url);
      socket.binaryType = 'blob';
      setValue({ socket, status: 'connecting' });
      socket.onopen = () => active && setValue({ socket, status: 'connected' });
      socket.onclose = () => {
        if (!active) return;
        setValue({ socket: null, status: 'disconnected' });
        reconnectTimer.current = window.setTimeout(connect, 2000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      active = false;
      window.clearTimeout(reconnectTimer.current);
      socket?.close();
    };
  }, []);

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

export const RoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { currentUser, isAdmin } = useAuth();
  const { socket: ws, status: connectionStatus } = useWebSocket();

  useEffect(() => {
    if (!ws) return;
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'initial-data' || data.type === 'room-update') {
          setRooms(data.payload.rooms);
          setIsLoading(false);
        } else if (data.type === 'participant-update') {
          setRooms(previous => previous.map(room => room.id === data.payload.roomId
            ? { ...room, participants: data.payload.participants }
            : room));
        }
      } catch (error) {
        console.error('Invalid server message', error);
      }
    };
    ws.addEventListener('message', handleMessage);
    const requestRooms = () => ws.send(JSON.stringify({ type: 'get-initial-data' }));
    if (ws.readyState === WebSocket.OPEN) requestRooms();
    else ws.addEventListener('open', requestRooms, { once: true });
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  const send = useCallback((type: string, payload: object) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ type, payload }));
    return true;
  }, [ws]);

  const createRoom = useCallback((name: string) => {
    if (currentUser) send('create-room', { name, createdBy: currentUser.id });
  }, [currentUser, send]);
  const joinRoom = useCallback((roomId: string) => {
    if (currentUser) send('join-room', { roomId, displayName: currentUser.username });
  }, [currentUser, send]);
  const leaveRoom = useCallback((roomId: string) => { send('leave-room', { roomId }); }, [send]);
  const updateRoomName = useCallback((roomId: string, newName: string) => {
    send('update-room-name', { roomId, newName, userId: currentUser?.id, isAdmin: isAdmin() });
  }, [currentUser, isAdmin, send]);
  const deleteRoom = useCallback((roomId: string) => {
    send('delete-room', { roomId, userId: currentUser?.id, isAdmin: isAdmin() });
  }, [currentUser, isAdmin, send]);
  const getRoom = useCallback((roomId: string) => rooms.find(room => room.id === roomId), [rooms]);
  const userCanEditRoom = useCallback((roomId: string) => {
    const room = getRoom(roomId);
    return Boolean(currentUser && room && (isAdmin() || room.createdBy === currentUser.id));
  }, [currentUser, getRoom, isAdmin]);

  const value = useMemo(() => ({ rooms, isLoading, connectionStatus, createRoom, joinRoom, leaveRoom,
    getRoom, updateRoomName, deleteRoom, userCanEditRoom, ws }),
  [rooms, isLoading, connectionStatus, createRoom, joinRoom, leaveRoom, getRoom, updateRoomName, deleteRoom, userCanEditRoom, ws]);
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};
