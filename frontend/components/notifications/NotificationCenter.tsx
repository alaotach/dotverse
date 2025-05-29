import React, { useState } from 'react';
import { useNotifications } from '../../src/context/NotificationContext';
import { Notification } from '../../src/services/notificationService';
import { FiCheck,FiTrash2,FiFilter } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

type FilterType = 'all'|'unread'|'auction'|'economy'|'social'|'system';

const NotificationCenter: React.FC = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, isLoading } =useNotifications();
  const [filter, setFilter] =useState<FilterType>('all');
  const navigate = useNavigate();

  const filteredNotifications = notifications.filter(notification => {
    switch (filter) {
      case 'unread':
        return !notification.read;
      case 'auction':
        return ['auction_outbid', 'auction_won', 'auction_ended', 'land_sold'].includes(notification.type);
      case 'economy':
        return notification.type === 'economy';
      case 'social':
        return ['comment_received', 'like_received'].includes(notification.type);
      case 'system':
        return notification.type === 'system';
      default:
        return true;
    }
  });

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    switch (notification.type) {
      case 'auction_outbid':
      case 'auction_won':
      case 'auction_ended':
        if (notification.metadata?.auctionId) {
          navigate(`/auction?id=${notification.metadata.auctionId}`);
        }
        break;
      case 'land_sold':
        navigate('/profile');
        break;
      case 'comment_received':
      case 'like_received':
        navigate('/gallery');
        break;
      case 'economy':
        navigate('/economy');
        break;
      default:
        break;
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'auction_outbid': return '💰';
      case 'auction_won': return '🎉';
      case 'auction_ended': return '🏁';
      case 'land_sold': return '🏡';
      case 'comment_received': return '💬';
      case 'like_received': return '❤️';
      case 'economy': return '🪙';
      case 'system': return '⚙️';
      default: return '📢';
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const getFilterButtonClass = (filterType: FilterType) => {
    return `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      filter === filterType
        ? 'bg-blue-600 text-white'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-gray-400 mt-2">
                You have {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <FiCheck size={16} />
              Mark all read
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={getFilterButtonClass('all')}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={getFilterButtonClass('unread')}
          >
            Unread ({unreadCount})
          </button>
          <button
            onClick={() => setFilter('auction')}
            className={getFilterButtonClass('auction')}
          >
            Auctions
          </button>
          <button
            onClick={() => setFilter('economy')}
            className={getFilterButtonClass('economy')}
          >
            Economy
          </button>
          <button
            onClick={() => setFilter('social')}
            className={getFilterButtonClass('social')}
          >
            Social
          </button>
          <button
            onClick={() => setFilter('system')}
            className={getFilterButtonClass('system')}
          >
            System
          </button>
        </div>
        <div className="bg-gray-800 rounded-lg">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">
              Loading notifications...
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
            </div>
          ) : (
            filteredNotifications.map((notification, index) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`
                  p-4 cursor-pointer transition-colors
                  hover:bg-gray-700
                  ${index !== filteredNotifications.length - 1 ? 'border-b border-gray-700' : ''}
                  ${!notification.read ? 'bg-gray-750 border-l-4 border-l-blue-500' : ''}
                `}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl flex-shrink-0 mt-1">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className={`font-semibold ${!notification.read ? 'text-white' : 'text-gray-300'}`}>
                        {notification.title}
                      </h3>
                      <span className="text-sm text-gray-500 flex-shrink-0 ml-4">
                        {formatTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="text-gray-400 mb-2">
                      {notification.message}
                    </p>
                    {notification.metadata && (
                      <div className="text-sm text-gray-500">
                        {notification.metadata.amount && (
                          <span className="mr-4">Amount: {notification.metadata.amount} 🪙</span>
                        )}
                        {notification.metadata.auctionId && (
                          <span className="mr-4">Auction ID: {notification.metadata.auctionId}</span>
                        )}
                      </div>
                    )}
                    {!notification.read && (
                      <div className="flex items-center mt-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                        <span className="text-xs text-blue-400">New</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;