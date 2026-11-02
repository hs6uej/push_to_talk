// การ์ด "องค์กรของฉัน" ในหน้าตั้งค่า: สถานะ, ขอเข้า (รหัส/QR), ขอเปิดองค์กร, ออก
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2Icon, ChevronRightIcon, LogOutIcon, PlusCircleIcon, QrCodeIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, Me } from '../lib/api';
import { store } from '../lib/store';
import { QrScanner } from './Qr';
import { Avatar, Badge, btnGhost, btnPrimary, inputCls } from './ui';

const ROLE: Record<string, string> = { admin: 'แอดมินองค์กร', dispatcher: 'ศูนย์สั่งการ', member: 'สมาชิก' };

const MyOrg: React.FC = () => {
  const { currentUser, reloadMe } = useAuth();
  const [mode, setMode] = useState<'none' | 'join' | 'create'>('none');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!currentUser) return null;
  const org = currentUser.org;

  const run = async (fn: () => Promise<{ user: Me }>, ok: string) => {
    setBusy(true);
    try {
      const { user } = await fn();
      store.setMe(user);
      await reloadMe();
      store.toast(ok);
      setMode('none');
    } catch (e: any) {
      store.toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    const pending = org?.memberStatus === 'pending';
    if (!confirm(pending ? 'ยกเลิกคำขอเข้าองค์กร?' : `ออกจากองค์กร ${org?.name}? คุณจะไม่เห็นช่องขององค์กรอีก`)) return;
    run(() => api.post('/api/me/org/leave'), pending ? 'ยกเลิกคำขอแล้ว' : 'ออกจากองค์กรแล้ว');
  };

  if (org) {
    const status = org.status !== 'active'
      ? { pending: ['รอ Super admin อนุมัติองค์กร', 'amber'], suspended: ['องค์กรถูกระงับ', 'red'], rejected: ['องค์กรไม่ได้รับอนุมัติ', 'red'], active: ['', 'green'] }[org.status]
      : org.memberStatus === 'pending' ? ['รอแอดมินองค์กรกดรับ', 'amber'] : [ROLE[org.role], 'green'];
    return (
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-3">
          <Avatar name={org.name} id={org.id} src={org.avatar} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{org.name}</p>
            <Badge tone={status[1] as 'amber' | 'green' | 'red'}>{status[0]}</Badge>
          </div>
        </div>
        {org.status === 'active' && org.memberStatus === 'active' && !org.allowExternal && (
          <p className="text-xs text-slate-500">องค์กรนี้ไม่อนุญาตให้ใช้กลุ่มสาธารณะหรือคุยกับคนนอกองค์กร</p>
        )}
        <div className="flex flex-wrap gap-2">
          {org.status === 'active' && org.memberStatus === 'active' && org.role === 'admin' && (
            <Link to="/org" className={btnPrimary}><Building2Icon className="w-4 h-4" /> จัดการองค์กร <ChevronRightIcon className="w-4 h-4" /></Link>
          )}
          <button onClick={leave} disabled={busy} className={`${btnGhost} text-red-600`}>
            <LogOutIcon className="w-4 h-4" /> {org.memberStatus === 'pending' ? 'ยกเลิกคำขอ' : 'ออกจากองค์กร'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      <p className="text-sm text-slate-500">ตอนนี้คุณเป็นบุคคลทั่วไป ใช้กลุ่มสาธารณะและเพิ่มเพื่อนได้</p>
      {mode === 'none' && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setMode('join')} className={btnGhost}><Building2Icon className="w-4 h-4" /> เข้าร่วมองค์กร</button>
          <button onClick={() => setMode('create')} className={btnGhost}><PlusCircleIcon className="w-4 h-4" /> ขอเปิดองค์กร</button>
        </div>
      )}
      {mode === 'join' && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => api.post('/api/me/org/join', { code }), 'ส่งคำขอแล้ว รอแอดมินองค์กรกดรับ'); }} className="space-y-2">
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="รหัสองค์กร" required className={`${inputCls} uppercase font-mono tracking-widest`} />
            <button type="button" onClick={() => setScan(true)} className="px-3 rounded-lg border border-slate-300 dark:border-slate-700" aria-label="สแกน QR องค์กร"><QrCodeIcon className="w-5 h-5" /></button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode('none')} className={btnGhost}>ยกเลิก</button>
            <button disabled={busy} className={`${btnPrimary} flex-1`}>ส่งคำขอเข้าองค์กร</button>
          </div>
        </form>
      )}
      {mode === 'create' && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => api.post('/api/me/org/create', { name }), 'ส่งคำขอเปิดองค์กรแล้ว รอ Super admin อนุมัติ'); }} className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อองค์กร" maxLength={80} required className={inputCls} />
          <p className="text-xs text-slate-500">คุณจะเป็นแอดมินขององค์กร ระบบสร้าง "ห้องรวม" และ "ฉุกเฉิน" ให้ ใช้งานได้หลังอนุมัติ</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode('none')} className={btnGhost}>ยกเลิก</button>
            <button disabled={busy} className={`${btnPrimary} flex-1`}>ขอเปิดองค์กร</button>
          </div>
        </form>
      )}
      {scan && <QrScanner onClose={() => setScan(false)} onCode={(c) => { setScan(false); setCode(c); }} />}
    </div>
  );
};

export default MyOrg;
