import React, { useState } from 'react';
import { landOfferService, CreateOfferData } from '../../src/services/landOfferService';
import { useAuth } from '../../src/context/AuthContext';
import { useEconomy } from '../../src/context/EconomyContext';
import { FiX, FiSend } from 'react-icons/fi';
import ModalWrapper from '../common/ModalWrapper';

interface MakeOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  landId: string;
  landOwner: {
    userId: string;
    displayName: string;
  };
  landInfo: {
    centerX: number;
    centerY: number;
    size: number;
  };
  onSuccess?: () => void;
}

const MakeOfferModal: React.FC<MakeOfferModalProps> = ({
  isOpen,
  onClose,
  landId,
  landOwner,
  landInfo,
  onSuccess
}) => {
  const { currentUser, userProfile } = useAuth();
  const { userEconomy } = useEconomy();
  const [offerAmount, setOfferAmount] = useState<number>(0);
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser || !userProfile) {
      setError('You must be logged in to make an offer.');
      return;
    }

    if (offerAmount <= 0) {
      setError('Please enter a valid offer amount.');
      return;
    }

    if (!userEconomy || userEconomy.balance < offerAmount) {
      setError('Insufficient balance to make this offer.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const offerData: CreateOfferData = {
        landId,
        toUserId: landOwner.userId,
        toUserDisplayName: landOwner.displayName,
        offerAmount,
        message: message.trim() || undefined
      };

      const result = await landOfferService.createOffer(
        currentUser.uid,
        userProfile.displayName || currentUser.email || 'Unknown User',
        offerData
      );

      if (result.success) {        onSuccess?.();
        onClose();
        setOfferAmount(0);
        setMessage('');
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError('Failed to send offer. Please try again.');
      console.error('Error making offer:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    setOfferAmount(Math.max(0, value));
  };

  const suggestedAmounts = [100, 500, 1000, 2500, 5000];

  if (!isOpen) return null;
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Make Land Offer</h2>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="text-gray-400 hover:text-white transition-colors modal-close-button ui-element"
            style={{ touchAction: 'manipulation' }}
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="mb-6">
          <div className="bg-gray-700 rounded-lg p-4 mb-4">
            <h3 className="text-white font-semibold mb-2">Land Details</h3>
            <div className="text-gray-300 text-sm">
              <p>Owner: {landOwner.displayName}</p>
              <p>Location: ({landInfo.centerX}, {landInfo.centerY})</p>
              <p>Size: {landInfo.size}×{landInfo.size}</p>
            </div>
          </div>

          <div className="bg-gray-700 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Your Balance:</span>
              <span className="text-yellow-400 font-bold">
                {userEconomy?.balance?.toLocaleString() || 0} 🪙
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Offer Amount (🪙)
            </label>
            <div className="relative">
              🪙
              <input
                type="number"
                value={offerAmount || ''}
                onChange={handleAmountChange}
                min="1"
                max={userEconomy?.balance || 0}
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter amount..."
                required
              />
            </div>
            
            <div className="mt-2">
              <p className="text-gray-400 text-xs mb-2">Quick amounts:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedAmounts.map(amount => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setOfferAmount(amount)}
                    disabled={!userEconomy || userEconomy.balance < amount}
                    className={`px-3 py-1 text-xs rounded ${
                      !userEconomy || userEconomy.balance < amount
                        ? 'bg-gray-600 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                  >
                    {amount.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Message (Optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              rows={3}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Add a personal message to the land owner..."
            />
            <p className="text-gray-500 text-xs mt-1">
              {message.length}/200 characters
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}          <div className="flex gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white rounded-lg transition-colors ui-element"
              style={{ 
                minHeight: '48px',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || offerAmount <= 0 || !userEconomy || userEconomy.balance < offerAmount}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2 ui-element"
              style={{ 
                minHeight: '48px',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Sending...
                </>
              ) : (
                <>
                  <FiSend size={16} />
                  Send Offer
                </>
              )}
            </button></div>
        </form>
      </div>
    </ModalWrapper>
  );
};

export default MakeOfferModal;