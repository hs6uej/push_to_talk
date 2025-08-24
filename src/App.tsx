import React from 'react';
import { AppRouter } from './AppRouter';
import { AuthProvider } from './contexts/AuthContext';
import { RoomProvider, WebSocketProvider } from './contexts/RoomContext'; // Import WebSocketProvider
import { TranscriptionProvider } from './contexts/TranscriptionContext';

export function App() {
  return (
    <AuthProvider>
      <WebSocketProvider> {/* <--- เพิ่ม Provider ตัวนี้เข้าไปครอบทั้งหมด */}
        <TranscriptionProvider>
          <RoomProvider>
            <div className="min-h-screen bg-gray-50">
              <AppRouter />
            </div>
          </RoomProvider>
        </TranscriptionProvider>
      </WebSocketProvider> {/* <--- และปิดท้ายที่นี่ */}
    </AuthProvider>
  );
}
