import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserLandInfo } from '../../src/services/landService';
import type { LandAuction } from '../../src/services/auctionService';

interface LandCardProps {
  land: UserLandInfo;
  auction?: LandAuction;
  onEdit?: (land: UserLandInfo) => void;
  onNameUpdate?: (landId: string, newName: string) => void;
  showActions?: boolean;
}

const LandCard: React.FC<LandCardProps> = ({ 
  land, 
  auction, 
  onEdit, 
  onNameUpdate, 
  showActions = true 
}) => {
  const navigate = useNavigate();
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(land.displayName || '');
  const isBeingAuctioned = land.isAuctioned || !!auction;

  const goToLand = () => {
    navigate(`/canvas?x=${land.centerX}&y=${land.centerY}`);
  };

  const goToAuction = () => {
    if (auction) {
      navigate(`/auction?id=${auction.id}`);
    } else if (land.auctionId) {
      navigate(`/auction?id=${land.auctionId}`);
    }
  };

  const handleNameSubmit = () => {
    if (onNameUpdate && tempName.trim()) {
      onNameUpdate(land.id, tempName.trim());
      setIsEditingName(false);
    }
  };

  const handleNameKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setTempName(land.displayName || '');
      setIsEditingName(false);
    }
  };

  return (
    <div className={`relative bg-white rounded-lg p-4 border-2 transition-all hover:shadow-md ${
      isBeingAuctioned ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 hover:border-blue-300'
    }`}>
      {/* Auction Badge */}
      {isBeingAuctioned && (
        <div 
          className="absolute -top-2 -right-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded-full font-bold cursor-pointer hover:bg-yellow-600"
          onClick={goToAuction}
        >
          AUCTION
        </div>
      )}
      
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          {isEditingName ? (
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleNameKeyPress}
              className="font-semibold text-gray-800 bg-transparent border-b border-blue-500 outline-none w-full"
              placeholder="Enter land name"
              autoFocus
            />
          ) : (
            <h3 
              className="font-semibold text-gray-800 flex items-center gap-2 cursor-pointer hover:text-blue-600"
              onClick={() => setIsEditingName(true)}
            >
              {land.displayName || 'Unnamed Land'}
              {!land.displayName && (
                <span className="text-xs text-gray-500">(click to name)</span>
              )}
            </h3>
          )}
        </div>
        
        {showActions && onEdit && (
          <button
            onClick={() => onEdit(land)}
            className="text-gray-500 hover:text-blue-600 text-sm"
          >
            Edit
          </button>
        )}
      </div>
      
      <div className="text-sm text-gray-600 mb-3">
        <div>Position: ({land.centerX}, {land.centerY})</div>
        <div>Size: {land.ownedSize}×{land.ownedSize} pixels</div>
        {isBeingAuctioned && auction && (
          <div className="text-yellow-600 font-medium">
            Current Bid: ${auction.currentBid}
          </div>
        )}
      </div>
      
      <div className="flex gap-2">
        <button
          onClick={goToLand}
          className="flex-1 bg-blue-500 text-white px-3 py-2 rounded text-sm hover:bg-blue-600 transition-colors"
        >
          View Land
        </button>
        
        {isBeingAuctioned && (
          <button
            onClick={goToAuction}
            className="flex-1 bg-yellow-500 text-white px-3 py-2 rounded text-sm hover:bg-yellow-600 transition-colors"
          >
            View Auction
          </button>
        )}
      </div>
    </div>
  );
};

export default LandCard;