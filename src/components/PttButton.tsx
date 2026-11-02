import React, { useEffect, useState } from 'react';
import { MicIcon, MicOffIcon } from 'lucide-react';
import { store, useStore } from '../lib/store';

interface Props {
  channelId: number;
  busyBy: string | null;   // ชื่อคนที่กำลังพูดในช่องนี้
  disabledReason?: string; // เช่น ฟังอย่างเดียว / ยังไม่เข้าร่วม
  size?: 'md' | 'lg';
}

const PttButton: React.FC<Props> = ({ channelId, busyBy, disabledReason, size = 'lg' }) => {
  const ptt = useStore((s) => s.ptt);
  const mode = useStore((s) => s.settings.pttMode);
  const connected = useStore((s) => s.connected);
  const [now, setNow] = useState(Date.now());

  const mine = ptt.channelId === channelId;
  const phase = mine ? ptt.phase : 'idle';
  const otherChannelTalking = ptt.phase !== 'idle' && !mine;
  const disabled = !connected || !!disabledReason || otherChannelTalking;

  useEffect(() => {
    if (phase !== 'talking') return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  // กด Space ค้างเพื่อพูด (ไม่ทำงานตอนพิมพ์)
  useEffect(() => {
    if (disabled) return;
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || typing(e)) return;
      e.preventDefault();
      store.pressTalk(channelId);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e)) return;
      e.preventDefault();
      store.releaseTalk();
    };
    const blur = () => store.releaseTalk();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [channelId, disabled]);

  const busy = !!busyBy && phase === 'idle';
  const remaining = Math.max(0, Math.ceil((ptt.maxMs - (now - ptt.startedAt)) / 1000));
  const dim = size === 'lg' ? 'w-28 h-28 sm:w-32 sm:h-32' : 'w-20 h-20';
  const icon = size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  const color =
    phase === 'talking' ? 'bg-red-500 ring-red-300/70 scale-105'
    : phase === 'requesting' ? 'bg-amber-500 ring-amber-300/60'
    : busy || disabled ? 'bg-slate-400 dark:bg-slate-600 ring-slate-300/40'
    : 'bg-emerald-500 hover:bg-emerald-600 ring-emerald-300/50';

  const label =
    disabledReason ? disabledReason
    : otherChannelTalking ? 'กำลังพูดอยู่ในช่องอื่น'
    : phase === 'talking' ? `กำลังส่งเสียง · เหลือ ${remaining} วิ${mode === 'toggle' ? ' · แตะเพื่อหยุด' : ''}`
    : phase === 'requesting' ? 'กำลังขอช่องพูด...'
    : busy ? `${busyBy} กำลังพูด`
    : mode === 'toggle' ? 'แตะเพื่อพูด แตะอีกครั้งเพื่อหยุด' : 'กดค้างเพื่อพูด';

  return (
    <div className="flex flex-col items-center select-none">
      <button
        type="button"
        aria-label={label}
        aria-pressed={phase !== 'idle'}
        disabled={disabled}
        className={`relative ${dim} rounded-full text-white shadow-xl ring-8 transition-all duration-150 touch-none flex items-center justify-center disabled:cursor-not-allowed ${color}`}
        onPointerDown={(e) => {
          if (mode === 'hold') e.currentTarget.setPointerCapture(e.pointerId);
          store.pressTalk(channelId);
        }}
        onPointerUp={() => store.releaseTalk()}
        onPointerCancel={() => store.releaseTalk()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {phase === 'talking' && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />}
        {busy || disabled ? <MicOffIcon className={icon} /> : <MicIcon className={`${icon} relative`} />}
      </button>
      <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300 text-center min-h-[1.25rem]">{label}</p>
      {phase === 'talking' && ptt.interim && (
        <p className="mt-1 text-xs text-slate-500 max-w-xs text-center line-clamp-2">{ptt.interim}</p>
      )}
      <p className="hidden lg:block mt-1 text-[11px] text-slate-400">คีย์ลัด: กด Space ค้าง</p>
    </div>
  );
};

export default PttButton;
