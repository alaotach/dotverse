import React, { useState, useEffect } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { getUserLands, updateLandName, type UserLandInfo } from '../../src/services/landService';
import { auctionService, type LandAuction } from '../../src/services/auctionService';
import LandCard from '../lands/LandCard';

const UserProfile: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [userLands, setUserLands] = useState<UserLandInfo[]>([]);
  const [loadingLands, setLoadingLands] = useState(true);
  const [auctionData, setAuctionData] = useState<Map<string, LandAuction>>(new Map());

  useEffect(() => {
    const loadUserLands = async () => {
      if (!currentUser) return;

      setLoadingLands(true);
      try {
        const lands = await getUserLands(currentUser.uid);
        setUserLands(lands);        
        const auctionMap = new Map<string, LandAuction>();
        for (const land of lands) {
          if (land.isAuctioned && land.auctionId) {
            try {
              const auction = await auctionService.getAuction(land.auctionId);
              if (auction) {
                auctionMap.set(land.auctionId, auction);
              }
            } catch (error) {
              console.error(`Error loading auction ${land.auctionId}:`, error);
            }
          }
        }
        setAuctionData(auctionMap);
      } catch (error) {
        console.error('Error loading user lands:', error);
      } finally {
        setLoadingLands(false);
      }
    };

    loadUserLands();
  }, [currentUser]);

  const handleUpdateLandName = async (landId: string, newName: string) => {
    try {
      await updateLandName(landId, newName);
      
      setUserLands(prev => prev.map(land => 
        land.id === landId 
          ? { ...land, displayName: newName }
          : land
      ));
    } catch (error) {
      console.error('Error updating land name:', error);
      throw error;
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Please Log In</h2>
          <p className="text-gray-600">You need to be logged in to view your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* User Info Section */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
              {userProfile?.displayName?.charAt(0)?.toUpperCase() || currentUser.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {userProfile?.displayName || 'Anonymous User'}
              </h1>
              <p className="text-gray-600">{currentUser.email}</p>
              <p className="text-sm text-gray-500">
                User ID: {currentUser.uid}
              </p>
            </div>
          </div>
        </div>

        {/* User Lands Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">My Lands</h2>
            <span className="text-sm text-gray-500">
              {userLands.length} {userLands.length === 1 ? 'land' : 'lands'} owned
            </span>
          </div>

          {loadingLands ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3 text-gray-600">Loading your lands...</span>
            </div>
          ) : userLands.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No lands owned</h3>
              <p className="text-gray-600 mb-4">You don't own any land plots yet.</p>
              <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors">
                Explore Available Lands
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userLands.map((land) => (
                <LandCard
                  key={land.id}
                  land={land}
                  auction={land.auctionId ? auctionData.get(land.auctionId) : undefined}
                  onNameUpdate={handleUpdateLandName}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
