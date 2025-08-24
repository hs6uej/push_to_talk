import React, { useEffect, useState, createContext, useContext } from 'react';
interface User {
  id: string;
  username: string;
  password: string;
  role?: string;
}
interface AuthContextType {
  currentUser: User | null;
  login: (username: string, password: string) => boolean;
  register: (username: string, password: string) => boolean;
  logout: () => void;
  error: string | null;
  updateUsername: (newUsername: string) => boolean;
  updatePassword: (currentPassword: string, newPassword: string) => boolean;
  isAdmin: () => boolean;
}
const AuthContext = createContext<AuthContextType | null>(null);
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
export const AuthProvider: React.FC<{
  children: React.ReactNode;
}> = ({
  children
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Load user from localStorage on initial render
  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);
  // Initialize admin user if not exists
  useEffect(() => {
    const users = getUsers();
    if (!users.some(user => user.username === 'admin')) {
      users.push({
        id: 'admin-id',
        username: 'admin',
        password: 'forum18',
        role: 'admin'
      });
      saveUsers(users);
    }
  }, []);
  // Get users from localStorage
  const getUsers = (): User[] => {
    const users = localStorage.getItem('users');
    return users ? JSON.parse(users) : [];
  };
  // Save users to localStorage
  const saveUsers = (users: User[]) => {
    localStorage.setItem('users', JSON.stringify(users));
  };
  const login = (username: string, password: string): boolean => {
    setError(null);
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      setCurrentUser(user);
      localStorage.setItem('currentUser', JSON.stringify(user));
      return true;
    } else {
      setError('Invalid username or password');
      return false;
    }
  };
  const register = (username: string, password: string): boolean => {
    setError(null);
    const users = getUsers();
    if (users.some(u => u.username === username)) {
      setError('Username already exists');
      return false;
    }
    const newUser = {
      id: Date.now().toString(),
      username,
      password,
      role: 'user'
    };
    users.push(newUser);
    saveUsers(users);
    setCurrentUser(newUser);
    localStorage.setItem('currentUser', JSON.stringify(newUser));
    return true;
  };
  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
  };
  const updateUsername = (newUsername: string): boolean => {
    if (!currentUser) return false;
    const users = getUsers();
    if (users.some(u => u.username === newUsername && u.id !== currentUser.id)) {
      setError('Username already exists');
      return false;
    }
    const updatedUsers = users.map(user => {
      if (user.id === currentUser.id) {
        return {
          ...user,
          username: newUsername
        };
      }
      return user;
    });
    const updatedUser = {
      ...currentUser,
      username: newUsername
    };
    saveUsers(updatedUsers);
    setCurrentUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    return true;
  };
  const updatePassword = (currentPassword: string, newPassword: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.password !== currentPassword) {
      setError('Current password is incorrect');
      return false;
    }
    const users = getUsers();
    const updatedUsers = users.map(user => {
      if (user.id === currentUser.id) {
        return {
          ...user,
          password: newPassword
        };
      }
      return user;
    });
    const updatedUser = {
      ...currentUser,
      password: newPassword
    };
    saveUsers(updatedUsers);
    setCurrentUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    return true;
  };
  const isAdmin = (): boolean => {
    return currentUser?.role === 'admin';
  };
  const value = {
    currentUser,
    login,
    register,
    logout,
    error,
    updateUsername,
    updatePassword,
    isAdmin
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};