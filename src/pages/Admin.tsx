// คอนโซล Super admin — องค์กรทั้งหมด (อนุมัติ/ระงับ), ผู้ใช้ทั้งหมด, ช่องทั้งหมด, บันทึกการใช้งาน
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2Icon, CheckIcon, GlobeIcon, KeyRoundIcon, LockIcon, SearchIcon, SirenIcon, Trash2Icon, UserPlusIcon } from 'lucide-react';
import { api, Org, OrgRole, User } from '../lib/api';
import { store, useStore } from '../lib/store';
import { Avatar, Badge, btnPrimary, card, inputCls, PageHeader, timeAgo } from '../components/ui';
import { AuditTable, RequestList, SimpleForm } from './OrgConsole';
import AppSettings from '../components/AppSettings';

interface AdminUser extends User {
  disabled: boolean; createdAt: number; lastSeen: number | null; online: boolean;
  org: { id: number; name: string; status: 'pending' | 'active' | null; role: OrgRole } | null;
}
interface AuditEntry { id: number; username: string | null; action: string; detail: string | null; ip: string | null; orgName: string | null; createdAt: number }
interface Stats { users: number; online: number; orgs: number; pendingOrgs: number; channels: number; messages24h: number; openAlerts: number }

export const ACTION_LABEL: Record<string, string> = {
  login: 'เข้าสู่ระบบ', 'login-failed': 'เข้าสู่ระบบไม่สำเร็จ', register: 'สมัครสมาชิก', 'password-change': 'เปลี่ยนรหัสผ่าน',
  'channel-create': 'สร้างช่อง', 'channel-update': 'แก้ไขช่อง', 'channel-delete': 'ลบช่อง', 'channel-join': 'เข้ากลุ่ม',
  'channel-join-request': 'ขอเข้ากลุ่ม', 'channel-invite-reset': 'เปลี่ยนรหัสเชิญกลุ่ม', 'member-add': 'เพิ่มสมาชิกช่อง',
  'member-role': 'เปลี่ยนบทบาทในช่อง', 'member-remove': 'นำสมาชิกออกจากช่อง', 'message-delete': 'ลบข้อความ', sos: 'ส่ง SOS',
  'sos-ack': 'รับเรื่อง SOS', 'sos-resolve': 'ปิดเหตุ SOS', 'vault-export': 'ส่งออกคลังข้อความ', 'user-create': 'สร้างผู้ใช้',
  'user-update': 'แก้ไขผู้ใช้', 'user-delete': 'ลบผู้ใช้', 'friend-add': 'เพิ่มเพื่อน', 'org-create-request': 'ขอเปิดองค์กร',
  'org-join-request': 'ขอเข้าองค์กร', 'org-leave': 'ออกจากองค์กร', 'org-update': 'แก้ไของค์กร', 'org-code-reset': 'เปลี่ยนรหัสองค์กร',
  'org-member-add': 'เพิ่มสมาชิกองค์กร', 'org-member-update': 'แก้ไขสมาชิกองค์กร', 'org-member-remove': 'นำออกจากองค์กร',
  'request-approve': 'อนุมัติคำขอ', 'app-settings': 'ตั้งค่าแอป', 'channel-purge': 'ล้างข้อความในช่อง', 'message-bulk-delete': 'ลบหลายข้อความ', 'vault-purge': 'ลบจากคลังข้อความ', 'request-reject': 'ปฏิเสธคำขอ', 'org-admin-update': 'Super admin แก้ไของค์กร', 'org-delete': 'ลบองค์กร',
};
const ORG_STATUS: Record<Org['status'], [string, 'amber' | 'green' | 'red' | 'slate']> = {
  pending: ['รออนุมัติ', 'amber'], active: ['ใช้งาน', 'green'], suspended: ['ระงับ', 'red'], rejected: ['ไม่อนุมัติ', 'slate'],
};

const Admin: React.FC = () => {
  const me = useStore((s) => s.me);
  const channels = useStore((s) => s.channels);
  const requests = useStore((s) => s.requests);
  const navigate = useNavigate();
  const [tab, setTab] = useState<'orgs' | 'users' | 'channels' | 'requests' | 'audit' | 'app'>('orgs');
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);
  const [assignFor, setAssignFor] = useState<AdminUser | null>(null);

  const load = useCallback(() => {
    api.get<{ orgs: Org[] }>('/api/admin/orgs').then((r) => setOrgs(r.orgs)).catch(() => {});
    api.get<{ users: AdminUser[] }>('/api/admin/users').then((r) => setUsers(r.users)).catch(() => {});
    api.get<Stats>('/api/admin/stats').then(setStats).catch(() => {});
    api.get<{ entries: AuditEntry[] }>('/api/admin/audit?limit=300').then((r) => setAudit(r.entries)).catch(() => {});
  }, []);
  useEffect(load, [load, requests.length]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) store.toast(ok);
      load();
      store.loadRequests();
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  const filteredUsers = useMemo(() => {
    const ql = q.toLowerCase();
    return users.filter((u) => !q || (u.username + u.displayName + (u.org?.name || '')).toLowerCase().includes(ql));
  }, [users, q]);
  const groupChannels = channels.filter((c) => c.type === 'channel');
  const pendingOrgs = orgs.filter((o) => o.status === 'pending').length;
  const tabs = [
    ['orgs', `องค์กร${pendingOrgs ? ` (${pendingOrgs} รอ)` : ''}`], ['users', `ผู้ใช้ (${users.length})`], ['channels', 'ช่องทั้งหมด'],
    ['requests', `คำขอ${requests.length ? ` (${requests.length})` : ''}`], ['audit', 'บันทึก'], ['app', 'ตั้งค่าแอป'],
  ] as const;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <PageHeader title="Super admin" />
      <div className="p-4 max-w-5xl mx-auto space-y-4">
        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {([['ผู้ใช้', stats.users], ['ออนไลน์', stats.online], ['องค์กร', stats.orgs], ['ช่อง', stats.channels], ['ข้อความ 24 ชม.', stats.messages24h], ['SOS ค้าง', stats.openAlerts]] as const).map(([l, v]) => (
              <div key={l} className={`${card} p-3`}>
                <p className="text-[11px] text-slate-500">{l}</p>
                <p className="text-xl font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1 p-1 rounded-lg bg-slate-200/60 dark:bg-slate-800 text-sm overflow-x-auto">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap ${tab === k ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>

        {tab === 'orgs' && (
          <div className="space-y-2">
            {orgs.length === 0 && <p className={`${card} p-6 text-center text-sm text-slate-400`}>ยังไม่มีองค์กร</p>}
            {orgs.map((o) => (
              <div key={o.id} className={`${card} p-3 flex flex-wrap items-center gap-3 ${o.status === 'pending' ? 'ring-2 ring-amber-400' : ''}`}>
                <Avatar name={o.name} id={o.id} src={o.avatar} />
                <div className="flex-1 min-w-[12rem]">
                  <p className="font-semibold flex items-center gap-2">{o.name} <Badge tone={ORG_STATUS[o.status][1]}>{ORG_STATUS[o.status][0]}</Badge></p>
                  <p className="text-xs text-slate-500">
                    สมาชิก {o.members} · ช่อง {o.channels} · รหัส <span className="font-mono">{o.code}</span>
                    {o.createdBy && <> · ขอโดย {o.createdBy.displayName}</>} · {timeAgo(o.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-sm">
                  {o.status === 'pending' && (
                    <>
                      <button onClick={() => act(() => api.patch(`/api/admin/orgs/${o.id}`, { status: 'active' }), 'อนุมัติองค์กรแล้ว')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white"><CheckIcon className="w-4 h-4" /> อนุมัติ</button>
                      <button onClick={() => act(() => api.patch(`/api/admin/orgs/${o.id}`, { status: 'rejected' }), 'ไม่อนุมัติ')} className="px-3 py-1.5 rounded-lg border dark:border-slate-700 text-red-600">ไม่อนุมัติ</button>
                    </>
                  )}
                  {o.status === 'active' && (
                    <>
                      <button onClick={() => navigate(`/org?orgId=${o.id}`)} className="px-3 py-1.5 rounded-lg border dark:border-slate-700">จัดการ</button>
                      <button onClick={() => confirm(`ระงับ ${o.name}? สมาชิกจะใช้ช่องขององค์กรไม่ได้`) && act(() => api.patch(`/api/admin/orgs/${o.id}`, { status: 'suspended' }))} className="px-3 py-1.5 rounded-lg border dark:border-slate-700 text-amber-600">ระงับ</button>
                    </>
                  )}
                  {(o.status === 'suspended' || o.status === 'rejected') && (
                    <button onClick={() => act(() => api.patch(`/api/admin/orgs/${o.id}`, { status: 'active' }), 'เปิดใช้งานแล้ว')} className="px-3 py-1.5 rounded-lg border dark:border-slate-700 text-emerald-600">เปิดใช้งาน</button>
                  )}
                  <button onClick={() => confirm(`ลบองค์กร "${o.name}" พร้อมช่องและข้อความทั้งหมด? (บัญชีสมาชิกยังอยู่)`) && act(() => api.del(`/api/admin/orgs/${o.id}`), 'ลบองค์กรแล้ว')} className="p-1.5 text-slate-400 hover:text-red-600" aria-label="ลบองค์กร">
                    <Trash2Icon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'users' && (
          <div className={`${card} overflow-hidden`}>
            <div className="flex flex-wrap items-center gap-2 p-3 border-b dark:border-slate-800">
              <label className="relative flex-1 min-w-[12rem]">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / องค์กร" className={`${inputCls} pl-9`} />
              </label>
              <button onClick={() => setCreating(true)} className={btnPrimary}><UserPlusIcon className="w-4 h-4" /> เพิ่มผู้ใช้</button>
            </div>
            <ul className="divide-y dark:divide-slate-800">
              {filteredUsers.map((u) => (
                <li key={u.id} className={`flex flex-wrap items-center gap-3 p-3 ${u.disabled ? 'opacity-60' : ''}`}>
                  <Avatar clickable name={u.displayName} userId={u.id} src={u.avatar} size="sm" status={u.online ? u.status : null} />
                  <span className="flex-1 min-w-[10rem]">
                    <span className="block text-sm font-medium">
                      {u.displayName} <span className="text-slate-400 font-normal">@{u.username}</span>
                      {u.role === 'superadmin' && <> <Badge tone="red">Super admin</Badge></>}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {u.org ? <>{u.org.name} · {u.org.status === 'pending' ? 'รออนุมัติ' : u.org.role === 'admin' ? 'แอดมินองค์กร' : u.org.role === 'dispatcher' ? 'ศูนย์สั่งการ' : 'สมาชิก'}</> : 'บุคคลทั่วไป'}
                      {' · '}{u.online ? 'ออนไลน์' : u.lastSeen ? timeAgo(u.lastSeen) : 'ยังไม่เคยออนไลน์'}
                    </span>
                  </span>
                  {u.id !== me?.id && (
                    <span className="flex flex-wrap gap-1 text-xs">
                      <button onClick={() => setAssignFor(u)} className="px-2 py-1 rounded border dark:border-slate-700 flex items-center gap-1"><Building2Icon className="w-3.5 h-3.5" /> องค์กร</button>
                      <button onClick={() => act(() => api.patch(`/api/admin/users/${u.id}`, { role: u.role === 'superadmin' ? 'user' : 'superadmin' }))} className="px-2 py-1 rounded border dark:border-slate-700">
                        {u.role === 'superadmin' ? 'ถอด Super' : 'ตั้งเป็น Super'}
                      </button>
                      <button onClick={() => act(() => api.patch(`/api/admin/users/${u.id}`, { disabled: !u.disabled }))} className="px-2 py-1 rounded border dark:border-slate-700">{u.disabled ? 'เปิดใช้' : 'ระงับ'}</button>
                      <button onClick={() => setResetFor(u)} className="p-1.5 text-slate-400 hover:text-slate-700" aria-label="ตั้งรหัสผ่านใหม่"><KeyRoundIcon className="w-4 h-4" /></button>
                      <button onClick={() => confirm(`ลบผู้ใช้ ${u.username}?`) && act(() => api.del(`/api/admin/users/${u.id}`), 'ลบแล้ว')} className="p-1.5 text-slate-400 hover:text-red-600" aria-label="ลบผู้ใช้"><Trash2Icon className="w-4 h-4" /></button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'channels' && (
          <div className={`${card} overflow-hidden`}>
            <ul className="divide-y dark:divide-slate-800">
              {groupChannels.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Avatar name={c.name} id={c.id} src={c.avatar} size="sm" />
                  <button onClick={() => navigate(`/c/${c.id}`)} className="flex-1 min-w-[10rem] text-left">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {c.emergency && <SirenIcon className="w-4 h-4 text-red-600" />}{c.name}
                      {c.visibility === 'private' ? <LockIcon className="w-3.5 h-3.5 text-slate-400" /> : !c.orgId && <GlobeIcon className="w-3.5 h-3.5 text-slate-400" />}
                    </span>
                    <span className="block text-xs text-slate-500">{c.orgName || 'สาธารณะ'} · สมาชิก {c.members} · ออนไลน์ {c.online}</span>
                  </button>
                  {!c.orgId && (
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={c.emergency} onChange={(e) => act(() => api.patch(`/api/channels/${c.id}`, { emergency: e.target.checked }))} />
                      ฉุกเฉินสาธารณะ
                    </label>
                  )}
                  <button onClick={() => confirm(`ลบช่อง "${c.name}" และประวัติทั้งหมด?`) && act(() => api.del(`/api/channels/${c.id}`), 'ลบช่องแล้ว')} className="p-1.5 text-slate-400 hover:text-red-600" aria-label="ลบช่อง">
                    <Trash2Icon className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'requests' && <RequestList requests={requests} onAct={act} empty="ไม่มีคำขอค้าง" />}
        {tab === 'audit' && <AuditTable entries={audit} showOrg />}
        {tab === 'app' && <AppSettings />}
      </div>

      {creating && (
        <SimpleForm
          title="เพิ่มผู้ใช้"
          fields={[{ key: 'username', placeholder: 'ชื่อผู้ใช้' }, { key: 'password', placeholder: 'รหัสผ่าน (อย่างน้อย 6 ตัว)' }]}
          select={{ key: 'orgId', options: { '': 'บุคคลทั่วไป', ...Object.fromEntries(orgs.filter((o) => o.status === 'active').map((o) => [String(o.id), `สมาชิก ${o.name}`])) }, value: '' }}
          onClose={() => setCreating(false)}
          onSubmit={(v) => act(async () => { await api.post('/api/admin/users', { ...v, orgId: v.orgId ? Number(v.orgId) : null }); setCreating(false); }, 'สร้างผู้ใช้แล้ว')}
        />
      )}
      {resetFor && (
        <SimpleForm
          title={`ตั้งรหัสผ่านใหม่ให้ ${resetFor.username}`}
          fields={[{ key: 'password', placeholder: 'รหัสผ่านใหม่' }]}
          onClose={() => setResetFor(null)}
          onSubmit={(v) => act(async () => { await api.patch(`/api/admin/users/${resetFor.id}`, v); setResetFor(null); }, 'ตั้งรหัสผ่านใหม่แล้ว')}
        />
      )}
      {assignFor && (
        <SimpleForm
          title={`กำหนดองค์กรให้ ${assignFor.displayName}`}
          fields={[]}
          select={{
            key: 'target',
            options: {
              '': 'บุคคลทั่วไป (ไม่สังกัดองค์กร)',
              ...Object.fromEntries(orgs.filter((o) => o.status === 'active').flatMap((o) => [
                [`${o.id}:member`, `${o.name} — สมาชิก`], [`${o.id}:dispatcher`, `${o.name} — ศูนย์สั่งการ`], [`${o.id}:admin`, `${o.name} — แอดมินองค์กร`],
              ])),
            },
            value: assignFor.org ? `${assignFor.org.id}:${assignFor.org.role}` : '',
          }}
          onClose={() => setAssignFor(null)}
          onSubmit={(v) => act(async () => {
            const [orgId, orgRole] = (v.target || '').split(':');
            await api.patch(`/api/admin/users/${assignFor.id}`, { orgId: orgId ? Number(orgId) : null, orgRole });
            setAssignFor(null);
          }, 'บันทึกแล้ว')}
        />
      )}
    </div>
  );
};

export default Admin;
