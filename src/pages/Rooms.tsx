import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../contexts/RoomContext';
import { useAuth } from '../contexts/AuthContext';
import { PlusIcon, UsersIcon, ArrowRightIcon } from 'lucide-react';
const Rooms: React.FC = () => {
  const [newRoomName, setNewRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const {
    rooms,
    createRoom,
    joinRoom
  } = useRoom();
  const {
    currentUser
  } = useAuth();
  const navigate = useNavigate();
  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRoomName.trim() && currentUser) {
      // createRoom ตอนนี้จะส่ง message ไปที่ server แทน
      createRoom(newRoomName.trim()); 
      
      // เราจะไม่ navigate ทันที แต่จะรอให้ server อัปเดตรายชื่อห้องกลับมา
      // แล้วผู้ใช้สามารถกด Join จากหน้า Rooms list ได้เลย
      // ซึ่งเป็น UX ที่ดีกว่าและปลอดภัยกว่า
      setNewRoomName('');
      setIsCreating(false);
    }
  };
  const handleJoinRoom = (roomId: string) => {
    joinRoom(roomId);
    navigate(`/room/${roomId}`);
  };
  return <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Rooms</h1>
        <button onClick={() => setIsCreating(!isCreating)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center">
          <PlusIcon className="w-5 h-5 mr-2" />
          Create Room
        </button>
      </div>
      {isCreating && <div className="bg-white shadow-md rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create New Room</h2>
          <form onSubmit={handleCreateRoom} className="flex gap-4">
            <input type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder="Room name" className="flex-grow border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md">
              Create
            </button>
          </form>
        </div>}
      {rooms.length === 0 ? <div className="text-center py-12 bg-white shadow-md rounded-lg">
          <p className="text-gray-500 text-lg">
            No rooms available. Create your first room!
          </p>
        </div> : <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {rooms.map(room => <div key={room.id} className="bg-white shadow-md rounded-lg overflow-hidden">
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-2">{room.name}</h3>
                <div className="flex items-center text-gray-500 mb-4">
                  <UsersIcon className="w-5 h-5 mr-2" />
                  <span>{room.participants.length} participants</span>
                </div>
                <button onClick={() => handleJoinRoom(room.id)} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center justify-center">
                  <span className="mr-2">Join Room</span>
                  <ArrowRightIcon className="w-5 h-5" />
                </button>
              </div>
            </div>)}
        </div>}
    </div>;
};
export default Rooms;