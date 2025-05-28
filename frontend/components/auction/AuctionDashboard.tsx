import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { auctionService, LandAuction } from '../../src/services/auctionService';
import { useEconomy } from '../../src/context/EconomyContext';
import AuctionCard from './AuctionCard';
import CreateAuctionModal from './CreateAuctionModal';

type FilterType = 'all' | 'ending-soon' | 'cheapest' | 'most-bids';
type TabType = 'browse' | 'my-auctions' | 'my-bids';

const AuctionDashboard: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const { userEconomy } = useEconomy();
  const [activeTab, setActiveTab] = useState<TabType>('browse');
  const [auctions, setAuctions] = useState<LandAuction[]>([]);
  const [userAuctions, setUserAuctions] = useState<LandAuction[]>([]);
  const [userBids, setUserBids] = useState<LandAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [maxPrice, setMaxPrice] = useState<number | ''>('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [activeAuctions, myAuctions, myBids] = await Promise.all([
          auctionService.getActiveAuctions(),
          auctionService.getUserAuctions(currentUser.uid),
          auctionService.getUserBids(currentUser.uid)
        ]);

        setAuctions(activeAuctions);
        setUserAuctions(myAuctions);
        setUserBids(myBids);
      } catch (error) {
        console.error('Error loading auction data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Subscribe to real-time updates for active auctions
    const unsubscribe = auctionService.subscribeToActiveAuctions((activeAuctions) => {
      setAuctions(activeAuctions);
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser]);

  const filteredAuctions = useMemo(() => {
    let filtered = [...auctions];

    // Apply filters
    switch (filter) {
      case 'ending-soon':
        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
        filtered = filtered.filter(auction => 
          auction.endTime.toDate() <= oneHourFromNow
        );
        break;
      case 'cheapest':
        filtered.sort((a, b) => a.currentBid - b.currentBid);
        break;
      case 'most-bids':
        filtered.sort((a, b) => b.bidHistory.length - a.bidHistory.length);
        break;
    }

    // Apply price filter
    if (maxPrice !== '' && maxPrice > 0) {
      filtered = filtered.filter(auction => auction.currentBid <= maxPrice);
    }

    return filtered;
  }, [auctions, filter, maxPrice]);

  const getTabButtonClass = (tab: TabType) => {
    return `px-6 py-3 rounded-lg font-medium transition-colors ${
      activeTab === tab
        ? 'bg-blue-600 text-white'
        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
    }`;
  };

  const getFilterButtonClass = (filterType: FilterType) => {
    return `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      filter === filterType
        ? 'bg-blue-600 text-white'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p>Please log in to access the auction house</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading auctions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">🏛️ Auction House</h1>
          <div className="flex items-center gap-4">
            {userEconomy && (
              <div className="bg-gradient-to-r from-yellow-600 to-orange-600 px-4 py-2 rounded-lg">
                <span className="font-semibold">
                  {userEconomy.balance?.toLocaleString() || 0} 🪙
                </span>
              </div>
            )}
            {userProfile?.landInfo && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Sell My Land
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6">
          <button
            onClick={() => setActiveTab('browse')}
            className={getTabButtonClass('browse')}
          >
            Browse Auctions ({auctions.length})
          </button>
          <button
            onClick={() => setActiveTab('my-auctions')}
            className={getTabButtonClass('my-auctions')}
          >
            My Auctions ({userAuctions.length})
          </button>
          <button
            onClick={() => setActiveTab('my-bids')}
            className={getTabButtonClass('my-bids')}
          >
            My Bids ({userBids.length})
          </button>
        </div>

        {/* Browse Tab */}
        {activeTab === 'browse' && (
          <>
            {/* Filters */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilter('all')}
                    className={getFilterButtonClass('all')}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilter('ending-soon')}
                    className={getFilterButtonClass('ending-soon')}
                  >
                    Ending Soon ⏰
                  </button>
                  <button
                    onClick={() => setFilter('cheapest')}
                    className={getFilterButtonClass('cheapest')}
                  >
                    Cheapest 💰
                  </button>
                  <button
                    onClick={() => setFilter('most-bids')}
                    className={getFilterButtonClass('most-bids')}
                  >
                    Most Bids 🔥
                  </button>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-300">Max Price:</label>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Any"
                    className="bg-gray-700 text-white px-3 py-1 rounded w-24 text-sm"
                  />
                  <span className="text-sm text-gray-300">🪙</span>
                </div>
              </div>
            </div>

            {/* Auction Grid */}
            {filteredAuctions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg">No auctions found matching your criteria</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAuctions.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} />
                ))}
              </div>
            )}
          </>
        )}

        {/* My Auctions Tab */}
        {activeTab === 'my-auctions' && (
          <div>
            {userAuctions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg mb-4">You haven't created any auctions yet</p>
                {userProfile?.landInfo && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    Create Your First Auction
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {userAuctions.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} isOwner={true} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* My Bids Tab */}
        {activeTab === 'my-bids' && (
          <div>
            {userBids.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg">You haven't placed any bids yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {userBids.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} isHighestBidder={true} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Auction Modal */}
      {showCreateModal && (
        <CreateAuctionModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            // Refresh user auctions
            if (currentUser) {
              auctionService.getUserAuctions(currentUser.uid).then(setUserAuctions);
            }
          }}
        />
      )}
    </div>
  );
};

export default AuctionDashboard;