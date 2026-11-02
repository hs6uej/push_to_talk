// Message Vault — ค้นหา ฟัง และส่งออกการสื่อสารทั้งหมด
import React, { useEffect, useState } from 'react';
import { DownloadIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { api, DirectoryUser, Message } from '../lib/api';
import { previewText, store, useStore } from '../lib/store';
import MessageBubble from '../components/MessageBubble';
import { btnGhost, btnPrimary, card, inputCls, PageHeader } from '../components/ui';

const KINDS = [
  ['', 'ทุกประเภท'], ['audio', 'เสียง'], ['text', 'ข้อความ'], ['image', 'รูปภาพ'], ['location', 'ตำแหน่ง'], ['sos', 'SOS'],
] as const;
const PAGE = 30;

const Vault: React.FC = () => {
  const channels = useStore((s) => s.channels);
  const me = useStore((s) => s.me);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [f, setF] = useState({ q: '', channelId: '', userId: '', kind: '', from: '', to: '' });
  const [rows, setRows] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.get<{ users: DirectoryUser[] }>('/api/users').then(({ users }) => setUsers(users)).catch(() => {});
  }, []);

  const params = (extra: Record<string, string | number> = {}) => {
    const p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    if (f.channelId) p.set('channelId', f.channelId);
    if (f.userId) p.set('userId', f.userId);
    if (f.kind) p.set('kind', f.kind);
    if (f.from) p.set('from', String(new Date(f.from).getTime()));
    if (f.to) p.set('to', String(new Date(f.to).getTime() + 86399999));
    Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)));
    return p.toString();
  };

  const search = async (off = 0) => {
    setLoading(true);
    try {
      const r = await api.get<{ total: number; messages: Message[] }>(`/api/vault?${params({ limit: PAGE, offset: off })}`);
      setRows(r.messages);
      setTotal(r.total);
      setOffset(off);
      setSelected(new Set());
    } catch (e: any) {
      store.toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { search(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteSelected = async () => {
    if (!confirm(`ลบ ${selected.size} ข้อความที่เลือกถาวร?`)) return;
    try {
      const r = await api.post<{ deleted: number; skipped: number }>('/api/messages/delete', { ids: [...selected] });
      store.toast(`ลบแล้ว ${r.deleted} ข้อความ${r.skipped ? ` (ข้าม ${r.skipped} ที่ไม่มีสิทธิ์)` : ''}`);
      search(offset);
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  // superadmin: ลบทุกข้อความที่ตรงกับตัวกรอง
  const purgeAll = async () => {
    const word = prompt(`จะลบ ${total.toLocaleString()} ข้อความที่ตรงกับตัวกรองถาวร\nพิมพ์คำว่า ลบ เพื่อยืนยัน`);
    if (word?.trim() !== 'ลบ') return;
    try {
      const body = Object.fromEntries(new URLSearchParams(params()).entries());
      const r = await api.post<{ deleted: number }>('/api/vault/purge', { ...body, confirm: true });
      store.toast(`ลบแล้ว ${r.deleted} ข้อความ`);
      search(0);
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  const exportCsv = () =>
    api.download(`/api/vault/export.csv?${params()}`, `ptt-messages-${new Date().toISOString().slice(0, 10)}.csv`)
      .catch((e) => store.toast(e.message, 'error'));

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <PageHeader title="คลังข้อความ (Message Vault)">
        <button onClick={exportCsv} className={btnGhost}><DownloadIcon className="w-4 h-4" /> <span className="hidden sm:inline">ส่งออก CSV</span></button>
      </PageHeader>
      <div className="p-4 max-w-5xl mx-auto space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); search(0); }} className={`${card} p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3`}>
          <label className="relative sm:col-span-2 lg:col-span-3">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={f.q} onChange={set('q')} placeholder="ค้นหาข้อความ คำถอดเสียง หรือชื่อผู้ส่ง" className={`${inputCls} pl-9`} />
          </label>
          <select value={f.channelId} onChange={set('channelId')} className={inputCls}>
            <option value="">ทุกช่อง</option>
            {channels.filter((c) => c.type === 'channel').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={f.userId} onChange={set('userId')} className={inputCls}>
            <option value="">ทุกคน</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
          </select>
          <select value={f.kind} onChange={set('kind')} className={inputCls}>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="text-xs text-slate-500">ตั้งแต่<input type="date" value={f.from} onChange={set('from')} className={`${inputCls} mt-1`} /></label>
          <label className="text-xs text-slate-500">ถึง<input type="date" value={f.to} onChange={set('to')} className={`${inputCls} mt-1`} /></label>
          <div className="flex items-end"><button className={`${btnPrimary} w-full`} disabled={loading}>ค้นหา</button></div>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-slate-500 flex-1">พบ {total.toLocaleString()} รายการ{selected.size > 0 && ` · เลือก ${selected.size}`}</p>
          {rows.length > 0 && (
            <button
              onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((m) => m.id)))}
              className="text-xs px-2.5 py-1.5 rounded-lg border dark:border-slate-700"
            >
              {selected.size === rows.length ? 'ยกเลิกเลือก' : 'เลือกทั้งหน้า'}
            </button>
          )}
          {selected.size > 0 && (
            <button onClick={deleteSelected} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-600 text-white">
              <Trash2Icon className="w-3.5 h-3.5" /> ลบที่เลือก ({selected.size})
            </button>
          )}
          {me?.role === 'superadmin' && total > 0 && (
            <button onClick={purgeAll} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-red-300 text-red-600">
              <Trash2Icon className="w-3.5 h-3.5" /> ลบทั้งหมดตามตัวกรอง ({total.toLocaleString()})
            </button>
          )}
        </div>
        <div className="space-y-3">
          {rows.map((m) => (
            <div key={m.id} className={`${card} p-3 ${selected.has(m.id) ? 'ring-2 ring-red-400' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 mb-2">
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => setSelected((s) => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })}
                  className="w-4 h-4 accent-red-600"
                  aria-label="เลือกข้อความ"
                />
                <span className="font-medium text-slate-700 dark:text-slate-200">{m.channelName}</span>
                <span>·</span>
                <span>{new Date(m.createdAt).toLocaleString('th-TH')}</span>
                <span className="sr-only">{previewText(m)}</span>
              </div>
              <MessageBubble m={m} mine={m.userId === me?.id} showName canDelete={me?.role === 'superadmin'} onImage={() => {}} />
            </div>
          ))}
        </div>
        {total > PAGE && (
          <div className="flex items-center justify-center gap-3 pb-6">
            <button disabled={offset === 0 || loading} onClick={() => search(Math.max(0, offset - PAGE))} className={btnGhost}>ก่อนหน้า</button>
            <span className="text-sm text-slate-500">{offset + 1}–{Math.min(offset + PAGE, total)}</span>
            <button disabled={offset + PAGE >= total || loading} onClick={() => search(offset + PAGE)} className={btnGhost}>ถัดไป</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Vault;
