import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../src/context/AuthContext';

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
    <div className="min-h-screen bg-gray-50">
      <div className="relative bg-blue-600 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="relative z-10 pb-8 bg-blue-600 sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
            <div className="pt-10 mx-auto max-w-7xl px-4 sm:pt-12 sm:px-6 md:pt-16 lg:pt-20 lg:px-8 xl:pt-28">
              <div className="sm:text-center lg:text-left">
                <h1 className="text-4xl font-extrabold text-white sm:text-5xl md:text-6xl">
                  <span className="block">Your world,</span>
                  <span className="block text-blue-200">one pixel at a time</span>
                </h1>
                <p className="mt-3 text-base text-blue-100 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                  DotVerse is a collaborative pixel canvas where you can claim your own land, express your creativity, and connect with others in a shared universe.
                </p>                <div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start space-y-3 sm:space-y-0 sm:space-x-3">
                  <div className="rounded-md shadow">
                    <Link to="/canvas" className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-blue-600 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10">
                      🎨 Join Canvas
                    </Link>
                  </div>
                  <div className="rounded-md shadow">
                    <Link to="/minigame" className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-purple-600 bg-yellow-300 hover:bg-yellow-200 md:py-4 md:text-lg md:px-10">
                      🎮 Play Minigame
                    </Link>
                  </div>
                  {!currentUser && (
                    <div className="mt-3 sm:mt-0 sm:ml-3">
                      <Link to="/register" className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-blue-100 bg-blue-500 hover:bg-blue-400 md:py-4 md:text-lg md:px-10">
                        Get Started
                      </Link>
                    </div>
                  )}
                </div>

                {/* User Profile Section - Only shown when logged in */}
                {currentUser && userProfile && (
                  <div className="mt-8 bg-blue-500 rounded-lg p-4 max-w-md">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        {userProfile.photoURL ? (
                          <img className="h-10 w-10 rounded-full" src={userProfile.photoURL} alt="Profile" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-blue-300 flex items-center justify-center">
                            <span className="text-blue-800 font-semibold">
                              {(userProfile.displayName || userProfile.email || 'U').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          Welcome, {userProfile.displayName || userProfile.email}
                        </p>
                        {userProfile.landInfo && (
                          <p className="text-xs text-blue-100">
                            Land: ({userProfile.landInfo.centerX}, {userProfile.landInfo.centerY})
                          </p>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <Link 
                          to="/profile"
                          className="inline-flex items-center px-3 py-1 border border-blue-400 text-xs font-medium rounded text-blue-100 hover:bg-blue-400 hover:text-white"
                        >
                          Profile
                        </Link>
                        <button
                          onClick={handleLogout}
                          className="inline-flex items-center px-3 py-1 border border-blue-400 text-xs font-medium rounded text-blue-100 hover:bg-blue-400 hover:text-white"
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 bg-blue-500">
          <div className="h-56 w-full sm:h-72 md:h-96 lg:w-full lg:h-full">
            <div className="w-full h-full opacity-30 flex">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col">
                  {Array.from({ length: 20 }).map((_, j) => (
                    <div 
                      key={j} 
                      className="flex-1 border border-blue-400"
                      style={{
                        backgroundColor: Math.random() > 0.7 
                          ? `rgb(${Math.floor(Math.random()*255)}, ${Math.floor(Math.random()*255)}, ${Math.floor(Math.random()*255)})` 
                          : 'transparent'
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-blue-600 font-semibold tracking-wide uppercase">Features</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Explore the DotVerse
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              Create, expand, and collaborate in our shared pixel universe
            </p>
          </div>

          <div className="mt-10">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <div className="pt-6">
                <div className="flow-root bg-gray-50 rounded-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div className="inline-flex items-center justify-center p-3 bg-blue-500 rounded-md shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a4 4 0 004-4V5z" />
                      </svg>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Claim Your Land</h3>
                    <p className="mt-5 text-base text-gray-500">
                      Get your own piece of the canvas when you sign up. Build, create, and express yourself in your personal space.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-gray-50 rounded-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div className="inline-flex items-center justify-center p-3 bg-green-500 rounded-md shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Real-time Collaboration</h3>
                    <p className="mt-5 text-base text-gray-500">
                      See changes from other users instantly. Work together to create amazing pixel art in a shared universe.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-gray-50 rounded-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div className="inline-flex items-center justify-center p-3 bg-purple-500 rounded-md shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Express Yourself</h3>
                    <p className="mt-5 text-base text-gray-500">
                      Use our advanced drawing tools including brushes, erasers, and fill tools to bring your imagination to life.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-500">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 lg:py-16 flex flex-col md:flex-row items-center justify-between">
          <div className="md:w-2/3 md:pr-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl mb-4">Ready to join?</h2>
            <p className="text-lg text-blue-100">
              {currentUser 
                ? "Jump back into the canvas and continue creating your masterpiece."
                : "Create an account to claim your land and start contributing to our collaborative pixel world."
              }
            </p>
          </div>
          <div className="mt-8 md:mt-0">
            <div className="rounded-md shadow">
              <Link to={currentUser ? "/canvas" : "/register"} className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-blue-600 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10">
                {currentUser ? "Go to Canvas" : "Sign Up Now"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}