import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../src/context/AuthContext';
import websocketService from "../../src/services/websocketService";
import { useEconomy } from '../../src/context/EconomyContext';
import LandDropdown from './LandDropdown';
import NotificationDropdown from '../notifications/NotificationDropdown';
import ChatButton from '../chat/ChatButton';
import { useMusic } from '../../src/context/MusicContext';
import { FiMusic, FiMenu, FiX } from 'react-icons/fi';
import { DailyCheckInButton } from '../dailylogin/LoginButton';
import MarketplaceButton from '../marketplace/MarketplaceButton';
import MinigameButton from '../minigame/MinigameButton';

const Navbar: React.FC = () => {
  const { currentUser, logout, userProfile } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const [pixelCount, setPixelCount] = useState(0);
  const isAdmin = userProfile?.role === 'admin' || userProfile?.email === 'admin@dotverse.com';
  const { userEconomy } = useEconomy();
  const { isPlayerVisible, togglePlayerVisibility, isPlaying } = useMusic();

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
    <nav className="text-white relative z-[10000] bg-black/10 backdrop-blur-sm border-b border-purple-500/10 shadow-xl shadow-purple-500/10">
      <div className="max-w-8xl mx-auto px-1 sm:px-2 md:px-4 lg:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16 lg:h-18">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-1 text-xl sm:text-2xl lg:text-3xl font-black hover:scale-105 transition-all duration-300 mr-2 sm:mr-4 lg:mr-8 xl:mr-12" onClick={closeMobileMenu}>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 drop-shadow-lg">
                DotVerse
              </span>
            </Link>
          </div>
          <div className="max-lg:hidden lg:flex flex-1 justify-center">
            <div className="flex items-center space-x-1 md:space-x-2 lg:space-x-3 xl:space-x-4"> 
              <Link to="/" className="group relative px-2 py-1.5 md:px-3 lg:px-4 xl:px-5 md:py-2 lg:py-2.5 rounded-xl text-xs md:text-sm text-white/90 hover:text-white font-medium transition-all duration-300 hover:bg-white/10 hover:shadow-lg hover:shadow-purple-500/20">
                <span className="relative z-10">Home</span>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </Link>
              <Link to="/canvas" className="group relative px-2 py-1.5 md:px-3 lg:px-4 xl:px-5 md:py-2 lg:py-2.5 rounded-xl text-xs md:text-sm text-white/90 hover:text-white font-medium transition-all duration-300 hover:bg-white/10 hover:shadow-lg hover:shadow-blue-500/20">
                <span className="relative z-10">Canvas</span>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </Link>
              {currentUser && (
                <>
                  <Link to="/economy" className="group relative px-2 py-1.5 md:px-3 lg:px-4 xl:px-5 md:py-2 lg:py-2.5 rounded-xl text-xs md:text-sm text-white/90 hover:text-white font-medium transition-all duration-300 hover:bg-white/10 hover:shadow-lg hover:shadow-green-500/20">
                    <span className="relative z-10">Economy</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </Link>
                  <Link to="/auction" className="group relative px-2 py-1.5 md:px-3 lg:px-4 xl:px-5 md:py-2 lg:py-2.5 rounded-xl text-xs md:text-sm text-white/90 hover:text-white font-medium transition-all duration-300 hover:bg-white/10 hover:shadow-lg hover:shadow-yellow-500/20">
                    <span className="relative z-10">Auction</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </Link>
                  <Link to="/gallery" className="group relative px-2 py-1.5 md:px-3 lg:px-4 xl:px-5 md:py-2 lg:py-2.5 rounded-xl text-xs md:text-sm text-white/90 hover:text-white font-medium transition-all duration-300 hover:bg-white/10 hover:shadow-lg hover:shadow-pink-500/20">
                    <span className="relative z-10">Gallery</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-rose-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </Link>
                </>
              )}
              {isAdmin && (
                <Link to="/admin/analytics" className="group relative px-2 py-1.5 md:px-3 lg:px-4 xl:px-5 md:py-2 lg:py-2.5 rounded-xl text-xs md:text-sm text-white/90 hover:text-white font-medium transition-all duration-300 hover:bg-white/10 hover:shadow-lg hover:shadow-red-500/20">
                  <span className="relative z-10">Admin</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-pink-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </Link>
              )}
            </div>
          </div>
          <div className="max-lg:hidden lg:flex items-center space-x-1 md:space-x-2 lg:space-x-3 xl:space-x-4 flex-shrink-1">
            {currentUser ? (
              <>
                <div className="flex items-center space-x-1 md:space-x-2 lg:space-x-3 xl:space-x-4">
                  {userEconomy && (
                    <div className="max-2xl:hidden group relative overflow-hidden bg-gradient-to-r from-yellow-500 to-orange-500 p-[1px] rounded-xl hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300">
                      <div className="bg-black/80 backdrop-blur-sm rounded-xl px-2 py-1 lg:px-3 xl:px-4 group-hover:bg-transparent transition-all duration-300">
                        <span className="text-xs lg:text-sm font-bold text-white">
                          {userEconomy.balance?.toLocaleString() || 0} 🪙
                        </span>
                      </div>
                    </div>
                  )}
                  {pixelCount > 0 && (
                    <div className="bg-white/10 backdrop-blur-sm px-2 py-1 lg:px-2.5 xl:px-3 rounded-xl border border-white/20 hover:bg-white/20 hover:border-white/30 transition-all duration-300">
                      <span className="text-xs lg:text-sm font-medium text-white">
                        {pixelCount.toLocaleString()} pixels
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-1 md:space-x-1.5 lg:space-x-2 xl:space-x-3 border-l border-white/20 pl-1 md:pl-2 lg:pl-3 xl:pl-4">
                  <div className="hover:scale-110 transition-transform duration-200"> <MarketplaceButton /> </div>
                  <div className="hover:scale-110 transition-transform duration-200"> <NotificationDropdown /> </div>
                  <div className="hover:scale-110 transition-transform duration-200"> <ChatButton /> </div>
                  <div> <DailyCheckInButton /> </div>
                  <button
                    onClick={togglePlayerVisibility}
                    className={`p-1 md:p-1.5 lg:p-2 xl:p-2.5 rounded-xl transition-all duration-300 hover:scale-110`}
                    title={isPlayerVisible ? "Hide Music Player" : "Show Music Player"}
                  >
                    <FiMusic size={14} />
                  </button>
                </div>

                <div className="flex items-center space-x-1 md:space-x-1.5 lg:space-x-2 xl:space-x-3 border-l border-white/20 pl-1 md:pl-2 lg:pl-3 xl:pl-4">
                  <div className="max-xl:hidden hover:scale-105 transition-transform duration-200"> <LandDropdown /> </div>
                  <Link to="/profile" className="group flex items-center text-white/90 hover:text-white px-1.5 py-1 md:px-2 lg:px-3 xl:px-4 md:py-1.5 lg:py-2 rounded-xl font-medium transition-all duration-300 hover:bg-white/10 hover:shadow-lg border border-transparent hover:border-white/20">
                    <div className="flex items-center space-x-1 md:space-x-2 lg:space-x-3">
                      {userProfile?.photoURL ? (
                        <img src={userProfile.photoURL} alt="Profile" className="w-5 h-5 md:w-6 lg:w-7 xl:w-8 rounded-full border-2 border-white/30 group-hover:border-white/50 transition-colors duration-300" />
                      ) : userProfile?.displayName ? (
                        <span className="w-5 h-5 md:w-6 lg:w-7 xl:w-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-xs md:text-sm font-bold border-2 border-white/30 group-hover:border-white/50 transition-colors duration-300">
                          {userProfile.displayName.charAt(0).toUpperCase()}
                        </span>
                      ) : null}
                      <span className="hidden md:inline text-xs lg:text-sm">
                        {userProfile?.displayName || currentUser.email}
                      </span>
                    </div>
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="group relative overflow-hidden bg-gradient-to-r from-red-500/20 to-pink-500/20 hover:from-red-500/30 hover:to-pink-500/30 border border-red-500/30 hover:border-red-500/50 text-white/90 hover:text-white px-1.5 py-1 md:px-2 lg:px-3 xl:px-4 md:py-1.5 lg:py-2 rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20"
                  >
                    <span className="relative z-10 text-xs lg:text-sm">Logout</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-1 md:space-x-2 lg:space-x-3 xl:space-x-4">
                <Link to="/login" className="group relative overflow-hidden text-white/90 hover:text-white px-2 py-1.5 md:px-3 lg:px-4 xl:px-5 md:py-2 lg:py-2.5 rounded-xl font-medium transition-all duration-300 hover:bg-white/10 border border-white/20 hover:border-white/30 hover:shadow-lg">
                  <span className="relative z-10 text-xs md:text-sm">Login</span>
                </Link>
                <Link to="/register" className="group relative overflow-hidden bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-2 py-1.5 md:px-3 lg:px-4 xl:px-5 md:py-2 lg:py-2.5 rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-105">
                  <span className="relative z-10 text-xs md:text-sm">Sign Up</span>
                </Link>
              </div>
            )}
          </div>
          
          {/* Mobile menu */}
          <div className="lg:hidden">
            <button
              onClick={toggleMobileMenu}
              className="group relative text-white hover:text-purple-300 p-2 sm:p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20" /* Adjusted padding for mobile */
            >
              <div className="relative z-10">
                {mobileMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
          </div>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="fixed top-16 left-0 right-0 bg-black/90 backdrop-blur-xl border-t border-white/10 shadow-lg z-50 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-3 pt-2 pb-3 space-y-2 w-full min-w-0 overflow-hidden">            {/* Navigation Links - Horizontal Scrollable */}
            <div className="pb-3 border-b border-white/10">
              <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide px-2 py-1 mb-2">
                Navigation
              </div>
              <div className="overflow-x-auto scrollbar-hide">
                <div className="flex space-x-2 px-2 pb-1">
                  <Link 
                    to="/" 
                    className="text-gray-200 hover:bg-white/10 hover:text-white whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium flex-shrink-0"
                    onClick={closeMobileMenu}
                  >
                    Home
                  </Link>
                  <Link 
                    to="/canvas" 
                    className="text-gray-200 hover:bg-white/10 hover:text-white whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium flex-shrink-0"
                    onClick={closeMobileMenu}
                  >
                    Canvas
                  </Link>
                  
                  {currentUser && (
                    <>
                      <Link 
                        to="/economy" 
                        className="text-gray-200 hover:bg-white/10 hover:text-white whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium flex-shrink-0"
                        onClick={closeMobileMenu}
                      >
                        Economy
                      </Link>
                      <Link 
                        to="/auction" 
                        className="text-gray-200 hover:bg-white/10 hover:text-white whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium flex-shrink-0"
                        onClick={closeMobileMenu}
                      >
                        Auction
                      </Link>
                      <Link 
                        to="/gallery" 
                        className="text-gray-200 hover:bg-white/10 hover:text-white whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium flex-shrink-0"
                        onClick={closeMobileMenu}
                      >
                        Gallery
                      </Link>
                      {isAdmin && (
                        <Link 
                          to="/admin/analytics" 
                          className="text-gray-200 hover:bg-white/10 hover:text-white whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium flex-shrink-0"
                          onClick={closeMobileMenu}
                        >
                          Admin
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {currentUser && (
              <>
                <div className="pb-2 border-b border-white/10">
                  <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide px-2 py-1 mb-1">
                    Account Info
                  </div>
                  <div className="px-2 space-y-1">
                    {userEconomy && (
                      <div className="bg-gradient-to-r from-yellow-600 to-orange-600 px-2 py-1 rounded text-center">
                        <span className="text-xs font-semibold">
                          Balance: {userEconomy.balance?.toLocaleString() || 0} 🪙
                        </span>
                      </div>
                    )}

                    {pixelCount > 0 && (
                      <div className="bg-white/10 px-2 py-1 rounded text-center">
                        <span className="text-gray-200 text-xs">
                          Pixels: {pixelCount.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="pb-2 border-b border-white/10">
                  <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide px-2 py-1 mb-1">
                    Quick Actions
                  </div>
                  <div className="grid grid-cols-3 gap-1 px-2">
                    <div onClick={closeMobileMenu} className="flex justify-center">
                      <div className="scale-70">
                        <MarketplaceButton />
                      </div>
                    </div>
                    <div onClick={closeMobileMenu} className="flex justify-center">
                      <div className="scale-70">
                        <MinigameButton />
                      </div>
                    </div>
                    <div onClick={closeMobileMenu} className="flex justify-center">
                      <div className="scale-70">
                        <NotificationDropdown />
                      </div>
                    </div>
                    <div onClick={closeMobileMenu} className="flex justify-center">
                      <div className="scale-70">
                        <ChatButton />
                      </div>
                    </div>
                    <div onClick={closeMobileMenu} className="flex justify-center">
                      <div className="scale-70">
                        <DailyCheckInButton />
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => {
                          togglePlayerVisibility();
                          closeMobileMenu();
                        }}
                        className={`p-1.5 rounded-full transition-colors ${
                          isPlayerVisible 
                            ? (isPlaying ? 'text-purple-400 bg-white/10' : 'text-gray-100 bg-white/10') 
                            : 'text-gray-400'
                        }`}
                        title={isPlayerVisible ? "Hide Music Player" : "Show Music Player"}
                      >
                        <FiMusic size={14} />
                      </button>
                    </div>
                  </div>                
                </div>

                <div className="space-y-1">
                  <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide px-2 py-1">
                    Account
                  </div>
                  
                  <div className="px-2" onClick={closeMobileMenu}>
                    <div className="scale-85 origin-left">
                      <LandDropdown />
                    </div>
                  </div>

                  <Link 
                    to="/profile" 
                    className="text-gray-200 hover:bg-white/10 hover:text-white block px-2 py-1.5 rounded-md text-sm font-medium"
                    onClick={closeMobileMenu}
                  >
                    <div className="flex items-center">
                      {userProfile?.photoURL ? (
                        <img src={userProfile.photoURL} alt="Profile" className="w-4 h-4 rounded-full mr-2" />
                      ) : userProfile?.displayName ? (
                        <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-xs mr-2">
                          {userProfile.displayName.charAt(0).toUpperCase()}
                        </span>
                      ) : null}
                      <span className="truncate text-xs">
                        Profile ({userProfile?.displayName || currentUser?.email || 'User'})
                      </span>
                    </div>
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="text-gray-200 hover:bg-white/10 hover:text-white block w-full text-left px-2 py-1.5 rounded-md text-sm font-medium"
                  >
                    Logout
                  </button>
                </div>
              </>
            )}
            {!currentUser && (
              <div className="space-y-1">
                <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide px-2 py-1">
                  Account
                </div>
                <Link 
                  to="/login" 
                  className="text-gray-200 hover:bg-white/10 hover:text-white block px-2 py-1.5 rounded-md text-sm font-medium"
                  onClick={closeMobileMenu}
                >
                  Login
                </Link>
                <Link 
                  to="/register" 
                  className="bg-blue-500 hover:bg-blue-600 text-white block px-2 py-1.5 rounded-md text-sm font-medium"
                  onClick={closeMobileMenu}
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;