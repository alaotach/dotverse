import React, { useState, useEffect } from 'react';
import { FiCalendar, FiGift } from 'react-icons/fi';
import { dailyCheckInService } from '../../src/services/dailyLoginRewardService';
import { DailyCheckInModal } from './DailyLoginModal';

export const DailyCheckInButton: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);

  useEffect(() => {
    checkStatus();
    
    // Check status every minute
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const checkStatus = () => {
    setCanCheckIn(dailyCheckInService.canCheckInToday());
    setCurrentStreak(dailyCheckInService.getCurrentStreak());
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        onTouchEnd={() => setShowModal(true)}
        className={`
          relative flex items-center gap-2 px-4 py-3 rounded-lg transition-all duration-200 min-h-[48px]
          ${canCheckIn
            ? 'bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white shadow-lg animate-pulse'
            : 'bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-300'
          }
        `}
        style={{ touchAction: 'manipulation' }}
        title={canCheckIn ? 'Daily check-in available!' : 'Daily check-in'}
        aria-label={canCheckIn ? 'Daily check-in available!' : 'Daily check-in'}
      >
        <FiCalendar size={18} />
        <span className="hidden sm:inline font-medium">Check-in</span>
        
        {canCheckIn && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
            <FiGift size={8} className="text-white" />
          </div>
        )}
        
        {currentStreak > 0 && (
          <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
            {currentStreak}
          </span>
        )}
      </button>

      <DailyCheckInModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
      />
    </>
  );
};