// ImageSend — พรีวิวรูปก่อนส่ง (หลายรูป + คำบรรยาย) และกล้องถ่ายรูปบนเดสก์ท็อป
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CameraIcon, PlusIcon, RefreshCwIcon, SendIcon, XIcon } from 'lucide-react';
import { api } from '../lib/api';
import { MAX_CHAT_IMAGES, shrinkImage } from '../lib/image';
import { store } from '../lib/store';
import { btnGhost, btnPrimary, inputCls, Sheet } from './ui';

export const ImageSendSheet: React.FC<{
  channelId: number;
  files: File[];
  onChange: (files: File[]) => void;
  onClose: () => void;
}> = ({ channelId, files, onChange, onClose }) => {
  const [caption, setCaption] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const send = async () => {
    setProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const blob = await shrinkImage(files[i]);
        if (blob.size > 8 * 1024 * 1024) throw new Error(`รูปที่ ${i + 1} ใหญ่เกิน 8MB`);
        // คำบรรยายแนบกับรูปสุดท้าย
        const q = i === files.length - 1 && caption.trim() ? `?caption=${encodeURIComponent(caption.trim())}` : '';
        await api.upload(`/api/channels/${channelId}/images${q}`, blob);
        setProgress(i + 1);
      }
      onClose();
    } catch (e: any) {
      store.toast(e.message || 'ส่งรูปไม่สำเร็จ', 'error');
      setProgress(null);
    }
  };

  const sending = progress !== null;
  return (
    <Sheet title={`ส่งรูป ${files.length} รูป`} onClose={sending ? () => {} : onClose} wide>
      <div className="space-y-4">
        <div className={`grid gap-2 ${files.length === 1 ? 'grid-cols-1' : 'grid-cols-3 sm:grid-cols-4'}`}>
          {urls.map((u, i) => (
            <div key={u} className="relative">
              <img src={u} alt="" className={`w-full rounded-lg object-cover ${files.length === 1 ? 'max-h-[50vh] object-contain bg-slate-100 dark:bg-slate-800' : 'aspect-square'}`} />
              {!sending && (
                <button
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                  aria-label="เอารูปออก"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              )}
              {sending && i < (progress || 0) && <span className="absolute inset-0 rounded-lg bg-emerald-600/40 flex items-center justify-center text-white text-xl">✓</span>}
            </div>
          ))}
          {files.length < MAX_CHAT_IMAGES && files.length > 1 && !sending && (
            <button onClick={() => addRef.current?.click()} className="aspect-square rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400" aria-label="เพิ่มรูป">
              <PlusIcon className="w-6 h-6" />
            </button>
          )}
        </div>
        <input
          ref={addRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            onChange([...files, ...Array.from(e.target.files || [])].slice(0, MAX_CHAT_IMAGES));
            e.target.value = '';
          }}
        />
        <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} placeholder="เพิ่มคำบรรยาย (ไม่บังคับ)" className={inputCls} disabled={sending} />
        <div className="flex gap-2">
          {files.length === 1 && !sending && (
            <button onClick={() => addRef.current?.click()} className={btnGhost}><PlusIcon className="w-4 h-4" /> เพิ่มรูป</button>
          )}
          <button onClick={send} disabled={sending || !files.length} className={`${btnPrimary} flex-1`}>
            <SendIcon className="w-4 h-4" />
            {sending ? `กำลังส่ง ${progress}/${files.length}...` : `ส่ง ${files.length} รูป`}
          </button>
        </div>
      </div>
    </Sheet>
  );
};

// กล้องผ่าน getUserMedia (ใช้บนคอม — มือถือใช้กล้องของระบบผ่าน input capture)
export const CameraSheet: React.FC<{ onCapture: (file: File) => void; onClose: () => void }> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let alive = true;
    setError(null);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((e) => setError(e?.name === 'NotAllowedError' ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง' : 'เปิดกล้องไม่ได้'));
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d')!;
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    canvas.toBlob((b) => b && onCapture(new File([b], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.9);
  };

  return (
    <Sheet title="ถ่ายรูป" onClose={onClose} wide>
      {error ? (
        <p className="text-center text-red-600 py-8">{error}</p>
      ) : (
        <div className="space-y-3">
          <video ref={videoRef} autoPlay playsInline muted className={`w-full rounded-lg bg-black aspect-video object-cover ${facing === 'user' ? '-scale-x-100' : ''}`} />
          <div className="flex items-center justify-center gap-6">
            <button onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')} className="p-3 rounded-full bg-slate-100 dark:bg-slate-800" aria-label="สลับกล้อง">
              <RefreshCwIcon className="w-5 h-5" />
            </button>
            <button onClick={snap} className="w-16 h-16 rounded-full bg-white border-4 border-emerald-500 shadow flex items-center justify-center" aria-label="ถ่าย">
              <CameraIcon className="w-7 h-7 text-emerald-600" />
            </button>
            <span className="w-11" />
          </div>
        </div>
      )}
    </Sheet>
  );
};
