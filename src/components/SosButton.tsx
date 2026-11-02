import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../lib/store';

const HOLD_MS = 1500;

// ปุ่ม SOS: กดค้าง 1.5 วินาทีเพื่อป้องกันการกดพลาด
const SosButton: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const [progress, setProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const timer = useRef<number | null>(null);
  const startedAt = useRef(0);
  const navigate = useNavigate();

  const cancel = () => {
    if (timer.current) cancelAnimationFrame(timer.current);
    timer.current = null;
    setProgress(0);
  };

  const fire = async () => {
    cancel();
    setSending(true);
    navigator.vibrate?.(300);
    try {
      const channelId = await store.triggerSos();
      const secs = store.getState().config.sosTalkSeconds;
      store.toast(secs ? `ส่ง SOS แล้ว — กำลังส่งเสียงสดเข้าช่องฉุกเฉิน ${secs} วินาที` : 'ส่ง SOS แล้ว');
      if (channelId != null) navigate(`/c/${channelId}`);
    } catch (e: any) {
      store.toast(e.message || 'ส่ง SOS ไม่สำเร็จ', 'error');
    } finally {
      setSending(false);
    }
  };

  const tick = () => {
    const p = Math.min(1, (Date.now() - startedAt.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) fire();
    else timer.current = requestAnimationFrame(tick);
  };

  const start = (e: React.PointerEvent) => {
    if (sending) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startedAt.current = Date.now();
    timer.current = requestAnimationFrame(tick);
  };

  const size = compact ? 40 : 56;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className="relative shrink-0 select-none touch-none rounded-full bg-red-600 text-white font-black flex items-center justify-center shadow hover:bg-red-700"
      style={{ width: size, height: size, fontSize: compact ? 11 : 14 }}
      title="กดค้างเพื่อส่ง SOS"
      aria-label="SOS กดค้างเพื่อแจ้งเหตุฉุกเฉิน"
    >
      <svg className="absolute inset-0 -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="white" strokeWidth="3" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} opacity={progress ? 1 : 0} />
      </svg>
      {sending ? '...' : 'SOS'}
    </button>
  );
};

export default SosButton;
