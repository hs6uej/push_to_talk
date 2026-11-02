// คอนโซลองค์กร — คำขอ, สมาชิก, ช่อง (ห้องรวม/ฉุกเฉิน), ตั้งค่า, บันทึกการใช้งาน
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckIcon, LockIcon, PlusIcon, QrCodeIcon, SirenIcon, StarIcon, Trash2Icon, UserPlusIcon, XIcon } from 'lucide-react';
import { api, isSuper, JoinRequest, Org, OrgRole, User } from '../lib/api';
import { store, useStore } from '../lib/store';
import AvatarEditor from '../components/AvatarEditor';
import { QrShareSheet } from '../components/Qr';
import { Avatar, Badge, btnPrimary, card, inputCls, PageHeader, Sheet, timeAgo, Toggle } from '../components/ui';
import { ACTION_LABEL } from './Admin';

interface Member extends User { orgRole: OrgRole; disabled: boolean; online: boolean; lastSeen: number | null }
interface AuditEntry { id: number; username: string | null; action: string; detail: string | null; ip: string | null; createdAt: number }
const ORG_ROLE_LABEL: Record<OrgRole, string> = { admin: 'แอดมินองค์กร', dispatcher: 'ศูนย์สั่งการ', member: 'สมาชิก' };

const OrgConsole: React.FC = () => {
  const me = useStore((s) => s.me);
  const channels = useStore((s) => s.channels);
  const allRequests = useStore((s) => s.requests);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orgParam = params.get('orgId');
  const q = orgParam ? `?orgId=${orgParam}` : '';
  const [tab, setTab] = useState<'requests' | 'members' | 'channels' | 'settings' | 'audit'>('requests');
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [showQr, setShowQr] = useState(false);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<{ org: Org }>(`/api/org${q}`).then((r) => { setOrg(r.org); setError(null); }).catch((e) => setError(e.message));
    api.get<{ members: Member[] }>(`/api/org/members${q}`).then((r) => setMembers(r.members)).catch(() => {});
    api.get<{ entries: AuditEntry[] }>(`/api/org/audit${q}`).then((r) => setAudit(r.entries)).catch(() => {});
  }, [q]);
  useEffect(load, [load, allRequests.length]);

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

  if (error) return <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500 p-6 text-center"><p>{error}</p><Link to="/settings" className="text-emerald-600">ไปหน้าตั้งค่าองค์กร</Link></div>;
  if (!org) return <div className="flex-1 flex items-center justify-center text-slate-400">กำลังโหลด...</div>;

  const requests = allRequests.filter((r) => r.orgId === org.id);
  const orgChannels = channels.filter((c) => c.orgId === org.id && c.type === 'channel');
  const withOrg = (body: object) => (orgParam ? { ...body, orgId: Number(orgParam) } : body);
  const tabs = [
    ['requests', `คำขอ${requests.length ? ` (${requests.length})` : ''}`], ['members', `สมาชิก (${members.length})`], ['channels', 'ช่อง'], ['settings', 'ตั้งค่า'], ['audit', 'บันทึก'],
  ] as const;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <PageHeader title={org.name} left={<Avatar name={org.name} id={org.id} src={org.avatar} size="sm" />}>
        <button onClick={() => setShowQr(true)} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white"><QrCodeIcon className="w-4 h-4" /> QR เชิญเข้าองค์กร</button>
      </PageHeader>
      <div className="p-4 max-w-4xl mx-auto space-y-4">
        {isSuper(me) && orgParam && <p className="text-xs text-amber-600">กำลังจัดการในฐานะ Super admin</p>}
        <div className="flex gap-1 p-1 rounded-lg bg-slate-200/60 dark:bg-slate-800 text-sm overflow-x-auto">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap ${tab === k ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>

        {tab === 'requests' && (
          <RequestList requests={requests} onAct={act} empty="ไม่มีคำขอรออนุมัติ — แชร์ QR องค์กรให้คนที่จะเข้าร่วม" />
        )}

        {tab === 'members' && (
          <div className={`${card} overflow-hidden`}>
            <div className="flex justify-end p-3 border-b dark:border-slate-800">
              <button onClick={() => setAdding(true)} className={btnPrimary}><UserPlusIcon className="w-4 h-4" /> เพิ่มสมาชิก</button>
            </div>
            <ul className="divide-y dark:divide-slate-800">
              {members.map((u) => (
                <li key={u.id} className={`flex flex-wrap items-center gap-3 p-3 ${u.disabled ? 'opacity-60' : ''}`}>
                  <Avatar clickable name={u.displayName} userId={u.id} src={u.avatar} size="sm" status={u.online ? u.status : null} />
                  <span className="flex-1 min-w-[9rem]">
                    <span className="block text-sm font-medium">{u.displayName} <span className="text-slate-400 font-normal">@{u.username}</span></span>
                    <span className="block text-xs text-slate-500">{u.online ? 'ออนไลน์อยู่' : u.lastSeen ? `ล่าสุด ${timeAgo(u.lastSeen)}` : 'ยังไม่เคยออนไลน์'}{u.disabled && ' · ระงับ'}</span>
                  </span>
                  <select
                    value={u.orgRole}
                    onChange={(e) => act(() => api.patch(`/api/org/members/${u.id}${q}`, { orgRole: e.target.value }))}
                    disabled={u.id === me?.id && !isSuper(me)}
                    className="text-sm rounded-lg border dark:border-slate-700 bg-transparent px-2 py-1"
                  >
                    {(Object.keys(ORG_ROLE_LABEL) as OrgRole[]).map((r) => <option key={r} value={r}>{ORG_ROLE_LABEL[r]}</option>)}
                  </select>
                  {u.id !== me?.id && (
                    <span className="flex gap-1">
                      <button onClick={() => act(() => api.patch(`/api/org/members/${u.id}${q}`, { disabled: !u.disabled }))} className="text-xs px-2 py-1 rounded border dark:border-slate-700">{u.disabled ? 'เปิดใช้' : 'ระงับ'}</button>
                      <button onClick={() => confirm(`นำ ${u.displayName} ออกจากองค์กร?`) && act(() => api.del(`/api/org/members/${u.id}${q}`), 'นำออกแล้ว')} className="p-1.5 text-slate-400 hover:text-red-600" aria-label="นำออกจากองค์กร">
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'channels' && (
          <div className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between gap-2 p-3 border-b dark:border-slate-800">
              <span className="text-xs text-slate-500">⭐ ห้องรวม = สมาชิกใหม่ทุกคนเข้าอัตโนมัติ · 🚨 ฉุกเฉิน = รับ SOS ขององค์กร</span>
              <button onClick={() => setCreating(true)} className={btnPrimary}><PlusIcon className="w-4 h-4" /> สร้างช่อง</button>
            </div>
            <ul className="divide-y dark:divide-slate-800">
              {orgChannels.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Avatar name={c.name} id={c.id} src={c.avatar} size="sm" />
                  <button onClick={() => navigate(`/c/${c.id}`)} className="flex-1 min-w-[9rem] text-left">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {c.name} {c.visibility === 'private' && <LockIcon className="w-3.5 h-3.5 text-slate-400" />}
                    </span>
                    <span className="block text-xs text-slate-500">สมาชิก {c.members} · {c.visibility === 'private' ? 'ส่วนตัว (ต้องกดรับ)' : 'ทุกคนในองค์กรเข้าได้'}</span>
                  </button>
                  <button
                    onClick={() => act(() => api.patch(`/api/channels/${c.id}`, { isDefault: !c.isDefault }))}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${c.isDefault ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' : 'border dark:border-slate-700 text-slate-500'}`}
                    title="ห้องรวม: สมาชิกทุกคนเข้าอัตโนมัติ"
                  >
                    <StarIcon className="w-3.5 h-3.5" /> ห้องรวม
                  </button>
                  <button
                    onClick={() => act(() => api.patch(`/api/channels/${c.id}`, { emergency: !c.emergency }))}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${c.emergency ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' : 'border dark:border-slate-700 text-slate-500'}`}
                    title="ช่องรับ SOS ขององค์กร"
                  >
                    <SirenIcon className="w-3.5 h-3.5" /> ฉุกเฉิน
                  </button>
                  <button onClick={() => confirm(`ลบช่อง "${c.name}" และประวัติทั้งหมด?`) && act(() => api.del(`/api/channels/${c.id}`), 'ลบช่องแล้ว')} className="p-1.5 text-slate-400 hover:text-red-600" aria-label="ลบช่อง">
                    <Trash2Icon className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'settings' && <OrgSettings org={org} q={q} onChange={load} />}

        {tab === 'audit' && <AuditTable entries={audit} />}
      </div>

      {showQr && org.code && (
        <QrShareSheet
          title="QR เชิญเข้าองค์กร"
          subtitle="สแกนแล้วส่งคำขอเข้าองค์กร แอดมินต้องกดรับ"
          code={org.code}
          avatar={{ name: org.name, id: org.id, src: org.avatar }}
          hint="ใช้ตอนสมัครสมาชิก (เลือก 'เข้าร่วมองค์กร') หรือสแกนจากหน้ารายชื่อ"
          onReset={async () => { await api.post(`/api/org/code/reset${q}`); load(); }}
          onClose={() => setShowQr(false)}
        />
      )}
      {adding && (
        <SimpleForm
          title="เพิ่มสมาชิกเข้าองค์กร"
          fields={[{ key: 'username', placeholder: 'ชื่อผู้ใช้ (ต้องสมัครไว้แล้ว และยังไม่สังกัดองค์กรอื่น)' }]}
          select={{ key: 'orgRole', options: ORG_ROLE_LABEL, value: 'member' }}
          onClose={() => setAdding(false)}
          onSubmit={(v) => act(async () => { await api.post(`/api/org/members${q}`, v); setAdding(false); }, 'เพิ่มสมาชิกแล้ว')}
        />
      )}
      {creating && (
        <SimpleForm
          title="สร้างช่องขององค์กร"
          fields={[{ key: 'name', placeholder: 'ชื่อช่อง' }, { key: 'description', placeholder: 'คำอธิบาย (ไม่บังคับ)', optional: true }]}
          select={{ key: 'visibility', options: { org: 'ทุกคนในองค์กรเข้าได้', private: 'ส่วนตัว (ต้องกดรับ/เพิ่มเอง)' }, value: 'org' }}
          onClose={() => setCreating(false)}
          onSubmit={(v) => act(async () => { await api.post('/api/channels', withOrg({ ...v, scope: 'org' })); setCreating(false); }, 'สร้างช่องแล้ว')}
        />
      )}
    </div>
  );
};

const OrgSettings: React.FC<{ org: Org; q: string; onChange: () => void }> = ({ org, q, onChange }) => {
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description);
  const save = async (body: object, ok = 'บันทึกแล้ว') => {
    try {
      await api.patch(`/api/org${q}`, body);
      store.toast(ok);
      onChange();
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };
  return (
    <div className="space-y-4">
      <section className={`${card} p-4 flex flex-col items-center`}>
        <AvatarEditor
          name={org.name}
          id={org.id}
          src={org.avatar}
          title="โลโก้องค์กร"
          onSave={async (blob) => { await api.upload(`/api/org/avatar${q}`, blob); onChange(); }}
          onRemove={async () => { await api.del(`/api/org/avatar${q}`); onChange(); }}
        />
      </section>
      <form onSubmit={(e) => { e.preventDefault(); save({ name, description }); }} className={`${card} p-4 space-y-3`}>
        <label className="block text-sm">ชื่อองค์กร<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${inputCls} mt-1`} /></label>
        <label className="block text-sm">คำอธิบาย<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} className={`${inputCls} mt-1`} /></label>
        <button className={btnPrimary}>บันทึก</button>
      </form>
      <section className={`${card} px-4`}>
        <Toggle
          label="อนุญาตให้สมาชิกใช้โลกภายนอก"
          hint="เข้ากลุ่มสาธารณะ เพิ่มเพื่อน และคุย 1:1 กับคนนอกองค์กรได้ — ปิดแล้วสมาชิกจะถูกนำออกจากกลุ่มสาธารณะทันที"
          checked={org.allowExternal}
          onChange={(v) => save({ allowExternal: v }, v ? 'เปิดการใช้โลกภายนอกแล้ว' : 'ปิดการใช้โลกภายนอกแล้ว')}
        />
      </section>
    </div>
  );
};

export const RequestList: React.FC<{ requests: JoinRequest[]; onAct: (fn: () => Promise<unknown>, ok?: string) => void; empty: string }> = ({ requests, onAct, empty }) => (
  <div className={`${card} overflow-hidden`}>
    {requests.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{empty}</p>}
    <ul className="divide-y dark:divide-slate-800">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
          <Avatar clickable name={r.user.displayName} userId={r.user.id} src={r.user.avatar} size="sm" />
          <span className="flex-1 min-w-[10rem]">
            <span className="block text-sm font-medium">{r.user.displayName} <span className="text-slate-400 font-normal">@{r.user.username}</span></span>
            <span className="block text-xs text-slate-500">
              {r.kind === 'org' ? <Badge tone="sky">ขอเข้าองค์กร{r.orgName ? ` ${r.orgName}` : ''}</Badge> : <Badge tone="amber">ขอเข้ากลุ่ม {r.channelName}</Badge>} · {timeAgo(r.createdAt)}
            </span>
          </span>
          <button onClick={() => onAct(() => api.post(`/api/requests/${r.id}/reject`), 'ปฏิเสธแล้ว')} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border dark:border-slate-700 text-red-600">
            <XIcon className="w-4 h-4" /> ปฏิเสธ
          </button>
          <button onClick={() => onAct(() => api.post(`/api/requests/${r.id}/approve`), 'อนุมัติแล้ว')} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white">
            <CheckIcon className="w-4 h-4" /> รับเข้า
          </button>
        </li>
      ))}
    </ul>
  </div>
);

export const AuditTable: React.FC<{ entries: (AuditEntry & { orgName?: string | null })[]; showOrg?: boolean }> = ({ entries, showOrg }) => (
  <div className={`${card} overflow-x-auto`}>
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50">
        <tr><th className="p-2">เวลา</th>{showOrg && <th className="p-2">องค์กร</th>}<th className="p-2">ผู้ใช้</th><th className="p-2">การกระทำ</th><th className="p-2">รายละเอียด</th><th className="p-2">IP</th></tr>
      </thead>
      <tbody className="divide-y dark:divide-slate-800">
        {entries.map((a) => (
          <tr key={a.id} className={a.action === 'sos' || a.action === 'login-failed' ? 'bg-red-50/60 dark:bg-red-500/5' : ''}>
            <td className="p-2 whitespace-nowrap text-xs text-slate-500">{new Date(a.createdAt).toLocaleString('th-TH')}</td>
            {showOrg && <td className="p-2 text-xs">{a.orgName || '—'}</td>}
            <td className="p-2">{a.username || '—'}</td>
            <td className="p-2 whitespace-nowrap">{ACTION_LABEL[a.action] || a.action}</td>
            <td className="p-2 text-xs text-slate-500 max-w-xs truncate" title={a.detail || ''}>{a.detail}</td>
            <td className="p-2 text-xs text-slate-500">{a.ip}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const SimpleForm: React.FC<{
  title: string;
  fields: { key: string; placeholder: string; optional?: boolean; type?: string }[];
  select?: { key: string; options: Record<string, string>; value: string };
  onSubmit: (values: Record<string, string>) => void;
  onClose: () => void;
}> = ({ title, fields, select, onSubmit, onClose }) => {
  const [values, setValues] = useState<Record<string, string>>(select ? { [select.key]: select.value } : {});
  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(values); }} className="space-y-3">
        {fields.map((f, i) => (
          <input key={f.key} type={f.type || 'text'} autoFocus={i === 0} required={!f.optional} placeholder={f.placeholder} value={values[f.key] || ''}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className={inputCls} />
        ))}
        {select && (
          <select value={values[select.key]} onChange={(e) => setValues({ ...values, [select.key]: e.target.value })} className={inputCls}>
            {Object.entries(select.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        )}
        <button className={`${btnPrimary} w-full`}>ตกลง</button>
      </form>
    </Sheet>
  );
};

export default OrgConsole;
