import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BatteryChargingIcon, BatteryIcon, GaugeIcon, MessageCircleIcon, RouteIcon, XIcon } from 'lucide-react';
import { api, Location } from '../lib/api';
import { store, useStore } from '../lib/store';
import TeamMap from '../components/TeamMap';
import { Avatar, Toggle, timeAgo } from '../components/ui';

const TRACK_RANGES = [
  { label: '1 ชม.', ms: 3600e3 },
  { label: '6 ชม.', ms: 6 * 3600e3 },
  { label: '24 ชม.', ms: 24 * 3600e3 },
];

export const LocationDetails: React.FC<{ loc: Location; online: boolean }> = ({ loc, online }) => (
  <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-300">
    <span className="flex items-center gap-1">
      {loc.charging ? <BatteryChargingIcon className="w-4 h-4" /> : <BatteryIcon className="w-4 h-4" />}
      {loc.battery != null ? `${Math.round(loc.battery * 100)}%` : '—'}
    </span>
    <span className="flex items-center gap-1">
      <GaugeIcon className="w-4 h-4" />
      {loc.speed != null ? `${Math.round(loc.speed * 3.6)} กม./ชม.` : '—'}
    </span>
    <span className={online ? 'text-emerald-600' : ''}>{timeAgo(loc.at)}</span>
  </div>
);

const MapPage: React.FC = () => {
  const locationsMap = useStore((s) => s.locations);
  const online = useStore((s) => s.online);
  const alerts = useStore((s) => s.alerts);
  const sharing = useStore((s) => s.settings.shareLocation);
  const me = useStore((s) => s.me);
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<number | null>(Number(params.get('focus')) || null);
  const [track, setTrack] = useState<{ lat: number; lng: number }[] | null>(null);
  const navigate = useNavigate();

  const locations = useMemo(() => Object.values(locationsMap).sort((a, b) => b.at - a.at), [locationsMap]);
  const sel = selected != null ? locationsMap[selected] : null;
  const openAlerts = useMemo(() => alerts.filter((a) => !a.resolvedAt), [alerts]);

  useEffect(() => setTrack(null), [selected]);
  const onSelect = useCallback((id: number) => setSelected(id), []);

  const loadTrack = async (ms: number) => {
    if (selected == null) return;
    try {
      const { points } = await api.get<{ points: { lat: number; lng: number }[] }>(`/api/users/${selected}/track?since=${Date.now() - ms}`);
      if (points.length < 2) store.toast('ยังไม่มีเส้นทางในช่วงเวลานี้');
      setTrack(points);
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  const chat = async (userId: number) => {
    if (userId === me?.id) return;
    const { id } = await api.post<{ id: number }>(`/api/direct/${userId}`);
    navigate(`/c/${id}`);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
      <div className="relative flex-1 min-h-[50%]">
        <TeamMap
          locations={locations}
          online={online}
          alerts={openAlerts}
          selectedId={selected}
          track={track}
          onSelect={onSelect}
          className="absolute inset-0"
        />
        {/* การ์ดคนที่เลือก */}
        {sel && (
          <div className="absolute z-[500] left-3 right-3 bottom-3 lg:right-auto lg:w-96 rounded-xl bg-white dark:bg-slate-900 shadow-xl p-3 space-y-2">
            <div className="flex items-center gap-3">
              <Avatar clickable name={sel.displayName} userId={sel.userId} size="sm" status={online[sel.userId] as any ?? null} />
              <span className="flex-1 font-semibold truncate">{sel.displayName}</span>
              <button onClick={() => setSelected(null)} className="p-1 text-slate-400" aria-label="ปิด"><XIcon className="w-4 h-4" /></button>
            </div>
            <LocationDetails loc={sel} online={!!online[sel.userId]} />
            <div className="flex flex-wrap gap-1.5">
              <span className="flex items-center gap-1 text-xs text-slate-500"><RouteIcon className="w-4 h-4" /> เส้นทาง:</span>
              {TRACK_RANGES.map((r) => (
                <button key={r.ms} onClick={() => loadTrack(r.ms)} className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                  {r.label}
                </button>
              ))}
              {sel.userId !== me?.id && (
                <button onClick={() => chat(sel.userId)} className="ml-auto text-xs px-2 py-1 rounded-full bg-emerald-600 text-white flex items-center gap-1">
                  <MessageCircleIcon className="w-3.5 h-3.5" /> คุย
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* รายชื่อทีม */}
      <aside className="lg:w-80 max-h-[45%] lg:max-h-none flex flex-col bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800">
        <div className="px-4 pt-3 pb-1">
          <h1 className="text-lg font-bold">แผนที่ทีม</h1>
          <Toggle
            label="แชร์ตำแหน่งของฉัน"
            hint="ส่งพิกัด แบตเตอรี่ และความเร็วให้ทีมแบบ realtime"
            checked={sharing}
            onChange={(v) => store.updateSettings({ shareLocation: v })}
          />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {locations.length === 0 && <p className="p-4 text-sm text-slate-400">ยังไม่มีใครแชร์ตำแหน่ง</p>}
          {locations.map((l) => (
            <button
              key={l.userId}
              onClick={() => setSelected(l.userId)}
              className={`w-full text-left px-4 py-2.5 space-y-1 ${selected === l.userId ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
            >
              <span className="flex items-center gap-2">
                <Avatar clickable name={l.displayName} userId={l.userId} size="sm" status={online[l.userId] as any ?? null} />
                <span className="font-medium text-sm truncate">{l.displayName}{l.userId === me?.id && ' (คุณ)'}</span>
              </span>
              <LocationDetails loc={l} online={!!online[l.userId]} />
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
};

export default MapPage;
