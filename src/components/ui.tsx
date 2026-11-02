// ui.tsx — ชิ้นส่วน UI ที่ใช้ร่วมกัน
import React, { useEffect, useState } from 'react';
import { RadioIcon, XIcon } from 'lucide-react';
import { Status } from '../lib/api';
import { store, useStore } from '../lib/store';

const AVATAR_COLORS = ['bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-orange-500'];

// ตัดตามตัวอักษรที่มองเห็น (ไม่ตัดสระ/วรรณยุกต์ไทยแยกจากพยัญชนะ) และข้ามสระหน้าของไทย
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new (Intl as any).Segmenter('th', { granularity: 'grapheme' }) : null;
const graphemes = (s: string): string[] => (segmenter ? [...segmenter.segment(s)].map((g: any) => g.segment) : [...s]);
const firstGlyph = (word: string) => graphemes(word).find((g) => !/^[เแโใไ]$/.test(g)) || word.slice(0, 1);

export function initials(name: string) {
  // ข้ามคำที่ไม่มีตัวอักษร เช่น "(แอดมิน)" → ใช้เฉพาะตัวอักษร/ตัวเลข
  const parts = name.trim().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}\p{M}]/gu, '')).filter(Boolean);
  if (!parts.length) return '?';
  if (/[฀-๿]/.test(parts[0])) return parts.length > 1 ? firstGlyph(parts[0]) + firstGlyph(parts[1]) : firstGlyph(parts[0]);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

// รูปวงกลม: ใช้รูปที่อัปโหลดไว้ (src หรือรูปของ userId จากสมุดรายชื่อ) ถ้าไม่มีจะแสดงตัวย่อชื่อ
export const Avatar: React.FC<{
  name: string;
  id?: number;      // ใช้เลือกสีพื้น (เช่น id ของช่อง)
  userId?: number | null; // ถ้าเป็นผู้ใช้ จะดึงรูปโปรไฟล์อัตโนมัติ
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: Status | null; // null = ออฟไลน์, undefined = ไม่แสดง
  speaking?: boolean;
  className?: string;
  children?: React.ReactNode;
  clickable?: boolean; // กดแล้วเปิดโปรไฟล์ของ userId
}> = ({ name, id, userId, src, size = 'md', status, speaking, className = '', children, clickable }) => {
  const userAvatar = useStore((s) => (userId != null ? s.users[userId]?.avatar : null));
  const url = src !== undefined && src !== null ? src : userAvatar;
  const [broken, setBroken] = useState<string | null>(null);
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : size === 'xl' ? 'w-24 h-24 text-3xl' : 'w-11 h-11 text-sm';
  const color = AVATAR_COLORS[Math.abs(id ?? userId ?? 0) % AVATAR_COLORS.length];
  const showImg = url && broken !== url && !children;
  return (
    <span
      className={`relative shrink-0 inline-flex ${clickable && userId ? 'cursor-pointer hover:opacity-90' : ''} ${className}`}
      {...(clickable && userId ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `ดูโปรไฟล์ ${name}`,
        onClick: (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); store.openProfile(userId); },
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') store.openProfile(userId); },
      } : {})}
    >
      <span className={`${dim} ${showImg ? 'bg-slate-200 dark:bg-slate-700' : color} rounded-full overflow-hidden text-white font-semibold flex items-center justify-center ${speaking ? 'ring-4 ring-red-400 animate-pulse' : ''}`}>
        {showImg ? <img src={url} alt="" className="w-full h-full object-cover" onError={() => setBroken(url)} loading="lazy" /> : children || initials(name)}
      </span>
      {status !== undefined && <StatusDot status={status} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-slate-900" />}
    </span>
  );
};

export const StatusDot: React.FC<{ status: Status | null; className?: string }> = ({ status, className = '' }) => (
  <span
    className={`inline-block w-3 h-3 rounded-full ${status === 'available' ? 'bg-emerald-500' : status === 'busy' ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'} ${className}`}
    title={status === 'available' ? 'พร้อม' : status === 'busy' ? 'ไม่ว่าง' : 'ออฟไลน์'}
  />
);

export const Badge: React.FC<{ children: React.ReactNode; tone?: 'red' | 'green' | 'slate' | 'amber' | 'sky' }> = ({ children, tone = 'slate' }) => {
  const tones = {
    red: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  };
  return <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${tones[tone]}`}>{children}</span>;
};

export const UnreadBadge: React.FC<{ n: number }> = ({ n }) =>
  n > 0 ? (
    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center">
      {n > 99 ? '99+' : n}
    </span>
  ) : null;

// หน้าต่างลอย: บนมือถือเป็น bottom sheet, บนจอใหญ่เป็น dialog กลางจอ
export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[90dvh] flex flex-col bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-800">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="ปิด">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
};

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({
  checked, onChange, label, hint, disabled,
}) => (
  <label className={`flex items-start justify-between gap-4 py-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
    <span>
      <span className="block text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</span>}
    </span>
    <span className="relative shrink-0 mt-0.5">
      <input type="checkbox" className="sr-only peer" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="block w-11 h-6 rounded-full bg-slate-300 dark:bg-slate-600 peer-checked:bg-emerald-500 transition-colors" />
      <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </span>
  </label>
);

export const inputCls =
  'block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2';
export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium px-4 py-2';
export const btnDanger =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2';
export const card = 'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800';

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export function shortTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export const fmtDuration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const PageHeader: React.FC<{ title: string; children?: React.ReactNode; left?: React.ReactNode }> = ({ title, children, left }) => (
  <header className="sticky top-0 z-10 flex items-center gap-2 h-14 px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 pt-[env(safe-area-inset-top)] box-content">
    {left}
    <h1 className="text-lg font-bold flex-1 truncate">{title}</h1>
    {children}
  </header>
);

// โลโก้แอป: รูปที่ Super admin อัปโหลด หรือไอคอนวิทยุพื้นสีหลัก
export const AppLogo: React.FC<{ className?: string }> = ({ className = 'w-10 h-10' }) => {
  const logo = useStore((s) => s.config.logo);
  return logo
    ? <img src={logo} alt="" className={`${className} rounded-xl object-cover`} />
    : <span className={`${className} rounded-xl bg-emerald-500 text-white flex items-center justify-center`}><RadioIcon className="w-3/5 h-3/5" /></span>;
};

