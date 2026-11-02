// /i/:code — เปิดจาก QR/ลิงก์เชิญ: เพิ่มเพื่อน, เข้ากลุ่ม, หรือขอเข้าองค์กร
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2Icon, UserPlusIcon, UsersIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, User } from '../lib/api';
import { store } from '../lib/store';
import { Avatar, btnGhost, btnPrimary } from '../components/ui';

interface Resolved {
  kind: 'user' | 'channel' | 'org';
  user?: User;
  isFriend?: boolean;
  self?: boolean;
  allowed?: boolean;
  channel?: { id: number; name: string; description: string; avatar: string | null; orgName: string | null; members: number };
  isMember?: boolean;
  joinMode?: 'join' | 'request' | null;
  org?: { id: number; name: string; avatar: string | null; active: boolean; members: number };
}

const InvitePage: React.FC = () => {
  const { code = '' } = useParams();
  const { currentUser, loading, reloadMe } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<Resolved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    api.get<Resolved>(`/api/invite/${encodeURIComponent(code)}`).then(setInfo).catch((e) => setError(e.message));
  }, [code, loading, currentUser?.id]);

  const accept = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ kind: string; userId?: number; channelId?: number; status?: string }>(`/api/invite/${encodeURIComponent(code)}/accept`);
      if (r.kind === 'user' && r.userId) {
        store.toast('เพิ่มเพื่อนแล้ว');
        const { id } = await api.post<{ id: number }>(`/api/direct/${r.userId}`);
        navigate(`/c/${id}`, { replace: true });
      } else if (r.kind === 'channel') {
        if (r.status === 'pending') {
          store.toast('ส่งคำขอแล้ว รอผู้ดูแลกดรับ');
          navigate('/', { replace: true });
        } else navigate(`/c/${r.channelId}`, { replace: true });
      } else {
        await reloadMe();
        store.toast(r.status === 'active' ? 'คุณเป็นสมาชิกองค์กรนี้แล้ว' : 'ส่งคำขอเข้าองค์กรแล้ว รอแอดมินอนุมัติ');
        navigate('/settings', { replace: true });
      }
    } catch (e: any) {
      store.toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4 text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-md p-6 text-center space-y-4">{children}</div>
    </div>
  );

  if (error) return shell(<><p className="text-4xl">🔗</p><p className="font-semibold">{error}</p><Link to="/" className={btnGhost}>กลับหน้าแรก</Link></>);
  if (!info) return shell(<p className="text-slate-500">กำลังตรวจสอบ...</p>);

  // ยังไม่ได้เข้าสู่ระบบ
  if (!currentUser) {
    return shell(
      <>
        {info.kind === 'org' && info.org ? (
          <>
            <Avatar name={info.org.name} id={info.org.id} src={info.org.avatar} size="xl" className="mx-auto" />
            <p className="text-lg font-bold">{info.org.name}</p>
            <p className="text-sm text-slate-500">เชิญคุณเข้าร่วมองค์กร · สมาชิก {info.org.members} คน</p>
          </>
        ) : (
          <p className="font-semibold">{info.kind === 'user' ? 'มีคนชวนคุณเป็นเพื่อน' : 'มีคนชวนคุณเข้ากลุ่ม'}</p>
        )}
        <p className="text-sm text-slate-500">เข้าสู่ระบบหรือสมัครสมาชิกเพื่อดำเนินการต่อ</p>
        <div className="grid gap-2">
          <Link to={`/register?invite=${code}`} className={btnPrimary}>สมัครสมาชิก</Link>
          <Link to="/login" state={{ from: `/i/${code}` }} className={btnGhost}>มีบัญชีแล้ว — เข้าสู่ระบบ</Link>
        </div>
      </>
    );
  }

  if (info.kind === 'user' && info.user) {
    const u = info.user;
    return shell(
      <>
        <Avatar name={u.displayName} userId={u.id} src={u.avatar} size="xl" className="mx-auto" />
        <div>
          <p className="text-lg font-bold">{u.displayName}</p>
          <p className="text-sm text-slate-500">@{u.username}{u.orgName && ` · ${u.orgName}`}</p>
        </div>
        {info.self ? <p className="text-sm text-slate-500">นี่คือ QR ของคุณเอง</p>
          : !info.allowed ? <p className="text-sm text-red-600">เพิ่มผู้ใช้นี้ไม่ได้ตามนโยบายองค์กร</p>
          : (
            <button onClick={accept} disabled={busy} className={`${btnPrimary} w-full`}>
              <UserPlusIcon className="w-4 h-4" /> {info.isFriend ? 'เป็นเพื่อนกันแล้ว — เปิดแชท' : 'เพิ่มเพื่อนและเริ่มคุย'}
            </button>
          )}
        <Link to="/" className="block text-sm text-slate-500">ยกเลิก</Link>
      </>
    );
  }

  if (info.kind === 'channel' && info.channel) {
    const c = info.channel;
    return shell(
      <>
        <Avatar name={c.name} id={c.id} src={c.avatar} size="xl" className="mx-auto" />
        <div>
          <p className="text-lg font-bold">{c.name}</p>
          <p className="text-sm text-slate-500 flex items-center justify-center gap-1"><UsersIcon className="w-4 h-4" /> สมาชิก {c.members} คน{c.orgName && ` · ${c.orgName}`}</p>
          {c.description && <p className="text-sm mt-2">{c.description}</p>}
        </div>
        {info.isMember ? (
          <button onClick={() => navigate(`/c/${c.id}`, { replace: true })} className={`${btnPrimary} w-full`}>เปิดกลุ่ม</button>
        ) : info.joinMode ? (
          <>
            <button onClick={accept} disabled={busy} className={`${btnPrimary} w-full`}>{info.joinMode === 'request' ? 'ขอเข้าร่วม (รอผู้ดูแลกดรับ)' : 'เข้าร่วมกลุ่ม'}</button>
          </>
        ) : (
          <p className="text-sm text-red-600">{c.orgName ? `กลุ่มนี้เป็นของ ${c.orgName} — ต้องเป็นสมาชิกองค์กรก่อน` : 'บัญชีของคุณเข้ากลุ่มสาธารณะไม่ได้ (นโยบายองค์กร)'}</p>
        )}
        <Link to="/" className="block text-sm text-slate-500">ยกเลิก</Link>
      </>
    );
  }

  const o = info.org!;
  const myOrg = currentUser.org;
  return shell(
    <>
      <Avatar name={o.name} id={o.id} src={o.avatar} size="xl" className="mx-auto" />
      <div>
        <p className="text-lg font-bold flex items-center justify-center gap-1.5"><Building2Icon className="w-5 h-5" /> {o.name}</p>
        <p className="text-sm text-slate-500">สมาชิก {o.members} คน</p>
      </div>
      {!o.active ? <p className="text-sm text-amber-600">องค์กรนี้ยังไม่เปิดใช้งาน</p>
        : myOrg?.id === o.id && myOrg.memberStatus === 'active' ? <p className="text-sm text-emerald-600">คุณเป็นสมาชิกองค์กรนี้แล้ว</p>
        : myOrg?.id === o.id ? <p className="text-sm text-amber-600">ส่งคำขอแล้ว รอแอดมินองค์กรอนุมัติ</p>
        : myOrg?.memberStatus === 'active' ? <p className="text-sm text-red-600">คุณสังกัด {myOrg.name} อยู่ ต้องออกจากองค์กรเดิมก่อน</p>
        : <button onClick={accept} disabled={busy} className={`${btnPrimary} w-full`}>ขอเข้าร่วมองค์กร</button>}
      <p className="text-xs text-slate-500">แอดมินขององค์กรต้องกดรับก่อน จึงจะเห็นช่องขององค์กร</p>
      <Link to="/" className="block text-sm text-slate-500">กลับ</Link>
    </>
  );
};

export default InvitePage;
