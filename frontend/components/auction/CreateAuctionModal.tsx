import React, { useState } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { auctionService, CreateAuctionData } from '../../src/services/auctionService';

interface CreateAuctionModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const CreateAuctionModal: React.FC<CreateAuctionModalProps> = ({ onClose, onSuccess }) => {
  const { currentUser, userProfile } = useAuth();
  const [formData, setFormData] = useState<CreateAuctionData>({
    landCenterX: userProfile?.landInfo?.centerX || 0,
    landCenterY: userProfile?.landInfo?.centerY || 0,
    landSize: userProfile?.landInfo?.ownedSize || 50,
    startingPrice: 100,
    duration: 24,
    buyNowPrice: undefined
  });
  const [enableBuyNow, setEnableBuyNow] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser || !userProfile) {
      setError('Please log in to create an auction');
      return;
    }

    if (formData.startingPrice <= 0) {
      setError('Starting price must be greater than 0');
      return;
    }

    if (enableBuyNow && (!formData.buyNowPrice || formData.buyNowPrice <= formData.startingPrice)) {
      setError('Buy now price must be higher than starting price');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const auctionData: CreateAuctionData = {
        ...formData,
        buyNowPrice: enableBuyNow ? formData.buyNowPrice : undefined
      };

      await auctionService.createAuction(
        currentUser.uid,
        userProfile.displayName || userProfile.email || 'Anonymous',
        auctionData
      );

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to create auction');
    } finally {
      setIsCreating(false);
    }
  };

  const durationOptions = [
    { value: 1, label: '1 Hour' },
    { value: 3, label: '3 Hours' },
    { value: 12, label: '12 Hours' },
    { value: 24, label: '1 Day' },
    { value: 72, label: '3 Days' },
    { value: 168, label: '1 Week' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-md w-full max-h-screen overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Create Land Auction</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Land Info */}
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-2">Your Land</h3>
              <div className="text-gray-300 space-y-1">
                <p>Location: ({formData.landCenterX}, {formData.landCenterY})</p>
                <p>Size: {formData.landSize}x{formData.landSize} pixels</p>
              </div>
            </div>

            {/* Starting Price */}
            <div>
              <label className="block text-white font-medium mb-2">
                Starting Price 🪙
              </label>
              <input
                type="number"
                value={formData.startingPrice}
                onChange={(e) => setFormData(prev => ({ ...prev, startingPrice: Number(e.target.value) }))}
                min="1"
                className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-white font-medium mb-2">
                Auction Duration
              </label>
              <select
                value={formData.duration}
                onChange={(e) => setFormData(prev => ({ ...prev, duration: Number(e.target.value) }))}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                required
              >
                {durationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Buy Now Option */}
            <div>
              <label className="flex items-center text-white mb-2">
                <input
                  type="checkbox"
                  checked={enableBuyNow}
                  onChange={(e) => setEnableBuyNow(e.target.checked)}
                  className="mr-2"
                />
                Enable "Buy Now" option
              </label>
              {enableBuyNow && (
                <input
                  type="number"
                  value={formData.buyNowPrice || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, buyNowPrice: Number(e.target.value) }))}
                  placeholder="Buy now price"
                  min={formData.startingPrice + 1}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-900 border border-red-600 text-red-200 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create Auction'}
              </button>
            </div>
          </form>

          {/* Info */}
          <div className="mt-6 text-xs text-gray-400 space-y-1">
            <p>• You can only cancel auctions with no bids</p>
            <p>• Auctions automatically extend if bids are placed near the end</p>
            <p>• You'll receive payment when the auction ends</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateAuctionModal;