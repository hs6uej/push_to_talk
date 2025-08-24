import React, { useEffect, useState, useRef } from 'react';
import { MicIcon } from 'lucide-react';
import { useTranscription } from '../contexts/TranscriptionContext';
import { useAuth } from '../contexts/AuthContext';

interface PushToTalkButtonProps {
  roomId: string;
  username: string;
}

const PushToTalkButton: React.FC<PushToTalkButtonProps> = ({
  roomId,
  username
}) => {
  const [isTalking, setIsTalking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [transcript, setTranscript] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const {
    addTranscription
  } = useTranscription();
  const {
    currentUser
  } = useAuth();

  // Initialize SpeechRecognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'th-TH'; // ตั้งค่าเป็นภาษาไทย

      recognitionRef.current.onresult = event => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPart = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPart;
          } else {
            interimTranscript += transcriptPart;
          }
        }
        setTranscript(finalTranscript || interimTranscript);
      };

      recognitionRef.current.onerror = event => {
        console.error('Speech recognition error', event.error);
        // ถ้าเกิด error ให้หยุดทำงานเพื่อป้องกันการค้าง
        if (isTalking) {
            stopTalking();
        }
      };

    } else {
      console.error('Speech recognition not supported in this browser');
    }

    // Initialize audio context
    const initAudio = async () => {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        setIsReady(true);
      } catch (error) {
        console.error('Error initializing audio context:', error);
      }
    };
    initAudio();

    // Cleanup function
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []); // Dependency array is empty, so this runs only once on mount

  const startTalking = async () => {
    // --- FIX: เพิ่มเงื่อนไขป้องกันการ start ซ้ำ ---
    if (isTalking || !isReady || !currentUser) return;

    setTranscript('');
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }
      setIsTalking(true);
      console.log(`${username} started talking in room ${roomId}`);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopTalking = () => {
    // --- FIX: เพิ่มเงื่อนไขป้องกันการ stop ซ้ำ ---
    if (!isTalking) return;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      // ใช้ setTimeout เล็กน้อยเพื่อให้แน่ใจว่าผลลัพธ์สุดท้ายถูกประมวลผลแล้ว
      setTimeout(() => {
        if (transcript && currentUser) {
          addTranscription(roomId, currentUser.id, username, transcript);
        }
        setTranscript('');
      }, 100);
    }
    setIsTalking(false);
    console.log(`${username} stopped talking in room ${roomId}`);
  };

  return <div className="flex flex-col items-center">
      <button 
        className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all transform ${isTalking ? 'bg-red-500 text-white scale-110' : 'bg-blue-500 text-white hover:bg-blue-600'}`} 
        onMouseDown={startTalking} 
        onMouseUp={stopTalking} 
        onMouseLeave={stopTalking} // แก้ไขให้เรียก stopTalking เสมอเมื่อเมาส์ออกจากปุ่ม
        onTouchStart={(e) => { e.preventDefault(); startTalking(); }} 
        onTouchEnd={stopTalking} 
        disabled={!isReady}
      >
        <MicIcon className={`w-12 h-12 ${isTalking ? 'animate-pulse' : ''}`} />
      </button>
      <p className="mt-4 font-medium">
        {isTalking ? 'กำลังพูด...' : 'กดเพื่อพูด'}
      </p>
      {!isReady && <p className="text-sm text-gray-500 mt-2">กำลังเตรียมระบบเสียง...</p>}
      {isTalking && transcript && <div className="mt-4 p-3 bg-gray-100 rounded-md max-w-md">
          <p className="text-sm text-gray-800">{transcript}</p>
        </div>}
    </div>;
};

export default PushToTalkButton;