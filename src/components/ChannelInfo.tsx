import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2Icon, LogOutIcon, QrCodeIcon, Trash2Icon, UserPlusIcon } from 'lucide-react';
import { api, ChannelDetail, DirectoryUser, MemberRole } from '../lib/api';
import { store, useStore } from '../lib/store';
import AvatarEditor from './AvatarEditor';
import { QrShareSheet } from './Qr';
import { Avatar, Badge, btnDanger, btnGhost, btnPrimary, inputCls, Sheet, Toggle } from './ui';

const ROLE_LABEL: Record<MemberRole, string> = { owner: 'เจ้าของ', moderator: 'ผู้ดูแลช่อง', member: 'สมาชิก', listener: 'ฟังอย่างเดียว' };

const ChannelInfo: React.FC<{ channelId: number; onClose: () => void }> = ({ channelId, onClose }) => {
  const me = useStore((s) => s.me);
  const online = useStore((s) => s.online);
  const channels = useStore((s) => s.channels);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ChannelDetail | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [addName, setAddName] = useState('');
  const [addRole, setAddRole] = useState<MemberRole>('member');
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(() => {
    api.get<ChannelDetail>(`/api/channels/${channelId}`).then((d) => {
      setDetail(d);
      setName(d.channel.name);
      setDescription(d.channel.description);
    }).catch((e) => store.toast(e.message, 'error'));
  }, [channelId]);

  // โหลดใหม่เมื่อรายการช่องเปลี่ยน (สมาชิกเข้า/ออก)
  useEffect(load, [load, channels]);
  useEffect(() => {
    api.get<{ users: DirectoryUser[] }>('/api/users').then(({ users }) => setDirectory(users)).catch(() => {});
  }, []);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) store.toast(ok);
      load();
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  if (!detail) return <Sheet title="ข้อมูลช่อง" onClose={onClose}><p className="text-slate-400 text-sm">กำลังโหลด...</p></Sheet>;
  const { channel, members, canManage } = detail;
  const isDirect = channel.type === 'direct';
  const mine = members.find((m) => m.id === me?.id);
  const isOwner = mine?.memberRole === 'owner' || me?.role === 'superadmin' || detail.isOrgAdmin;
  const elevated = me?.role === 'superadmin' || detail.isOrgAdmin;
  const memberIds = new Set(members.map((m) => m.id));
  const suggestions = directory.filter((u) => !memberIds.has(u.id) && addName && (u.username + u.displayName).toLowerCase().includes(addName.toLowerCase())).slice(0, 5);

  return (
    <Sheet title={isDirect ? 'แชทส่วนตัว' : 'ข้อมูลช่อง'} onClose={onClose}>
      <div className="space-y-5">
        {!isDirect && (detail.inviteCode || detail.requests.length > 0) && (
          <div className="space-y-2">
            {detail.inviteCode && (
              <button onClick={() => setShowQr(true)} className={`${btnGhost} w-full`}>
                <QrCodeIcon className="w-4 h-4" /> QR / ลิงก์เชิญเข้ากลุ่ม
              </button>
            )}
            {detail.requests.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">คำขอเข้ากลุ่ม ({detail.requests.length})</p>
                {detail.requests.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Avatar clickable name={r.user.displayName} userId={r.user.id} src={r.user.avatar} size="sm" />
                    <span className="flex-1 min-w-0 text-sm truncate">{r.user.displayName}</span>
                    <button onClick={() => act(() => api.post(`/api/requests/${r.id}/reject`))} className="text-xs px-2 py-1 rounded border dark:border-slate-700 text-red-600">ปฏิเสธ</button>
                    <button onClick={() => act(() => api.post(`/api/requests/${r.id}/approve`), 'รับเข้ากลุ่มแล้ว')} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white">รับเข้า</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isDirect && channel.orgId && <p className="text-xs text-slate-500 flex items-center gap-1"><Building2Icon className="w-3.5 h-3.5" /> ช่องขององค์กร {channel.orgName}</p>}

        {!isDirect && (
          <AvatarEditor
            name={channel.name}
            id={channel.id}
            src={channel.avatar}
            title="รูปประจำช่อง"
            canEdit={canManage}
            onSave={async (blob) => { await api.upload(`/api/channels/${channelId}/avatar`, blob); load(); }}
            onRemove={async () => { await api.del(`/api/channels/${channelId}/avatar`); load(); }}
          />
        )}

        {!isDirect && (canManage ? (
          <form
            className="space-y-2"
            onSubmit={(e) => { e.preventDefault(); act(() => api.patch(`/api/channels/${channelId}`, { name, description }), 'บันทึกแล้ว'); }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputCls} aria-label="ชื่อช่อง" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} placeholder="คำอธิบายช่อง" className={inputCls} />
            <button className={btnPrimary}>บันทึก</button>
          </form>
        ) : (
          <div>
            <p className="text-lg font-semibold">{channel.name}</p>
            {channel.description && <p className="text-sm text-slate-500">{channel.description}</p>}
          </div>
        ))}

        {!isDirect && canManage && (
          <div className="divide-y dark:divide-slate-800 border-y dark:border-slate-800">
            <Toggle
              label="ช่องส่วนตัว"
              hint={channel.orgId ? 'คนในองค์กรต้องสแกน QR แล้วรอผู้ดูแลกดรับ' : 'เข้าได้ด้วย QR/ลิงก์เชิญ หรือผู้ดูแลเพิ่มให้เท่านั้น'}
              checked={channel.visibility === 'private'}
              onChange={(v) => act(() => api.patch(`/api/channels/${channelId}`, { visibility: v ? 'private' : 'open' }))}
            />
            {elevated && (channel.orgId || me?.role === 'superadmin') && (
              <Toggle
                label={channel.orgId ? 'ห้องรวมขององค์กร' : 'เข้าร่วมอัตโนมัติเมื่อสมัครสมาชิก'}
                hint={channel.orgId ? 'สมาชิกองค์กรทุกคน (รวมถึงคนที่เข้าใหม่) จะถูกเพิ่มเข้าช่องนี้อัตโนมัติ' : 'ผู้ใช้ที่สมัครใหม่ทุกคนจะเป็นสมาชิกห้องนี้ทันที'}
                checked={channel.isDefault}
                onChange={(v) => act(() => api.patch(`/api/channels/${channelId}`, { isDefault: v }))}
              />
            )}
            {elevated && (
              <Toggle
                label="ช่องฉุกเฉิน (รับ SOS)"
                hint="SOS จะถูกส่งเข้าช่องนี้พร้อมเสียงสดและพิกัด"
                checked={channel.emergency}
                onChange={(v) => act(() => api.patch(`/api/channels/${channelId}`, { emergency: v }))}
              />
            )}
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold mb-2">สมาชิก ({members.length})</h3>
          {canManage && !isDirect && (
            <div className="relative mb-3">
              <div className="flex gap-2">
                <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="เพิ่มสมาชิกด้วยชื่อผู้ใช้" className={inputCls} />
                <select value={addRole} onChange={(e) => setAddRole(e.target.value as MemberRole)} className={`${inputCls} w-auto`}>
                  <option value="member">สมาชิก</option>
                  <option value="moderator">ผู้ดูแลช่อง</option>
                  <option value="listener">ฟังอย่างเดียว</option>
                </select>
                <button
                  className={btnPrimary}
                  aria-label="เพิ่มสมาชิก"
                  onClick={() => act(async () => { await api.post(`/api/channels/${channelId}/members`, { username: addName, role: addRole }); setAddName(''); }, 'เพิ่มสมาชิกแล้ว')}
                >
                  <UserPlusIcon className="w-4 h-4" />
                </button>
              </div>
              {suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
                  {suggestions.map((u) => (
                    <button key={u.id} onClick={() => setAddName(u.username)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
                      {u.displayName} <span className="text-slate-400">@{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <ul className="divide-y dark:divide-slate-800">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <Avatar clickable name={m.displayName} userId={m.id} src={m.avatar} size="sm" status={online[m.id] ?? null} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{m.displayName}{m.id === me?.id && ' (คุณ)'}</span>
                  <span className="block text-xs text-slate-500">@{m.username}</span>
                </span>
                {canManage && !isDirect && m.id !== me?.id && (m.memberRole !== 'owner' || isOwner) ? (
                  <>
                    <select
                      value={m.memberRole}
                      onChange={(e) => act(() => api.patch(`/api/channels/${channelId}/members/${m.id}`, { role: e.target.value }))}
                      className="text-xs rounded border dark:border-slate-700 bg-transparent px-1 py-1"
                    >
                      {(Object.keys(ROLE_LABEL) as MemberRole[]).filter((r) => r !== 'owner' || isOwner).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    <button
                      onClick={() => confirm(`นำ ${m.displayName} ออกจากช่อง?`) && act(() => api.del(`/api/channels/${channelId}/members/${m.id}`))}
                      className="p-1 text-slate-400 hover:text-red-600"
                      aria-label="นำออก"
                    >
                      <Trash2Icon className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  !isDirect && <Badge tone={m.memberRole === 'owner' ? 'green' : m.memberRole === 'listener' ? 'amber' : 'slate'}>{ROLE_LABEL[m.memberRole]}</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>

        {!isDirect && (me?.role === 'superadmin' || (detail.isOrgAdmin && !!channel.orgId)) && (
          <div className="rounded-xl border border-red-200 dark:border-red-500/30 p-3 space-y-2">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">ล้างข้อความในช่อง</p>
            <p className="text-xs text-slate-500">ลบข้อความ เสียง รูป และตำแหน่งที่ส่งในช่องนี้ถาวร{channel.emergency ? ' (รวมประวัติ SOS ที่ปิดเหตุแล้ว)' : ''} — กู้คืนไม่ได้</p>
            <div className="flex flex-wrap gap-1.5">
              {([['เก่ากว่า 1 วัน', 1], ['เก่ากว่า 7 วัน', 7], ['เก่ากว่า 30 วัน', 30], ['ทั้งหมด', 0]] as const).map(([label, days]) => (
                <button
                  key={label}
                  onClick={() => confirm(`ลบข้อความ${days ? `ที่เก่ากว่า ${days} วัน` : 'ทั้งหมด'}ในช่อง "${channel.name}"?`) && act(async () => {
                    const r = await api.post<{ deleted: number }>(`/api/channels/${channelId}/purge`, { before: days ? Date.now() - days * 86400000 : undefined, alerts: true });
                    store.toast(`ลบแล้ว ${r.deleted} ข้อความ`);
                  })}
                  className={`text-xs px-2.5 py-1.5 rounded-lg ${days ? 'border border-red-300 dark:border-red-500/40 text-red-600' : 'bg-red-600 text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isDirect && (
          <div className="flex flex-wrap gap-2 pt-2 border-t dark:border-slate-800">
            {mine && (
              <button
                className={btnGhost}
                onClick={() => confirm('ออกจากช่องนี้?') && act(async () => {
                  await api.post(`/api/channels/${channelId}/leave`);
                  onClose();
                  navigate('/');
                })}
              >
                <LogOutIcon className="w-4 h-4" /> ออกจากช่อง
              </button>
            )}
            {isOwner && (
              <button
                className={btnDanger}
                onClick={() => confirm(`ลบช่อง "${channel.name}" และประวัติทั้งหมด?`) && act(async () => {
                  await api.del(`/api/channels/${channelId}`);
                  onClose();
                  navigate('/');
                })}
              >
                <Trash2Icon className="w-4 h-4" /> ลบช่อง
              </button>
            )}
          </div>
        )}
      </div>
      {showQr && detail.inviteCode && (
        <QrShareSheet
          title="QR เชิญเข้ากลุ่ม"
          code={detail.inviteCode}
          avatar={{ name: channel.name, id: channel.id, src: channel.avatar }}
          subtitle={channel.orgName ? `กลุ่มขององค์กร ${channel.orgName}` : 'กลุ่มสาธารณะ'}
          hint={channel.orgId && channel.visibility === 'private' ? 'คนในองค์กรสแกนแล้วต้องรอผู้ดูแลกดรับ' : channel.orgId ? 'เฉพาะสมาชิกองค์กรสแกนเข้าได้' : 'ใครสแกนก็เข้ากลุ่มได้ทันที'}
          onReset={canManage ? async () => { await api.post(`/api/channels/${channelId}/invite/reset`); load(); } : undefined}
          onClose={() => setShowQr(false)}
        />
      )}
    </Sheet>
  );
};

export default ChannelInfo;
