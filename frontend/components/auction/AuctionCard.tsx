import React, { useState, useEffect } from 'react';
import { LandAuction, auctionService } from '../../src/services/auctionService';
import { useAuth } from '../../src/context/AuthContext';
import { useEconomy } from '../../src/context/EconomyContext';

interface AuctionCardProps {
  auction: LandAuction;
  isOwner?: boolean;
  isHighestBidder?: boolean;
}

const AuctionCard: React.FC<AuctionCardProps> = ({ auction, isOwner, isHighestBidder }) => {
  const { currentUser, userProfile } = useAuth();
  const { userEconomy } = useEconomy();
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [bidAmount, setBidAmount] = useState<number>(auction.currentBid + 1);
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const [showBidInput, setShowBidInput] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const endTime = auction.endTime.toDate();
      const timeDiff = endTime.getTime() - now.getTime();

      if (timeDiff <= 0) {
        setTimeLeft('Ended');
        return;
      }

      const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [auction.endTime]);

  const handlePlaceBid = async () => {
    if (!currentUser || !userProfile) {
      setError('Please log in to place a bid');
      return;
    }

    if (bidAmount <= auction.currentBid) {
      setError(`Bid must be higher than ${auction.currentBid} 🪙`);
      return;
    }

    if (!userEconomy || userEconomy.balance! < bidAmount) {
      setError('Insufficient funds');
      return;
    }

    setIsPlacingBid(true);
    setError('');

    try {
      await auctionService.placeBid(
        auction.id,
        currentUser.uid,
        userProfile.displayName || userProfile.email || 'Anonymous',
        bidAmount
      );
      setShowBidInput(false);
      setBidAmount(auction.currentBid + 1);
    } catch (err: any) {
      setError(err.message || 'Failed to place bid');
    } finally {
      setIsPlacingBid(false);
    }
  };

  const handleBuyNow = async () => {
    if (!currentUser || !userProfile || !auction.buyNowPrice) return;

    if (!userEconomy || userEconomy.balance! < auction.buyNowPrice) {
      setError('Insufficient funds for buy now');
      return;
    }

    if (confirm(`Buy this land immediately for ${auction.buyNowPrice} 🪙?`)) {
      setIsPlacingBid(true);
      setError('');

      try {
        await auctionService.buyNow(
          auction.id,
          currentUser.uid,
          userProfile.displayName || userProfile.email || 'Anonymous'
        );
      } catch (err: any) {
        setError(err.message || 'Failed to complete purchase');
      } finally {
        setIsPlacingBid(false);
      }
    }
  };

  const handleCancelAuction = async () => {
    if (!currentUser) return;

    if (confirm('Are you sure you want to cancel this auction?')) {
      try {
        await auctionService.cancelAuction(auction.id, currentUser.uid);
      } catch (err: any) {
        setError(err.message || 'Failed to cancel auction');
      }
    }
  };

  const getStatusColor = () => {
    switch (auction.status) {
      case 'active':
        return timeLeft === 'Ended' ? 'text-red-400' : 'text-green-400';
      case 'ended':
        return 'text-gray-400';
      case 'cancelled':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const isEnded = auction.status === 'ended' || timeLeft === 'Ended';
  const isActive = auction.status === 'active' && !isEnded;
  const canBid = isActive && currentUser && auction.ownerId !== currentUser.uid;

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-semibold">
            Land ({auction.landCenterX}, {auction.landCenterY})
          </h3>
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {auction.status === 'cancelled' ? 'Cancelled' : timeLeft}
          </span>
        </div>
        <p className="text-gray-400 text-sm">
          Size: {auction.landSize}x{auction.landSize} | Owner: {auction.ownerDisplayName}
        </p>
      </div>

      {/* Land Preview */}
      <div className="p-4">
        <div className="w-full h-32 bg-gray-700 rounded-lg flex items-center justify-center mb-4">
          <div className="text-center">
            <div className="text-2xl mb-1">🏞️</div>
            <div className="text-xs text-gray-400">Land Preview</div>
          </div>
        </div>

        {/* Bid Info */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between">
            <span className="text-gray-400">Current Bid:</span>
            <span className="font-semibold">{auction.currentBid} 🪙</span>
          </div>
          {auction.buyNowPrice && (
            <div className="flex justify-between">
              <span className="text-gray-400">Buy Now:</span>
              <span className="font-semibold text-yellow-400">{auction.buyNowPrice} 🪙</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-400">Bids:</span>
            <span>{auction.bidHistory.length}</span>
          </div>
          {auction.highestBidderName && (
            <div className="flex justify-between">
              <span className="text-gray-400">Leading:</span>
              <span className="text-green-400">{auction.highestBidderName}</span>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900 border border-red-600 text-red-200 px-3 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {isOwner ? (
            <div className="space-y-2">
              {auction.status === 'active' && auction.bidHistory.length === 0 && (
                <button
                  onClick={handleCancelAuction}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors"
                >
                  Cancel Auction
                </button>
              )}
              {auction.status === 'ended' && auction.highestBidderId && (
                <div className="text-center text-green-400 font-medium">
                  Sold to {auction.highestBidderName}!
                </div>
              )}
            </div>
          ) : canBid ? (
            <div className="space-y-2">
              {!showBidInput ? (
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => setShowBidInput(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
                  >
                    Place Bid
                  </button>
                  {auction.buyNowPrice && (
                    <button
                      onClick={handleBuyNow}
                      disabled={isPlacingBid}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isPlacingBid ? 'Processing...' : `Buy Now ${auction.buyNowPrice} 🪙`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(Number(e.target.value))}
                      min={auction.currentBid + 1}
                      className="flex-1 bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                    <span className="flex items-center text-gray-400">🪙</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handlePlaceBid}
                      disabled={isPlacingBid}
                      className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition-colors disabled:opacity-50"
                    >
                      {isPlacingBid ? '...' : 'Bid'}
                    </button>
                    <button
                      onClick={() => {
                        setShowBidInput(false);
                        setError('');
                      }}
                      className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : isEnded && isHighestBidder ? (
            <div className="text-center text-green-400 font-medium">
              You won this auction! 🎉
            </div>
          ) : isEnded ? (
            <div className="text-center text-gray-400">
              Auction ended
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AuctionCard;