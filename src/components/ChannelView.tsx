import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon, CameraIcon, ImageIcon, InfoIcon, LockIcon, MapPinIcon, SendIcon, SirenIcon, Volume2Icon, VolumeXIcon,
} from 'lucide-react';
import { api, Message } from '../lib/api';
import { store, useStore } from '../lib/store';
import MessageBubble, { ImageGroupBubble, ImageViewer } from './MessageBubble';
import PttButton from './PttButton';
import ChannelInfo from './ChannelInfo';
import { CameraSheet, ImageSendSheet } from './ImageSend';
import { imagesFrom, isTouchDevice, MAX_CHAT_IMAGES } from '../lib/image';
import { Avatar } from './ui';

const EMPTY: Message[] = [];

function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'วันนี้';
  if (d.toDateString() === yesterday.toDateString()) return 'เมื่อวาน';
  return d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const Composer: React.FC<{ channelId: number; disabled: boolean; onImages: (files: File[]) => void; onCamera: () => void }> = ({
  channelId, disabled, onImages, onCamera,
}) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      store.toast(e.message || 'ส่งไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendText = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    run(async () => {
      await api.post(`/api/channels/${channelId}/messages`, { kind: 'text', text: t });
      setText('');
    });
  };

  const sendLocation = () => run(async () => {
    const pos = await store.getPosition();
    if (!pos) throw new Error('หาตำแหน่งไม่ได้ (ตรวจสอบสิทธิ์ตำแหน่งของเบราว์เซอร์)');
    await api.post(`/api/channels/${channelId}/messages`, { kind: 'location', lat: pos.coords.latitude, lng: pos.coords.longitude });
  });

  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = imagesFrom(e.target.files);
    if (files.length > MAX_CHAT_IMAGES) store.toast(`เลือกได้สูงสุด ${MAX_CHAT_IMAGES} รูปต่อครั้ง`);
    if (files.length) onImages(files.slice(0, MAX_CHAT_IMAGES));
    e.target.value = '';
  };

  // มือถือใช้แอปกล้องของเครื่อง, คอมใช้กล้องในหน้าเว็บ
  const openCamera = () => (isTouchDevice() ? cameraRef.current?.click() : onCamera());

  const iconBtn = 'p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40';
  return (
    <form onSubmit={sendText} className="flex items-center gap-0.5 sm:gap-1">
      <button type="button" disabled={disabled || busy} onClick={openCamera} className={iconBtn} aria-label="ถ่ายรูป" title="ถ่ายรูป">
        <CameraIcon className="w-5 h-5" />
      </button>
      <button type="button" disabled={disabled || busy} onClick={() => fileRef.current?.click()} className={iconBtn} aria-label="เลือกรูป" title={`เลือกรูป (สูงสุด ${MAX_CHAT_IMAGES} รูป)`}>
        <ImageIcon className="w-5 h-5" />
      </button>
      <button type="button" disabled={disabled || busy} onClick={sendLocation} className={iconBtn} aria-label="ส่งตำแหน่ง" title="ส่งตำแหน่ง">
        <MapPinIcon className="w-5 h-5" />
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={picked} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={picked} />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? '' : 'พิมพ์ข้อความ...'}
        maxLength={4000}
        className="flex-1 min-w-0 rounded-full bg-slate-100 dark:bg-slate-800 px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      />
      <button disabled={disabled || busy || !text.trim()} className="p-2 rounded-full bg-emerald-600 text-white disabled:opacity-40" aria-label="ส่ง">
        <SendIcon className="w-5 h-5" />
      </button>
    </form>
  );
};

interface Props {
  channelId: number;
  embedded?: boolean; // แสดงในหน้า dispatch (ไม่มีปุ่มย้อนกลับ)
}

const ChannelView: React.FC<Props> = ({ channelId, embedded }) => {
  const navigate = useNavigate();
  const me = useStore((s) => s.me);
  const channels = useStore((s) => s.channels);
  const online = useStore((s) => s.online);
  const live = useStore((s) => s.live[channelId]);
  const thread = useStore((s) => s.messages[channelId]);
  const muted = useStore((s) => s.settings.mutedChannels.includes(channelId));
  const keepAwake = useStore((s) => s.settings.keepAwake);
  const ch = channels.find((c) => c.id === channelId);
  const items = thread?.items || EMPTY;

  const [showInfo, setShowInfo] = useState(false);
  const [viewImage, setViewImage] = useState<number | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [camera, setCamera] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef(0);

  useEffect(() => {
    store.setActiveChannel(channelId);
    store.loadMessages(channelId);
    stickToBottom.current = true;
    return () => store.setActiveChannel(null);
  }, [channelId]);

  // เปิดหน้าจอค้างไว้ระหว่างอยู่ในช่อง (ถ้าตั้งค่าไว้)
  useEffect(() => {
    if (!keepAwake || !('wakeLock' in navigator)) return;
    let lock: any = null;
    const acquire = () => (navigator as any).wakeLock.request('screen').then((l: any) => { lock = l; }).catch(() => {});
    acquire();
    const onVis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.();
    };
  }, [keepAwake, channelId]);

  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่ / คงตำแหน่งเมื่อโหลดข้อความเก่า
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    else if (prevHeight.current && el.scrollHeight > prevHeight.current && el.scrollTop < 50) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    }
    prevHeight.current = el.scrollHeight;
  }, [items]);

  const onScroll = () => {
    const el = listRef.current!;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 60 && thread?.hasMore && !thread.loading) {
      prevHeight.current = el.scrollHeight;
      store.loadOlder(channelId);
    }
  };

  // จัดกลุ่ม: ป้ายวัน, และรวมรูปที่ส่งติดกันจากคนเดียวกัน (ภายใน 1 นาที) เป็นกริด
  type Row = { day: string } | { m: Message; showName: boolean } | { group: Message[]; showName: boolean };
  const rows = useMemo(() => {
    const out: Row[] = [];
    let lastDay = '';
    let lastUser: number | null | undefined;
    let lastTs = 0;
    for (const m of items) {
      const day = dayLabel(m.createdAt);
      if (day !== lastDay) {
        out.push({ day });
        lastDay = day;
        lastUser = undefined;
      }
      const prev = out[out.length - 1];
      const prevImage = prev && ('group' in prev ? prev.group[prev.group.length - 1] : 'm' in prev ? prev.m : null);
      if (m.kind === 'image' && prevImage && prevImage.kind === 'image' && !prevImage.text && prevImage.userId === m.userId && m.createdAt - prevImage.createdAt < 60000) {
        if ('group' in prev) prev.group.push(m);
        else out[out.length - 1] = { group: [prevImage, m], showName: (prev as { showName: boolean }).showName };
      } else {
        out.push({ m, showName: m.userId !== lastUser || m.createdAt - lastTs > 5 * 60000 });
      }
      lastUser = m.userId;
      lastTs = m.createdAt;
    }
    return out;
  }, [items]);
  const imageIds = useMemo(() => items.filter((m) => m.kind === 'image').map((m) => m.id), [items]);

  if (!ch) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 p-8 text-center">
        {channels.length ? 'ไม่พบช่องนี้ หรือคุณไม่มีสิทธิ์เข้าถึง' : 'กำลังโหลด...'}
      </div>
    );
  }

  const speaker = live?.user || ch.speaker;
  const othersSpeaking = speaker && speaker.id !== me?.id ? speaker : null;
  const isMember = !!ch.role;
  // เจ้าหน้าที่ของช่องนี้: superadmin หรือ admin/dispatcher ขององค์กรเจ้าของช่อง
  const staff = me?.staffScope === 'all' || (!!ch.orgId && me?.staffScope === ch.orgId);
  const orgAdmin = me?.role === 'superadmin' || (!!ch.orgId && me?.org?.id === ch.orgId && me.org.role === 'admin');
  const canPost = (isMember && ch.role !== 'listener') || (staff && ch.type === 'channel');
  const canModerate = orgAdmin || ch.role === 'owner' || ch.role === 'moderator';
  const peerStatus = ch.peer ? online[ch.peer.id] ?? null : undefined;

  const subtitle = othersSpeaking
    ? `${othersSpeaking.displayName} กำลังพูด...`
    : ch.type === 'direct'
      ? peerStatus === 'available' ? 'ออนไลน์ · พร้อม' : peerStatus === 'busy' ? 'ออนไลน์ · ไม่ว่าง' : 'ออฟไลน์'
      : `${ch.online} ออนไลน์ · สมาชิก ${ch.members} คน`;

  const join = async () => {
    try {
      const r = await api.post<{ status: string }>(`/api/channels/${channelId}/join`);
      if (r.status === 'pending') store.toast('ส่งคำขอแล้ว รอผู้ดูแลกดรับ');
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-slate-950"
      onDragOver={(e) => { if (canPost && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = imagesFrom(e.dataTransfer.files);
        if (canPost && files.length) setPendingImages((p) => [...p, ...files].slice(0, MAX_CHAT_IMAGES));
      }}
      onPaste={(e) => {
        const files = imagesFrom(e.clipboardData.items);
        if (canPost && files.length) {
          e.preventDefault();
          setPendingImages((p) => [...p, ...files].slice(0, MAX_CHAT_IMAGES));
        }
      }}
    >
      {/* หัวช่อง */}
      <header className="flex items-center gap-2 px-2 sm:px-4 h-14 box-content pt-[env(safe-area-inset-top)] bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        {!embedded && (
          <button onClick={() => navigate('/')} className="lg:hidden p-2 -ml-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="กลับ">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
        )}
        <button onClick={() => setShowInfo(true)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
          {ch.type === 'direct' && ch.peer
            ? <Avatar clickable name={ch.peer.displayName} userId={ch.peer.id} size="sm" status={peerStatus} speaking={!!othersSpeaking} />
            : <Avatar name={ch.name} id={ch.id} src={ch.avatar} size="sm" speaking={!!othersSpeaking}>{ch.emergency && !ch.avatar ? <SirenIcon className="w-4 h-4" /> : undefined}</Avatar>}
          <span className="min-w-0">
            <span className="flex items-center gap-1 font-semibold truncate">
              {ch.name}
              {ch.visibility === 'private' && ch.type === 'channel' && <LockIcon className="w-3.5 h-3.5 text-slate-400" />}
            </span>
            <span className={`block text-xs truncate ${othersSpeaking ? 'text-red-600 font-medium' : 'text-slate-500'}`}>{subtitle}</span>
          </span>
        </button>
        <button onClick={() => store.toggleMute(channelId)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300" aria-label={muted ? 'เปิดเสียงช่องนี้' : 'ปิดเสียงช่องนี้'} title={muted ? 'เปิดเสียงช่องนี้' : 'ปิดเสียงช่องนี้'}>
          {muted ? <VolumeXIcon className="w-5 h-5" /> : <Volume2Icon className="w-5 h-5" />}
        </button>
        <button onClick={() => setShowInfo(true)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300" aria-label="ข้อมูลช่อง">
          <InfoIcon className="w-5 h-5" />
        </button>
      </header>

      {/* แถบคนกำลังพูด */}
      {othersSpeaking && (
        <div className={`flex items-center gap-3 px-4 py-2 text-white shrink-0 ${live?.sos ? 'bg-red-700' : 'bg-red-500'}`}>
          <Avatar clickable name={othersSpeaking.displayName} userId={othersSpeaking.id} size="sm" />
          <span className="flex-1 min-w-0 truncate font-medium">{live?.sos && '🚨 '}{othersSpeaking.displayName} กำลังพูด</span>
          <span className="flex items-end gap-0.5 h-5">
            {[0.6, 1, 0.8, 0.5, 0.9].map((k, i) => (
              <span key={i} className="w-1 rounded-full bg-white transition-[height] duration-100" style={{ height: `${Math.max(15, (live?.level || 0.3) * k * 100)}%` }} />
            ))}
          </span>
          {muted && <span className="text-xs bg-white/20 rounded px-1.5">ปิดเสียงอยู่</span>}
        </div>
      )}

      {/* ข้อความ */}
      <div ref={listRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-3 space-y-1.5">
        {thread?.loading && <p className="text-center text-xs text-slate-400 py-2">กำลังโหลด...</p>}
        {ch.historyFrom !== 0 && !thread?.hasMore && (
          <p className="mx-auto w-fit text-center text-[11px] text-slate-500 bg-slate-200/70 dark:bg-slate-800 rounded-full px-3 py-1">
            {ch.historyFrom > 0
              ? `แสดงเฉพาะข้อความตั้งแต่คุณเข้าร่วม (${new Date(ch.historyFrom).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })})`
              : 'ไม่แสดงข้อความย้อนหลัง — เข้าร่วมเพื่อรับข้อความต่อจากนี้'}
          </p>
        )}
        {!thread?.loading && items.length === 0 && (
          <div className="text-center text-slate-400 mt-12 space-y-1">
            <p className="text-4xl">📻</p>
            <p>ยังไม่มีข้อความในช่องนี้</p>
            <p className="text-sm">กดปุ่มไมค์ค้างไว้เพื่อพูด หรือพิมพ์ข้อความ</p>
          </div>
        )}
        {rows.map((r, i) =>
          'day' in r ? (
            <div key={`d${i}`} className="flex justify-center py-2">
              <span className="text-[11px] text-slate-500 bg-slate-200/70 dark:bg-slate-800 rounded-full px-3 py-0.5">{r.day}</span>
            </div>
          ) : 'group' in r ? (
            <div key={`g${r.group[0].id}`} className={r.showName ? 'pt-2' : ''}>
              <ImageGroupBubble
                items={r.group}
                mine={r.group[0].userId === me?.id}
                showName={r.showName && ch.type === 'channel'}
                onImage={setViewImage}
              />
            </div>
          ) : (
            <div key={r.m.id} className={r.showName ? 'pt-2' : ''}>
              <MessageBubble
                m={r.m}
                mine={r.m.userId === me?.id}
                showName={r.showName && ch.type === 'channel'}
                canDelete={r.m.userId === me?.id || canModerate}
                onImage={setViewImage}
              />
            </div>
          )
        )}
      </div>

      {/* ส่วนล่าง: ข้อความ + ปุ่มพูด */}
      <footer className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!isMember && ch.type === 'channel' && !staff ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm text-slate-500">คุณยังไม่ได้เข้าร่วมช่องนี้ — ฟังได้ระหว่างเปิดหน้านี้อยู่</p>
            {ch.joinMode && (
              <button onClick={join} className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-6 py-2">
                {ch.joinMode === 'request' ? 'ขอเข้าร่วม (รอผู้ดูแลกดรับ)' : 'เข้าร่วมช่อง'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row-reverse lg:items-center gap-3 max-w-4xl mx-auto">
            <div className="flex justify-center lg:px-4">
              <PttButton
                channelId={channelId}
                busyBy={othersSpeaking?.displayName ?? null}
                disabledReason={!canPost ? 'ฟังอย่างเดียว' : undefined}
                size={embedded ? 'md' : 'lg'}
              />
            </div>
            <div className="flex-1 min-w-0">
              <Composer channelId={channelId} disabled={!canPost} onImages={setPendingImages} onCamera={() => setCamera(true)} />
            </div>
          </div>
        )}
      </footer>

      {showInfo && <ChannelInfo channelId={channelId} onClose={() => setShowInfo(false)} />}
      {viewImage != null && (
        <ImageViewer
          ids={imageIds}
          current={viewImage}
          onChange={setViewImage}
          onClose={() => setViewImage(null)}
          canDelete={(id) => { const m = items.find((x) => x.id === id); return !!m && (m.userId === me?.id || canModerate); }}
        />
      )}
      {pendingImages.length > 0 && (
        <ImageSendSheet channelId={channelId} files={pendingImages} onChange={setPendingImages} onClose={() => setPendingImages([])} />
      )}
      {camera && (
        <CameraSheet onClose={() => setCamera(false)} onCapture={(f) => { setCamera(false); setPendingImages((p) => [...p, f].slice(0, MAX_CHAT_IMAGES)); }} />
      )}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-40 m-3 rounded-2xl border-4 border-dashed border-emerald-500 bg-emerald-500/10 flex items-center justify-center text-emerald-700 dark:text-emerald-300 text-lg font-semibold">
          วางรูปที่นี่เพื่อส่ง
        </div>
      )}
    </div>
  );
};

export default ChannelView;
