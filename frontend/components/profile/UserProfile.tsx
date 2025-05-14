import React, { useEffect, useState } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { signOutUser, updateUserProfile } from '../../src/services/authService';
import { getUserLands } from '../../src/services/landService';
import { useNavigate, Navigate } from 'react-router-dom';

const UserProfile: React.FC = () => {
  const { currentUser, userProfile, logout, isLoading } = useAuth();
  const navigate = useNavigate();
  
  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [ownedLands, setOwnedLands] = useState<{x: number, y: number}[]>([]);
  const [isLoadingLands, setIsLoadingLands] = useState(true);
  
  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName || '');
      
      const loadUserLands = async () => {
        try {
          if (currentUser) {
            const lands = await getUserLands(currentUser.uid);
            setOwnedLands(lands);
          }
        } catch (err) {
          console.error('Error loading user lands:', err);
        } finally {
          setIsLoadingLands(false);
        }
      };
      
      loadUserLands();
    }
  }, [userProfile, currentUser]);
  
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) return;
    
    setIsUpdating(true);
    setUpdateError(null);
    
    try {
      await updateUserProfile(currentUser.uid, { displayName });
      setIsEditing(false);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setUpdateError(err.message || 'Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  };
  
  const handleSignOut = async () => {
    try {
      await signOutUser();
      navigate('/login');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };
  
  const handleViewLand = () => {
    if (!userProfile) return;
    
    const { centerX, centerY } = userProfile.landInfo;
    navigate(`/canvas?x=${centerX}&y=${centerY}`);
  };
  
  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Loading profile...</div>;
  }

  if (!currentUser || !userProfile) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  const goToUserLand = () => {
    if (userProfile.landInfo) {
      navigate(`/canvas?x=${userProfile.landInfo.centerX}&y=${userProfile.landInfo.centerY}`);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-white shadow-xl rounded-lg p-6">
        <div className="flex flex-col items-center sm:flex-row sm:items-start">
          <img
            className="w-32 h-32 rounded-full object-cover border-4 border-blue-500 mb-4 sm:mb-0 sm:mr-6"
            src={userProfile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.displayName || 'User')}&background=random&size=128`}
            alt={userProfile.displayName || 'User Avatar'}
          />
          <div>
            <h1 className="text-3xl font-bold text-gray-800 text-center sm:text-left">
              {userProfile.displayName || 'Anonymous User'}
            </h1>
            <p className="text-gray-600 text-center sm:text-left">{userProfile.email}</p>
          </div>
        </div>

        <div className="mt-8 border-t pt-6">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Land Information</h2>
          {userProfile.landInfo ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700">
              <p><strong>Center X:</strong> {userProfile.landInfo.centerX}</p>
              <p><strong>Center Y:</strong> {userProfile.landInfo.centerY}</p>
              <p><strong>Land Size:</strong> {userProfile.landInfo.ownedSize} x {userProfile.landInfo.ownedSize} pixels</p>
              <p className="md:col-span-2">
                <button 
                  onClick={handleViewLand}
                  className="mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
                >
                  View My Land
                </button>
              </p>
            </div>
          ) : (
            <p className="text-gray-500">No land information available.</p>
          )}
        </div>

        <div className="mt-8 border-t pt-6">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Account Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700">
            <p><strong>User ID:</strong> {userProfile.uid}</p>
            <p><strong>Joined:</strong> {new Date(userProfile.createdAt).toLocaleDateString()}</p>
            <p><strong>Last Login:</strong> {new Date(userProfile.lastLogin).toLocaleString()}</p>
          </div>
        </div>
        
        {/* Placeholder for future actions like "Edit Profile" or "Expand Land" */}
        <div className="mt-8 border-t pt-6 flex justify-end">
          <button 
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded"
            onClick={() => alert("Edit profile functionality coming soon!")}
          >
            Edit Profile (Soon)
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
