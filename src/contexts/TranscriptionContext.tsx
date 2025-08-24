import React, { useEffect, useState, createContext, useContext } from 'react';
interface TranscriptionEntry {
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}
interface RoomTranscriptions {
  [roomId: string]: TranscriptionEntry[];
}
interface TranscriptionContextType {
  addTranscription: (roomId: string, userId: string, username: string, text: string) => void;
  getRoomTranscriptions: (roomId: string) => TranscriptionEntry[];
  deleteRoomTranscriptions: (roomId: string) => void;
  getAllTranscriptions: () => RoomTranscriptions;
}
const TranscriptionContext = createContext<TranscriptionContextType | null>(null);
export const useTranscription = () => {
  const context = useContext(TranscriptionContext);
  if (!context) {
    throw new Error('useTranscription must be used within a TranscriptionProvider');
  }
  return context;
};
export const TranscriptionProvider: React.FC<{
  children: React.ReactNode;
}> = ({
  children
}) => {
  const [transcriptions, setTranscriptions] = useState<RoomTranscriptions>({});
  // Load transcriptions from localStorage on initial render
  useEffect(() => {
    const storedTranscriptions = localStorage.getItem('transcriptions');
    if (storedTranscriptions) {
      try {
        setTranscriptions(JSON.parse(storedTranscriptions));
      } catch (error) {
        console.error('Error parsing stored transcriptions:', error);
        localStorage.removeItem('transcriptions');
      }
    }
  }, []);
  // Save transcriptions to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('transcriptions', JSON.stringify(transcriptions));
  }, [transcriptions]);
  const addTranscription = (roomId: string, userId: string, username: string, text: string) => {
    if (!text.trim()) return; // Don't add empty transcriptions
    setTranscriptions(prevTranscriptions => {
      const roomTranscriptions = prevTranscriptions[roomId] || [];
      const newEntry: TranscriptionEntry = {
        userId,
        username,
        text: text.trim(),
        timestamp: Date.now()
      };
      return {
        ...prevTranscriptions,
        [roomId]: [...roomTranscriptions, newEntry]
      };
    });
  };
  const getRoomTranscriptions = (roomId: string): TranscriptionEntry[] => {
    return transcriptions[roomId] || [];
  };
  const deleteRoomTranscriptions = (roomId: string) => {
    setTranscriptions(prevTranscriptions => {
      const newTranscriptions = {
        ...prevTranscriptions
      };
      delete newTranscriptions[roomId];
      return newTranscriptions;
    });
  };
  const getAllTranscriptions = (): RoomTranscriptions => {
    return transcriptions;
  };
  const value = {
    addTranscription,
    getRoomTranscriptions,
    deleteRoomTranscriptions,
    getAllTranscriptions
  };
  return <TranscriptionContext.Provider value={value}>
      {children}
    </TranscriptionContext.Provider>;
};