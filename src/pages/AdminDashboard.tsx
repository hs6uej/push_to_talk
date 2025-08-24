import React, { useState, Fragment } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranscription } from '../contexts/TranscriptionContext';
import { TrashIcon, EditIcon, SaveIcon, XIcon, MessageSquareTextIcon } from 'lucide-react';
const AdminDashboard: React.FC = () => {
  const {
    rooms,
    deleteRoom,
    updateRoomName
  } = useRoom();
  const {
    isAdmin
  } = useAuth();
  const {
    getRoomTranscriptions
  } = useTranscription();
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [viewingTranscriptsForRoom, setViewingTranscriptsForRoom] = useState<string | null>(null);
  if (!isAdmin()) {
    return <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
        <p className="mt-2">You don't have permission to access this page.</p>
      </div>;
  }
  const handleEdit = (roomId: string, currentName: string) => {
    setEditingRoom(roomId);
    setEditedName(currentName);
  };
  const handleSave = (roomId: string) => {
    if (editedName.trim()) {
      updateRoomName(roomId, editedName.trim());
    }
    setEditingRoom(null);
  };
  const handleCancel = () => {
    setEditingRoom(null);
  };
  const toggleTranscripts = (roomId: string) => {
    if (viewingTranscriptsForRoom === roomId) {
      setViewingTranscriptsForRoom(null);
    } else {
      setViewingTranscriptsForRoom(roomId);
    }
  };
  return <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Admin Dashboard</h1>
      <div className="bg-white shadow-md rounded-lg overflow-hidden mb-8">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Room Management</h2>
          {rooms.length === 0 ? <p className="text-gray-500">No rooms available.</p> : <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Room Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Participants
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transcripts
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rooms.map(room => {
                const transcriptions = getRoomTranscriptions(room.id);
                const isViewingTranscripts = viewingTranscriptsForRoom === room.id;
                return <Fragment key={room.id}>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingRoom === room.id ? <input type="text" value={editedName} onChange={e => setEditedName(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1 w-full" autoFocus /> : <div className="text-sm font-medium text-gray-900">
                                {room.name}
                              </div>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {room.createdBy}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {room.participants.length}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button onClick={() => toggleTranscripts(room.id)} className={`flex items-center ${transcriptions.length > 0 ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400'}`} disabled={transcriptions.length === 0}>
                              <MessageSquareTextIcon className="h-5 w-5 mr-1" />
                              <span>{transcriptions.length}</span>
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {editingRoom === room.id ? <div className="flex justify-end space-x-2">
                                <button onClick={() => handleSave(room.id)} className="text-green-600 hover:text-green-900">
                                  <SaveIcon className="h-5 w-5" />
                                </button>
                                <button onClick={handleCancel} className="text-gray-600 hover:text-gray-900">
                                  <XIcon className="h-5 w-5" />
                                </button>
                              </div> : <div className="flex justify-end space-x-2">
                                <button onClick={() => handleEdit(room.id, room.name)} className="text-blue-600 hover:text-blue-900">
                                  <EditIcon className="h-5 w-5" />
                                </button>
                                <button onClick={() => deleteRoom(room.id)} className="text-red-600 hover:text-red-900">
                                  <TrashIcon className="h-5 w-5" />
                                </button>
                              </div>}
                          </td>
                        </tr>
                        {isViewingTranscripts && <tr>
                            <td colSpan={5} className="px-6 py-4">
                              <div className="bg-gray-50 p-4 rounded-lg">
                                <h3 className="font-medium mb-3">
                                  Transcripts for {room.name}
                                </h3>
                                {transcriptions.length === 0 ? <p className="text-gray-500">
                                    No transcripts available.
                                  </p> : <div className="space-y-3 max-h-64 overflow-y-auto">
                                    {transcriptions.map((entry, index) => <div key={index} className="bg-white p-3 rounded border border-gray-200">
                                        <div className="flex justify-between items-center mb-1">
                                          <span className="font-medium text-blue-600">
                                            {entry.username}
                                          </span>
                                          <span className="text-xs text-gray-500">
                                            {new Date(entry.timestamp).toLocaleString()}
                                          </span>
                                        </div>
                                        <p className="text-gray-800">
                                          {entry.text}
                                        </p>
                                      </div>)}
                                  </div>}
                              </div>
                            </td>
                          </tr>}
                      </Fragment>;
              })}
                </tbody>
              </table>
            </div>}
        </div>
      </div>
    </div>;
};
export default AdminDashboard;