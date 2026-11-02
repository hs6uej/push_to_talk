import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPinIcon, SirenIcon, VolumeXIcon } from 'lucide-react';
import { store, useStore } from '../lib/store';
import { timeAgo } from './ui';

// แถบแจ้งเตือน SOS ที่ยังไม่มีใครรับทราบ — แสดงทับทุกหน้า
const SosOverlay: React.FC = () => {
  const alerts = useStore((s) => s.alerts);
  const me = useStore((s) => s.me);
  const sirenOn = useStore((s) => s.sirenOn);
  const navigate = useNavigate();
  const pending = alerts.filter((a) => !a.ackedAt && a.userId !== me?.id);
  if (!pending.length) return null;
  const a = pending[0];

  const act = async (action: 'ack' | 'resolve') => {
    try {
      await store.alertAction(a.id, action);
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[55] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl bg-red-600 text-white shadow-2xl ring-4 ring-red-300 animate-[pulse_1.5s_ease-in-out_infinite]">
        <div className="flex items-start gap-3 p-4">
          <SirenIcon className="w-8 h-8 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-lg">SOS — {a.username}</p>
            <p className="text-sm opacity-90">{a.note || 'แจ้งเหตุฉุกเฉิน'} · {timeAgo(a.createdAt)}</p>
            {a.lat != null && (
              <p className="text-xs opacity-80 mt-0.5">{a.lat.toFixed(5)}, {a.lng!.toFixed(5)}</p>
            )}
            {pending.length > 1 && <p className="text-xs mt-1">และอีก {pending.length - 1} รายการ</p>}
          </div>
          {sirenOn && (
            <button onClick={() => store.stopAlarm()} className="p-2 rounded-full bg-white/20" aria-label="ปิดเสียงเตือน">
              <VolumeXIcon className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-px bg-red-500 rounded-b-2xl overflow-hidden text-sm font-semibold">
          <button onClick={() => act('ack')} className="bg-red-700 py-3 hover:bg-red-800">รับทราบ</button>
          {a.channelId != null ? (
            <button onClick={() => { act('ack'); navigate(`/c/${a.channelId}`); }} className="bg-red-700 py-3 hover:bg-red-800">ไปช่องฉุกเฉิน</button>
          ) : <span className="bg-red-700" />}
          <button
            disabled={a.lat == null}
            onClick={() => { act('ack'); navigate(`/map?focus=${a.userId}`); }}
            className="bg-red-700 py-3 hover:bg-red-800 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <MapPinIcon className="w-4 h-4" /> แผนที่
          </button>
        </div>
      </div>
    </div>
  );
};

export default SosOverlay;
