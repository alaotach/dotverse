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
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreview(result);
        setFormData(prev => ({
          ...prev,
          imageUrl: result
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedLand) {
      setError('Please select a land to auction');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const auctionData: CreateAuctionData = {
        ...formData,
        landCenterX: selectedLand.centerX,
        landCenterY: selectedLand.centerY,
        landSize: selectedLand.ownedSize,
        buyNowPrice: enableBuyNow ? formData.buyNowPrice : undefined
      };

      const result = await auctionService.createAuction(currentUser.uid, auctionData);
      
      if (result.success) {
        onSuccess();
      } else {
        setError(result.message || 'Failed to create auction');
      }
    } catch (error) {
      console.error('Error creating auction:', error);
      setError('Failed to create auction. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  if (!currentUser) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Create Auction</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {loadingLands ? (
            <div className="text-center py-4">Loading your lands...</div>
          ) : userLands.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              No available lands to auction
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Land
                </label>
                <select
                  value={selectedLand?.id || ''}
                  onChange={(e) => {
                    const land = userLands.find(l => l.id === e.target.value);
                    setSelectedLand(land || null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Choose a land...</option>
                  {userLands.map(land => (
                    <option key={land.id} value={land.id}>
                      {land.displayName || `Land at (${land.centerX}, ${land.centerY})`} - {land.ownedSize}×{land.ownedSize}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Starting Price (🪙)
                </label>
                <input
                  type="number"
                  name="startingPrice"
                  value={formData.startingPrice}
                  onChange={handleInputChange}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duration (hours)
                </label>
                <input
                  type="number"
                  name="duration"
                  value={formData.duration}
                  onChange={handleInputChange}
                  min="1"
                  max="168"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableBuyNow"
                  checked={enableBuyNow}
                  onChange={(e) => setEnableBuyNow(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="enableBuyNow" className="text-sm font-medium text-gray-700">
                  Enable Buy Now option
                </label>
              </div>

              {enableBuyNow && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Buy Now Price (🪙)
                  </label>
                  <input
                    type="number"
                    name="buyNowPrice"
                    value={formData.buyNowPrice || ''}
                    onChange={handleInputChange}
                    min={formData.startingPrice + 1}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Auction Image (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {imagePreview && (
                  <div className="mt-2">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-32 object-cover rounded-md"
                    />
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !selectedLand}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreating ? 'Creating...' : 'Create Auction'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default CreateAuctionModal;