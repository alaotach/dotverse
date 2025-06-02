import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../src/context/AuthContext';
import { useEconomy } from '../../src/context/EconomyContext';
import type { UserLandInfo } from '../../src/services/landService';
import type { LandAuction } from '../../src/services/auctionService';
import MakeOfferModal from './MakeOfferModal';
import { FiMapPin, FiMaximize, FiDollarSign, FiClock, FiUser, FiEye, FiFilm } from 'react-icons/fi';
import { landMergingService, type MergeCandidate } from '../../src/services/landMergingService';
import LandMergeModal from './LandMergeModal';
import LandAnimationModal from './LandAnimationModal';
import type { LandFramePixelData } from '../../src/services/landService';
import ModalWrapper from '../common/ModalWrapper';

interface LandInfoPanelProps {
  land: UserLandInfo;
  auction?: LandAuction | null;
  isOwner: boolean;
  onClose: () => void;
  onExpand?: () => void;
  onCreateAuction?: () => void;
  onCaptureCurrentPixels?: (landId: string) => LandFramePixelData;
}

const LandInfoPanel: React.FC<LandInfoPanelProps> = ({
  land,
  auction,
  isOwner,
  onClose,
  onExpand,
  onCreateAuction,
  onCaptureCurrentPixels
}) => {
  const { currentUser, userProfile } = useAuth();
  const { userEconomy } = useEconomy();
  const navigate = useNavigate();
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedMergeCandidate, setSelectedMergeCandidate] = useState<MergeCandidate | null>(null);
  const [showAnimationModal, setShowAnimationModal] = useState(false);9

  useEffect(() => {
    const loadMergeCandidates = async () => {
      if (isOwner && currentUser) {
        const candidates = await landMergingService.findMergeCandidates(currentUser.uid, land.id);
        setMergeCandidates(candidates);
      }
    };
    
    loadMergeCandidates();
  }, [isOwner, currentUser, land.id]);

  const handleViewOnCanvas = () => {
    navigate(`/canvas?x=${land.centerX}&y=${land.centerY}`);
    onClose();
  };

  const handleViewAuction = () => {
    if (auction) {
      navigate(`/auction/`);
      onClose();
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const getTimeRemaining = (endTime: any) => {
    if (!endTime) return '';
    const end = endTime.toDate ? endTime.toDate() : new Date(endTime);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    
    if (diff <= 0) return 'Ended';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  return (
    <>
      <ModalWrapper isOpen={true} onClose={onClose}>
        <div className="bg-gray-800 rounded-lg max-w-md w-full max-h-screen overflow-y-auto">
          <div className="flex justify-between items-center p-6 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">
              {land.displayName || `Land #${land.id.substring(0, 8)}`}
            </h2>
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
              ×
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <FiMapPin className="mr-2" />
                Land Details
              </h3>
              <div className="space-y-2 text-gray-300">
                <div className="flex justify-between">
                  <span>Position:</span>
                  <span>({land.centerX}, {land.centerY})</span>
                </div>
                <div className="flex justify-between">
                  <span>Size:</span>
                  <span>{land.ownedSize}×{land.ownedSize} pixels</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Area:</span>
                  <span>{land.ownedSize * land.ownedSize} pixels</span>
                </div>
                <div className="flex justify-between">
                  <span>Owner:</span>
                  <span className={isOwner ? 'text-green-400' : 'text-gray-300'}>
                    {isOwner ? 'You' : (land.displayName || 'Unknown')}
                  </span>
                </div>
              </div>
            </div>

            {auction && (
              <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-yellow-400 mb-3 flex items-center">
                  <FiDollarSign className="mr-2" />
                  Auction Details
                </h3>
                <div className="space-y-2 text-gray-300">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className="text-yellow-400 font-medium">
                      {auction.status === 'active' ? 'Active' : auction.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current Bid:</span>
                    <span className="text-green-400 font-medium">
                      {auction.currentBid} 🪙
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Starting Price:</span>
                    <span>{auction.startingPrice} 🪙</span>
                  </div>
                  {auction.buyNowPrice && (
                    <div className="flex justify-between">
                      <span>Buy Now Price:</span>
                      <span className="text-blue-400 font-medium">
                        {auction.buyNowPrice} 🪙
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Time Remaining:</span>
                    <span className="text-red-400 font-medium">
                      {getTimeRemaining(auction.endTime)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bids:</span>
                    <span>{auction.bidHistory?.length || 0}</span>
                  </div>
                  {auction.highestBidderName && (
                    <div className="flex justify-between">
                      <span>Highest Bidder:</span>
                      <span className="text-purple-400">
                        {auction.highestBidderName}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <FiUser className="mr-2" />
                Statistics
              </h3>
              <div className="space-y-2 text-gray-300">
                <div className="flex justify-between">
                  <span>Land ID:</span>
                  <span className="font-mono text-sm">{land.id}</span>
                </div>
                <div className="flex justify-between">
                  <span>Created:</span>
                  <span>{formatTime(land.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className={`font-medium ${
                    land.isAuctioned 
                      ? 'text-yellow-400' 
                      : 'text-green-400'
                  }`}>
                    {land.isAuctioned ? 'Being Auctioned' : 'Available'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleViewOnCanvas}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
              >
                <FiEye className="mr-2" />
                View on Canvas
              </button>

              {isOwner && mergeCandidates.length > 0 && (
                <div className="bg-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                    <FiArrowRight className="mr-2" />
                    Merge Options
                  </h3>
                  <div className="space-y-2">
                    {mergeCandidates.map((candidate, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setSelectedMergeCandidate(candidate);
                          setShowMergeModal(true);
                        }}
                        className="w-full bg-gray-600 hover:bg-gray-500 text-white p-3 rounded-lg transition-colors text-left"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-medium flex items-center">
                              {candidate.direction === 'irregular' ? (
                                <>
                                  <FiGrid className="mr-1 text-orange-400" size={16} />
                                  Irregular merge → {candidate.resultingSize}×{candidate.resultingSize}
                                </>
                              ) : (
                                `Merge ${candidate.direction} → ${candidate.resultingSize}×${candidate.resultingSize}`
                              )}
                              {candidate.resultingShape === 'irregular' && (
                                <span className="ml-2 text-orange-400 text-xs">(Irregular Shape)</span>
                              )}
                            </div>
                            <div className="text-gray-300 text-sm">
                              {candidate.resultingShape === 'irregular' 
                                ? 'Creates an irregular-shaped land plot'
                                : 'Combine with adjacent land'
                              }
                            </div>
                          </div>
                          <div className="text-yellow-400 font-bold">
                            {candidate.cost} 🪙
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isOwner && (
                <button
                  onClick={() => setShowAnimationModal(true)}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded transition-colors"
                >
                  <FiFilm />
                  {land.hasAnimation ? 'Edit Animation' : 'Create Animation'}
                </button>
              )}

              {showAnimationModal && (
                <LandAnimationModal
                  isOpen={showAnimationModal}
                  onClose={() => setShowAnimationModal(false)}
                  land={land}
                  onCaptureCurrentPixels={onCaptureCurrentPixels || (() => ({}))}
                  onSuccess={() => setShowAnimationModal(false)}
                />
              )}

              {isOwner && (
                <>
                  {!land.isAuctioned && onExpand && (
                    <button
                      onClick={() => {
                        onExpand();
                        onClose();
                      }}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
                    >
                      <FiMaximize className="mr-2" />
                      Expand Land
                    </button>
                  )}

                  {!land.isAuctioned && onCreateAuction && (
                    <button
                      onClick={() => {
                        onCreateAuction();
                        onClose();
                      }}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
                    >
                      <FiDollarSign className="mr-2" />
                      Create Auction
                    </button>
                  )}

                  {auction && (
                    <button
                      onClick={handleViewAuction}
                      className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
                    >
                      <FiClock className="mr-2" />
                      Manage Auction
                    </button>
                  )}
                </>
              )}

              {!isOwner && currentUser && (
                <>
                  {auction ? (
                    <button
                      onClick={handleViewAuction}
                      className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
                    >
                      <FiDollarSign className="mr-2" />
                      View Auction
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowOfferModal(true)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
                    >
                      <FiDollarSign className="mr-2" />
                      Make Offer
                    </button>
                  )}
                </>
              )}

              {currentUser && userEconomy && (
                <div className="bg-gray-700 rounded-lg p-3 text-center">
                  <span className="text-gray-300">Your Balance: </span>
                  <span className="text-green-400 font-medium">
                    {(userEconomy.balance || 0).toLocaleString()} 🪙
                  </span>
                </div>
              )}
            </div>

            {!isOwner && (
              <div className="bg-blue-900/30 border border-blue-600 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-400 mb-2">
                  Investment Potential
                </h3>
                <div className="text-gray-300 text-sm space-y-1">
                  <p>• Large canvas area for creative projects</p>
                  <p>• Strategic location at ({land.centerX}, {land.centerY})</p>
                  <p>• {land.ownedSize * land.ownedSize} pixels of creative space</p>
                  <p>• Expandable with future updates</p>                </div>
              </div>
            )}
          </div>
        </div>
      </ModalWrapper>

      {showOfferModal && !isOwner && currentUser && (
        <MakeOfferModal
          isOpen={showOfferModal}
          onClose={() => setShowOfferModal(false)}
          landId={land.id}
          landOwner={{
            userId: land.owner,
            displayName: land.displayName || 'Unknown Owner'
          }}
          landInfo={{
            centerX: land.centerX,
            centerY: land.centerY,
            size: land.ownedSize
          }}
          onSuccess={() => {
            setShowOfferModal(false);
          }}
        />
      )}

      {showMergeModal && selectedMergeCandidate && (
        <LandMergeModal
          isOpen={showMergeModal}
          onClose={() => {
            setShowMergeModal(false);
            setSelectedMergeCandidate(null);
          }}
          primaryLandId={land.id}
          mergeCandidate={selectedMergeCandidate}
          onSuccess={() => {
            setShowMergeModal(false);
            setSelectedMergeCandidate(null);
            onClose();
          }}
        />
      )}
    </>
  );
};

export default LandInfoPanel;