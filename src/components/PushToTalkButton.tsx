import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MicIcon, MicOffIcon } from 'lucide-react';
import { useTranscription } from '../contexts/TranscriptionContext';
import { useAuth } from '../contexts/AuthContext';
import { useRoom } from '../contexts/RoomContext';

interface PushToTalkButtonProps { roomId: string; username: string }

const PushToTalkButton: React.FC<PushToTalkButtonProps> = ({ roomId, username }) => {
  const [isTalking, setIsTalking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef('');
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  const { addTranscription } = useTranscription();
  const { currentUser } = useAuth();
  const { ws, connectionStatus } = useRoom();

  useEffect(() => {
    if (!ws) return;
    const receive = (event: MessageEvent) => {
      if (!(event.data instanceof Blob) || event.data.size === 0) return;
      const url = URL.createObjectURL(event.data);
      const audio = new Audio(url);
      audioQueueRef.current.push(audio);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioQueueRef.current = audioQueueRef.current.filter(item => item !== audio);
      };
      audio.play().catch(() => setError('แตะหน้าจอหนึ่งครั้งเพื่ออนุญาตให้เบราว์เซอร์เล่นเสียง'));
    };
    const receiveTranscript = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      const message = JSON.parse(event.data);
      if (message.type === 'new-transcription' && message.payload.roomId === roomId &&
          message.payload.userId !== currentUser?.id) {
        addTranscription(roomId, message.payload.userId, message.payload.username, message.payload.text);
      }
    };
    ws.addEventListener('message', receive);
    ws.addEventListener('message', receiveTranscript);
    return () => {
      ws.removeEventListener('message', receive);
      ws.removeEventListener('message', receiveTranscript);
    };
  }, [addTranscription, currentUser?.id, roomId, ws]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    recognitionRef.current?.abort();
    audioQueueRef.current.forEach(audio => audio.pause());
  }, []);

  const publishTranscript = useCallback(() => {
    const text = transcriptRef.current.trim();
    if (!text || !currentUser) return;
    addTranscription(roomId, currentUser.id, username, text);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'send-transcription', payload: {
        roomId, userId: currentUser.id, username, text
      } }));
    }
    transcriptRef.current = '';
    setTranscript('');
  }, [addTranscription, currentUser, roomId, username, ws]);

  const startTalking = async () => {
    if (isTalking || !currentUser || connectionStatus !== 'connected') return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true
      } });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = () => {
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (audio.size && ws?.readyState === WebSocket.OPEN) ws.send(audio);
        stream.getTracks().forEach(track => track.stop());
        publishTranscript();
      };
      recorder.start();

      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (Recognition) {
        const recognition = new Recognition();
        recognition.lang = 'th-TH';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = event => {
          let text = '';
          for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
          transcriptRef.current = text;
          setTranscript(text);
        };
        recognition.onerror = event => {
          if (event.error !== 'aborted' && event.error !== 'no-speech') setError(`ถอดเสียงไม่สำเร็จ: ${event.error}`);
        };
        recognitionRef.current = recognition;
        recognition.start();
      }
      setIsTalking(true);
    } catch {
      setError('ไม่สามารถใช้ไมโครโฟนได้ กรุณาอนุญาตสิทธิ์ไมโครโฟนแล้วลองอีกครั้ง');
    }
  };

  const stopTalking = () => {
    if (!isTalking) return;
    setIsTalking(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const unavailable = connectionStatus !== 'connected' || !navigator.mediaDevices || !window.MediaRecorder;
  return <div className="flex flex-col items-center text-center">
    <button type="button" aria-label={isTalking ? 'ปล่อยเพื่อส่งเสียง' : 'กดค้างเพื่อพูด'}
      className={`w-28 h-28 rounded-full flex items-center justify-center shadow-lg transition-all select-none touch-none ${isTalking ? 'bg-red-500 text-white scale-110 ring-8 ring-red-100' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:bg-gray-300 disabled:cursor-not-allowed`}
      onPointerDown={startTalking} onPointerUp={stopTalking} onPointerCancel={stopTalking}
      onPointerLeave={stopTalking} disabled={unavailable}>
      {unavailable ? <MicOffIcon className="w-12 h-12" /> : <MicIcon className={`w-12 h-12 ${isTalking ? 'animate-pulse' : ''}`} />}
    </button>
    <p className="mt-4 font-medium">{isTalking ? 'กำลังบันทึก — ปล่อยเพื่อส่ง' : unavailable ? 'กำลังเชื่อมต่อ…' : 'กดค้างเพื่อพูด'}</p>
    {isTalking && transcript && <p className="mt-3 max-w-md rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-900">{transcript}</p>}
    {error && <p role="alert" className="mt-3 max-w-md text-sm text-red-600">{error}</p>}
  </div>;
};

export default PushToTalkButton;
