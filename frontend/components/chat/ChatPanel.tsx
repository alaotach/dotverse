import React, { useState, useEffect, useRef } from 'react';
import { FiSend, FiX, FiChevronDown } from 'react-icons/fi';
import { useChat } from '../../src/context/ChatContext';
import { useAuth } from '../../src/context/AuthContext';

const ChatPanel: React.FC = () => {
  const { msgs, sendMessage, isOpen, setIsOpen } = useChat();
  const { currentUser } = useAuth();
  const [input, setInput] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const msgsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('[ChatPanel] Messages updated:', msgs);
  }, [msgs]);

  useEffect(() => {
    if (!isMinimized && msgsEndRef.current) {
      msgsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgs, isMinimized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    try {
      await sendMessage(input);
      setInput('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen || !currentUser) return null;

  return (
    <div 
      className="fixed bottom-0 right-4 bg-gray-800 rounded-t-lg shadow-xl z-40 transition-all duration-300 border border-gray-700"
      style={{ 
        width: '350px',
        height: isMinimized ? '48px' : '400px',
        maxHeight: '80vh'
      }}
    >
      <div 
        className="p-3 bg-gray-700 rounded-t-lg flex justify-between items-center cursor-pointer"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <h3 className="font-medium text-white flex items-center">
          <span>Global Chat</span>
          {!isMinimized && msgs.length > 0 && (
            <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
              {msgs.length}
            </span>
          )}
        </h3>
        <div className="flex items-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
            className="text-gray-300 hover:text-white mr-2"
          >
            <FiChevronDown 
              size={18} 
              className={`transform transition-transform ${isMinimized ? 'rotate-180' : ''}`}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="text-gray-300 hover:text-white"
          >
            <FiX size={18} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ height: 'calc(100% - 96px)' }}>
            {msgs.length === 0 ? (
              <div className="text-center text-gray-500 my-4">
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

          <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700 flex">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-gray-700 border-0 rounded-l-lg p-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Type a message..."
              maxLength={500}
            />
            <button
              type="submit"
              className="bg-blue-600 text-white p-2 rounded-r-lg hover:bg-blue-700 transition-colors disabled:bg-blue-800 disabled:opacity-50"
              disabled={!input.trim()}
            >
              <FiSend />
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default ChatPanel;