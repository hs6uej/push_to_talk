import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { AppLogo } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';

export const authInput =
  'mt-1 block w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500';

export const AuthShell: React.FC<{ title: string; children: React.ReactNode; wide?: boolean }> = ({ title, children, wide }) => {
  const config = useStore((s) => s.config);
  return (
  <div className="min-h-[100dvh] flex items-center justify-center bg-slate-100 dark:bg-slate-950 px-4 py-8 text-slate-900 dark:text-slate-100">
    <div className={`w-full ${wide ? 'max-w-md' : 'max-w-sm'} bg-white dark:bg-slate-900 rounded-2xl shadow-md p-6 sm:p-8`}>
      <div className="flex flex-col items-center mb-6 text-center">
        <AppLogo className="w-16 h-16 mb-3" />
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{config.appName}</p>
        {config.tagline && <p className="text-xs text-slate-500 mt-0.5">{config.tagline}</p>}
        <h2 className="text-2xl font-bold mt-3">{title}</h2>
      </div>
      {children}
      {config.supportContact && <p className="mt-6 text-center text-xs text-slate-500">ติดต่อผู้ดูแล: {config.supportContact}</p>}
      <p className="mt-4 text-center text-xs"><Link to="/docs" className="text-slate-500 hover:text-emerald-600 underline">วิธีใช้งานและข้อมูลระบบ</Link></p>
    </div>
  </div>
  );
};

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login, currentUser, allowRegister } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const next = (location.state as any)?.from || '/';

  if (currentUser) return <Navigate to={next} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      navigate(next, { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="เข้าสู่ระบบ">
      {error && <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium">ชื่อผู้ใช้
          <input type="text" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} className={authInput} />
        </label>
        <label className="block text-sm font-medium">รหัสผ่าน
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={authInput} />
        </label>
        <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg text-white font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
          {busy ? 'กรุณารอสักครู่...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
      {allowRegister && (
        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          ยังไม่มีบัญชี? <Link to="/register" state={location.state} className="font-medium text-emerald-600">สมัครสมาชิก</Link>
        </p>
      )}
    </AuthShell>
  );
};

export default Login;
