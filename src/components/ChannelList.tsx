import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2Icon, GlobeIcon, LockIcon, MessageCircleIcon, PlusIcon, ScanLineIcon, SearchIcon, SirenIcon, UserCheckIcon, VolumeXIcon } from 'lucide-react';
import { api, Channel, isSuper } from '../lib/api';
import { previewText, store, useStore } from '../lib/store';
import { unlockAudio } from '../lib/audio';
import { Avatar, btnPrimary, inputCls, Sheet, shortTime, UnreadBadge } from './ui';
import SosButton from './SosButton';
import StatusSwitch from './StatusSwitch';
import { QrScanner } from './Qr';

const ChannelRow: React.FC<{ ch: Channel; active: boolean; onOpen: () => void }> = ({ ch, active, onOpen }) => {
  const live = useStore((s) => s.live[ch.id]);
  const online = useStore((s) => s.online);
  const muted = useStore((s) => s.settings.mutedChannels.includes(ch.id));
  const speaking = live || ch.speaker;
  return (
    <button
      onClick={onOpen}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${active ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
    >
      {ch.type === 'direct' && ch.peer ? (
        <Avatar clickable name={ch.peer.displayName} userId={ch.peer.id} status={online[ch.peer.id] ?? null} speaking={!!speaking} />
      ) : (
        <Avatar name={ch.name} id={ch.id} src={ch.avatar} speaking={!!speaking}>
          {ch.emergency && !ch.avatar ? <SirenIcon className="w-5 h-5" /> : undefined}
        </Avatar>
      )}
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="font-semibold truncate">{ch.name}</span>
          {ch.type === 'channel' && ch.visibility === 'private' && <LockIcon className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
          {muted && <VolumeXIcon className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
          {ch.requests > 0 && <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 rounded-full bg-amber-100 text-amber-700"><UserCheckIcon className="w-3 h-3" />{ch.requests}</span>}
          <span className="ml-auto text-xs text-slate-400 shrink-0">{ch.lastMessage ? shortTime(ch.lastMessage.createdAt) : ''}</span>
        </span>
        <span className="flex items-center gap-2 mt-0.5">
          <span className={`text-sm truncate flex-1 ${speaking ? 'text-red-600 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
            {speaking
              ? `🎙️ ${(live?.user || ch.speaker)!.displayName} กำลังพูด...`
              : ch.lastMessage
                ? `${ch.type === 'channel' ? ch.lastMessage.username + ': ' : ''}${previewText(ch.lastMessage)}`
                : ch.type === 'channel' ? `${ch.online}/${ch.members} ออนไลน์` : 'เริ่มคุยกันเลย'}
          </span>
          <UnreadBadge n={ch.unread} />
        </span>
      </span>
    </button>
  );
};

const ChannelList: React.FC = () => {
  const channels = useStore((s) => s.channels);
  const navigate = useNavigate();
  const { channelId } = useParams();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const me = useStore((s) => s.me);
  const [scan, setScan] = useState(false);

  // แบ่งกลุ่ม: องค์กร (แยกตามองค์กรสำหรับ superadmin) → แชทส่วนตัว → กลุ่มสาธารณะ → กลุ่มสาธารณะที่ยังไม่เข้าร่วม
  const sections = useMemo(() => {
    const match = (c: Channel) => !q || c.name.toLowerCase().includes(q.toLowerCase());
    const byActivity = (a: Channel, b: Channel) =>
      Number(b.emergency) - Number(a.emergency) || Number(b.isDefault) - Number(a.isDefault) ||
      (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0) || a.name.localeCompare(b.name);
    const list = channels.filter(match);
    const out: { key: string; title: string; icon: React.FC<{ className?: string }>; items: Channel[] }[] = [];
    const orgNames = new Map<number, string>();
    list.forEach((c) => c.orgId && orgNames.set(c.orgId, c.orgName || 'องค์กร'));
    // องค์กรของฉันขึ้นก่อน
    const orgIds = [...orgNames.keys()].sort((a, b) => Number(b === me?.org?.id) - Number(a === me?.org?.id) || orgNames.get(a)!.localeCompare(orgNames.get(b)!));
    for (const id of orgIds) {
      const items = list.filter((c) => c.orgId === id && (c.role || c.joinMode || isSuper(me))).sort(byActivity);
      if (items.length) out.push({ key: `org${id}`, title: orgNames.get(id)!, icon: Building2Icon, items });
    }
    const dms = list.filter((c) => c.type === 'direct').sort(byActivity);
    if (dms.length) out.push({ key: 'dm', title: 'แชทส่วนตัว', icon: MessageCircleIcon, items: dms });
    const pub = list.filter((c) => !c.orgId && c.type === 'channel' && c.role).sort(byActivity);
    if (pub.length) out.push({ key: 'pub', title: 'กลุ่มสาธารณะ', icon: GlobeIcon, items: pub });
    const discover = list.filter((c) => !c.orgId && c.type === 'channel' && !c.role).sort(byActivity);
    if (discover.length) out.push({ key: 'discover', title: 'กลุ่มสาธารณะที่ยังไม่ได้เข้าร่วม', icon: GlobeIcon, items: discover });
    return out;
  }, [channels, q, me]);

  const open = (id: number) => {
    unlockAudio();
    navigate(`/c/${id}`);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 space-y-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold flex-1">ช่องสนทนา</h1>
          <button onClick={() => setScan(true)} className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="สแกน QR" title="สแกน QR เพื่อเพิ่มเพื่อน/เข้ากลุ่ม">
            <ScanLineIcon className="w-5 h-5" />
          </button>
          <span className="lg:hidden"><SosButton compact /></span>
          <button onClick={() => setCreating(true)} className="p-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700" aria-label="สร้างช่อง">
            <PlusIcon className="w-5 h-5" />
          </button>
        </div>
        <StatusSwitch />
        <OrgBanner />
        <label className="relative block">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาช่อง" className={`${inputCls} pl-9`} />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sections.length === 0 && <p className="text-center text-slate-400 py-12 text-sm">ไม่พบช่อง</p>}
        {sections.map((sec) => (
          <section key={sec.key}>
            <div className="sticky top-0 z-[1] px-4 pt-3 pb-1 text-xs font-semibold text-slate-500 flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
              <sec.icon className="w-3.5 h-3.5" /> {sec.title}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sec.items.map((c) => <ChannelRow key={c.id} ch={c} active={String(c.id) === channelId} onOpen={() => open(c.id)} />)}
            </div>
          </section>
        ))}
      </div>
      {creating && <CreateChannel onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); open(id); }} />}
      {scan && <QrScanner onClose={() => setScan(false)} onCode={(code) => { setScan(false); navigate(`/i/${code}`); }} />}
    </div>
  );
};

// แบนเนอร์สถานะองค์กร: รออนุมัติ / องค์กรยังไม่เปิด / ถูกระงับ
const OrgBanner: React.FC = () => {
  const me = useStore((s) => s.me);
  const navigate = useNavigate();
  const org = me?.org;
  if (!org) return null;
  const msg = org.status === 'pending' ? `กำลังรอ Super admin อนุมัติองค์กร "${org.name}"`
    : org.status === 'suspended' ? `องค์กร "${org.name}" ถูกระงับชั่วคราว`
    : org.status === 'rejected' ? `องค์กร "${org.name}" ไม่ได้รับอนุมัติ`
    : org.memberStatus === 'pending' ? `รอแอดมิน "${org.name}" กดรับเข้าองค์กร` : null;
  if (!msg) return null;
  return (
    <button onClick={() => navigate('/settings')} className="w-full text-left text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 flex items-center gap-2">
      <Building2Icon className="w-4 h-4 shrink-0" /> {msg}
    </button>
  );
};

type Scope = 'org' | 'public';
const CreateChannel: React.FC<{ onClose: () => void; onCreated: (id: number) => void }> = ({ onClose, onCreated }) => {
  const me = useStore((s) => s.me);
  const inOrg = !!me?.org && me.org.status === 'active' && me.org.memberStatus === 'active';
  const canPublic = !!me?.external;
  const [scope, setScope] = useState<Scope>(inOrg ? 'org' : 'public');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await api.post<{ id: number }>('/api/channels', { name, description, scope, visibility: isPrivate ? 'private' : scope === 'org' ? 'org' : 'public' });
      onCreated(id);
    } catch (err: any) {
      store.toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const opt = (active: boolean) => `p-3 rounded-lg border text-left ${active ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-300 dark:border-slate-700'}`;
  return (
    <Sheet title="สร้างช่องใหม่" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {inOrg && canPublic && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setScope('org')} className={opt(scope === 'org')}>
              <span className="flex items-center gap-1.5 font-medium text-sm"><Building2Icon className="w-4 h-4" /> ในองค์กร</span>
              <span className="block text-xs text-slate-500 mt-1 truncate">{me!.org!.name}</span>
            </button>
            <button type="button" onClick={() => setScope('public')} className={opt(scope === 'public')}>
              <span className="flex items-center gap-1.5 font-medium text-sm"><GlobeIcon className="w-4 h-4" /> สาธารณะ</span>
              <span className="block text-xs text-slate-500 mt-1">คนทั่วไปเข้าร่วมได้</span>
            </button>
          </div>
        )}
        <label className="block text-sm font-medium">ชื่อช่อง
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus className={`${inputCls} mt-1`} />
        </label>
        <label className="block text-sm font-medium">คำอธิบาย
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className={`${inputCls} mt-1`} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setIsPrivate(false)} className={opt(!isPrivate)}>
            <span className="flex items-center gap-1.5 font-medium text-sm"><GlobeIcon className="w-4 h-4" /> เปิด</span>
            <span className="block text-xs text-slate-500 mt-1">{scope === 'org' ? 'ทุกคนในองค์กรเข้าได้เลย' : 'ทุกคนค้นหาและเข้าร่วมได้'}</span>
          </button>
          <button type="button" onClick={() => setIsPrivate(true)} className={opt(isPrivate)}>
            <span className="flex items-center gap-1.5 font-medium text-sm"><LockIcon className="w-4 h-4" /> ส่วนตัว</span>
            <span className="block text-xs text-slate-500 mt-1">{scope === 'org' ? 'สแกน QR แล้วรอผู้ดูแลกดรับ' : 'เข้าได้ด้วย QR/ลิงก์เชิญเท่านั้น'}</span>
          </button>
        </div>
        <button disabled={busy} className={`${btnPrimary} w-full`}>สร้างช่อง</button>
      </form>
    </Sheet>
  );
};

export default ChannelList;
