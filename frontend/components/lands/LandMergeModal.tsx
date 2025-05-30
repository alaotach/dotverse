import React, { useState } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { useEconomy } from '../../src/context/EconomyContext';
import { landMergingService, type MergeCandidate } from '../../src/services/landMergingService';
import { FiX, FiArrowRight, FiDollarSign, FiAlertTriangle } from 'react-icons/fi';

interface LandMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  primaryLandId: string;
  mergeCandidate: MergeCandidate;
  onSuccess: () => void;
}

const LandMergeModal: React.FC<LandMergeModalProps> = ({
  isOpen,
  onClose,
  primaryLandId,
  mergeCandidate,
  onSuccess
}) => {
  const { currentUser } = useAuth();
  const { userEconomy, refreshEconomy } = useEconomy();
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string>('');

  const handleMerge = async () => {
    if (!currentUser) {
      setError('You must be logged in to merge lands');
      return;
    }

    if (!userEconomy || (userEconomy.balance || 0) < mergeCandidate.cost) {
      setError('Insufficient funds for this merge');
      return;
    }

    setIsMerging(true);
    setError('');

    try {
      const result = await landMergingService.mergeLands(
        currentUser.uid,
        primaryLandId,
        mergeCandidate.land.id
      );

      if (result.success) {
        await refreshEconomy();
        onSuccess();
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError('Failed to merge lands. Please try again.');
      console.error('Merge error:', error);
    } finally {
      setIsMerging(false);
    }
  };

  const canAfford = userEconomy && (userEconomy.balance || 0) >= mergeCandidate.cost;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Merge Lands</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="mb-6">
          <div className="bg-gray-700 rounded-lg p-4 mb-4">
            <h3 className="text-white font-semibold mb-3">Merge Preview</h3>
            <div className="flex items-center justify-center space-x-4">
              <div className="text-center">
                <div className="text-gray-300 text-sm mb-1">Primary Land</div>
                <div className="bg-blue-600 w-12 h-12 rounded flex items-center justify-center text-white text-xs">
                  {mergeCandidate.land.ownedSize}×{mergeCandidate.land.ownedSize}
                </div>
              </div>
              
              <FiArrowRight className="text-gray-400" size={20} />
              
              <div className="text-center">
                <div className="text-gray-300 text-sm mb-1">Adjacent Land ({mergeCandidate.direction})</div>
                <div className="bg-blue-600 w-12 h-12 rounded flex items-center justify-center text-white text-xs">
                  {mergeCandidate.land.ownedSize}×{mergeCandidate.land.ownedSize}
                </div>
              </div>
              
              <FiArrowRight className="text-gray-400" size={20} />
              
              <div className="text-center">
                <div className="text-gray-300 text-sm mb-1">Merged Result</div>
                <div className="bg-green-600 w-16 h-12 rounded flex items-center justify-center text-white text-xs">
                  {mergeCandidate.resultingSize}×{mergeCandidate.resultingSize}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-700 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-300">Merge Cost:</span>
              <span className="text-yellow-400 font-bold flex items-center">
                <FiDollarSign className="mr-1" />
                {mergeCandidate.cost} 🪙
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Your Balance:</span>
              <span className={`font-bold ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                {userEconomy?.balance?.toLocaleString() || 0} 🪙
              </span>
            </div>
          </div>

          {!canAfford && (
            <div className="bg-red-900/20 border border-red-600 rounded-lg p-3 mb-4">
              <div className="flex items-center text-red-400">
                <FiAlertTriangle className="mr-2" size={16} />
                <span className="text-sm">Insufficient funds for this merge</span>
              </div>
            </div>
          )}
        </div>

        <div className="mb-6">
          <h4 className="text-white font-medium mb-2">Merge Details:</h4>
          <ul className="text-gray-300 text-sm space-y-1">
            <li>• Combines two adjacent lands into one larger plot</li>
            <li>• Original lands will be replaced by a single merged land</li>
            <li>• New land size: {mergeCandidate.resultingSize}×{mergeCandidate.resultingSize} pixels</li>
            <li>• Direction: Merging to the {mergeCandidate.direction}</li>
          </ul>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={isMerging || !canAfford}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
          >
            {isMerging ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                Merging...
              </>
            ) : (
              <>
                <FiDollarSign className="mr-2" />
                Merge for {mergeCandidate.cost} 🪙
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LandMergeModal;