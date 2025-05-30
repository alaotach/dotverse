import React from 'react';
import { useNavigate } from 'react-router-dom';
import { landOfferService } from '../../src/services/landOfferService';
import { useNotifications } from '../../src/context/NotificationContext';
import { useAuth } from '../../src/context/AuthContext';
import { FiCheck, FiX, FiDollarSign, FiClock } from 'react-icons/fi';

interface OfferNotificationCardProps {
  offerId: string;
  offerAmount: number;
  buyerName: string;
  landPosition: string;
  createdAt: any;
  onAccept?: () => void;
  onReject?: () => void;
}

const OfferNotificationCard: React.FC<OfferNotificationCardProps> = ({
  offerId,
  offerAmount,
  buyerName,
  landPosition,
  createdAt,
  onAccept,
  onReject
}) => {
  const navigate = useNavigate();
  const { currentUser, refreshProfile } = useAuth();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleAccept = async () => {
    if (!onAccept || !currentUser) return;
    setIsLoading(true);
    try {
      const result = await landOfferService.respondToOffer(offerId, 'accepted', currentUser.uid);
      if (result.success && result.landSaleCompleted) {
        await refreshProfile();
      }
      onAccept();
    } catch (error) {
      console.error('Error accepting offer:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!onReject || !currentUser) return;
    setIsLoading(true);
    try {
      await landOfferService.respondToOffer(offerId, 'rejected', currentUser.uid);
      onReject();
    } catch (error) {
      console.error('Error rejecting offer:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  };

  return (
    <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-600/30 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center">
          <FiDollarSign className="text-green-400 mr-2" size={20} />
          <h4 className="text-white font-semibold">Land Offer Received</h4>
        </div>
        <div className="flex items-center text-gray-400 text-sm">
          <FiClock className="mr-1" size={12} />
          {formatTime(createdAt)}
        </div>
      </div>
      
      <div className="mb-4">
        <p className="text-gray-300 mb-2">
          <span className="text-blue-400 font-medium">{buyerName}</span> wants to buy your land at {landPosition}
        </p>
        <div className="text-2xl font-bold text-green-400">
          {offerAmount.toLocaleString()} 🪙
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={isLoading}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center"
        >
          <FiCheck className="mr-2" size={16} />
          {isLoading ? 'Processing...' : 'Accept'}
        </button>
        
        <button
          onClick={handleReject}
          disabled={isLoading}
          className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center"
        >
          <FiX className="mr-2" size={16} />
          {isLoading ? 'Processing...' : 'Reject'}
        </button>
        
        <button
          onClick={() => navigate('/profile?tab=offers')}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
        >
          Details
        </button>
      </div>
    </div>
  );
};

export default OfferNotificationCard;