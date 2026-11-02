// theme.ts — ปรับสีหลัก/โหมดมืด/ชื่อแอป/ไอคอน ตามค่าตั้งของ Super admin (และความชอบของผู้ใช้)
export type BrandColor = 'emerald' | 'teal' | 'sky' | 'blue' | 'indigo' | 'violet' | 'rose' | 'orange' | 'amber';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppConfig {
  appName: string;
  shortName: string;
  tagline: string;
  primaryColor: BrandColor;
  themeMode: ThemeMode;
  navStyle: 'dark' | 'brand' | 'light';
  logo: string | null;
  allowRegister: boolean;
  allowCreateOrg: boolean;
  maxTalkSeconds: number;
  sosTalkSeconds: number;
  supportContact: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  appName: 'PTT วิทยุสื่อสาร', shortName: 'PTT', tagline: '', primaryColor: 'emerald', themeMode: 'system', navStyle: 'dark',
  logo: null, allowRegister: true, allowCreateOrg: true, maxTalkSeconds: 60, sosTalkSeconds: 15, supportContact: '',
};

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
// สีชุดเดียวกับ Tailwind (50 → 950)
export const PALETTES: Record<BrandColor, string[]> = {
  emerald: ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'],
  teal: ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a', '#042f2e'],
  sky: ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e', '#082f49'],
  blue: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'],
  indigo: ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b'],
  violet: ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'],
  rose: ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519'],
  orange: ['#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407'],
  amber: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'],
};
export const COLOR_LABEL: Record<BrandColor, string> = {
  emerald: 'เขียวมรกต', teal: 'เขียวน้ำทะเล', sky: 'ฟ้า', blue: 'น้ำเงิน', indigo: 'คราม', violet: 'ม่วง', rose: 'ชมพูแดง', orange: 'ส้ม', amber: 'เหลืองอำพัน',
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
export const brandHex = (c: BrandColor, shade = 500) => PALETTES[c][SHADES.indexOf(shade as (typeof SHADES)[number])];

// ความชอบของผู้ใช้เอง ('' = ตามค่าเริ่มต้นของแอป)
const USER_MODE_KEY = 'ptt.themeMode';
export function getUserMode(): ThemeMode | '' {
  try { return (localStorage.getItem(USER_MODE_KEY) as ThemeMode) || ''; } catch { return ''; }
}
export function setUserMode(mode: ThemeMode | '') {
  try { mode ? localStorage.setItem(USER_MODE_KEY, mode) : localStorage.removeItem(USER_MODE_KEY); } catch { /* ignore */ }
  applyMode(current);
}

let current: AppConfig = DEFAULT_CONFIG;
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
media?.addEventListener('change', () => applyMode(current));

function applyMode(c: AppConfig) {
  const mode = getUserMode() || c.themeMode;
  const dark = mode === 'dark' || (mode === 'system' && !!media?.matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function applyConfig(c: AppConfig) {
  current = c;
  const root = document.documentElement.style;
  PALETTES[c.primaryColor].forEach((hex, i) => root.setProperty(`--brand-${SHADES[i]}`, rgb(hex)));
  applyMode(c);
  document.title = c.appName;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', brandHex(c.primaryColor, 600));
  const icon = c.logo || '/icon.svg';
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((l) => { l.href = icon; });
}
