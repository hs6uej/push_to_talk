import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, MapPinIcon, PauseIcon, PlayIcon, SirenIcon, Trash2Icon } from 'lucide-react';
import { api, Message } from '../lib/api';
import { playClip, stopClip } from '../lib/audio';
import { store } from '../lib/store';
import { Avatar, fmtDuration, Sheet } from './ui';

// ---------- รูปที่ต้องแนบ token ----------
const blobCache = new Map<number, string>();
export const AuthImage: React.FC<{ messageId: number; className?: string; alt?: string; onClick?: () => void }> = ({ messageId, className, alt, onClick }) => {
  const [url, setUrl] = useState(blobCache.get(messageId) || '');
  useEffect(() => {
    if (url) return;
    let alive = true;
    api.blob(api.fileUrl(messageId)).then((b) => {
      const u = URL.createObjectURL(b);
      blobCache.set(messageId, u);
      if (alive) setUrl(u);
    }).catch(() => {});
    return () => { alive = false; };
  }, [messageId, url]);
  return url
    ? <img src={url} alt={alt || ''} className={className} onClick={onClick} loading="lazy" />
    : <div className={`${className} bg-slate-200 dark:bg-slate-700 animate-pulse`} />;
};

// ---------- แผนที่ย่อ (OSM tile 3x3 รอบจุด) ----------
export const StaticMap: React.FC<{ lat: number; lng: number; zoom?: number; className?: string }> = ({ lat, lng, zoom = 15, className = '' }) => {
  const n = 2 ** zoom;
  const xf = ((lng + 180) / 360) * n;
  const yf = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const tx = Math.floor(xf), ty = Math.floor(yf);
  const px = (xf - tx) * 256, py = (yf - ty) * 256;
  const tiles = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push([dx, dy]);
  return (
    <div className={`relative overflow-hidden bg-slate-200 dark:bg-slate-700 ${className}`}>
      <div className="absolute" style={{ left: `calc(50% - ${256 + px}px)`, top: `calc(50% - ${256 + py}px)`, width: 768, height: 768 }}>
        {tiles.map(([dx, dy]) => (
          <img
            key={`${dx},${dy}`}
            src={`https://tile.openstreetmap.org/${zoom}/${(tx + dx + n) % n}/${ty + dy}.png`}
            alt=""
            className="absolute w-64 h-64 max-w-none"
            style={{ left: (dx + 1) * 256, top: (dy + 1) * 256 }}
            loading="lazy"
          />
        ))}
      </div>
      <MapPinIcon className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full w-8 h-8 text-red-600 fill-red-200 drop-shadow" />
      <span className="absolute bottom-0 right-0 bg-white/80 text-[9px] px-1 text-slate-600">© OpenStreetMap</span>
    </div>
  );
};

// ---------- เล่นเสียง ----------
const AudioPlayer: React.FC<{ m: Message; mine: boolean }> = ({ m, mine }) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const toggle = async () => {
    if (playing) {
      stopClip();
      return;
    }
    try {
      setPlaying(true);
      const data = await (await api.blob(api.fileUrl(m.id))).arrayBuffer();
      const start = performance.now();
      const dur = m.durationMs || 1;
      await playClip(data, () => {
        cancelAnimationFrame(raf.current);
        setPlaying(false);
        setProgress(0);
      });
      const tick = () => {
        setProgress(Math.min(1, (performance.now() - start) / dur));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e: any) {
      setPlaying(false);
      store.toast(e.message || 'เล่นเสียงไม่ได้', 'error');
    }
  };

  // แท่งคลื่นเสียงตกแต่ง (สุ่มคงที่ตาม id)
  const bars = Array.from({ length: 28 }, (_, i) => 30 + ((m.id * 37 + i * 53) % 70));
  return (
    <button onClick={toggle} className="flex items-center gap-2.5 w-56 max-w-full" aria-label={playing ? 'หยุด' : 'เล่นเสียง'}>
      <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white ${playing ? 'bg-red-500' : mine ? 'bg-emerald-600' : 'bg-emerald-500'}`}>
        {playing ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4 ml-0.5" />}
      </span>
      <span className="flex-1 flex items-center gap-[2px] h-7">
        {bars.map((h, i) => (
          <span
            key={i}
            className={`flex-1 rounded-full ${i / bars.length < progress ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </span>
      <span className="text-xs tabular-nums text-slate-500 shrink-0">{fmtDuration(m.durationMs || 0)}</span>
    </button>
  );
};

interface Props {
  m: Message;
  mine: boolean;
  showName: boolean;
  canDelete: boolean;
  onImage: (id: number) => void;
}

const MessageBubble: React.FC<Props> = ({ m, mine, showName, canDelete, onImage }) => {
  const time = new Date(m.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  const remove = async () => {
    if (!confirm('ลบข้อความนี้?')) return;
    try {
      await api.del(`/api/messages/${m.id}`);
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  if (m.kind === 'sos') {
    return (
      <div className="mx-auto my-2 max-w-sm w-full rounded-xl border-2 border-red-500 bg-red-50 dark:bg-red-500/10 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white font-bold">
          <SirenIcon className="w-5 h-5" /> SOS จาก {m.username}
          <span className="ml-auto text-xs font-normal opacity-90">{time}</span>
        </div>
        {m.text && <p className="px-3 pt-2 text-sm">{m.text}</p>}
        {m.lat != null && m.lng != null ? (
          <a href={`https://www.google.com/maps?q=${m.lat},${m.lng}`} target="_blank" rel="noreferrer" className="block p-3">
            <StaticMap lat={m.lat} lng={m.lng} className="h-32 rounded-lg" />
            <span className="block mt-1 text-xs text-red-700 dark:text-red-300">{m.lat.toFixed(5)}, {m.lng.toFixed(5)} · เปิดใน Google Maps</span>
          </a>
        ) : <p className="px-3 py-2 text-xs text-slate-500">ไม่มีข้อมูลพิกัด</p>}
      </div>
    );
  }

  return (
    <div className={`group flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      {!mine && (showName ? <Avatar clickable name={m.username} userId={m.userId} size="sm" /> : <span className="w-8 shrink-0" />)}
      <div className={`max-w-[80%] sm:max-w-md flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showName && !mine && <span className="text-xs text-slate-500 mb-0.5 ml-1">{m.username}</span>}
        <div
          className={`rounded-2xl px-3 py-2 shadow-sm ${mine ? 'bg-emerald-100 dark:bg-emerald-900/50 rounded-br-md' : 'bg-white dark:bg-slate-800 rounded-bl-md'} ${m.kind === 'image' || m.kind === 'location' ? 'p-1.5' : ''}`}
        >
          {m.kind === 'audio' && (
            <>
              <AudioPlayer m={m} mine={mine} />
              {m.transcript && <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{m.transcript}</p>}
            </>
          )}
          {m.kind === 'text' && <p className="text-[15px] whitespace-pre-wrap break-words">{m.text}</p>}
          {m.kind === 'image' && (
            <>
              <AuthImage messageId={m.id} onClick={() => onImage(m.id)} className="rounded-xl max-h-72 w-auto min-w-[8rem] min-h-[6rem] object-cover cursor-zoom-in" />
              {m.text && <p className="px-1.5 pt-1 text-sm">{m.text}</p>}
            </>
          )}
          {m.kind === 'location' && m.lat != null && m.lng != null && (
            <a href={`https://www.google.com/maps?q=${m.lat},${m.lng}`} target="_blank" rel="noreferrer" className="block w-60 max-w-full">
              <StaticMap lat={m.lat} lng={m.lng} className="h-32 rounded-xl" />
              <span className="flex items-center gap-1 px-1.5 pt-1 text-xs text-slate-600 dark:text-slate-300">
                <MapPinIcon className="w-3.5 h-3.5" /> {m.text || 'ตำแหน่งที่แชร์'} · เปิดแผนที่
              </span>
            </a>
          )}
        </div>
        <span className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 mx-1">
          {time}
          {m.kind === 'audio' && m.hasFile && (
            <button onClick={() => api.download(`${api.fileUrl(m.id)}?download=1`, `ptt-${m.id}.wav`)} className="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-60" aria-label="ดาวน์โหลดเสียง">
              <DownloadIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button onClick={remove} className="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-60 hover:text-red-500" aria-label="ลบข้อความ">
              <Trash2Icon className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
};

// รูปหลายรูปที่ส่งติดกัน แสดงเป็นกริด
export const ImageGroupBubble: React.FC<{ items: Message[]; mine: boolean; showName: boolean; onImage: (id: number) => void }> = ({ items, mine, showName, onImage }) => {
  const shown = items.slice(0, 6);
  const extra = items.length - shown.length;
  const last = items[items.length - 1];
  const cols = items.length === 2 || items.length === 4 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      {!mine && (showName ? <Avatar clickable name={items[0].username} userId={items[0].userId} size="sm" /> : <span className="w-8 shrink-0" />)}
      <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showName && !mine && <span className="text-xs text-slate-500 mb-0.5 ml-1">{items[0].username}</span>}
        <div className={`grid ${cols} gap-1 p-1 rounded-2xl w-64 sm:w-80 ${mine ? 'bg-emerald-100 dark:bg-emerald-900/50' : 'bg-white dark:bg-slate-800'}`}>
          {shown.map((m, i) => (
            <button key={m.id} onClick={() => onImage(m.id)} className="relative aspect-square overflow-hidden rounded-lg">
              <AuthImage messageId={m.id} className="w-full h-full object-cover" />
              {i === shown.length - 1 && extra > 0 && (
                <span className="absolute inset-0 bg-black/50 text-white text-xl font-semibold flex items-center justify-center">+{extra}</span>
              )}
            </button>
          ))}
          {last.text && <p className="col-span-full px-1.5 pb-1 text-sm">{last.text}</p>}
        </div>
        <span className="text-[11px] text-slate-400 mt-0.5 mx-1">
          {items.length} รูป · {new Date(last.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

// ดูรูปเต็มจอ เลื่อนดูรูปอื่นในช่องได้
export const ImageViewer: React.FC<{
  ids: number[];
  current: number;
  onChange: (id: number) => void;
  onClose: () => void;
  canDelete: (id: number) => boolean;
}> = ({ ids, current, onChange, onClose, canDelete }) => {
  const idx = ids.indexOf(current);
  const go = (d: number) => {
    const next = ids[idx + d];
    if (next != null) onChange(next);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const touchX = useRef<number | null>(null);
  const remove = async () => {
    if (!confirm('ลบรูปนี้?')) return;
    try {
      await api.del(`/api/messages/${current}`);
      const next = ids[idx + 1] ?? ids[idx - 1];
      if (next != null) onChange(next);
      else onClose();
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };
  return (
    <Sheet title={ids.length > 1 ? `รูปภาพ ${idx + 1}/${ids.length}` : 'รูปภาพ'} onClose={onClose} wide>
      <div
        className="relative select-none"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        <AuthImage key={current} messageId={current} className="w-full max-h-[70dvh] object-contain rounded-lg bg-slate-100 dark:bg-slate-800" />
        {idx > 0 && (
          <button onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center" aria-label="รูปก่อนหน้า">
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
        )}
        {idx < ids.length - 1 && (
          <button onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center" aria-label="รูปถัดไป">
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-3 text-sm">
        <button onClick={() => api.download(`${api.fileUrl(current)}?download=1`, `ptt-image-${current}.jpg`)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border dark:border-slate-700">
          <DownloadIcon className="w-4 h-4" /> ดาวน์โหลด
        </button>
        {canDelete(current) && (
          <button onClick={remove} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border dark:border-slate-700 text-red-600">
            <Trash2Icon className="w-4 h-4" /> ลบ
          </button>
        )}
      </div>
    </Sheet>
  );
};

export default MessageBubble;
