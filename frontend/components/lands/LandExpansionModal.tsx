import React, { useState, useEffect } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { useEconomy } from '../../src/context/EconomyContext';
import { landExpansionService } from '../../src/services/landExpansionService';
import { getUserLands, type UserLandInfo } from '../../src/services/landService';

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
  const [latestLandSize, setLatestLandSize] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTimestamp, setRefreshTimestamp] = useState(Date.now());
  const [manualRefresh, setManualRefresh] = useState(false);

  const getLandToExpand = () => {
    return selectedLand || (userProfile?.landInfo ? {
      id: 'profile-land',
      centerX: userProfile.landInfo.centerX,
      centerY: userProfile.landInfo.centerY,
      ownedSize: userProfile.landInfo.ownedSize,
      owner: currentUser?.uid || '',
      displayName: 'My Land',
      isAuctioned: false
    } : null);
  };

  const fetchLatestLandSize = async (skipLoadingState = false) => {
    if (!skipLoadingState) {
      setIsRefreshing(true);
    }
    
    try {
      if (!currentUser) return;
      
      await refreshProfile();
      if (selectedLand) {
        const lands = await getUserLands(currentUser.uid);
        const updatedLand = lands.find(land => 
          land.centerX === selectedLand.centerX && 
          land.centerY === selectedLand.centerY
        );
        
        if (updatedLand) {
          console.log("[LandExpansionModal] Found updated land size:", updatedLand.ownedSize);
          setLatestLandSize(updatedLand.ownedSize);
          return updatedLand.ownedSize;
        }
      }
      
      if (userProfile?.landInfo) {
        console.log("[LandExpansionModal] Using profile land size:", userProfile.landInfo.ownedSize);
        setLatestLandSize(userProfile.landInfo.ownedSize);
        return userProfile.landInfo.ownedSize;
      }
      
      return 50;
    } catch (error) {
      console.error("Error fetching latest land size:", error);
      return selectedLand?.ownedSize || userProfile?.landInfo?.ownedSize || 50;
    } finally {
      if (!skipLoadingState) {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    if (isOpen && !previewData) {
      const initialLoad = async () => {
        setIsRefreshing(true);
        try {
          const size = await fetchLatestLandSize(true);
          if (isMounted) {
            const preview = landExpansionService.getExpansionPreview(size);
            setPreviewData(preview);
            console.log('[LandExpansionModal] Initial load with size:', size, 'Preview:', preview);
            setRefreshTimestamp(Date.now());
          }
        } finally {
          if (isMounted) {
            setIsRefreshing(false);
          }
        }
      };
      
      initialLoad();
    }
    
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    
    const refreshData = async () => {
      if (!manualRefresh) return;
      
      const size = await fetchLatestLandSize();
      const preview = landExpansionService.getExpansionPreview(size);
      setPreviewData(preview);
      console.log('[LandExpansionModal] Manual refresh with size:', size, 'Preview:', preview);
      setManualRefresh(false);
    };
    
    refreshData();
  }, [refreshTimestamp, manualRefresh]);

  const handleExpansion = async () => {
    if (!currentUser) {
      setError('Land information not available');
      return;
    }
    
    const landToExpand = getLandToExpand();
    if (!landToExpand) {
      setError('Land information not available');
      return;
    }

    const currentSize = latestLandSize || 
      selectedLand?.ownedSize || 
      userProfile?.landInfo?.ownedSize || 50;
    
    if (!userEconomy || (userEconomy.balance || 0) < previewData.cost) {
      setError(`Insufficient funds. You need ${previewData.cost} 🪙`);
      return;
    }

    const MAX_LAND_SIZE = 200; 
    if (currentSize >= MAX_LAND_SIZE) {
      setError(`Land has reached the maximum size limit of ${MAX_LAND_SIZE}x${MAX_LAND_SIZE}`);
      return;
    }

    setIsExpanding(true);
    setError('');

    try {
      console.log('[LandExpansionModal] Requesting expansion with VERIFIED current size:', currentSize);
      
      const result = await landExpansionService.requestLandExpansion(
        currentUser.uid,
        landToExpand.centerX,
        landToExpand.centerY,
        currentSize
      );

      if (result.success) {
        console.log('[LandExpansionModal] Expansion successful, new size:', result.newSize);
        
        await Promise.all([
          refreshProfile(),
          refreshEconomy()
        ]);

        if (result.newSize) {
          setLatestLandSize(result.newSize);
          const newPreview = landExpansionService.getExpansionPreview(result.newSize);
          setPreviewData(newPreview);
          console.log('[LandExpansionModal] Updated preview with confirmed new size:', result.newSize);
        }
        
        onSuccess();
        setRefreshTimestamp(Date.now());
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

  const triggerManualRefresh = () => {
    setManualRefresh(true);
    setRefreshTimestamp(Date.now());
  };

  const landToExpand = getLandToExpand();
  if (!isOpen || !previewData || !landToExpand) return null;

  const canAfford = userEconomy && previewData.canAfford(userEconomy.balance || 0);

  const displaySize = latestLandSize || 
    (selectedLand?.ownedSize || userProfile?.landInfo?.ownedSize || 50);

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
          {isRefreshing && (
            <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-3 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent mr-2"></div>
              <div className="text-blue-300 text-sm">Refreshing land data...</div>
            </div>
          )}

          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              {landToExpand.displayName || `Land at (${landToExpand.centerX}, ${landToExpand.centerY})`}
            </h3>
            <div className="text-gray-300">
              <div>Current Size: {displaySize}×{displaySize} pixels</div>
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

          <button
            onClick={triggerManualRefresh}
            disabled={isRefreshing}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-blue-700 disabled:opacity-50 transition-colors mb-2 flex items-center justify-center gap-2"
          >
            {isRefreshing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Refreshing...</span>
              </>
            ) : (
              <span>Refresh Land Data</span>
            )}
          </button>

          {previewData.isAtMaxSize && (
            <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-3">
              <div className="text-yellow-300 text-sm">
                ⚠️ This expansion will reach the maximum land size limit of 200×200.
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
              disabled={!canAfford || isExpanding || previewData.isAtMaxSize || isRefreshing || displaySize >= 200}
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