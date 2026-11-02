// รายชื่อ: เพื่อน / คนในองค์กร / ค้นหาทุกคน + QR ของฉัน + สแกนเพิ่มเพื่อน
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircleIcon, QrCodeIcon, ScanLineIcon, SearchIcon, UserMinusIcon, UserPlusIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, DirectoryUser } from '../lib/api';
import { store, useStore } from '../lib/store';
import { unlockAudio } from '../lib/audio';
import { QrScanner, QrShareSheet } from './Qr';
import { Avatar, Badge, inputCls, timeAgo } from './ui';

type Tab = 'friends' | 'org' | 'search';

const ContactList: React.FC = () => {
  const { currentUser: me } = useAuth();
  const online = useStore((s) => s.online);
  const friendsVersion = useStore((s) => s.friendsVersion);
  const inOrg = !!me?.orgId;
  const [tab, setTab] = useState<Tab>('friends');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [q, setQ] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [scan, setScan] = useState(false);
  const navigate = useNavigate();

  const load = () => api.get<{ users: DirectoryUser[] }>('/api/users').then(({ users }) => setUsers(users)).catch(() => {});
  useEffect(() => { load(); }, [Object.keys(online).length, friendsVersion]);

  // ค้นหาทุกคนที่คุยได้ (ตามนโยบายองค์กร)
  useEffect(() => {
    if (tab !== 'search' || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get<{ users: DirectoryUser[] }>(`/api/users?q=${encodeURIComponent(q.trim())}`).then(({ users }) => setResults(users)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q, tab]);

  const list = useMemo(() => {
    const ql = q.toLowerCase();
    const base = tab === 'search' ? results : users.filter((u) => (tab === 'friends' ? u.isFriend : u.sameOrg));
    return base
      .filter((u) => u.id !== me?.id && (tab === 'search' || !q || (u.displayName + u.username).toLowerCase().includes(ql)))
      .sort((a, b) => Number(!!online[b.id]) - Number(!!online[a.id]) || a.displayName.localeCompare(b.displayName));
  }, [users, results, q, tab, online, me?.id]);

  const openDirect = async (u: DirectoryUser) => {
    unlockAudio();
    try {
      const { id } = await api.post<{ id: number }>(`/api/direct/${u.id}`);
      navigate(`/c/${id}`);
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  const toggleFriend = async (u: DirectoryUser) => {
    try {
      if (u.isFriend) {
        if (!confirm(`ลบ ${u.displayName} ออกจากเพื่อน?`)) return;
        await api.del(`/api/friends/${u.id}`);
      } else {
        await api.post(`/api/friends/${u.id}`);
        store.toast('เพิ่มเพื่อนแล้ว');
      }
      await load();
      setResults((r) => r.map((x) => (x.id === u.id ? { ...x, isFriend: !u.isFriend } : x)));
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  const tabs: [Tab, string][] = [['friends', `เพื่อน (${users.filter((u) => u.isFriend).length})`], ...(inOrg ? [['org', me!.orgName || 'องค์กร'] as [Tab, string]] : []), ['search', 'ค้นหา']];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 space-y-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold flex-1">รายชื่อ</h1>
          <button onClick={() => setScan(true)} className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="สแกน QR เพิ่มเพื่อน" title="สแกน QR เพิ่มเพื่อน">
            <ScanLineIcon className="w-5 h-5" />
          </button>
          <button onClick={() => setShowQr(true)} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full bg-emerald-600 text-white" title="QR ของฉัน">
            <QrCodeIcon className="w-4 h-4" /> QR ของฉัน
          </button>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 py-1.5 rounded-md font-medium truncate px-1 ${tab === k ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
        <label className="relative block">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'search' ? 'พิมพ์ชื่อหรือ username (อย่างน้อย 2 ตัว)' : 'กรองรายชื่อ'} className={`${inputCls} pl-9`} />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {list.length === 0 && (
          <div className="text-center text-slate-400 py-12 text-sm space-y-2 px-6">
            {tab === 'friends' ? (
              <>
                <p>ยังไม่มีเพื่อน</p>
                <p>ให้เพื่อนสแกน "QR ของฉัน" หรือกดปุ่มสแกนเพื่อเพิ่มเพื่อน</p>
              </>
            ) : tab === 'search' ? <p>{q.trim().length < 2 ? 'ค้นหาคนที่จะคุยด้วย' : 'ไม่พบผู้ใช้'}</p> : <p>ยังไม่มีสมาชิกอื่นในองค์กร</p>}
          </div>
        )}
        {list.map((u) => {
          const st = online[u.id] ?? null;
          return (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <button onClick={() => openDirect(u)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                <Avatar clickable name={u.displayName} userId={u.id} src={u.avatar} status={st} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="font-semibold truncate">{u.displayName}</span>
                    {u.orgRole === 'admin' && u.sameOrg && <Badge tone="sky">แอดมิน</Badge>}
                    {u.orgRole === 'dispatcher' && u.sameOrg && <Badge tone="sky">ศูนย์สั่งการ</Badge>}
                    {u.orgName && !u.sameOrg && <Badge>{u.orgName}</Badge>}
                  </span>
                  <span className="block text-sm text-slate-500 truncate">
                    {st === 'available' ? 'พร้อมคุย' : st === 'busy' ? 'ไม่ว่าง' : u.lastSeen ? `ออนไลน์ล่าสุด ${timeAgo(u.lastSeen)}` : 'ออฟไลน์'}
                    <span className="text-slate-400"> · @{u.username}</span>
                  </span>
                </span>
              </button>
              <button onClick={() => toggleFriend(u)} className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={u.isFriend ? 'ลบเพื่อน' : 'เพิ่มเพื่อน'} title={u.isFriend ? 'ลบเพื่อน' : 'เพิ่มเพื่อน'}>
                {u.isFriend ? <UserMinusIcon className="w-5 h-5" /> : <UserPlusIcon className="w-5 h-5" />}
              </button>
              <button onClick={() => openDirect(u)} className="p-2 rounded-full text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10" aria-label="คุย">
                <MessageCircleIcon className="w-5 h-5" />
              </button>
            </div>
          );
        })}
      </div>
      {showQr && me && (
        <QrShareSheet
          title="QR ของฉัน"
          code={me.friendCode}
          avatar={{ name: me.displayName, userId: me.id, src: me.avatar }}
          subtitle={`@${me.username}`}
          hint="ให้เพื่อนสแกนเพื่อเพิ่มเป็นเพื่อนและเริ่มคุย"
          onClose={() => setShowQr(false)}
        />
      )}
      {scan && <QrScanner onClose={() => setScan(false)} onCode={(code) => { setScan(false); navigate(`/i/${code}`); }} />}
    </div>
  );
};

export default ContactList;
