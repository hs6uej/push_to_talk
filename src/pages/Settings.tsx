import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArchiveIcon, Building2Icon, ChevronRightIcon, HeadsetIcon, LogOutIcon, QrCodeIcon, ShieldIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, isOrgAdmin, isStaff, isSuper } from '../lib/api';
import { speechSupported, store, useStore } from '../lib/store';
import { beep, unlockAudio } from '../lib/audio';
import StatusSwitch from '../components/StatusSwitch';
import AvatarEditor from '../components/AvatarEditor';
import MyOrg from '../components/MyOrg';
import { getUserMode, setUserMode } from '../lib/theme';
import { QrShareSheet } from '../components/Qr';
import { btnGhost, btnPrimary, card, inputCls, PageHeader, Toggle } from '../components/ui';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className={`${card} p-4`}>
    <h2 className="text-sm font-semibold text-slate-500 mb-1">{title}</h2>
    {children}
  </section>
);

const Settings: React.FC = () => {
  const { currentUser, updateProfile, logout, setAvatar, reloadMe } = useAuth();
  const settings = useStore((s) => s.settings);
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showQr, setShowQr] = useState(false);
  const [themePref, setThemePref] = useState(getUserMode());
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');

  if (!currentUser) return null;
  const staff = isStaff(currentUser);

  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      store.toast(ok);
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  const toggleNotifications = async (on: boolean) => {
    if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      setNotifPerm(p);
      if (p !== 'granted') {
        store.toast('เบราว์เซอร์ไม่อนุญาตการแจ้งเตือน', 'error');
        return;
      }
    }
    store.updateSettings({ notifications: on });
  };

  const linkRow = 'flex items-center gap-3 py-3 text-sm font-medium';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <PageHeader title="ตั้งค่า" />
      <div className="p-4 max-w-2xl mx-auto space-y-4 pb-10">
        <section className={`${card} p-5 flex flex-col items-center gap-1 text-center`}>
          <AvatarEditor
            name={currentUser.displayName}
            userId={currentUser.id}
            src={currentUser.avatar}
            title="รูปโปรไฟล์"
            onSave={(blob) => setAvatar(blob)}
            onRemove={() => setAvatar(null)}
          />
          <p className="font-semibold text-lg truncate mt-2">{currentUser.displayName}</p>
          <p className="text-sm text-slate-500">@{currentUser.username}{currentUser.orgName && ` · ${currentUser.orgName}`}</p>
          <button onClick={() => setShowQr(true)} className={`${btnPrimary} mt-3`}><QrCodeIcon className="w-4 h-4" /> QR ของฉัน (ให้เพื่อนสแกน)</button>
        </section>

        <Section title="องค์กรของฉัน"><MyOrg /></Section>

        <Section title="สถานะ">
          <div className="pt-2"><StatusSwitch /></div>
          <p className="text-xs text-slate-500 mt-2">“ไม่ว่าง” = ไม่เล่นเสียงสดจากช่องอื่น ยกเว้นช่องที่เปิดอยู่ (ข้อความยังเก็บในประวัติ)</p>
        </Section>

        {(staff || isOrgAdmin(currentUser)) && (
          <Section title="เครื่องมือ">
            <div className="divide-y dark:divide-slate-800">
              {isOrgAdmin(currentUser) && currentUser.org?.status === 'active' && (
                <Link to="/org" className={linkRow}><Building2Icon className="w-5 h-5" /> <span className="flex-1">จัดการองค์กร</span><ChevronRightIcon className="w-4 h-4 text-slate-400" /></Link>
              )}
              {staff && <Link to="/dispatch" className={linkRow}><HeadsetIcon className="w-5 h-5" /> <span className="flex-1">ศูนย์สั่งการ</span><ChevronRightIcon className="w-4 h-4 text-slate-400" /></Link>}
              {staff && <Link to="/vault" className={linkRow}><ArchiveIcon className="w-5 h-5" /> <span className="flex-1">คลังข้อความ</span><ChevronRightIcon className="w-4 h-4 text-slate-400" /></Link>}
              {isSuper(currentUser) && (
                <Link to="/admin" className={linkRow}><ShieldIcon className="w-5 h-5" /> <span className="flex-1">Super admin</span><ChevronRightIcon className="w-4 h-4 text-slate-400" /></Link>
              )}
            </div>
          </Section>
        )}

        <Section title="การแสดงผล">
          <div className="grid grid-cols-4 gap-2 pt-2">
            {([['', 'ตามแอป'], ['system', 'ตามเครื่อง'], ['light', 'สว่าง'], ['dark', 'มืด']] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => { setUserMode(m); setThemePref(m); }}
                className={`p-2 rounded-lg border text-sm ${themePref === m ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-300 dark:border-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="การพูด (PTT)">
          <div className="grid grid-cols-2 gap-2 py-2">
            {(['hold', 'toggle'] as const).map((m) => (
              <button
                key={m}
                onClick={() => store.updateSettings({ pttMode: m })}
                className={`p-3 rounded-lg border text-left ${settings.pttMode === m ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-300 dark:border-slate-700'}`}
              >
                <span className="block text-sm font-medium">{m === 'hold' ? 'กดค้างเพื่อพูด' : 'แตะเปิด/ปิด'}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{m === 'hold' ? 'เหมือนวิทยุสื่อสาร' : 'สะดวกเวลาพูดยาว'}</span>
              </button>
            ))}
          </div>
          <div className="divide-y dark:divide-slate-800">
            <Toggle
              label="ใช้ปุ่มบนหูฟังบลูทูธ / ปุ่ม media เป็นปุ่ม PTT"
              hint="กดหนึ่งครั้งเริ่มพูด กดอีกครั้งหยุด (ทดลอง — ขึ้นกับอุปกรณ์และเบราว์เซอร์)"
              checked={settings.headsetPtt}
              onChange={(v) => { unlockAudio(); store.updateSettings({ headsetPtt: v }); }}
            />
            <Toggle
              label="ถอดเสียงพูดเป็นข้อความ (ภาษาไทย)"
              hint={speechSupported ? 'ใช้ระบบรู้จำเสียงของเบราว์เซอร์' : 'เบราว์เซอร์นี้ไม่รองรับ (ใช้ Chrome หรือ Edge)'}
              checked={settings.transcribe && speechSupported}
              disabled={!speechSupported}
              onChange={(v) => store.updateSettings({ transcribe: v })}
            />
            <Toggle label="เปิดหน้าจอค้างไว้ขณะอยู่ในช่อง" checked={settings.keepAwake} onChange={(v) => store.updateSettings({ keepAwake: v })} />
          </div>
          <button onClick={async () => { await unlockAudio(); beep('start'); setTimeout(() => beep('end'), 400); }} className={`${btnGhost} mt-2`}>ทดสอบเสียงลำโพง</button>
        </Section>

        <Section title="ตำแหน่งและการแจ้งเตือน">
          <div className="divide-y dark:divide-slate-800">
            <Toggle
              label="แชร์ตำแหน่งให้ทีม"
              hint="ส่งพิกัด แบตเตอรี่ ความเร็ว ให้คนในช่องเดียวกันและศูนย์สั่งการ"
              checked={settings.shareLocation}
              onChange={(v) => store.updateSettings({ shareLocation: v })}
            />
            <Toggle
              label="แจ้งเตือนบนเครื่อง"
              hint={notifPerm === 'denied' ? 'ถูกบล็อกในเบราว์เซอร์ — เปิดสิทธิ์ใน Site settings' : 'ข้อความใหม่เมื่อไม่ได้เปิดหน้าเว็บ และ SOS'}
              checked={settings.notifications && notifPerm === 'granted'}
              onChange={toggleNotifications}
            />
          </div>
        </Section>

        <Section title="โปรไฟล์">
          <form
            className="space-y-3 pt-2"
            onSubmit={(e) => { e.preventDefault(); run(() => updateProfile({ displayName, username }), 'บันทึกโปรไฟล์แล้ว'); }}
          >
            <label className="block text-sm">ชื่อที่แสดง<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className={`${inputCls} mt-1`} /></label>
            <label className="block text-sm">ชื่อผู้ใช้ (ใช้ล็อกอิน)<input value={username} onChange={(e) => setUsername(e.target.value)} className={`${inputCls} mt-1`} /></label>
            <button className={btnPrimary}>บันทึก</button>
          </form>
        </Section>

        <Section title="เปลี่ยนรหัสผ่าน">
          <form
            className="space-y-3 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (pw.next !== pw.confirm) return store.toast('รหัสผ่านใหม่ไม่ตรงกัน', 'error');
              run(async () => {
                await updateProfile({ currentPassword: pw.current, newPassword: pw.next });
                setPw({ current: '', next: '', confirm: '' });
              }, 'เปลี่ยนรหัสผ่านแล้ว');
            }}
          >
            <input type="password" autoComplete="current-password" placeholder="รหัสผ่านปัจจุบัน" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required className={inputCls} />
            <input type="password" autoComplete="new-password" placeholder="รหัสผ่านใหม่" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required className={inputCls} />
            <input type="password" autoComplete="new-password" placeholder="ยืนยันรหัสผ่านใหม่" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required className={inputCls} />
            <button className={btnPrimary}>เปลี่ยนรหัสผ่าน</button>
          </form>
        </Section>

        <button onClick={() => { logout(); navigate('/login'); }} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-red-600 font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <LogOutIcon className="w-5 h-5" /> ออกจากระบบ
        </button>
      </div>
      {showQr && (
        <QrShareSheet
          title="QR ของฉัน"
          code={currentUser.friendCode}
          avatar={{ name: currentUser.displayName, userId: currentUser.id, src: currentUser.avatar }}
          subtitle={`@${currentUser.username}`}
          hint="ให้เพื่อนสแกนด้วยกล้องมือถือหรือปุ่มสแกนในแอป เพื่อเพิ่มเป็นเพื่อนและเริ่มคุย"
          onReset={async () => { await api.post('/api/me/friend-code/reset'); await reloadMe(); }}
          onClose={() => setShowQr(false)}
        />
      )}
    </div>
  );
};

export default Settings;
