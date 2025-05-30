import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../src/context/AuthContext';
import { getUserLands, updateLandName, type UserLandInfo } from '../../src/services/landService';

const LandDropdown: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [userLands, setUserLands] = useState<UserLandInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingLandId, setEditingLandId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastLoadTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setEditingLandId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isOpen && currentUser) {
      loadUserLands(true);
    }
  }, [isOpen, currentUser, userProfile]);

  const loadUserLands = async (forceRefresh = false) => {
    if (!currentUser) return;
    
    const now = Date.now();
    if (!forceRefresh && now - lastLoadTimeRef.current < 5000) {
      return;
    }

    setIsLoading(true);
    try {
      const lands = await getUserLands(currentUser.uid);
      setUserLands(lands);
      lastLoadTimeRef.current = now;
      console.log('[LandDropdown] Loaded lands:', lands);
    } catch (error) {
      console.error('Error loading user lands:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDropdownToggle = () => {
    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);
    
    if (newIsOpen && currentUser) {
      setUserLands([]);
      loadUserLands(true);
    }
  };

  const handleLandClick = (land: UserLandInfo) => {
    navigate(`/canvas?x=${land.centerX}&y=${land.centerY}`);
    setIsOpen(false);
  };

  const handleNameEdit = (land: UserLandInfo) => {
    setEditingLandId(land.id);
    setTempName(land.displayName || '');
  };

  const handleNameSave = async (landId: string) => {
    if (!tempName.trim()) return;
    
    try {
      await updateLandName(landId, tempName.trim());
      setUserLands(prev => prev.map(land => 
        land.id === landId ? { ...land, displayName: tempName.trim() } : land
      ));
      setEditingLandId(null);
    } catch (error) {
      console.error('Error updating land name:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, landId: string) => {
    if (e.key === 'Enter') {
      handleNameSave(landId);
    } else if (e.key === 'Escape') {
      setEditingLandId(null);
    }
  };

  if (!currentUser) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleDropdownToggle}
        className="flex items-center text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
      >
        My Lands
        <svg 
          className={`ml-1 h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg z-50 border border-gray-200">
          <div className="py-2">
            <div className="px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200">
              My Lands
            </div>
            
            {isLoading ? (
              <div className="px-4 py-3 text-sm text-gray-500 flex items-center">
                <svg className="animate-spin h-4 w-4 mr-2 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading lands...
              </div>
            ) : userLands.length > 0 ? (
              <div className="max-h-64 overflow-y-auto">
                {userLands.map((land) => (
                  <div key={land.id} className="group hover:bg-gray-50">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        {editingLandId === land.id ? (
                          <input
                            type="text"
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onBlur={() => handleNameSave(land.id)}
                            onKeyDown={(e) => handleKeyPress(e, land.id)}
                            className="w-full px-2 py-1 text-sm border border-blue-500 rounded outline-none"
                            placeholder="Enter land name"
                            autoFocus
                          />
                        ) : (
                          <div className="cursor-pointer" onClick={() => handleLandClick(land)}>
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {land.displayName || 'Unnamed Land'}
                            </div>
                            <div className="text-xs text-gray-500">
                              ({land.centerX}, {land.centerY}) • {land.ownedSize}×{land.ownedSize}
                              {land.isAuctioned && (
                                <span className="ml-2 text-yellow-600 font-medium">🔨 AUCTION</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {!land.displayName && editingLandId !== land.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNameEdit(land);
                            }}
                            className="text-blue-500 hover:text-blue-700 text-xs"
                          >
                            Name
                          </button>
                        )}
                        
                        {land.displayName && editingLandId !== land.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNameEdit(land);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 text-xs transition-opacity"
                          >
                            Edit
                          </button>
                        )}
                        
                        {land.isAuctioned && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/auction?id=${land.auctionId}`);
                              setIsOpen(false);
                            }}
                            className="text-yellow-600 hover:text-yellow-700 text-xs"
                          >
                            Auction
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-gray-500">No lands owned</div>
            )}

            <div className="flex justify-between px-4 py-2 border-t border-gray-200">
              <button
                onClick={() => loadUserLands(true)}
                className="text-sm text-blue-600 hover:text-blue-800 transition-colors flex items-center"
              >
                <svg className="h-3 w-3 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              <button
                onClick={() => {
                  navigate('/profile');
                  setIsOpen(false);
                }}
                className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                View All Lands
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandDropdown;
