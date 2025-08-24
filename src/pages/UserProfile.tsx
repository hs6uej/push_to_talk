import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRoom } from '../contexts/RoomContext';
import { SaveIcon, EditIcon, XIcon } from 'lucide-react';
const UserProfile: React.FC = () => {
  const {
    currentUser,
    updateUsername,
    updatePassword,
    error
  } = useAuth();
  const {
    rooms,
    updateRoomName,
    userCanEditRoom
  } = useRoom();
  const [newUsername, setNewUsername] = useState('');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editedRoomName, setEditedRoomName] = useState('');
  const userRooms = rooms.filter(room => room.createdBy === currentUser?.id);
  const handleUsernameEdit = () => {
    setNewUsername(currentUser?.username || '');
    setIsEditingUsername(true);
  };
  const handleUsernameSave = () => {
    if (newUsername.trim() && currentUser) {
      if (updateUsername(newUsername.trim())) {
        setIsEditingUsername(false);
      }
    }
  };
  const handlePasswordEdit = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setIsEditingPassword(true);
  };
  const handlePasswordSave = () => {
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    if (updatePassword(currentPassword, newPassword)) {
      setIsEditingPassword(false);
    }
  };
  const handleRoomEdit = (roomId: string, currentName: string) => {
    setEditingRoomId(roomId);
    setEditedRoomName(currentName);
  };
  const handleRoomSave = (roomId: string) => {
    if (editedRoomName.trim()) {
      updateRoomName(roomId, editedRoomName.trim());
    }
    setEditingRoomId(null);
  };
  if (!currentUser) return null;
  return <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">User Profile</h1>
      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>}
      <div className="bg-white shadow-md rounded-lg overflow-hidden mb-8">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Account Information</h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              {isEditingUsername ? <div className="flex items-center">
                  <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 mr-2 flex-grow" autoFocus />
                  <button onClick={handleUsernameSave} className="text-green-600 hover:text-green-900 p-1">
                    <SaveIcon className="h-5 w-5" />
                  </button>
                  <button onClick={() => setIsEditingUsername(false)} className="text-gray-600 hover:text-gray-900 p-1">
                    <XIcon className="h-5 w-5" />
                  </button>
                </div> : <div className="flex items-center">
                  <span className="text-gray-900">{currentUser.username}</span>
                  <button onClick={handleUsernameEdit} className="ml-2 text-blue-600 hover:text-blue-900">
                    <EditIcon className="h-4 w-4" />
                  </button>
                </div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              {isEditingPassword ? <div className="space-y-3">
                  {passwordError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm">
                      {passwordError}
                    </div>}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Current Password
                    </label>
                    <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 w-full" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      New Password
                    </label>
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 w-full" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Confirm New Password
                    </label>
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 w-full" />
                  </div>
                  <div className="flex justify-end space-x-2 mt-3">
                    <button onClick={handlePasswordSave} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm">
                      Save Password
                    </button>
                    <button onClick={() => setIsEditingPassword(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md text-sm">
                      Cancel
                    </button>
                  </div>
                </div> : <div className="flex items-center">
                  <span className="text-gray-900">••••••••</span>
                  <button onClick={handlePasswordEdit} className="ml-2 text-blue-600 hover:text-blue-900">
                    <EditIcon className="h-4 w-4" />
                  </button>
                </div>}
            </div>
          </div>
        </div>
      </div>
      {userRooms.length > 0 && <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">My Rooms</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Room Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Participants
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userRooms.map(room => <tr key={room.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingRoomId === room.id ? <input type="text" value={editedRoomName} onChange={e => setEditedRoomName(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1 w-full" autoFocus /> : <div className="text-sm font-medium text-gray-900">
                            {room.name}
                          </div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {room.participants.length}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {editingRoomId === room.id ? <div className="flex justify-end space-x-2">
                            <button onClick={() => handleRoomSave(room.id)} className="text-green-600 hover:text-green-900">
                              <SaveIcon className="h-5 w-5" />
                            </button>
                            <button onClick={() => setEditingRoomId(null)} className="text-gray-600 hover:text-gray-900">
                              <XIcon className="h-5 w-5" />
                            </button>
                          </div> : <button onClick={() => handleRoomEdit(room.id, room.name)} className="text-blue-600 hover:text-blue-900">
                            <EditIcon className="h-5 w-5" />
                          </button>}
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>}
    </div>;
};
export default UserProfile;