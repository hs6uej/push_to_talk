// ตั้งค่าแอป (Super admin): ชื่อ, โลโก้, สีหลัก, โหมดสี, แถบเมนู, การสมัคร, เวลาพูด, SOS, การเก็บข้อมูล
import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, MoonIcon, MonitorIcon, SunIcon } from 'lucide-react';
import { api } from '../lib/api';
import { store } from '../lib/store';
import { AppConfig, BrandColor, COLOR_LABEL, PALETTES, ThemeMode } from '../lib/theme';
import AvatarEditor from './AvatarEditor';
import { btnGhost, btnPrimary, card, inputCls, Toggle } from './ui';

type Settings = AppConfig & { retentionDays: number };

const MODES: [ThemeMode, string, React.FC<{ className?: string }>][] = [['system', 'ตามเครื่อง', MonitorIcon], ['light', 'สว่าง', SunIcon], ['dark', 'มืด', MoonIcon]];
const NAVS: ['dark' | 'brand' | 'light', string, string][] = [['dark', 'เข้ม', 'bg-slate-900'], ['brand', 'สีหลัก', 'bg-emerald-800'], ['light', 'สว่าง', 'bg-white border border-slate-300']];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className={`${card} p-4 space-y-3`}>
    <h3 className="text-sm font-semibold text-slate-500">{title}</h3>
    {children}
  </section>
);

const AppSettings: React.FC = () => {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ settings: Settings }>('/api/admin/settings').then(({ settings }) => { setSaved(settings); setForm(settings); }).catch((e) => store.toast(e.message, 'error'));
  }, []);

  // ออกจากหน้าโดยไม่บันทึก → คืนค่าธีมที่บันทึกไว้
  const savedRef = useRef<Settings | null>(null);
  savedRef.current = saved;
  useEffect(() => () => {
    if (savedRef.current) store.setConfig({ ...store.getState().config, ...savedRef.current });
  }, []);

  if (!form || !saved) return <p className="text-sm text-slate-400">กำลังโหลด...</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v });
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  // พรีวิวสีทันทีโดยยังไม่บันทึก
  const preview = (patch: Partial<Settings>) => {
    const next = { ...form, ...patch };
    setForm(next);
    store.setConfig({ ...store.getState().config, ...next });
  };

  const save = async () => {
    setBusy(true);
    try {
      const { logo, ...body } = form;
      const { settings } = await api.patch<{ settings: Settings }>('/api/admin/settings', body);
      setSaved(settings);
      setForm(settings);
      store.toast('บันทึกการตั้งค่าแอปแล้ว — ทุกคนเห็นทันที');
    } catch (e: any) {
      store.toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setForm(saved);
    store.setConfig({ ...store.getState().config, ...saved });
  };

  const onLogo = (settings: Settings) => {
    setSaved({ ...saved, logo: settings.logo });
    setForm({ ...form, logo: settings.logo });
    store.setConfig({ ...store.getState().config, logo: settings.logo });
  };

  const num = (k: 'maxTalkSeconds' | 'sosTalkSeconds' | 'retentionDays', label: string, hint: string, min: number, max: number) => (
    <label className="block text-sm">
      {label}
      <input type="number" min={min} max={max} value={form[k]} onChange={(e) => set(k, Number(e.target.value))} className={`${inputCls} mt-1 w-32`} />
      <span className="block text-xs text-slate-500 mt-1">{hint}</span>
    </label>
  );

  return (
    <div className="space-y-4 pb-24">
      <Section title="ชื่อและโลโก้">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
          <AvatarEditor
            name={form.shortName}
            id={1}
            src={form.logo}
            title="โลโก้แอป"
            onSave={async (blob) => onLogo((await api.upload<{ settings: Settings }>('/api/admin/settings/logo', blob)).settings)}
            onRemove={async () => onLogo((await api.del<{ settings: Settings }>('/api/admin/settings/logo')).settings)}
          />
          <div className="flex-1 grid gap-3">
            <label className="block text-sm">ชื่อแอป<input value={form.appName} onChange={(e) => preview({ appName: e.target.value })} maxLength={40} className={`${inputCls} mt-1`} /></label>
            <label className="block text-sm">ชื่อสั้น (ใต้ไอคอนบนมือถือ)<input value={form.shortName} onChange={(e) => set('shortName', e.target.value)} maxLength={12} className={`${inputCls} mt-1`} /></label>
            <label className="block text-sm">คำโปรย (หน้าเข้าสู่ระบบ)<input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} maxLength={120} className={`${inputCls} mt-1`} /></label>
            <label className="block text-sm">ช่องทางติดต่อผู้ดูแล (แสดงในหน้าเข้าสู่ระบบ)<input value={form.supportContact} onChange={(e) => set('supportContact', e.target.value)} maxLength={120} placeholder="เช่น โทร 02-xxx-xxxx / LINE @xxx" className={`${inputCls} mt-1`} /></label>
          </div>
        </div>
      </Section>

      <Section title="ธีม">
        <p className="text-sm">สีหลัก</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {(Object.keys(PALETTES) as BrandColor[]).map((c) => (
            <button
              key={c}
              onClick={() => preview({ primaryColor: c })}
              className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs ${form.primaryColor === c ? 'border-slate-900 dark:border-white ring-1 ring-slate-900 dark:ring-white' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: PALETTES[c][5] }}>
                {form.primaryColor === c && <CheckIcon className="w-4 h-4" />}
              </span>
              {COLOR_LABEL[c]}
            </button>
          ))}
        </div>
        <p className="text-sm pt-2">โหมดสีเริ่มต้น <span className="text-xs text-slate-500">(ผู้ใช้เปลี่ยนเองได้ในหน้าตั้งค่า)</span></p>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map(([m, label, Icon]) => (
            <button key={m} onClick={() => preview({ themeMode: m })} className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-sm ${form.themeMode === m ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <p className="text-sm pt-2">แถบเมนูด้านซ้าย (จอใหญ่)</p>
        <div className="grid grid-cols-3 gap-2">
          {NAVS.map(([v, label, swatch]) => (
            <button key={v} onClick={() => preview({ navStyle: v })} className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${form.navStyle === v ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
              <span className={`w-4 h-8 rounded ${swatch}`} /> {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="การสมัครสมาชิก">
        <div className="divide-y dark:divide-slate-800">
          <Toggle label="เปิดให้สมัครสมาชิกเอง" hint="ปิดแล้วต้องให้ Super admin หรือแอดมินองค์กรสร้าง/เพิ่มบัญชีให้" checked={form.allowRegister} onChange={(v) => set('allowRegister', v)} />
          <Toggle label="เปิดให้ขอเปิดองค์กรใหม่" hint="ผู้ใช้ส่งคำขอเปิดองค์กร แล้วรอ Super admin อนุมัติ" checked={form.allowCreateOrg} onChange={(v) => set('allowCreateOrg', v)} />
        </div>
      </Section>

      <Section title="การพูดและ SOS">
        <div className="grid sm:grid-cols-2 gap-4">
          {num('maxTalkSeconds', 'เวลาพูดสูงสุดต่อครั้ง (วินาที)', '5–300 วินาที ครบแล้วตัดอัตโนมัติ', 5, 300)}
          {num('sosTalkSeconds', 'ส่งเสียงสดหลังกด SOS (วินาที)', '0 = ไม่เปิดไมค์อัตโนมัติ', 0, 60)}
        </div>
      </Section>

      <Section title="การเก็บข้อมูล">
        {num('retentionDays', 'ลบข้อความ/เสียง/เส้นทางที่เก่ากว่า (วัน)', '0 = เก็บตลอด · ระบบลบอัตโนมัติทุก 6 ชั่วโมง', 0, 3650)}
      </Section>

      {/* แถบบันทึกลอย */}
      <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 transition ${dirty ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-2 rounded-full bg-slate-900 text-white shadow-2xl pl-4 pr-1.5 py-1.5">
          <span className="text-sm">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
          <button onClick={reset} className={`${btnGhost} !border-slate-600 !py-1.5 !rounded-full`}>ยกเลิก</button>
          <button onClick={save} disabled={busy} className={`${btnPrimary} !py-1.5 !rounded-full`}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        </div>
      </div>
    </div>
  );
};

export default AppSettings;
