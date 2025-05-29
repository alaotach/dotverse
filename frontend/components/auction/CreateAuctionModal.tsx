import React, { useState, useEffect } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { auctionService } from '../../src/services/auctionService';
import type { CreateAuctionData } from '../../src/services/auctionService';
import { getUserLands, type UserLandInfo } from '../../src/services/landService';

interface CreateAuctionModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const CreateAuctionModal: React.FC<CreateAuctionModalProps> = ({ onClose, onSuccess }) => {
  const { currentUser, userProfile } = useAuth();
  
  const [userLands, setUserLands] = useState<UserLandInfo[]>([]);
  const [selectedLand, setSelectedLand] = useState<UserLandInfo | null>(null);
  const [loadingLands, setLoadingLands] = useState(true);
    const [formData, setFormData] = useState<CreateAuctionData>({
    landCenterX: 0,
    landCenterY: 0,
    landSize: 50,
    startingPrice: 100,
    duration: 24,
    buyNowPrice: undefined,
    imageUrl: undefined
  });
  const [enableBuyNow, setEnableBuyNow] = useState(false);  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    const loadUserLands = async () => {
      if (!currentUser) return;
      
      setLoadingLands(true);
      try {
        const lands = await getUserLands(currentUser.uid);
        const availableLands = lands.filter(land => !land.isAuctioned);
        setUserLands(availableLands);
        
        if (availableLands.length > 0) {
          const primaryLand = availableLands.find(land => 
            land.centerX === userProfile?.landInfo?.centerX && 
            land.centerY === userProfile?.landInfo?.centerY
          ) || availableLands[0];
          
          setSelectedLand(primaryLand);
          setFormData(prev => ({
            ...prev,
            landCenterX: primaryLand.centerX,
            landCenterY: primaryLand.centerY,
            landSize: primaryLand.ownedSize
          }));
        }
      } catch (error) {
        console.error('Error loading user lands:', error);
        setError('Failed to load your lands');
      } finally {
        setLoadingLands(false);
      }
    };

    loadUserLands();
  }, [currentUser, userProfile]);

  useEffect(() => {
    if (selectedLand) {
      setFormData(prev => ({
        ...prev,
        landCenterX: selectedLand.centerX,
        landCenterY: selectedLand.centerY,
        landSize: selectedLand.ownedSize
      }));
    }  }, [selectedLand]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreview(result);
        setFormData(prev => ({ ...prev, imageUrl: result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser || !userProfile) {
      setError('Please log in to create an auction');
      return;
    }

    if (!selectedLand) {
      setError('Please select a land to auction');
      return;
    }

    if (selectedLand.isAuctioned) {
      setError('This land is already being auctioned');
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
      };      await auctionService.createAuction(
        currentUser.uid,
        userProfile.displayName || userProfile.email || 'Anonymous',
        auctionData
      );

      console.log('[CreateAuctionModal] Auction created successfully for user:', currentUser.uid);
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
          </div>          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Land Selection */}
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-3">Select Land to Auction</h3>
              
              {loadingLands ? (
                <div className="text-gray-300 flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500"></div>
                  Loading your lands...
                </div>
              ) : userLands.length === 0 ? (
                <div className="text-gray-400">
                  <p>No lands available for auction.</p>
                  <p className="text-sm mt-1">You need to own land that isn't already being auctioned.</p>
                </div>
              ) : (                <div className="space-y-2">
                  {userLands.map((land, index) => (
                    <div
                      key={`${land.centerX}-${land.centerY}`}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedLand?.centerX === land.centerX && selectedLand?.centerY === land.centerY
                          ? 'border-blue-500 bg-blue-900/30'
                          : 'border-gray-600 hover:border-gray-500 bg-gray-800'
                      }`}
                      onClick={() => setSelectedLand(land)}
                    >                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-16 h-16 rounded border border-gray-600 bg-gray-700 flex items-center justify-center">
                            <div className="text-center text-xs text-gray-400">
                              <div>{land.ownedSize}×{land.ownedSize}</div>
                              <div>Land</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-white font-medium">
                            Land #{index + 1}
                          </div>
                          <div className="text-gray-300 text-sm">
                            Location: ({land.centerX}, {land.centerY})
                          </div>
                          <div className="text-gray-300 text-sm">
                            Size: {land.ownedSize}×{land.ownedSize} pixels
                          </div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                          selectedLand?.centerX === land.centerX && selectedLand?.centerY === land.centerY
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-gray-500'
                        }`}>
                          {selectedLand?.centerX === land.centerX && selectedLand?.centerY === land.centerY && (
                            <div className="w-full h-full rounded-full bg-white scale-50"></div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-white font-medium mb-2">
                Land Screenshot (Optional)
              </label>
              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
                {imagePreview && (
                  <div className="relative">
                    <img 
                      src={imagePreview} 
                      alt="Land preview" 
                      className="w-full h-32 object-cover rounded border border-gray-600"
                    />
                    <button
                      type="button"                      onClick={() => {
                        setImagePreview(null);
                        setFormData(prev => ({ ...prev, imageUrl: undefined }));
                      }}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-700"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="text-xs text-gray-400">
                  Upload a screenshot of your land to help potential bidders see what they're buying.
                </div>
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
              </button>              <button
                type="submit"
                disabled={isCreating || !selectedLand || loadingLands}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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