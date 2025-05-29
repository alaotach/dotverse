import React, { useState, useEffect } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { useEconomy } from '../../src/context/EconomyContext';
import { landExpansionService } from '../../src/services/landExpansionService';
import { type UserLandInfo } from '../../src/services/landService';

interface LandExpansionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedLand?: UserLandInfo;
}

const LandExpansionModal: React.FC<LandExpansionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  selectedLand
}) => {
  const { currentUser, userProfile, refreshProfile } = useAuth();
  const { userEconomy, refreshEconomy } = useEconomy();
  const [isExpanding, setIsExpanding] = useState(false);
  const [error, setError] = useState<string>('');
  const [previewData, setPreviewData] = useState<any>(null);

  const landToExpand = selectedLand || (userProfile?.landInfo ? {
    id: 'profile-land',
    centerX: userProfile.landInfo.centerX,
    centerY: userProfile.landInfo.centerY,
    ownedSize: userProfile.landInfo.ownedSize,
    owner: currentUser?.uid || '',
    displayName: 'My Land',
    isAuctioned: false
  } : null);

  useEffect(() => {
    if (isOpen && landToExpand) {
      const preview = landExpansionService.getExpansionPreview(landToExpand.ownedSize);
      setPreviewData(preview);
    }
  }, [isOpen, landToExpand]);

  const handleExpansion = async () => {
    if (!currentUser || !landToExpand) {
      setError('Land information not available');
      return;
    }

    if (!userEconomy || (userEconomy.balance || 0) < previewData.cost) {
      setError(`Insufficient funds. You need ${previewData.cost} 🪙`);
      return;
    }

    setIsExpanding(true);
    setError('');

    try {
      const result = await landExpansionService.requestLandExpansion(
        currentUser.uid,
        landToExpand.centerX,
        landToExpand.centerY,
        landToExpand.ownedSize
      );

      if (result.success) {
        await Promise.all([
          refreshProfile(),
          refreshEconomy()
        ]);
        
        onSuccess();
        onClose();
      } else {
        setError(result.message);
      }
    } catch (error) {
      console.error('Land expansion error:', error);
      setError('Failed to expand land. Please try again.');
    } finally {
      setIsExpanding(false);
    }
  };

  if (!isOpen || !previewData || !landToExpand) return null;

  const canAfford = userEconomy && previewData.canAfford(userEconomy.balance || 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Expand Land</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              {landToExpand.displayName || `Land at (${landToExpand.centerX}, ${landToExpand.centerY})`}
            </h3>
            <div className="text-gray-300">
              <div>Current Size: {previewData.currentSize}×{previewData.currentSize} pixels</div>
              <div>Location: ({landToExpand.centerX}, {landToExpand.centerY})</div>
            </div>
          </div>

          <div className="bg-blue-900 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-2">After Expansion</h3>
            <div className="text-gray-300">
              <div>New Size: {previewData.newSize}×{previewData.newSize} pixels</div>
              <div className="text-green-400">
                +{previewData.sizeIncrease} pixels ({previewData.sizeIncrease/2} in each direction)
              </div>
              <div className="text-yellow-400 font-medium mt-2">
                Cost: {previewData.cost.toLocaleString()} 🪙
              </div>
            </div>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-300">Your Balance:</span>
              <span className={`font-medium ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                {(userEconomy?.balance || 0).toLocaleString()} 🪙
              </span>
            </div>
            {!canAfford && (
              <div className="text-red-400 text-sm mt-2">
                You need {(previewData.cost - (userEconomy?.balance || 0)).toLocaleString()} more 🪙
              </div>
            )}
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-2">Visual Preview</h3>
            <div className="flex items-center justify-center">
              <div className="relative">
                <div 
                  className="bg-blue-500 border-2 border-blue-300 flex items-center justify-center"
                  style={{ width: '60px', height: '60px' }}
                >
                  <span className="text-xs text-white">Current</span>
                </div>
                
                <div 
                  className="absolute -inset-2 bg-green-500 bg-opacity-30 border-2 border-green-400 border-dashed flex items-center justify-center"
                  style={{
                    width: '80px',
                    height: '80px',
                    left: '-10px',
                    top: '-10px'
                  }}
                >
                  <span className="text-xs text-green-300 mt-8">+{previewData.sizeIncrease/2}</span>
                </div>
              </div>
            </div>
            <div className="text-center text-sm text-gray-400 mt-2">
              Green area shows expansion
            </div>
          </div>

          {previewData.isAtMaxSize && (
            <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-3">
              <div className="text-yellow-300 text-sm">
                ⚠️ This expansion will reach the maximum land size limit.
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-900 border border-red-600 rounded-lg p-3">
              <div className="text-red-300 text-sm">{error}</div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExpansion}
              disabled={!canAfford || isExpanding || previewData.isAtMaxSize}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              {isExpanding ? 'Expanding...' : `Expand for ${previewData.cost.toLocaleString()} 🪙`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandExpansionModal;