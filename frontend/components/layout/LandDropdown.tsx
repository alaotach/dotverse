import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../src/context/AuthContext';
import { getUserLands, updateLandName, type UserLandInfo } from '../../src/services/landService';

const LandDropdown: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [userLands, setUserLands] = useState<UserLandInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingLandId, setEditingLandId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    if (isOpen && currentUser && userLands.length === 0) {
      loadUserLands();
    }
  }, [isOpen, currentUser]);

  const loadUserLands = async () => {
    if (!currentUser) return;
    
    setIsLoading(true);
    try {
      const lands = await getUserLands(currentUser.uid);
      setUserLands(lands);
    } catch (error) {
      console.error('Error loading user lands:', error);
    } finally {
      setIsLoading(false);
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
        onClick={() => setIsOpen(!isOpen)}
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
              <div className="px-4 py-3 text-sm text-gray-500">Loading lands...</div>
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
            
            <div className="border-t border-gray-200 mt-2">
              <button
                onClick={() => {
                  navigate('/profile');
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
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
