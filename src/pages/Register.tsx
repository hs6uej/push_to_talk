// สมัครสมาชิก: เลือกตั้งแต่แรกว่า บุคคลทั่วไป / เข้าร่วมองค์กร / ขอเปิดองค์กรใหม่
import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2Icon, CheckIcon, PlusCircleIcon, QrCodeIcon, UserIcon } from 'lucide-react';
import { RegisterData, useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { QrScanner } from '../components/Qr';
import { AuthShell, authInput } from './Login';

type Mode = RegisterData['mode'];
const MODES: { mode: Mode; icon: React.FC<{ className?: string }>; title: string; desc: string }[] = [
  { mode: 'personal', icon: UserIcon, title: 'บุคคลทั่วไป', desc: 'ใช้กลุ่มสาธารณะ เพิ่มเพื่อนด้วย QR' },
  { mode: 'join-org', icon: Building2Icon, title: 'เข้าร่วมองค์กร', desc: 'ใช้รหัส/QR ขององค์กร แล้วรอแอดมินกดรับ' },
  { mode: 'create-org', icon: PlusCircleIcon, title: 'เปิดองค์กรใหม่', desc: 'คุณเป็นแอดมิน รอ Super admin อนุมัติ' },
];

const Register: React.FC = () => {
  const { register, currentUser, allowRegister } = useAuth();
  const allowCreateOrg = useStore((s) => s.config.allowCreateOrg);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const invite = params.get('invite');
  const [mode, setMode] = useState<Mode>('personal');
  const [form, setForm] = useState({ username: '', displayName: '', password: '', confirm: '', orgCode: '', orgName: '' });
  const [orgPreview, setOrgPreview] = useState<{ name: string; active: boolean } | null>(null);
  const [scan, setScan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // มาจาก QR องค์กร → เลือก "เข้าร่วมองค์กร" และใส่รหัสให้เลย
  useEffect(() => {
    if (!invite) return;
    api.get<{ kind: string; org?: { name: string; active: boolean } }>(`/api/invite/${invite}`).then((r) => {
      if (r.kind === 'org') {
        setMode('join-org');
        setForm((f) => ({ ...f, orgCode: invite.toUpperCase() }));
      }
    }).catch(() => {});
  }, [invite]);

  // ตรวจรหัสองค์กรขณะพิมพ์
  useEffect(() => {
    setOrgPreview(null);
    const code = form.orgCode.trim();
    if (mode !== 'join-org' || code.length < 6) return;
    const t = setTimeout(() => {
      api.get<{ kind: string; org?: { name: string; active: boolean } }>(`/api/invite/${encodeURIComponent(code)}`)
        .then((r) => setOrgPreview(r.kind === 'org' && r.org ? r.org : null)).catch(() => setOrgPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [form.orgCode, mode]);

  if (currentUser) return <Navigate to={invite ? `/i/${invite}` : '/'} replace />;
  if (!allowRegister) {
    return <AuthShell title="สมัครสมาชิก"><p className="text-center text-slate-500">ปิดการสมัครสมาชิก กรุณาติดต่อผู้ดูแลระบบ</p></AuthShell>;
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) return setError('รหัสผ่านไม่ตรงกัน');
    if (mode === 'join-org' && !orgPreview?.active) return setError('กรุณาใส่รหัสองค์กรที่ถูกต้อง');
    setBusy(true);
    try {
      await register({
        username: form.username, password: form.password, displayName: form.displayName || undefined, mode,
        orgCode: mode === 'join-org' ? form.orgCode.trim() : undefined, orgName: mode === 'create-org' ? form.orgName : undefined,
      });
      const from = (location.state as any)?.from;
      navigate(invite && mode !== 'join-org' ? `/i/${invite}` : from || (mode === 'personal' ? '/' : '/settings'), { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="สมัครสมาชิก" wide>
      {error && <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <fieldset>
          <legend className="text-sm font-medium mb-2">สมัครในนาม</legend>
          <div className="grid gap-2">
            {MODES.filter((m) => m.mode !== 'create-org' || allowCreateOrg).map((m) => (
              <button
                type="button"
                key={m.mode}
                onClick={() => setMode(m.mode)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition ${mode === m.mode ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-500' : 'border-slate-300 dark:border-slate-700 hover:border-slate-400'}`}
              >
                <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${mode === m.mode ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                  <m.icon className="w-5 h-5" />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold text-sm">{m.title}</span>
                  <span className="block text-xs text-slate-500">{m.desc}</span>
                </span>
                {mode === m.mode && <CheckIcon className="w-5 h-5 text-emerald-600" />}
              </button>
            ))}
          </div>
        </fieldset>

        {mode === 'join-org' && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-2">
            <label className="block text-sm font-medium">รหัสองค์กร
              <div className="flex gap-2 mt-1">
                <input value={form.orgCode} onChange={set('orgCode')} placeholder="เช่น AB12CD34" className={`${authInput} !mt-0 uppercase font-mono tracking-widest`} required />
                <button type="button" onClick={() => setScan(true)} className="shrink-0 px-3 rounded-lg border border-slate-300 dark:border-slate-700" aria-label="สแกน QR องค์กร">
                  <QrCodeIcon className="w-5 h-5" />
                </button>
              </div>
            </label>
            {orgPreview ? (
              <p className={`text-sm ${orgPreview.active ? 'text-emerald-600' : 'text-amber-600'}`}>
                {orgPreview.active ? `✓ ${orgPreview.name}` : `${orgPreview.name} — ยังไม่เปิดใช้งาน`}
              </p>
            ) : form.orgCode.length >= 6 && <p className="text-sm text-slate-500">ไม่พบองค์กร</p>}
            <p className="text-xs text-slate-500">ระหว่างรอแอดมินอนุมัติ คุณใช้กลุ่มสาธารณะได้ตามปกติ</p>
          </div>
        )}
        {mode === 'create-org' && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-2">
            <label className="block text-sm font-medium">ชื่อองค์กร
              <input value={form.orgName} onChange={set('orgName')} maxLength={80} required className={authInput} />
            </label>
            <p className="text-xs text-slate-500">ระบบจะสร้าง "ห้องรวม" และ "ฉุกเฉิน" ขององค์กรให้ ใช้งานได้หลัง Super admin อนุมัติ</p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm font-medium">ชื่อผู้ใช้
            <input autoComplete="username" required value={form.username} onChange={set('username')} className={authInput} />
          </label>
          <label className="block text-sm font-medium">ชื่อที่แสดง
            <input value={form.displayName} onChange={set('displayName')} maxLength={40} placeholder="ไม่บังคับ" className={authInput} />
          </label>
          <label className="block text-sm font-medium">รหัสผ่าน
            <input type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} className={authInput} />
          </label>
          <label className="block text-sm font-medium">ยืนยันรหัสผ่าน
            <input type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} className={authInput} />
          </label>
        </div>
        <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg text-white font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
          {busy ? 'กรุณารอสักครู่...' : mode === 'personal' ? 'สมัครสมาชิก' : mode === 'join-org' ? 'สมัครและขอเข้าองค์กร' : 'สมัครและขอเปิดองค์กร'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        มีบัญชีแล้ว? <Link to="/login" state={invite ? { from: `/i/${invite}` } : location.state} className="font-medium text-emerald-600">เข้าสู่ระบบ</Link>
      </p>
      {scan && <QrScanner onClose={() => setScan(false)} onCode={(c) => { setScan(false); setForm((f) => ({ ...f, orgCode: c })); }} />}
    </AuthShell>
  );
};

export default Register;
