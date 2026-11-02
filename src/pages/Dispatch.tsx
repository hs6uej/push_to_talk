// Dispatch Hub — เฝ้าทุกช่องพร้อมกัน, คิวแจ้งเหตุ SOS, แผนที่ และกิจกรรมล่าสุด
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2Icon, MapPinIcon, PhoneCallIcon, SirenIcon, VolumeXIcon } from 'lucide-react';
import { api, Channel } from '../lib/api';
import { previewText, store, useStore } from '../lib/store';
import ChannelView from '../components/ChannelView';
import TeamMap from '../components/TeamMap';
import { Badge, shortTime, timeAgo, UnreadBadge } from '../components/ui';

const ChannelTile: React.FC<{ ch: Channel; selected: boolean; onClick: () => void }> = ({ ch, selected, onClick }) => {
  const live = useStore((s) => s.live[ch.id]);
  const muted = useStore((s) => s.settings.mutedChannels.includes(ch.id));
  const speaker = live?.user || ch.speaker;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3 transition ${speaker ? 'border-red-500 bg-red-50 dark:bg-red-500/10' : selected ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'}`}
    >
      <span className="flex items-center gap-1.5">
        {ch.emergency && <SirenIcon className="w-4 h-4 text-red-600" />}
        <span className="font-semibold truncate flex-1">{ch.name}</span>
        {muted && <VolumeXIcon className="w-3.5 h-3.5 text-slate-400" />}
        <UnreadBadge n={ch.unread} />
      </span>
      <span className={`block text-xs mt-1 truncate ${speaker ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
        {speaker ? `🎙️ ${speaker.displayName} กำลังพูด` : ch.lastMessage ? `${ch.lastMessage.username}: ${previewText(ch.lastMessage)}` : 'ยังไม่มีกิจกรรม'}
      </span>
      <span className="block text-[11px] text-slate-400 mt-1">{ch.online}/{ch.members} ออนไลน์{ch.lastMessage && ` · ${shortTime(ch.lastMessage.createdAt)}`}</span>
    </button>
  );
};

const Dispatch: React.FC = () => {
  const channels = useStore((s) => s.channels);
  const alerts = useStore((s) => s.alerts);
  const activity = useStore((s) => s.activity);
  const locationsMap = useStore((s) => s.locations);
  const online = useStore((s) => s.online);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<'channels' | 'alerts' | 'activity'>('channels');
  const [focusUser, setFocusUser] = useState<number | null>(null);

  useEffect(() => {
    store.setMonitorAll(true);
    store.loadAlerts();
    return () => store.setMonitorAll(false);
  }, []);

  const me = useStore((s) => s.me);
  // superadmin เฝ้าทุกช่อง, เจ้าหน้าที่องค์กรเฝ้าเฉพาะช่องขององค์กร
  const groups = useMemo(() => channels.filter((c) => c.type === 'channel' && (me?.staffScope === 'all' || c.orgId === me?.staffScope)).sort((a, b) => Number(b.emergency) - Number(a.emergency) || a.name.localeCompare(b.name)), [channels, me?.staffScope]);
  const openAlerts = useMemo(() => alerts.filter((a) => !a.resolvedAt), [alerts]);
  const locations = useMemo(() => Object.values(locationsMap), [locationsMap]);
  const chName = (id: number) => channels.find((c) => c.id === id)?.name || `#${id}`;
  const onSelectUser = useCallback((id: number) => setFocusUser(id), []);

  const act = async (id: number, action: 'ack' | 'resolve') => {
    try {
      await store.alertAction(id, action);
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  const callBack = async (userId: number | null) => {
    if (!userId) return;
    const { id } = await api.post<{ id: number }>(`/api/direct/${userId}`);
    setSelected(id);
  };

  const alertsPanel = (
    <div className="space-y-2">
      {openAlerts.length === 0 && <p className="text-sm text-slate-400 flex items-center gap-1"><CheckCircle2Icon className="w-4 h-4" /> ไม่มีเหตุค้าง</p>}
      {openAlerts.map((a) => (
        <div key={a.id} className={`rounded-xl border-2 p-3 space-y-2 ${a.ackedAt ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10' : 'border-red-500 bg-red-50 dark:bg-red-500/10'}`}>
          <div className="flex items-center gap-2">
            <SirenIcon className="w-5 h-5 text-red-600" />
            <span className="font-bold flex-1 truncate">{a.username}</span>
            <span className="text-xs text-slate-500">{timeAgo(a.createdAt)}</span>
          </div>
          {a.note && <p className="text-sm">{a.note}</p>}
          <p className="text-xs text-slate-500">
            {a.ackedAt ? <Badge tone="amber">รับเรื่องโดย {a.ackedBy}</Badge> : <Badge tone="red">รอรับเรื่อง</Badge>}
            {a.lat != null && ` · ${a.lat.toFixed(4)}, ${a.lng!.toFixed(4)}`}
          </p>
          <div className="flex flex-wrap gap-1.5 text-xs font-medium">
            {!a.ackedAt && <button onClick={() => act(a.id, 'ack')} className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white">รับเรื่อง</button>}
            <button onClick={() => act(a.id, 'resolve')} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white">ปิดเหตุ</button>
            {a.channelId != null && <button onClick={() => setSelected(a.channelId)} className="px-2.5 py-1.5 rounded-lg border dark:border-slate-700">ช่องฉุกเฉิน</button>}
            <button onClick={() => callBack(a.userId)} className="px-2.5 py-1.5 rounded-lg border dark:border-slate-700 flex items-center gap-1"><PhoneCallIcon className="w-3.5 h-3.5" /> เรียกกลับ</button>
            {a.userId && <button onClick={() => setFocusUser(a.userId)} className="px-2.5 py-1.5 rounded-lg border dark:border-slate-700 flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5" /> แผนที่</button>}
          </div>
        </div>
      ))}
    </div>
  );

  const activityPanel = (
    <ul className="space-y-1.5">
      {activity.length === 0 && <li className="text-sm text-slate-400">ยังไม่มีกิจกรรมตั้งแต่เปิดหน้านี้</li>}
      {activity.map((m) => (
        <li key={m.id}>
          <button onClick={() => setSelected(m.channelId)} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <span className="font-medium text-slate-700 dark:text-slate-200">{m.username}</span> → {chName(m.channelId)}
              <span className="ml-auto">{shortTime(m.createdAt)}</span>
            </span>
            <span className={`block text-sm truncate ${m.kind === 'sos' ? 'text-red-600 font-semibold' : ''}`}>{previewText(m)}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* แถบสรุป */}
      <div className="flex items-center gap-3 px-4 h-14 box-content pt-[env(safe-area-inset-top)] bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <h1 className="text-lg font-bold flex-1">ศูนย์สั่งการ</h1>
        <Badge tone="green">ออนไลน์ {Object.keys(online).length}</Badge>
        <Badge tone={openAlerts.length ? 'red' : 'slate'}>SOS {openAlerts.length}</Badge>
        <Badge tone="sky">กำลังพูด {groups.filter((c) => c.speaker).length}</Badge>
      </div>

      {/* มือถือ: แท็บ */}
      <div className="xl:hidden flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm shrink-0">
        {([['channels', 'ช่อง'], ['alerts', `แจ้งเหตุ (${openAlerts.length})`], ['activity', 'กิจกรรม']] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); if (k === 'channels') setSelected(null); }} className={`flex-1 py-2.5 font-medium border-b-2 ${tab === k ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500'}`}>{l}</button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* ช่องทั้งหมด */}
        <div className={`${tab === 'channels' && selected == null ? 'flex' : 'hidden'} lg:flex w-full lg:w-72 shrink-0 flex-col overflow-y-auto p-3 gap-2 border-r border-slate-200 dark:border-slate-800`}>
          {groups.map((c) => <ChannelTile key={c.id} ch={c} selected={selected === c.id} onClick={() => { setSelected(c.id); setTab('channels'); }} />)}
        </div>

        {/* ช่องที่เลือก */}
        <div className={`${tab === 'channels' && selected != null ? 'flex' : 'hidden'} lg:flex flex-1 min-w-0 flex-col`}>
          {selected != null ? (
            <>
              <button onClick={() => setSelected(null)} className="lg:hidden text-left text-sm text-emerald-600 px-4 py-2 bg-white dark:bg-slate-900 border-b dark:border-slate-800">← ช่องทั้งหมด</button>
              <ChannelView key={selected} channelId={selected} embedded />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-6 text-center">
              เลือกช่องเพื่อพูด — ระหว่างเปิดหน้านี้คุณจะได้ยินเสียงจากทุกช่อง (ปิดเสียงรายช่องได้ในหน้าช่อง)
            </div>
          )}
        </div>

        {/* แจ้งเหตุ + แผนที่ + กิจกรรม */}
        <aside className={`${tab !== 'channels' ? 'flex' : 'hidden'} xl:flex w-full xl:w-96 shrink-0 flex-col min-h-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900`}>
          <div className={`${tab === 'activity' ? 'hidden xl:block' : ''} p-3 border-b dark:border-slate-800 max-h-[45%] overflow-y-auto`}>
            <h2 className="text-sm font-semibold mb-2">คิวแจ้งเหตุ</h2>
            {alertsPanel}
          </div>
          <div className={`${tab === 'activity' ? 'hidden xl:block' : ''} relative h-56 shrink-0`}>
            <TeamMap locations={locations} online={online} alerts={openAlerts} selectedId={focusUser} track={null} onSelect={onSelectUser} className="absolute inset-0" />
            <button onClick={() => navigate(focusUser ? `/map?focus=${focusUser}` : '/map')} className="absolute z-[500] top-2 right-2 text-xs bg-white dark:bg-slate-800 shadow rounded px-2 py-1">เปิดแผนที่เต็ม</button>
          </div>
          <div className={`${tab === 'alerts' ? 'hidden xl:block' : ''} flex-1 min-h-0 overflow-y-auto p-3`}>
            <h2 className="text-sm font-semibold mb-2">กิจกรรมล่าสุด</h2>
            {activityPanel}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Dispatch;
