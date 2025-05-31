import React, { useEffect, useState } from 'react';
import { FiMap, FiPlus, FiX, FiTrash2, FiEdit, FiChevronDown, FiBookmark, FiArrowRight } from 'react-icons/fi';
import { tpService, type SavedLocations } from '../../src/services/tpService';
import { useAuth } from '../../src/context/AuthContext';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface TpPanelProps {
  onTeleport: (x: number, y: number, locationName?: string) => void;
  currentPosition: { x: number, y: number };
}

const TpPanel: React.FC<TpPanelProps> = ({ onTeleport, currentPosition }) => {
    const { currentUser } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [savedLocations, setSavedLocations] = useState<SavedLocations[]>([]);
    const [loading, setLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showCoordForm, setShowCoordForm] = useState(false);
    const [locationName, setLocationName] = useState('');
    const [locationNotes, setLocationNotes] = useState('');
    const [coordX, setCoordX] = useState('');
    const [coordY, setCoordY] = useState('');

    useEffect(() => {
        if (!currentUser || !isOpen) return;

        const fetchLocations = async () => {
            setLoading(true);
            try{
                const locations = await tpService.getLocations(currentUser.uid);
                setSavedLocations(locations);
            } catch (error) {
                console.error("Error fetching saved locations:", error);
                toast.error("Failed to load saved locations.");
            } finally {
                setLoading(false);
            }
        };
        fetchLocations();
    }, [currentUser, isOpen])

    const handleSaveCurrentLocation = async () => {
        if (!currentUser) return;
        
        try {
        if (!locationName.trim()) {
            toast.error('Please enter a location name');
            return;
        }
        
        await tpService.saveLocation(currentUser.uid, {
            name: locationName,
            x: currentPosition.x,
            y: currentPosition.y,
            notes: locationNotes || undefined
        });
        toast.success(`Saved location: ${locationName}`);
        setLocationName('');
        setLocationNotes('');
        setShowAddForm(false);
        const locations = await tpService.getLocations(currentUser.uid);
        setSavedLocations(locations);
        } catch (error) {
        console.error('Error saving location:', error);
        toast.error('Failed to save location');
        }
    };

    const handleDeleteLocation = async (locationId: string, locationName: string) => {
        if (!currentUser) return;
        
        try {
        await tpService.deleteLocation(currentUser.uid, locationId);
        toast.success(`Deleted location: ${locationName}`);
        setSavedLocations(prev => prev.filter(loc => loc.id !== locationId));
        } catch (error) {
        console.error('Error deleting location:', error);
        toast.error('Failed to delete location');
        }
    };

    const handleTeleportToCoords = () => {
        const x = parseInt(coordX);
        const y = parseInt(coordY);
        if (isNaN(x) || isNaN(y)) {
        toast.error('Please enter valid coordinates');
        return;
        }
        onTeleport(x, y);
        toast.info(`Teleported to (${x}, ${y})`);
        setCoordX('');
        setCoordY('');
        setShowCoordForm(false);
    };

    if (!currentUser) return null;

    return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />
      
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-32 right-4 bg-indigo-600 text-white rounded-full p-3 shadow-lg hover:bg-indigo-700 transition-colors z-40"
          title="Teleport"
        >
          <FiMap size={24} />
        </button>
      ) : (
        <div 
          className="fixed top-32 right-4 bg-gray-800 rounded-lg shadow-xl z-40 transition-all duration-300 border border-gray-700"
          style={{ 
            width: '320px',
            height: isMinimized ? '48px' : 'auto',
            maxHeight: isMinimized ? '48px' : '500px'
          }}
        >
          <div 
            className="p-3 bg-gray-700 rounded-t-lg flex justify-between items-center cursor-pointer"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            <h3 className="font-medium text-white flex items-center">
              <FiMap className="mr-2" />
              <span>Teleporter</span>
            </h3>
            <div className="flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(!isMinimized);
                }}
                className="text-gray-300 hover:text-white mr-2"
              >
                <FiChevronDown 
                  size={18} 
                  className={`transform transition-transform ${isMinimized ? 'rotate-180' : ''}`}
                />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="text-gray-300 hover:text-white"
              >
                <FiX size={18} />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <div className="overflow-y-auto p-3 space-y-3" style={{ maxHeight: '452px' }}>
              {/* Control buttons */}
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    setShowAddForm(!showAddForm);
                    setShowCoordForm(false);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded flex items-center justify-center"
                >
                  <FiBookmark className="mr-2" />
                  Save Location
                </button>
                <button
                  onClick={() => {
                    setShowCoordForm(!showCoordForm);
                    setShowAddForm(false);
                  }}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded flex items-center justify-center"
                >
                  <FiArrowRight className="mr-2" />
                  Go to Coords
                </button>
              </div>
              <div className="bg-gray-700 p-3 rounded-lg">
                <div className="text-sm text-gray-300 mb-1">Current Position</div>
                <div className="text-white font-medium">X: {currentPosition.x}, Y: {currentPosition.y}</div>
              </div>
              {showAddForm && (
                <div className="bg-gray-700 p-3 rounded-lg space-y-3 border border-blue-500">
                  <h4 className="text-white font-medium">Save Current Location</h4>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Location Name</label>
                    <input
                      type="text"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded border border-gray-500 focus:outline-none focus:border-blue-500"
                      placeholder="My Favorite Spot"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Notes (Optional)</label>
                    <textarea
                      value={locationNotes}
                      onChange={(e) => setLocationNotes(e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded border border-gray-500 focus:outline-none focus:border-blue-500"
                      placeholder="Description or notes about this location"
                      rows={2}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveCurrentLocation}
                      className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-4 rounded"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {showCoordForm && (
                <div className="bg-gray-700 p-3 rounded-lg space-y-3 border border-purple-500">
                  <h4 className="text-white font-medium">Go to Coordinates</h4>
                  <div className="flex space-x-3">
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">X</label>
                      <input
                        type="number"
                        value={coordX}
                        onChange={(e) => setCoordX(e.target.value)}
                        className="w-full bg-gray-600 text-white px-3 py-2 rounded border border-gray-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Y</label>
                      <input
                        type="number"
                        value={coordY}
                        onChange={(e) => setCoordY(e.target.value)}
                        className="w-full bg-gray-600 text-white px-3 py-2 rounded border border-gray-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleTeleportToCoords}
                      className="bg-purple-600 hover:bg-purple-700 text-white py-1 px-4 rounded"
                    >
                      Teleport
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <h4 className="text-white font-medium mb-2">Saved Locations</h4>
                
                {loading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
                  </div>
                ) : savedLocations.length === 0 ? (
                  <div className="text-gray-400 text-center py-4">
                    No saved locations yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {savedLocations.map(location => (
                      <div 
                        key={location.id} 
                        className="bg-gray-700 p-3 rounded-lg flex justify-between items-center hover:bg-gray-600 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="text-white font-medium">{location.name}</div>
                          <div className="text-gray-400 text-sm">X: {location.x}, Y: {location.y}</div>
                          {location.notes && (
                            <div className="text-gray-300 text-sm mt-1 italic">{location.notes}</div>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => onTeleport(location.x, location.y, location.name)}
                            className="text-indigo-400 hover:text-indigo-300"
                            title="Teleport here"
                          >
                            <FiArrowRight size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteLocation(location.id, location.name)}
                            className="text-red-400 hover:text-red-300"
                            title="Delete location"
                          >
                            <FiTrash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default TpPanel;