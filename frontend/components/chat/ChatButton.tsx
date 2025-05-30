import React from 'react';
import { FiMessageCircle } from 'react-icons/fi';
import { useChat } from '../../src/context/ChatContext';
import NotificationBadge from '../notifications/NotificationBadge';

const ChatButton: React.FC = () => {
  const { unreadCount, isOpen, setIsOpen } = useChat();

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="relative p-2 text-gray-300 hover:text-white transition-colors"
      title={isOpen ? "Close Chat" : "Open Chat"}
    >
      <FiMessageCircle size={20} />
      <NotificationBadge count={unreadCount} />
    </button>
  );
};

export default ChatButton;