import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Rooms from './pages/Rooms';
import Room from './pages/Room';
import AdminDashboard from './pages/AdminDashboard';
import UserProfile from './pages/UserProfile';
import { useAuth } from './contexts/AuthContext';
import Header from './components/Header';
const ProtectedRoute = ({
  children
}) => {
  const {
    currentUser
  } = useAuth();
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  return children;
};
const AdminRoute = ({
  children
}) => {
  const {
    currentUser,
    isAdmin
  } = useAuth();
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  if (!isAdmin()) {
    return <Navigate to="/" />;
  }
  return children;
};
export function AppRouter() {
  return <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<ProtectedRoute>
              <Rooms />
            </ProtectedRoute>} />
        <Route path="/room/:roomId" element={<ProtectedRoute>
              <Room />
            </ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute>
              <UserProfile />
            </ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute>
              <AdminDashboard />
            </AdminRoute>} />
      </Routes>
    </BrowserRouter>;
}