// AppShell — โครงหน้าจอ: จอใหญ่ = แถบเมนูซ้าย + รายการ + เนื้อหา, มือถือ = เนื้อหา + แถบเมนูล่าง
import React, { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArchiveIcon, Building2Icon, HeadsetIcon, MapIcon, MessagesSquareIcon, SettingsIcon, ShieldIcon, UsersIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isOrgAdmin, isStaff, isSuper } from '../lib/api';
import { store, useStore } from '../lib/store';
import ChannelList from './ChannelList';
import ContactList from './ContactList';
import SosButton from './SosButton';
import SosOverlay from './SosOverlay';
import ProfileModal from './ProfileModal';
import { AppLogo, Avatar } from './ui';

// สไตล์แถบเมนูซ้าย (Super admin เลือกได้)
const NAV_STYLES = {
  dark: { bar: 'bg-slate-900 text-slate-300', active: 'bg-slate-800 text-white', hover: 'hover:bg-slate-800/60' },
  brand: { bar: 'bg-emerald-800 text-emerald-100', active: 'bg-emerald-950/40 text-white', hover: 'hover:bg-emerald-950/25' },
  light: { bar: 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800', active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', hover: 'hover:bg-slate-100 dark:hover:bg-slate-800' },
};

interface NavItem { to: string; label: string; icon: React.FC<{ className?: string }>; staff?: boolean; orgAdmin?: boolean; superOnly?: boolean; mobile?: boolean }
const NAV: NavItem[] = [
  { to: '/', label: 'ช่อง', icon: MessagesSquareIcon, mobile: true },
  { to: '/contacts', label: 'รายชื่อ', icon: UsersIcon, mobile: true },
  { to: '/map', label: 'แผนที่', icon: MapIcon, mobile: true },
  { to: '/dispatch', label: 'ศูนย์สั่งการ', icon: HeadsetIcon, staff: true },
  { to: '/vault', label: 'คลังข้อความ', icon: ArchiveIcon, staff: true },
  { to: '/org', label: 'องค์กร', icon: Building2Icon, orgAdmin: true },
  { to: '/admin', label: 'Super admin', icon: ShieldIcon, superOnly: true },
  { to: '/settings', label: 'ตั้งค่า', icon: SettingsIcon, mobile: true },
];

const AppShell: React.FC = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const unread = useStore((s) => s.channels);
  const connected = useStore((s) => s.connected);
  const toast = useStore((s) => s.toast);
  const config = useStore((s) => s.config);
  const navCls = NAV_STYLES[config.navStyle] || NAV_STYLES.dark;
  const alerts = useStore((s) => s.alerts);
  const requests = useStore((s) => s.requests);
  const totalUnread = unread.reduce((n, c) => n + (c.unread || 0), 0);
  const openAlerts = alerts.filter((a) => !a.resolvedAt).length;

  useEffect(() => {
    const onRemoved = () => navigate('/');
    window.addEventListener('ptt:channel-removed', onRemoved);
    return () => window.removeEventListener('ptt:channel-removed', onRemoved);
  }, [navigate]);

  if (!currentUser) return null;
  const staff = isStaff(currentUser);
  const orgAdmin = isOrgAdmin(currentUser) && !!currentUser.org && currentUser.org.status === 'active';
  const items = NAV.filter((n) => (!n.staff || staff) && (!n.orgAdmin || orgAdmin) && (!n.superOnly || isSuper(currentUser)));
  const path = location.pathname;
  const inChannel = path.startsWith('/c/');
  // แผงรายการด้านซ้าย (จอใหญ่) แสดงเฉพาะหน้าช่อง/รายชื่อ
  const listPanel = path === '/contacts' ? 'contacts' : path === '/' || inChannel ? 'channels' : null;

  const orgRequests = requests.filter((r) => r.orgId === currentUser.org?.id).length;
  const badgeFor = (to: string) =>
    to === '/' ? totalUnread : to === '/dispatch' ? openAlerts : to === '/org' ? orgRequests : to === '/admin' ? requests.length - orgRequests : to === '/settings' && !staff ? requests.length : 0;

  return (
    <div className="h-[100dvh] flex bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* แถบเมนูซ้าย (จอใหญ่) */}
      <nav className={`hidden lg:flex w-20 shrink-0 flex-col items-center gap-1 py-3 ${navCls.bar}`}>
        <div className="mb-3 flex flex-col items-center" title={config.appName}>
          <AppLogo className="w-10 h-10" />
          <span className={`mt-1 w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'}`} title={connected ? 'เชื่อมต่อแล้ว' : 'ไม่ได้เชื่อมต่อ'} />
        </div>
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `relative w-16 py-2 rounded-xl flex flex-col items-center gap-1 text-[11px] ${isActive || (n.to === '/' && inChannel) ? navCls.active : navCls.hover}`
            }
          >
            <n.icon className="w-5 h-5" />
            <span className="leading-tight text-center">{n.label}</span>
            {badgeFor(n.to) > 0 && (
              <span className={`absolute top-1 right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${n.to === '/dispatch' ? 'bg-red-500' : n.to === '/org' || n.to === '/admin' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                {badgeFor(n.to)}
              </span>
            )}
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col items-center gap-3">
          <SosButton compact />
          <button onClick={() => navigate('/settings')} title={currentUser.displayName}>
            <Avatar name={currentUser.displayName} userId={currentUser.id} src={currentUser.avatar} size="sm" status={currentUser.status} />
          </button>
        </div>
      </nav>

      {/* แผงรายการ (จอใหญ่) */}
      {listPanel && (
        <aside className="hidden lg:flex w-80 xl:w-96 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {listPanel === 'channels' ? <ChannelList /> : <ContactList />}
        </aside>
      )}

      {/* เนื้อหาหลัก */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!connected && (
          <div className="bg-amber-500 text-white text-xs text-center py-1">กำลังเชื่อมต่อเซิร์ฟเวอร์ใหม่...</div>
        )}
        <main className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>

        {/* แถบเมนูล่าง (มือถือ) — ซ่อนตอนอยู่ในช่องเพื่อให้ปุ่มพูดเต็มที่ */}
        {!inChannel && (
          <nav className="lg:hidden flex border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pb-[env(safe-area-inset-bottom)]">
            {items.filter((n) => n.mobile).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) => `relative flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}
              >
                <n.icon className="w-6 h-6" />
                {n.label}
                {badgeFor(n.to) > 0 && (
                  <span className="absolute top-1 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {badgeFor(n.to)}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      <SosOverlay />
      <ProfileModal />
      {toast && (
        <div
          className={`fixed z-[60] top-4 left-1/2 -translate-x-1/2 max-w-[90vw] px-4 py-2 rounded-lg shadow-lg text-sm text-white ${toast.tone === 'error' ? 'bg-red-600' : 'bg-slate-800'}`}
          onClick={() => store.dismissToast()}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
};

export default AppShell;
