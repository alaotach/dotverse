import React, { useState, useEffect } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { useEconomy } from '../../src/context/EconomyContext';
import { getUserLands, updateLandName, type UserLandInfo } from '../../src/services/landService';
import { auctionService, type LandAuction } from '../../src/services/auctionService';
import { economyService } from '../../src/services/economyService';
import { analyticsService } from '../../src/services/analyticsService';
import LandCard from '../lands/LandCard';
import OfferManagement from '../lands/OfferManagement';
import LandExpansionModal from '../lands/LandExpansionModal';
import CreateAuctionModal from '../auction/CreateAuctionModal';
import { FiUser, FiMapPin, FiDollarSign, FiClock, FiTrendingUp, FiGift } from 'react-icons/fi';

type TabType = 'overview' | 'lands' | 'auctions' | 'offers' | 'transactions';

const UserProfile: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const { userEconomy, refreshUserEconomy } = useEconomy();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [userLands, setUserLands] = useState<UserLandInfo[]>([]);
  const [userAuctions, setUserAuctions] = useState<LandAuction[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showExpansionModal, setShowExpansionModal] = useState(false);
  const [showCreateAuctionModal, setShowCreateAuctionModal] = useState(false);
  const [selectedLand, setSelectedLand] = useState<UserLandInfo | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    if (tab === 'offers') {
      setActiveTab('offers');
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadUserData();
    }
  }, [currentUser, activeTab]);

  const loadUserData = async () => {
    if (!currentUser) return;
    
    setIsLoading(true);
    try {
      switch (activeTab) {
        case 'lands':
          const lands = await getUserLands(currentUser.uid);
          setUserLands(lands);
          break;
        case 'auctions':
          const auctions = await auctionService.getUserAuctions(currentUser.uid);
          setUserAuctions(auctions);
          break;
        case 'transactions':
          const userTransactions = await economyService.getRecentTransactions(currentUser.uid);
          setTransactions(userTransactions);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLandNameUpdate = async (landId: string, newName: string) => {
    try {
      await updateLandName(landId, newName);
      setUserLands(prev => 
        prev.map(land => 
          land.id === landId ? { ...land, displayName: newName } : land
        )
      );
    } catch (error) {
      console.error('Error updating land name:', error);
    }
  };

  const handleExpansionSuccess = () => {
    setShowExpansionModal(false);
    setSelectedLand(null);
    refreshUserEconomy();
    loadUserData();
    
  };

  const handleAuctionSuccess = () => {
    setShowCreateAuctionModal(false);
    setSelectedLand(null);
    loadUserData();
    
  };

  const getTabButtonClass = (tab: TabType) => {
    return `px-4 py-2 rounded-lg font-medium transition-colors ${
      activeTab === tab
        ? 'bg-blue-600 text-white'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Please log in to view your profile.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold mr-4">
                {(userProfile?.displayName || currentUser.email || 'U')[0].toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold">
                  {userProfile?.displayName || 'Anonymous User'}
                </h1>
                <p className="text-gray-400">{currentUser.email}</p>
                <p className="text-sm text-gray-500">
                  Member since {formatTime(userProfile?.createdAt)}
                </p>
              </div>
            </div>
            
            {userEconomy && (
              <div className="text-right">
                <div className="text-3xl font-bold text-green-400">
                  {(userEconomy.balance || 0).toLocaleString()} 🪙
                </div>
                <p className="text-gray-400">Current Balance</p>
                <div className="text-sm text-gray-500 mt-2">
                  <div>Total Earned: {(userEconomy.totalEarned || 0).toLocaleString()} 🪙</div>
                  <div>Total Spent: {(userEconomy.totalSpent || 0).toLocaleString()} 🪙</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={getTabButtonClass('overview')}
          >
            <FiUser className="inline mr-2" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab('lands')}
            className={getTabButtonClass('lands')}
          >
            <FiMapPin className="inline mr-2" />
            My Lands ({userLands.length})
          </button>
          <button
            onClick={() => setActiveTab('auctions')}
            className={getTabButtonClass('auctions')}
          >
            <FiDollarSign className="inline mr-2" />
            My Auctions
          </button>
          <button
            onClick={() => setActiveTab('offers')}
            className={getTabButtonClass('offers')}
          >
            <FiGift className="inline mr-2" />
            Offers
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={getTabButtonClass('transactions')}
          >
            <FiClock className="inline mr-2" />
            Transactions
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-gray-800 rounded-lg p-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-gray-700 rounded-lg p-4">
                <FiMapPin className="text-blue-400 mb-2" size={24} />
                <h3 className="text-lg font-semibold">Lands Owned</h3>
                <p className="text-2xl font-bold text-blue-400">{userLands.length}</p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4">
                <FiDollarSign className="text-green-400 mb-2" size={24} />
                <h3 className="text-lg font-semibold">Total Balance</h3>
                <p className="text-2xl font-bold text-green-400">
                  {(userEconomy?.balance || 0).toLocaleString()} 🪙
                </p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4">
                <FiClock className="text-purple-400 mb-2" size={24} />
                <h3 className="text-lg font-semibold">Active Auctions</h3>
                <p className="text-2xl font-bold text-purple-400">
                  {userAuctions.filter(a => a.status === 'active').length}
                </p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4">
                <FiTrendingUp className="text-yellow-400 mb-2" size={24} />
                <h3 className="text-lg font-semibold">Total Earned</h3>
                <p className="text-2xl font-bold text-yellow-400">
                  {(userEconomy?.totalEarned || 0).toLocaleString()} 🪙
                </p>
              </div>
            </div>
          )}

          {activeTab === 'lands' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">My Lands</h2>
              </div>
              
              {isLoading ? (
                <div className="text-center py-8">Loading your lands...</div>
              ) : userLands.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  You don't own any lands yet. Start by claiming pixels on the canvas!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {userLands.map((land) => (
                    <LandCard
                      key={land.id}
                      land={land}
                      onEdit={(land) => {
                        setSelectedLand(land);
                        setShowExpansionModal(true);
                      }}
                      onNameUpdate={handleLandNameUpdate}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'offers' && (
            <OfferManagement />
          )}

          {activeTab === 'transactions' && (
            <div>
              <h2 className="text-xl font-bold mb-6">Transaction History</h2>
              {isLoading ? (
                <div className="text-center py-8">Loading transactions...</div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No transactions found.
                </div>
              ) : (
                <div className="space-y-4">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="bg-gray-700 rounded-lg p-4 flex justify-between items-center"
                    >
                      <div>
                        <h4 className="font-semibold">{transaction.description}</h4>
                        <p className="text-gray-400 text-sm">
                          {formatTime(transaction.createdAt)}
                        </p>
                      </div>
                      <div className={`font-bold ${
                        transaction.type === 'credit' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {transaction.type === 'credit' ? '+' : '-'}
                        {transaction.amount.toLocaleString()} 🪙
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showExpansionModal && selectedLand && (
        <LandExpansionModal
          isOpen={showExpansionModal}
          onClose={() => {
            setShowExpansionModal(false);
            setSelectedLand(null);
          }}
          onSuccess={handleExpansionSuccess}
          selectedLand={selectedLand}
        />
      )}      {showCreateAuctionModal && selectedLand && (
        <CreateAuctionModal
          isOpen={showCreateAuctionModal}
          onClose={() => {
            setShowCreateAuctionModal(false);
            setSelectedLand(null);
          }}
          onSuccess={handleAuctionSuccess}
        />
      )}
    </div>
  );
};

export default UserProfile;