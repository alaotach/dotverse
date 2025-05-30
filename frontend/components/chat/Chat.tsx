import React, {useState, useEffect, useRef} from 'react';
import {useAuth} from '../../src/context/AuthContext';
import { chatService, ChatMessage } from '../../src/services/chatService';
import {FiX, FiSend, FiMessageSquare} from 'react-icons/fi';
import { set } from 'firebase/database';

const Chat: React.FC = () => {
    const { currentUser, userProfile } = useAuth();
    const [ isOpen, setIsOpen ] = useState(false);
    const [msg, setMsg] = useState('');
    const [msgs, setMsgs] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const msgsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if(!isOpen) return;
        const unsubscribe = chatService.subscribeToMessages((newMsgs) => {
            setMsgs(newMsgs);
            setLoading(false);
    });
        return () => {
            unsubscribe();
        };
    }, [isOpen]);

    useEffect(() => {
        if (msgsEndRef.current) {
            msgsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [msgs]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!msg.trim() || !currentUser) return;
        setLoading(true);
        try {
            await chatService.sendMessage(currentUser?.uid || '', userProfile?.displayName || 'anon', msg);
            setMsg('');
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (!currentUser) {
        return null;
    }

    return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 bg-blue-600 text-white rounded-full p-3 shadow-lg hover:bg-blue-700 transition-colors z-40"
          title="Open Chat"
        >
          <FiMessageSquare size={24} />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-4 right-4 bg-gray-800 rounded-lg shadow-xl w-80 sm:w-96 z-40 flex flex-col" style={{ height: '500px', maxHeight: '80vh' }}>
          <div className="p-3 bg-gray-700 rounded-t-lg flex justify-between items-center">
            <h3 className="font-medium text-white">Global Chat</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-300 hover:text-white"
            >
              <FiX size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {loading ? (
              <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : msgs.length === 0 ? (
              <div className="text-center text-gray-500 mt-4">
                No messages yet. Start the conversation!
              </div>
            ) : (
              msgs.map((msg) => (
                <div
                  key={msg.id}
                  className={`${
                    msg.userId === currentUser?.uid
                      ? 'bg-blue-700 ml-8 rounded-tl-lg rounded-br-lg rounded-bl-lg'
                      : 'bg-gray-700 mr-8 rounded-tr-lg rounded-br-lg rounded-bl-lg'
                      } p-3`}
                >
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-sm">
                      {msg.userId === currentUser?.uid ? 'You' : msg.username}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                  <p className="text-white break-words">{msg.msg}</p>
                </div>
              ))
            )}
            <div ref={msgsEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-700 flex">
            <input
              type="text"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              className="flex-1 bg-gray-700 border-0 rounded-l-lg p-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Type a message..."
              maxLength={500}
            />
            <button
              type="submit"
              className="bg-blue-600 text-white p-2 rounded-r-lg hover:bg-blue-700 transition-colors"
              disabled={!msg.trim()}
            >
              <FiSend />
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default Chat;