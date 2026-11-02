// Qr.tsx — แสดง QR (เพิ่มเพื่อน/เข้ากลุ่ม/เข้าองค์กร), แชร์ลิงก์ และสแกน QR ด้วยกล้อง
import React, { useEffect, useRef, useState } from 'react';
import { CopyIcon, DownloadIcon, ImageIcon, RefreshCwIcon, Share2Icon } from 'lucide-react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { inviteUrl } from '../lib/api';
import { store } from '../lib/store';
import { Avatar, btnGhost, Sheet } from './ui';

export const QrCode: React.FC<{ value: string; size?: number; className?: string }> = ({ value, size = 240, className = '' }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) QRCode.toCanvas(ref.current, value, { width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } });
  }, [value, size]);
  return <canvas ref={ref} className={`rounded-xl bg-white ${className}`} style={{ width: size, height: size }} />;
};

// ดึงรหัสเชิญจากข้อความที่สแกนได้ (ลิงก์ /i/CODE หรือรหัสเปล่า)
export function codeFromText(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/i\/([A-Za-z0-9]{6,12})(?:[/?#]|$)/);
  if (m) return m[1].toUpperCase();
  return /^[A-Za-z0-9]{6,12}$/.test(t) ? t.toUpperCase() : null;
}

export const QrShareSheet: React.FC<{
  title: string;
  subtitle?: string;
  code: string;
  avatar?: { name: string; id?: number; userId?: number; src?: string | null };
  hint?: string;
  onReset?: () => Promise<void>;
  onClose: () => void;
}> = ({ title, subtitle, code, avatar, hint, onReset, onClose }) => {
  const url = inviteUrl(code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      store.toast('คัดลอกลิงก์แล้ว');
    } catch {
      store.toast(url);
    }
  };
  const share = () => (navigator as any).share?.({ title, text: subtitle || title, url }).catch(() => {});
  const download = async () => {
    const a = document.createElement('a');
    a.href = await QRCode.toDataURL(url, { width: 1024, margin: 2 });
    a.download = `qr-${code}.png`;
    a.click();
  };
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        {avatar && (
          <div className="flex flex-col items-center gap-1">
            <Avatar name={avatar.name} id={avatar.id} userId={avatar.userId} src={avatar.src} size="lg" />
            <p className="font-semibold">{avatar.name}</p>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        )}
        <div className="p-3 rounded-2xl bg-white shadow-inner border border-slate-200">
          <QrCode value={url} size={232} />
        </div>
        <p className="font-mono text-lg tracking-[0.3em] font-semibold">{code}</p>
        {hint && <p className="text-xs text-slate-500 max-w-xs">{hint}</p>}
        <div className="grid grid-cols-3 gap-2 w-full">
          <button onClick={copy} className={btnGhost}><CopyIcon className="w-4 h-4" /> คัดลอก</button>
          {'share' in navigator ? (
            <button onClick={share} className={btnGhost}><Share2Icon className="w-4 h-4" /> แชร์</button>
          ) : <span />}
          <button onClick={download} className={btnGhost}><DownloadIcon className="w-4 h-4" /> บันทึก</button>
        </div>
        {onReset && (
          <button
            onClick={() => confirm('สร้างรหัสใหม่? QR/ลิงก์เดิมจะใช้ไม่ได้อีก') && onReset().catch((e) => store.toast(e.message, 'error'))}
            className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-800"
          >
            <RefreshCwIcon className="w-3.5 h-3.5" /> สร้างรหัสใหม่ (ยกเลิกอันเดิม)
          </button>
        )}
      </div>
    </Sheet>
  );
};

// สแกน QR ด้วยกล้อง (jsQR) หรือเลือกรูป QR จากเครื่อง
export const QrScanner: React.FC<{ onCode: (code: string) => void; onClose: () => void }> = ({ onCode, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const done = useRef(false);

  const handleText = (text: string) => {
    const code = codeFromText(text);
    if (code && !done.current) {
      done.current = true;
      navigator.vibrate?.(80);
      onCode(code);
    }
    return !!code;
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let alive = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const tick = () => {
      const v = videoRef.current;
      if (!alive || done.current) return;
      if (v && v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = v.videoWidth * scale;
        canvas.height = v.videoHeight * scale;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (r && handleText(r.data)) return;
      }
      raf = requestAnimationFrame(tick);
    };
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        raf = requestAnimationFrame(tick);
      })
      .catch((e) => setError(e?.name === 'NotAllowedError' ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง' : 'เปิดกล้องไม่ได้ — เลือกรูป QR หรือพิมพ์รหัสแทน'));
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromFile = async (file: File) => {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return store.toast('เปิดรูปไม่ได้', 'error');
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const r = jsQR(ctx.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width, bmp.height);
    if (!r || !handleText(r.data)) store.toast('ไม่พบ QR ของระบบนี้ในรูป', 'error');
  };

  return (
    <Sheet title="สแกน QR" onClose={onClose}>
      <div className="space-y-3">
        {error ? (
          <p className="text-center text-sm text-amber-600 py-6">{error}</p>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-[15%] border-4 border-white/80 rounded-2xl pointer-events-none" />
            <p className="absolute bottom-2 inset-x-0 text-center text-white text-xs drop-shadow">เล็ง QR ให้อยู่ในกรอบ</p>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className={`${btnGhost} flex-1`}><ImageIcon className="w-4 h-4" /> เลือกรูป QR</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) fromFile(f); e.target.value = ''; }} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (!handleText(manual)) store.toast('รหัสไม่ถูกต้อง', 'error'); }} className="flex gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="หรือพิมพ์รหัส / วางลิงก์" className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm uppercase" />
          <button className="rounded-lg bg-emerald-600 text-white text-sm px-4">ตกลง</button>
        </form>
      </div>
    </Sheet>
  );
};
