import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoom } from '../contexts/RoomContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranscription } from '../contexts/TranscriptionContext';
import PushToTalkButton from '../components/PushToTalkButton';
import { ArrowLeftIcon, UsersIcon, EditIcon, SaveIcon, XIcon, MessageSquareTextIcon } from 'lucide-react';
interface RoomParams {
  roomId: string;
}
const Room: React.FC = () => {
  const {
    roomId
  } = useParams<keyof RoomParams>() as RoomParams;
  const {
    getRoom,
    joinRoom,
    leaveRoom,
    updateRoomName,
    userCanEditRoom
  } = useRoom();
  const {
    currentUser
  } = useAuth();
  const {
    getRoomTranscriptions
  } = useTranscription();
  const navigate = useNavigate();
  const [room, setRoom] = useState(getRoom(roomId));
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [showTranscripts, setShowTranscripts] = useState(false);
  // Join room on component mount
  useEffect(() => {
    if (!room) {
      navigate('/');
      return;
    }
    joinRoom(roomId);
    // Leave room when component unmounts
    return () => {
      leaveRoom(roomId);
    };
  }, [roomId, joinRoom, leaveRoom, navigate, room]);
  // Update room data when it changes
  useEffect(() => {
    setRoom(getRoom(roomId));
  }, [getRoom, roomId]);
  const handleEditName = () => {
    if (room) {
      setEditedName(room.name);
      setIsEditingName(true);
    }
  };
  const handleSaveName = () => {
    if (editedName.trim() && room) {
      updateRoomName(room.id, editedName.trim());
      setIsEditingName(false);
    }
  };
  if (!room || !currentUser) {
    return <div className="p-8 text-center">Room not found</div>;
  }
  const canEdit = userCanEditRoom(roomId);
  const transcriptions = getRoomTranscriptions(roomId);
  return <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <button onClick={() => navigate('/')} className="flex items-center text-blue-600 hover:text-blue-800">
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Back to Rooms
        </button>
      </div>
      <div className="bg-white shadow-md rounded-lg p-8">
        <div className="flex justify-between items-center mb-8">
          {isEditingName ? <div className="flex items-center">
              <input type="text" value={editedName} onChange={e => setEditedName(e.target.value)} className="text-2xl font-bold border border-gray-300 rounded-md px-3 py-1 mr-2" autoFocus />
              <button onClick={handleSaveName} className="text-green-600 hover:text-green-900 p-1">
                <SaveIcon className="h-5 w-5" />
              </button>
              <button onClick={() => setIsEditingName(false)} className="text-gray-600 hover:text-gray-900 p-1">
                <XIcon className="h-5 w-5" />
              </button>
            </div> : <div className="flex items-center">
              <h1 className="text-3xl font-bold text-gray-800">{room.name}</h1>
              {canEdit && <button onClick={handleEditName} className="ml-2 text-blue-600 hover:text-blue-900">
                  <EditIcon className="h-5 w-5" />
                </button>}
            </div>}
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-gray-600">
              <UsersIcon className="w-5 h-5 mr-2" />
              <span>{room.participants.length} participants</span>
            </div>
            <button onClick={() => setShowTranscripts(!showTranscripts)} className={`flex items-center ${showTranscripts ? 'text-blue-600' : 'text-gray-600'} hover:text-blue-800`}>
              <MessageSquareTextIcon className="w-5 h-5 mr-2" />
              <span>Transcripts</span>
            </button>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12">
          <PushToTalkButton roomId={roomId} username={currentUser.username} />
          <p className="mt-8 text-gray-600 text-center">
            Press and hold the button to talk. Release to stop.
          </p>
        </div>
        {showTranscripts && <div className="mt-8 border-t pt-6">
            <h2 className="text-xl font-semibold mb-4">Conversation History</h2>
            {transcriptions.length === 0 ? <p className="text-gray-500">No conversation history yet.</p> : <div className="space-y-4 max-h-96 overflow-y-auto">
                {transcriptions.map((entry, index) => <div key={index} className={`p-3 rounded-lg ${entry.userId === currentUser.id ? 'bg-blue-50 ml-12' : 'bg-gray-50 mr-12'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className={`font-medium ${entry.userId === currentUser.id ? 'text-blue-600' : 'text-gray-700'}`}>
                        {entry.username}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-gray-800">{entry.text}</p>
                  </div>)}
              </div>}
          </div>}
      </div>
    </div>;
};
export default Room;