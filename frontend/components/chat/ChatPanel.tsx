import React, { useState, useEffect, useRef } from 'react';
import { FiSend, FiX, FiChevronDown, FiSettings, FiSmile, FiUsers, FiMinus } from 'react-icons/fi';
import { useChat } from '../../src/context/ChatContext';
import { useAuth } from '../../src/context/AuthContext';
import websocketService from '../../src/services/websocketService';
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';

interface OnlineUser {
  id: string;
  displayName: string;
  lastActive: number;
}

const ChatPanel: React.FC = () => {
  const { msgs, sendMessage, isOpen, setIsOpen } = useChat();
  const { currentUser } = useAuth();
  const [input, setInput] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !currentUser) return;

    console.log('[ChatPanel] Setting up online users tracking for:', currentUser.uid);

    const handleOnlineUsersUpdate = (users: OnlineUser[]) => {
      console.log('[ChatPanel] Received online users update:', users);
      setOnlineUsers(users);
    };

    websocketService.onOnlineUsersChange(handleOnlineUsersUpdate);

    if (!websocketService.isConnected()) {
      console.log('[ChatPanel] Connecting to websocket for presence tracking');
      websocketService.connect();
    } else {
      websocketService.updateUserPresence();
    }

    const presenceInterval = setInterval(() => {
      if (websocketService.isConnected()) {
        websocketService.updateUserPresence();
      }
    }, 30000);

    return () => {
      clearInterval(presenceInterval);
      websocketService.offOnlineUsersChange(handleOnlineUsersUpdate);
    };
  }, [isOpen, currentUser]);

  useEffect(() => {
    if (!isMinimized && msgsEndRef.current) {
      msgsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgs, isMinimized]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    setIsTyping(true);
    try {
      await sendMessage(input);
      setInput('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setTimeout(() => setIsTyping(false), 300);
    }
  };

  const handleEmojiClick = (emojiObject: any) => {
    setInput(prev => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  const getMessageTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    
    if (diffMinutes < 1) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;
    return date.toLocaleDateString();
  };

  const getUserInitial = (username: string) => {
    return username ? username.charAt(0).toUpperCase() : '?';
  };

  const getAvatarGradient = (username: string) => {
    const gradients = [
      'from-cyan-400 to-blue-500',
      'from-purple-400 to-pink-500',
      'from-green-400 to-blue-500',
      'from-yellow-400 to-orange-500',
      'from-red-400 to-pink-500',
      'from-indigo-400 to-purple-500'
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length];
  };

  const renderMessage = (msg: any) => {
    const isOwnMessage = msg.userId === currentUser?.uid;
    
    return (
      <div key={msg.id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-3`}>
        <div className={`flex items-end space-x-2 max-w-xs lg:max-w-sm ${isOwnMessage ? 'flex-row-reverse space-x-reverse' : ''}`}>
          {!isOwnMessage && (
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarGradient(msg.username)} flex items-center justify-center text-white text-sm font-bold shadow-lg flex-shrink-0`}>
              {getUserInitial(msg.username)}
            </div>
          )}
          
          <div className="relative group">
            {!isOwnMessage && (
              <p className="text-xs text-gray-400 mb-1 px-1 font-medium">{msg.username}</p>
            )}
            
            <div className={`
              relative px-4 py-3 rounded-2xl shadow-lg transition-all duration-300 group-hover:shadow-xl
              ${isOwnMessage 
                ? 'bg-gradient-to-br from-purple-600 via-purple-500 to-blue-600 text-white rounded-br-md shadow-purple-500/25' 
                : 'bg-gray-800/80 backdrop-blur-sm text-gray-100 border border-gray-700/50 rounded-bl-md shadow-gray-900/50'
              }
            `}>
              <p className="text-sm leading-relaxed break-words">{msg.msg}</p>
            </div>
            
            <p className={`text-xs text-gray-500 mt-1 px-1 ${isOwnMessage ? 'text-right' : 'text-left'}`}>
              {getMessageTime(msg.timestamp)}
            </p>
          </div>
        </div>
      </div>
    );
  };

  if (!currentUser) return null;

  if (isMinimized && isOpen) {
    return (
      <div className="fixed bottom-4 left-4 z-50 max-w-md">
        <div className="bg-black/40 backdrop-blur-sm rounded-lg p-3 mb-2 border border-white/10">
          <div className="space-y-2 max-h-32 overflow-hidden">
            {msgs.slice(-3).map((msg) => {
              const isOwnMessage = msg.userId === currentUser?.uid;
              return (
                <div key={msg.id} className="flex items-start space-x-2 text-sm">
                  <span className={`font-medium ${isOwnMessage ? 'text-blue-300' : 'text-white'}`}>
                    {isOwnMessage ? 'You' : msg.username}:
                  </span>
                  <span className="text-gray-200 flex-1 truncate">{msg.msg}</span>
                </div>
              );
            })}
          </div>
          
          <form onSubmit={handleSubmit} className="flex items-center mt-2 space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-white placeholder-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              placeholder="Type message..."
              maxLength={500}
            />
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="text-white/70 hover:text-white transition-colors p-1"
              title="Expand chat"
            >
              <FiChevronDown size={14} className="rotate-180" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <>
      <div className={`lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
      
      <div className={`
        fixed z-50 transition-all duration-500 ease-in-out
        lg:bottom-16 lg:right-4 lg:w-96 lg:h-[600px] lg:rounded-2xl
        max-lg:inset-x-0 max-lg:bottom-0 max-lg:h-[80vh] max-lg:rounded-t-3xl
        bg-gray-900/95 backdrop-blur-xl border border-purple-500/20
        shadow-2xl shadow-purple-500/10
        ${!isOpen ? 'lg:translate-y-full max-lg:translate-y-full' : ''}
      `}>
        
        <div className="absolute inset-0 rounded-2xl max-lg:rounded-t-3xl overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-60" />
          <div className="absolute bottom-0 right-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-60" />
        </div>
        <div className="relative p-4 bg-gradient-to-r from-purple-900/30 via-gray-900/50 to-blue-900/30 border-b border-gray-700/50 lg:rounded-t-2xl max-lg:rounded-t-3xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <span className="text-2xl">🌐</span>
                <div>
                  <h3 className="text-white font-semibold text-lg tracking-wide">Global Chat</h3>
                  <div className="flex items-center space-x-2 text-xs">
                    <div className="flex items-center space-x-1 text-green-400">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50" />
                      <FiUsers size={12} />
                      <span className="font-medium">{onlineUsers.length} online</span>
                    </div>
                    <div className="w-1 h-1 bg-gray-500 rounded-full" />
                    <span className="text-gray-400">
                      {websocketService.isConnected() ? 'Connected' : 'Connecting...'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {}}
                className="p-2 text-gray-400 hover:text-cyan-400 transition-all duration-200 hover:bg-cyan-400/10 rounded-lg group"
                title="Settings"
              >
                <FiSettings size={18} className="group-hover:rotate-90 transition-transform duration-300" />
              </button>
              <button
                onClick={() => setIsMinimized(true)}
                className="p-2 text-gray-400 hover:text-purple-400 transition-all duration-200 hover:bg-purple-400/10 rounded-lg"
                title="Minimize"
              >
                <FiMinus size={18} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-gray-400 hover:text-red-400 transition-all duration-200 hover:bg-red-400/10 rounded-lg"
                title="Close"
              >
                <FiX size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col h-full">
          <div className="relative flex-1 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-gray-900/95 to-transparent z-10 pointer-events-none" />
            <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-purple-600/50 scrollbar-track-transparent p-4 space-y-4">
              {msgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 rounded-full flex items-center justify-center border border-purple-500/30">
                      <span className="text-3xl">💬</span>
                    </div>
                    <div className="absolute inset-0 bg-purple-500/20 rounded-full animate-ping" />
                  </div>
                  <div>
                    <p className="text-gray-300 font-medium mb-1">Welcome to the Neural Network</p>
                    <p className="text-gray-500 text-sm">Connect with the DotVerse community</p>
                    {onlineUsers.length > 0 && (
                      <p className="text-gray-400 text-xs mt-2">
                        {onlineUsers.length} users online: {onlineUsers.slice(0, 3).map(u => u.displayName).join(', ')}
                        {onlineUsers.length > 3 && ` +${onlineUsers.length - 3} more`}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                msgs.map(renderMessage)
              )}
              {isTyping && (
                <div className="flex justify-start animate-fade-in-up">
                  <div className="flex items-end space-x-3 max-w-xs">
                    <div className="w-8 h-8 bg-gradient-to-br from-gray-600 to-gray-700 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
                    </div>
                    <div className="bg-gray-800/80 backdrop-blur-sm px-4 py-3 rounded-2xl rounded-bl-md border border-gray-700/50">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={msgsEndRef} />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-900/95 to-transparent pointer-events-none" />
          </div>
          {showEmojiPicker && (
            <div className="flex z-50000">
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={Theme.DARK}
                emojiStyle={EmojiStyle.APPLE}
              />
            </div>
          )}
          <div className="relative p-4 bg-gradient-to-r from-gray-900/80 via-gray-800/50 to-gray-900/80 backdrop-blur-sm border-t border-gray-700/50">
            <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
            
            <form onSubmit={handleSubmit} className="flex items-end space-x-3">
              <div className="flex space-x-1">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-2 text-gray-400 hover:text-cyan-400 transition-all duration-200 hover:bg-cyan-400/10 rounded-lg group"
                  title="Emoji"
                >
                  <FiSmile size={18} className="group-hover:scale-110 transition-transform" />
                </button>
              </div>
              
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="w-full bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-2xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all duration-300"
                  placeholder="Enter the matrix..."
                  maxLength={500}
                  disabled={isTyping}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <span className="text-xs text-gray-500">{input.length}/500</span>
                </div>
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className={`
                  relative p-3 rounded-2xl transition-all duration-300 group overflow-hidden
                  ${input.trim() && !isTyping
                    ? 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white shadow-lg hover:shadow-purple-500/25 transform hover:scale-105' 
                    : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                  }
                `}
              >
                {isTyping ? (
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <FiSend size={18} className="relative z-10 group-hover:translate-x-0.5 transition-transform" />
                    {input.trim() && (
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-cyan-600/20 rounded-2xl blur-md -z-10 group-hover:blur-lg transition-all" />
                    )}
                  </>
                )}
              </button>
            </form>
            
            <div className="flex items-center justify-between mt-2 text-xs">
              <div className="flex items-center space-x-2 text-gray-500">
                <span>Neural link {websocketService.isConnected() ? 'active' : 'connecting'}</span>
                <div className={`w-1 h-1 rounded-full animate-pulse ${websocketService.isConnected() ? 'bg-green-400' : 'bg-yellow-400'}`} />
              </div>
              <span className="text-gray-600">Press Enter to transmit</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ChatPanel;