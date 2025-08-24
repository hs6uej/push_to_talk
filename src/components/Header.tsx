import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOutIcon, HomeIcon, UserIcon, ShieldIcon } from 'lucide-react';
const Header: React.FC = () => {
  const {
    currentUser,
    logout,
    isAdmin
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  // Don't show header on login and register pages
  if (location.pathname === '/login' || location.pathname === '/register') {
    return null;
  }
  return <header className="bg-blue-600 text-white shadow-md">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link to="/" className="text-xl font-bold flex items-center">
          <span className="mr-2">Push-to-Talk</span>
        </Link>
        {currentUser && <div className="flex items-center space-x-4">
            <Link to="/" className="flex items-center hover:underline">
              <HomeIcon className="h-5 w-5 mr-1" />
              <span>Rooms</span>
            </Link>
            <Link to="/profile" className="flex items-center hover:underline">
              <UserIcon className="h-5 w-5 mr-1" />
              <span>Profile</span>
            </Link>
            {isAdmin() && <Link to="/admin" className="flex items-center hover:underline">
                <ShieldIcon className="h-5 w-5 mr-1" />
                <span>Admin</span>
              </Link>}
            <div className="text-sm">
              Logged in as{' '}
              <span className="font-medium">{currentUser.username}</span>
              {isAdmin() && <span className="ml-1 bg-yellow-500 text-xs px-2 py-0.5 rounded-full">
                  Admin
                </span>}
            </div>
            <button onClick={handleLogout} className="flex items-center bg-red-500 hover:bg-red-600 px-3 py-1 rounded-md transition">
              <LogOutIcon className="h-4 w-4 mr-1" />
              <span>Logout</span>
            </button>
          </div>}
      </div>
    </header>;
};
export default Header;