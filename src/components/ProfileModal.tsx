// ProfileModal — กดที่รูปโปรไฟล์ใครก็ได้: แสดงชื่อ องค์กร สถานะ และปุ่ม QR / คุย / เพิ่มเพื่อน
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2Icon, MessageCircleIcon, QrCodeIcon, UserCheckIcon, UserPlusIcon } from 'lucide-react';
import { api, User } from '../lib/api';
import { store, useStore } from '../lib/store';
import { QrCode } from './Qr';
import { Avatar, Badge, btnGhost, btnPrimary, Sheet, timeAgo } from './ui';
import { inviteUrl } from '../lib/api';

interface Profile {
  user: User & { online: boolean; lastSeen: number | null };
  isFriend: boolean;
  self: boolean;
  friendCode: string;
  sameOrg: boolean;
}

const ORG_ROLE: Record<string, string> = { admin: 'แอดมินองค์กร', dispatcher: 'ศูนย์สั่งการ', member: 'สมาชิก' };

const ProfileModal: React.FC = () => {
  const userId = useStore((s) => s.profileId);
  const online = useStore((s) => s.online);
  const navigate = useNavigate();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setP(null);
    setError(null);
    setShowQr(false);
    if (userId == null) return;
    api.get<Profile>(`/api/users/${userId}/profile`).then(setP).catch((e) => setError(e.message));
  }, [userId]);

  if (userId == null) return null;
  const close = () => store.openProfile(null);

  const chat = async () => {
    setBusy(true);
    try {
      const { id } = await api.post<{ id: number }>(`/api/direct/${userId}`);
      close();
      navigate(`/c/${id}`);
    } catch (e: any) {
      store.toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const addFriend = async () => {
    setBusy(true);
    try {
      await api.post(`/api/friends/${userId}`);
      setP((x) => (x ? { ...x, isFriend: true } : x));
      store.toast('เพิ่มเพื่อนแล้ว');
    } catch (e: any) {
      store.toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const u = p?.user;
  const st = u ? online[u.id] ?? null : null;
  return (
    <Sheet title="โปรไฟล์" onClose={close}>
      {error && <p className="text-center text-sm text-slate-500 py-6">{error}</p>}
      {!p && !error && <p className="text-center text-sm text-slate-400 py-6">กำลังโหลด...</p>}
      {p && u && (
        <div className="flex flex-col items-center text-center gap-3">
          <Avatar name={u.displayName} userId={u.id} src={u.avatar} size="xl" status={st} />
          <div>
            <p className="text-xl font-bold">{u.displayName}</p>
            <p className="text-sm text-slate-500">@{u.username}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            <Badge tone={st === 'available' ? 'green' : st === 'busy' ? 'amber' : 'slate'}>
              {st === 'available' ? 'ออนไลน์ · พร้อม' : st === 'busy' ? 'ออนไลน์ · ไม่ว่าง' : u.lastSeen ? `ออนไลน์ล่าสุด ${timeAgo(u.lastSeen)}` : 'ออฟไลน์'}
            </Badge>
            {u.orgName && (
              <Badge tone="sky"><Building2Icon className="w-3 h-3" /> {u.orgName}{u.orgRole && u.orgRole !== 'member' ? ` · ${ORG_ROLE[u.orgRole]}` : ''}</Badge>
            )}
            {u.role === 'superadmin' && <Badge tone="red">Super admin</Badge>}
            {p.isFriend && <Badge tone="green"><UserCheckIcon className="w-3 h-3" /> เพื่อน</Badge>}
          </div>

          {showQr ? (
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 rounded-2xl bg-white border border-slate-200"><QrCode value={inviteUrl(p.friendCode)} size={208} /></div>
              <p className="font-mono tracking-[0.3em] font-semibold">{p.friendCode}</p>
              <p className="text-xs text-slate-500">{p.self ? 'ให้คนอื่นสแกนเพื่อเพิ่มคุณเป็นเพื่อน' : `สแกนเพื่อเพิ่ม ${u.displayName} เป็นเพื่อน`}</p>
            </div>
          ) : null}

          <div className="grid gap-2 w-full pt-1">
            <button onClick={() => setShowQr(!showQr)} className={btnGhost}>
              <QrCodeIcon className="w-4 h-4" /> {showQr ? 'ซ่อน QR code' : 'แสดง QR code'}
            </button>
            {!p.self && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={chat} disabled={busy} className={btnPrimary}><MessageCircleIcon className="w-4 h-4" /> คุย 1:1</button>
                {p.isFriend
                  ? <button disabled className={`${btnGhost} opacity-60`}><UserCheckIcon className="w-4 h-4" /> เป็นเพื่อนแล้ว</button>
                  : <button onClick={addFriend} disabled={busy} className={btnGhost}><UserPlusIcon className="w-4 h-4" /> เพิ่มเพื่อน</button>}
              </div>
            )}
            {p.self && (
              <button onClick={() => { close(); navigate('/settings'); }} className={btnGhost}>แก้ไขโปรไฟล์</button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
};

export default ProfileModal;
