import { Link } from 'react-router-dom';
import { useAuth } from '../src/context/AuthContext';
import { lazy, Suspense } from 'react';

const HeroSectionBG = lazy(() => import('./layout/HeroSectionBG'));


export default function Home() {
  const { currentUser, userProfile, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      <div className="absolute inset-0 z-0" style={{ pointerEvents: 'auto' }}>
        <Suspense fallback={<div className="w-full h-full bg-gradient-to-b from-purple-900 via-blue-900 to-black" />}>
          <HeroSectionBG />
        </Suspense>
      </div>

      <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/10 via-transparent to-black/20 pointer-events-none" />

      <div className="relative z-20 min-h-screen flex pointer-events-none">
        <div className="w-1/2 flex flex-col justify-center items-start pl-8 lg:pl-16 xl:pl-24 pointer-events-auto">
          <div className="max-w-xl">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 mb-6 tracking-tight">
              DotVerse
            </h1>
            <p className="max-md:hidden md:block text-lg md:text-xl lg:text-2xl text-gray-200 mb-4 font-light">
              Connect your dots across the cosmos
            </p>
            <p className="max-md:hidden md:block text-base md:text-lg text-gray-400 mb-8 leading-relaxed">
              DotVerse is a collaborative pixel canvas where you can claim your own land, express your creativity, and connect with others in a shared universe.
            </p>
            <div className="flex flex-col gap-4 mb-8">
              {/* Canvas Button */}
              <Link 
                to="/canvas" 
                className="group relative overflow-hidden bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 p-1 rounded-2xl shadow-2xl hover:shadow-blue-500/25 transition-all duration-300 transform hover:scale-105 w-fit"
              >
                <div className="bg-black rounded-xl px-6 py-3 group-hover:bg-transparent transition-all duration-300">
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-2xl">🎨</span>
                    <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 group-hover:from-white group-hover:to-white transition-all duration-300">
                      Enter Canvas
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 group-hover:text-gray-200 mt-1 transition-colors duration-300">
                    Paint the infinite cosmos
                  </p>
                </div>
              </Link>

              <Link 
                to="/minigame" 
                className="group relative overflow-hidden bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 p-1 rounded-2xl shadow-2xl hover:shadow-orange-500/25 transition-all duration-300 transform hover:scale-105 w-fit"
              >
                <div className="bg-black rounded-xl px-6 py-3 group-hover:bg-transparent transition-all duration-300">
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-2xl">🎮</span>
                    <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-400 group-hover:from-white group-hover:to-white transition-all duration-300">
                      Play Games
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 group-hover:text-gray-200 mt-1 transition-colors duration-300">
                    Drawing competitions & more
                  </p>
                </div>
              </Link>

              {!currentUser && (
                <Link 
                  to="/register" 
                  className="group relative overflow-hidden bg-gradient-to-r from-green-500 to-emerald-500 p-1 rounded-2xl shadow-2xl hover:shadow-green-500/25 transition-all duration-300 transform hover:scale-105 w-fit"
                >
                  <div className="bg-black rounded-xl px-6 py-3 group-hover:bg-transparent transition-all duration-300">
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-2xl">🚀</span>
                      <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400 group-hover:from-white group-hover:to-white transition-all duration-300">
                        Join DotVerse
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 group-hover:text-gray-200 mt-1 transition-colors duration-300">
                      Start your cosmic journey
                    </p>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="w-1/3 flex items-center justify-center pointer-events-none">
          <div className="text-center opacity-20 hover:opacity-40 transition-opacity duration-500">
            <div className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white/20 to-white/10 mb-4">
              ∞
            </div>
            <p className="text-white/20 text-sm font-light">
              Drag to explore
            </p>
          </div>
        </div>

        <div className="w-1/2 flex flex-col justify-center items-end pr-8 lg:pr-16 xl:pr-24 pointer-events-auto">
          {currentUser && userProfile ? (
            <div className="max-w-md w-full">
              <div className="group relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-300"></div>
                
                <div className="relative bg-black/80 backdrop-blur-xl border border-gray-800 rounded-2xl p-6">
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="flex-shrink-0">
                      {userProfile.photoURL ? (
                        <img 
                          className="h-16 w-16 rounded-full border-2 border-purple-500 shadow-lg" 
                          src={userProfile.photoURL} 
                          alt="Profile" 
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center border-2 border-purple-500 shadow-lg">
                          <span className="text-white font-bold text-xl">
                            {userProfile.displayName?.[0]?.toUpperCase() || userProfile.email?.[0]?.toUpperCase() || '?'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xl font-bold text-white truncate">
                        Welcome back!
                      </p>
                      <p className="text-lg text-purple-300 truncate">
                        {userProfile.displayName || userProfile.email}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="bg-gray-800/50 rounded-xl p-4">
                      <p className="text-sm text-gray-400 mb-2">Your Land</p>
                      <p className="text-white font-mono text-sm">
                        ({userProfile.landInfo?.centerX}, {userProfile.landInfo?.centerY})
                      </p>
                      <p className="text-purple-300 text-sm">
                        Size: {userProfile.landInfo?.ownedSize}×{userProfile.landInfo?.ownedSize}
                      </p>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Link
                        to="/profile"
                        className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 transform hover:scale-105 text-center"
                      >
                        👤 Profile
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex-1 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 transform hover:scale-105"
                      >
                        🚪 Logout
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-md w-full">
              <div className="bg-black/60 backdrop-blur-xl border border-gray-800 rounded-2xl p-6 text-center">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Ready to explore?
                </h3>
                <p className="text-gray-300 mb-6">
                  Join the community and start creating your digital legacy in the infinite canvas.
                </p>
                <div className="space-y-3">
                  <Link
                    to="/login"
                    className="block w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
                  >
                    🔑 Sign In
                  </Link>
                  <Link
                    to="/register"
                    className="block w-full border-2 border-purple-500 hover:bg-purple-500/10 text-purple-300 hover:text-white font-medium py-3 px-6 rounded-lg transition-all duration-200"
                  >
                    ✨ Create Account
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black via-black/50 to-transparent z-10 pointer-events-none" />
    </div>
  );
}