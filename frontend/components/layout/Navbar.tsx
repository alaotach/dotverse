import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../src/context/AuthContext';
import websocketService from "../../src/services/websocketService";
import { useEconomy } from '../../src/context/EconomyContext';
import LandDropdown from './LandDropdown';

const Navbar: React.FC = () => {
  const { currentUser, logout, userProfile } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const [pixelCount, setPixelCount] = useState(0);
  const isAdmin = userProfile?.role === 'admin' || userProfile?.email === 'admin@dotverse.com';
  const { userEconomy } = useEconomy();

  useEffect(() => {
  const handlePixelStats = (stats: { pixelCount: number }) => {
    setPixelCount(stats.pixelCount);
  };
  
  websocketService.on('pixel_stats', handlePixelStats);
  
  return () => {
    websocketService.off('pixel_stats', handlePixelStats);
  };
}, []);
  
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error("Failed to log out", error);
    }
    setMobileMenuOpen(false);
  };
  
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };
  
  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };
  
  return (
    <nav className="bg-gray-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 text-xl font-bold">
              DotVerse
            </Link>
            <div className="md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <Link to="/" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Home</Link>
                <Link to="/canvas" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Canvas</Link>
                {currentUser && (
                  <Link to="/economy" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Economy</Link>
                )}
                {currentUser && (
                  <Link to="/auction" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Auction</Link>
                )}
                {isAdmin && (
                  <Link to="/admin/analytics" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Admin</Link>
                )}
            </div>
          </div>
          <div className="md:block">
            <div className="ml-4 flex items-center md:ml-6">
              {currentUser ? (
                <>

                  {userEconomy && (
                    <div className="mr-4 bg-gradient-to-r from-yellow-600 to-orange-600 px-3 py-1 rounded-lg">
                      <span className="text-sm font-semibold">
                        {userEconomy.balance?.toLocaleString() || 0} 🪙
                      </span>
                    </div>
                  )}                  <Link to="/gallery" className="text-gray-300 hover:text-white transition-colors">
                    Gallery
                  </Link>
                  <LandDropdown />
                  <Link to="/profile" className="flex items-center text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                    {userProfile?.photoURL ? (
                      <img src={userProfile.photoURL} alt="Profile" className="w-6 h-6 rounded-full mr-2" />
                    ) : userProfile?.displayName ? (
                      <span className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs mr-2">
                        {userProfile.displayName.charAt(0).toUpperCase()}
                      </span>
                    ) : null}
                    {userProfile?.displayName || currentUser.email}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="ml-4 text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Logout
                  </button>
                  {pixelCount > 0 && (
                    <span className="hidden md:inline-block text-gray-300 px-3 py-2 text-sm">
                      {pixelCount.toLocaleString()} pixels
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Link to="/login" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Login</Link>
                  <Link to="/register" className="ml-4 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium">Sign Up</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </nav>
  );
};

export default Navbar;