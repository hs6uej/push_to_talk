import React from 'react';
import { store, useStore } from '../lib/store';

// สลับสถานะ พร้อม / ไม่ว่าง (ไม่ว่าง = ไม่เล่นเสียงสดจากช่องอื่นที่ไม่ได้เปิดอยู่)
const StatusSwitch: React.FC = () => {
  const status = useStore((s) => s.me?.status);
  if (!status) return null;
  return (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm">
      {(['available', 'busy'] as const).map((s) => (
        <button
          key={s}
          onClick={() => store.setStatus(s)}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium ${status === s ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${s === 'available' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {s === 'available' ? 'พร้อม' : 'ไม่ว่าง'}
        </button>
      ))}
    </div>
  );
};

export default StatusSwitch;
