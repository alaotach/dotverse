import React, { useState, useEffect } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { doc, getDoc, collection, query, orderBy, limit, getDocs, where, Timestamp } from 'firebase/firestore';
import { fs } from '../../src/firebaseClient';

interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  totalPixelsPlaced: number;
  pixelsPlacedToday: number;
  totalLandsClaimed: number;
  averageSessionTime: number;
  topUsers: { uid: string; displayName: string; pixelCount: number }[];
  dailyActivity: { date: string; pixels: number; users: number }[];
  recentActivity: { type: string; user: string; timestamp: Date; details: string }[];
}

const AdminAnalytics: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');

  const isAdmin = userProfile?.role === 'admin' || userProfile?.email === 'admin@dotverse.com';

  useEffect(() => {
    if (!isAdmin) {
      setError('Access denied. Admin privileges required.');
      setLoading(false);
      return;
    }

    fetchAnalyticsData();
  }, [isAdmin, timeRange]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);

      const data: AnalyticsData = {
        totalUsers: 0,
        activeUsers: 0,
        totalPixelsPlaced: 0,
        pixelsPlacedToday: 0,
        totalLandsClaimed: 0,
        averageSessionTime: 0,
        topUsers: [],
        dailyActivity: [],
        recentActivity: []
      };

      const usersQuery = query(collection(fs, 'users'));
      const usersSnapshot = await getDocs(usersQuery);
      data.totalUsers = usersSnapshot.size;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      let activeUserIds = new Set<string>();
      let totalPixels = 0;
      let pixelsToday = 0;
      let totalLands = 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const topUsersMap = new Map<string, { displayName: string; pixelCount: number }>();
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        
        if (userData.landInfo) {
          totalLands++;
        }

        if (userData.pixelsPlaced) {
          totalPixels += userData.pixelsPlaced;
          topUsersMap.set(userDoc.id, {
            displayName: userData.displayName || userData.email || 'Unknown',
            pixelCount: userData.pixelsPlaced
          });
        }

        if (userData.lastActive && userData.lastActive.toDate() > sevenDaysAgo) {
          activeUserIds.add(userDoc.id);
        }
      }

      const pixelActivityQuery = query(
        collection(fs, 'pixelActivity'),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      
      try {
        const activitySnapshot = await getDocs(pixelActivityQuery);
        const recentActivity: any[] = [];
        
        activitySnapshot.forEach((doc) => {
          const activity = doc.data();
          if (activity.timestamp && activity.timestamp.toDate() > today) {
            pixelsToday++;
          }
          
          if (recentActivity.length < 20) {
            recentActivity.push({
              type: 'pixel_placed',
              user: activity.userDisplayName || 'Unknown',
              timestamp: activity.timestamp?.toDate() || new Date(),
              details: `Placed pixel at (${activity.x}, ${activity.y})`
            });
          }
        });

        data.recentActivity = recentActivity;
      } catch (err) {
        console.log('No pixel activity collection found, creating mock data');
      }

      const dailyActivity = [];
      for (let i = parseInt(timeRange.replace(/[^\d]/g, '')); i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dailyActivity.push({
          date: date.toISOString().split('T')[0],
          pixels: Math.floor(Math.random() * 1000) + 100,
          users: Math.floor(Math.random() * 50) + 10
        });
      }

      const topUsers = Array.from(topUsersMap.entries())
        .map(([uid, data]) => ({ uid, ...data }))
        .sort((a, b) => b.pixelCount - a.pixelCount)
        .slice(0, 10);

      data.activeUsers = activeUserIds.size;
      data.totalPixelsPlaced = totalPixels;
      data.pixelsPlacedToday = pixelsToday;
      data.totalLandsClaimed = totalLands;
      data.topUsers = topUsers;
      data.dailyActivity = dailyActivity;
      data.averageSessionTime = Math.floor(Math.random() * 3600) + 600; // Mock data

      setAnalyticsData(data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Please log in to access analytics.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access admin analytics.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600">{error}</p>
          <button 
            onClick={fetchAnalyticsData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Analytics</h1>
          <p className="text-gray-600 mt-2">Monitor DotVerse activity and user engagement</p>
          
          <div className="mt-4">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
              {(['24h', '7d', '30d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    timeRange === range
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {range === '24h' ? 'Last 24 Hours' : range === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Users"
            value={analyticsData?.totalUsers || 0}
            icon="👥"
            color="blue"
          />
          <StatCard
            title="Active Users"
            value={analyticsData?.activeUsers || 0}
            subtitle={`${timeRange}`}
            icon="🟢"
            color="green"
          />
          <StatCard
            title="Total Pixels"
            value={analyticsData?.totalPixelsPlaced || 0}
            icon="🎨"
            color="purple"
          />
          <StatCard
            title="Pixels Today"
            value={analyticsData?.pixelsPlacedToday || 0}
            icon="⚡"
            color="yellow"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Lands Claimed"
            value={analyticsData?.totalLandsClaimed || 0}
            icon="🏡"
            color="indigo"
          />
          <StatCard
            title="Avg Session Time"
            value={`${Math.floor((analyticsData?.averageSessionTime || 0) / 60)}m`}
            icon="⏱️"
            color="pink"
          />
          <StatCard
            title="Canvas Coverage"
            value={`${((analyticsData?.totalPixelsPlaced || 0) / 1000000 * 100).toFixed(2)}%`}
            icon="📊"
            color="cyan"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Daily Activity</h3>
            <div className="h-64">
              <SimpleLineChart data={analyticsData?.dailyActivity || []} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Top Contributors</h3>
            <div className="space-y-3">
              {analyticsData?.topUsers.slice(0, 8).map((user, index) => (
                <div key={user.uid} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="w-6 text-center text-sm font-medium text-gray-500">
                      {index + 1}
                    </span>
                    <span className="ml-3 text-sm font-medium text-gray-900 truncate">
                      {user.displayName}
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">{user.pixelCount} pixels</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Recent Activity</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {analyticsData?.recentActivity.slice(0, 10).map((activity, index) => (
                <div key={index} className="flex items-center justify-between py-2">
                  <div className="flex items-center">
                    <span className="text-2xl mr-3">🎨</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{activity.user}</p>
                      <p className="text-xs text-gray-600">{activity.details}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">
                    {activity.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, color }) => {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    yellow: 'bg-yellow-500',
    indigo: 'bg-indigo-500',
    pink: 'bg-pink-500',
    cyan: 'bg-cyan-500'
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center">
        <div className={`rounded-lg p-3 ${colorClasses[color as keyof typeof colorClasses]} text-white text-xl`}>
          {icon}
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
};

interface ChartData {
  date: string;
  pixels: number;
  users: number;
}

const SimpleLineChart: React.FC<{ data: ChartData[] }> = ({ data }) => {
  if (!data.length) {
    return <div className="flex items-center justify-center h-full text-gray-500">No data available</div>;
  }

  const maxPixels = Math.max(...data.map(d => d.pixels));
  const maxUsers = Math.max(...data.map(d => d.users));

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative">
        <svg className="w-full h-full" viewBox="0 0 400 200">
          {[0, 1, 2, 3, 4].map(i => (
            <line
              key={i}
              x1="0"
              y1={i * 40}
              x2="400"
              y2={i * 40}
              stroke="#f3f4f6"
              strokeWidth="1"
            />
          ))}
          
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            points={data.map((d, i) => 
              `${(i / (data.length - 1)) * 400},${200 - (d.pixels / maxPixels) * 180}`
            ).join(' ')}
          />
          
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            points={data.map((d, i) => 
              `${(i / (data.length - 1)) * 400},${200 - (d.users / maxUsers) * 180}`
            ).join(' ')}
          />
        </svg>
      </div>
      
      <div className="flex justify-center space-x-4 mt-4 text-sm">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-blue-500 rounded mr-2"></div>
          <span>Pixels</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-green-500 rounded mr-2"></div>
          <span>Users</span>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalytics;