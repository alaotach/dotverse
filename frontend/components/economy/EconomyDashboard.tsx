import React, { useState, useEffect } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { useEconomy } from '../../src/context/EconomyContext';
import { economyService, ECONOMY_RATES, EconomyTransaction } from '../../src/services/economyService';

const EconomyDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { userEconomy, recentTransactions, isLoading, refreshEconomy } = useEconomy();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'leaderboard'>('overview');

  useEffect(() => {
    const loadLeaderboard = async () => {
      const data = await economyService.getLeaderboard(10);
      setLeaderboard(data);
    };

    if (activeTab === 'leaderboard') {
      loadLeaderboard();
    }
  }, [activeTab]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p>Please log in to view your economy dashboard</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString()} 🪙`;
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'like_received': return '❤️';
      case 'comment_received': return '💬';
      case 'post_bonus': return '📸';
      case 'daily_bonus': return '🎁';
      default: return '💰';
    }
  };

  const getTransactionColor = (amount: number) => {
    return amount >= 0 ? 'text-green-400' : 'text-red-400';
  };

  const formatTransactionAmount = (amount: number) => {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}${amount} 🪙`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Economy Dashboard</h1>
          <button
            onClick={refreshEconomy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Current Balance</h2>
              <p className="text-4xl font-bold">{formatCurrency(userEconomy?.balance || 0)}</p>
            </div>
            <div className="text-right">
              <p className="text-lg opacity-80">Total Earned</p>
              <p className="text-2xl font-semibold">{formatCurrency(userEconomy?.totalEarned || 0)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center">
              <div className="text-3xl mr-4">❤️</div>
              <div>
                <p className="text-gray-400">Likes Received</p>
                <p className="text-2xl font-bold">{userEconomy?.lifetimeStats?.likesReceived || 0}</p>
                <p className="text-sm text-green-400">+{ECONOMY_RATES.LIKE_REWARD} coins each</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center">
              <div className="text-3xl mr-4">💬</div>
              <div>
                <p className="text-gray-400">Comments Received</p>
                <p className="text-2xl font-bold">{userEconomy?.lifetimeStats?.commentsReceived || 0}</p>
                <p className="text-sm text-green-400">+{ECONOMY_RATES.COMMENT_REWARD} coins each</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center">
              <div className="text-3xl mr-4">📸</div>
              <div>
                <p className="text-gray-400">Posts Created</p>
                <p className="text-2xl font-bold">{userEconomy?.lifetimeStats?.postsShared || 0}</p>
                <p className="text-sm text-green-400">+{ECONOMY_RATES.POST_CREATION_BONUS} coins each</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex space-x-1 mb-6">
          {['overview', 'transactions', 'leaderboard'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-2xl font-bold mb-4">How to Earn Coins</h3>
            <div className="space-y-4">
              <div className="flex items-center p-4 bg-gray-700 rounded-lg">
                <span className="text-2xl mr-4">❤️</span>
                <div>
                  <p className="font-semibold">Get Likes on Your Posts</p>
                  <p className="text-gray-400">Earn {ECONOMY_RATES.LIKE_REWARD} coins for each like on your gallery posts</p>
                </div>
              </div>
              <div className="flex items-center p-4 bg-gray-700 rounded-lg">
                <span className="text-2xl mr-4">💬</span>
                <div>
                  <p className="font-semibold">Receive Comments</p>
                  <p className="text-gray-400">Earn {ECONOMY_RATES.COMMENT_REWARD} coins for each comment on your posts</p>
                </div>
              </div>
              <div className="flex items-center p-4 bg-gray-700 rounded-lg">
                <span className="text-2xl mr-4">📸</span>
                <div>
                  <p className="font-semibold">Share Your Creations</p>
                  <p className="text-gray-400">Earn {ECONOMY_RATES.POST_CREATION_BONUS} coins bonus for each post you create</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-2xl font-bold mb-4">Recent Transactions</h3>
            {recentTransactions.length === 0 ? (
              <p className="text-gray-400">No transactions yet. Start creating and sharing to earn coins!</p>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getTransactionIcon(transaction.type)}</span>
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <p className="text-sm text-gray-400">
                          {new Date(transaction.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <span className={`font-bold ${getTransactionColor(transaction.amount)}`}>
                      {formatTransactionAmount(transaction.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-2xl font-bold mb-4">Top Earners</h3>
            {leaderboard.length === 0 ? (
              <p className="text-gray-400">Loading leaderboard...</p>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((user, index) => (
                  <div key={user.userId} className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                    <div className="flex items-center">
                      <span className="text-2xl mr-4 w-8 text-center">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </span>
                      <div>
                        <p className="font-semibold">User {user.userId.slice(0, 8)}...</p>
                        <p className="text-sm text-gray-400">
                          {user.lifetimeStats?.likesReceived || 0} likes • {user.lifetimeStats?.commentsReceived || 0} comments
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{formatCurrency(user.totalEarned || 0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EconomyDashboard;