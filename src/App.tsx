import React from 'react';
import { AppRouter } from './AppRouter';
import { AuthProvider } from './contexts/AuthContext';
import { RoomProvider, WebSocketProvider } from './contexts/RoomContext';
import { TranscriptionProvider } from './contexts/TranscriptionContext';

export function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <TranscriptionProvider>
          <RoomProvider>
            <div className="min-h-screen bg-gray-50">
              <AppRouter />
            </div>
          </RoomProvider>
        </TranscriptionProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}
