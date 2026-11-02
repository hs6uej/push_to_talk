import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import { Contacts, Home } from './pages/Home';
import ChannelPage from './pages/ChannelPage';
import MapPage from './pages/MapPage';
import Dispatch from './pages/Dispatch';
import Vault from './pages/Vault';
import Admin from './pages/Admin';
import Settings from './pages/Settings';
import OrgConsole from './pages/OrgConsole';
import InvitePage from './pages/InvitePage';
import AppShell from './components/AppShell';
import { useAuth } from './contexts/AuthContext';
import { isOrgAdmin, isStaff, isSuper } from './lib/api';

const Protected: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="h-[100dvh] flex items-center justify-center text-slate-500">กำลังโหลด...</div>;
  if (!currentUser) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
};

const RoleGate: React.FC<{ children: React.ReactElement; need: 'staff' | 'orgAdmin' | 'super' }> = ({ children, need }) => {
  const { currentUser } = useAuth();
  const ok = need === 'super' ? isSuper(currentUser) : need === 'orgAdmin' ? isOrgAdmin(currentUser) : isStaff(currentUser);
  return ok ? children : <Navigate to="/" replace />;
};

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/i/:code" element={<InvitePage />} />
        <Route element={<Protected><AppShell /></Protected>}>
          <Route path="/" element={<Home />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/c/:channelId" element={<ChannelPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/dispatch" element={<RoleGate need="staff"><Dispatch /></RoleGate>} />
          <Route path="/vault" element={<RoleGate need="staff"><Vault /></RoleGate>} />
          <Route path="/org" element={<RoleGate need="orgAdmin"><OrgConsole /></RoleGate>} />
          <Route path="/admin" element={<RoleGate need="super"><Admin /></RoleGate>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
