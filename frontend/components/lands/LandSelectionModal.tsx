import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { UserLandInfo, getUserLands } from '../../src/services/landService';
import ModalWrapper from '../common/ModalWrapper';

interface LandSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLandSelect: (land: UserLandInfo) => void;
  userId: string;
}

const LandSelectionModal: React.FC<LandSelectionModalProps> = ({
  isOpen,
  onClose,
  onLandSelect,
  userId
}) => {
  const [lands, setLands] = useState<UserLandInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      loadLands();
    }
  }, [isOpen, userId]);

  const loadLands = async () => {
    setLoading(true);
    try {
      const userLands = await getUserLands(userId);
      setLands(userLands);
    } catch (error) {
      console.error('Error loading lands:', error);
    } finally {
      setLoading(false);
    }
  };
  if (!isOpen) return null;

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
      <div className="bg-gray-800 rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Select Land to Animate</h2>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="text-gray-400 hover:text-white transition-colors modal-close-button ui-element"
            style={{
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation'
            }}
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading lands...</div>
          ) : lands.length === 0 ? (
            <div className="text-center text-gray-400 py-8">No lands found</div>
          ) : (
            <div className="space-y-3">
              {lands.map((land) => (
                <button
                  key={land.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onLandSelect(land);
                    onClose();
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onLandSelect(land);
                    onClose();
                  }}
                  className="w-full p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-left transition-colors ui-element"
                  style={{
                    minHeight: '48px',
                    touchAction: 'manipulation'
                  }}
                >
                  <div className="text-white font-medium">
                    {land.displayName || `Land #${land.id}`}
                  </div>
                  <div className="text-gray-400 text-sm">
                    Position: ({land.centerX}, {land.centerY}) - {land.ownedSize}×{land.ownedSize}
                  </div>
                  {land.hasAnimation && (
                    <div className="text-green-400 text-sm mt-1">
                      ✓ Has animation
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
};

export default LandSelectionModal;