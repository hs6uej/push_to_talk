import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, Me, setToken } from '../lib/api';
import { store, useStore } from '../lib/store';

interface AuthContextType {
  currentUser: Me | null;
  loading: boolean;
  allowRegister: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  reloadMe: () => Promise<void>;
  logout: () => void;
  setAvatar: (file: Blob | null) => Promise<void>;
  updateProfile: (changes: { username?: string; displayName?: string; currentPassword?: string; newPassword?: string }) => Promise<void>;
}

export interface RegisterData {
  username: string;
  password: string;
  displayName?: string;
  mode: 'personal' | 'join-org' | 'create-org';
  orgCode?: string;
  orgName?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  const allowRegister = useStore((s) => s.config.allowRegister);
  // ข้อมูลผู้ใช้ล่าสุดจาก WebSocket (เช่น สถานะ/บทบาทที่เปลี่ยน)
  const liveMe = useStore((s) => s.me);

  useEffect(() => {
    if (!getToken()) return;
    api.get<{ user: Me }>('/api/me')
      .then(({ user }) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) store.start(user);
  }, [user?.id]);

  const logout = useCallback(() => {
    store.stop();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener('ptt:logout', logout);
    // ข้อมูลตัวเองเปลี่ยนจากฝั่งเซิร์ฟเวอร์ (อนุมัติเข้าองค์กร/เปลี่ยนบทบาท)
    const onMe = (e: Event) => setUser((u) => (u ? { ...(e as CustomEvent).detail, status: u.status } : u));
    window.addEventListener('ptt:me', onMe);
    return () => {
      window.removeEventListener('ptt:logout', logout);
      window.removeEventListener('ptt:me', onMe);
    };
  }, [logout]);

  const reloadMe = useCallback(async () => {
    const { user } = await api.get<{ user: Me }>('/api/me');
    setUser(user);
    store.setMe(user);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user } = await api.post<{ token: string; user: Me }>('/api/auth/login', { username, password });
    setToken(token);
    setUser(user);
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const { token, user } = await api.post<{ token: string; user: Me }>('/api/auth/register', data);
    setToken(token);
    setUser(user);
  }, []);

  const updateProfile = useCallback(async (changes: { username?: string; displayName?: string; currentPassword?: string; newPassword?: string }) => {
    const { user } = await api.patch<{ user: Me }>('/api/me', changes);
    setUser(user);
    store.setMe(user);
  }, []);

  const setAvatar = useCallback(async (file: Blob | null) => {
    const { user } = file ? await api.upload<{ user: Me }>('/api/me/avatar', file) : await api.del<{ user: Me }>('/api/me/avatar');
    setUser(user);
    store.setMe(user);
  }, []);

  const currentUser = user && liveMe && liveMe.id === user.id
    ? { ...user, status: liveMe.status, avatar: liveMe.avatar, displayName: liveMe.displayName }
    : user;

  return (
    <AuthContext.Provider value={{ currentUser, loading, allowRegister, login, register, reloadMe, logout, updateProfile, setAvatar }}>
      {children}
    </AuthContext.Provider>
  );
};
