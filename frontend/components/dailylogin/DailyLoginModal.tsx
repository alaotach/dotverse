import React, { useState, useEffect } from 'react';
import { dailyCheckInService, type DailyCheckInReward } from '../../src/services/dailyLoginRewardService';
import { useEconomy } from '../../src/context/EconomyContext';
import { FiX, FiGift, FiCalendar, FiTrendingUp } from 'react-icons/fi';

interface DailyCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DailyCheckInModal: React.FC<DailyCheckInModalProps> = ({ isOpen, onClose }) => {
  const [rewards, setRewards] = useState<DailyCheckInReward[]>([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastReward, setLastReward] = useState(0);
  const { addCoins } = useEconomy();

  useEffect(() => {
    if (isOpen) {
      loadCheckInData();
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = 'unset';
      document.body.style.touchAction = 'auto';
    }
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.touchAction = 'auto';
    };
  }, [isOpen]);

  const loadCheckInData = () => {
    setRewards(dailyCheckInService.getRewards());
    setCurrentStreak(dailyCheckInService.getCurrentStreak());
    setTotalCheckIns(dailyCheckInService.getTotalCheckIns());
    setCanCheckIn(dailyCheckInService.canCheckInToday());
  };

  const handleBackdropClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCloseClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  const handleCheckInClick = async (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canCheckIn) return;

    const result = dailyCheckInService.checkIn();
    
    if (result.success) {
      setLastReward(result.reward);
      addCoins(result.reward);
      setShowSuccess(true);
      loadCheckInData();
      setTimeout(() => {
        setShowSuccess(false);
      }, 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      onTouchEnd={handleBackdropClick}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
        pointerEvents: 'all',
        zIndex: 99999
      }}
    >
      <div 
        className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl shadow-purple-500/20 relative transform transition-all duration-300 scale-100"
        onClick={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={{ 
          margin: 'auto',
          maxHeight: '85vh',
          overflowY: 'auto',
          touchAction: 'pan-y',
          pointerEvents: 'all'
        }}
      >
        <div className="sticky top-0 bg-gray-900 flex items-center justify-between p-4 border-b border-gray-700 z-10">
          <div className="flex items-center gap-2">
            <FiCalendar className="text-yellow-400" />
            <h2 className="text-xl font-bold text-white">Daily Check-In</h2>
          </div>
          <button
            onClick={handleCloseClick}
            onTouchEnd={handleCloseClick}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="text-gray-400 hover:text-white active:text-white transition-colors p-3 hover:bg-gray-800 active:bg-gray-700 rounded-lg min-w-[48px] min-h-[48px] flex items-center justify-center"
            style={{ touchAction: 'manipulation', pointerEvents: 'all' }}
            aria-label="Close modal"
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="p-4 border-b border-gray-700">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <FiTrendingUp className="text-green-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{currentStreak}</div>
              <div className="text-sm text-gray-400">Current Streak</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <FiGift className="text-blue-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{totalCheckIns}</div>
              <div className="text-sm text-gray-400">Total Check-ins</div>
            </div>
          </div>
        </div>

        {showSuccess && (
          <div className="p-4 bg-green-900/50 border-l-4 border-green-400 m-4 rounded">
            <div className="flex items-center">
              <FiGift className="text-green-400 mr-2" />
              <div>
                <div className="text-green-100 font-medium">Check-in Successful!</div>
                <div className="text-green-200 text-sm">You earned {lastReward} coins!</div>
              </div>
            </div>
          </div>
        )}

        <div className="p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Weekly Rewards</h3>
          <div className="grid grid-cols-7 gap-2">
            {rewards.map((reward) => (
              <div
                key={reward.day}
                className={`
                  relative p-2 sm:p-3 rounded-lg text-center border-2 transition-all duration-200
                  ${reward.claimed 
                    ? 'bg-green-900 border-green-500 text-green-100' 
                    : currentStreak + 1 === reward.day && canCheckIn
                    ? 'bg-yellow-900 border-yellow-500 text-yellow-100 ring-2 ring-yellow-400'
                    : 'bg-gray-800 border-gray-600 text-gray-300'
                  }
                `}
              >
                <div className="text-xs font-medium mb-1">Day {reward.day}</div>
                <div className="text-sm font-bold">{reward.coins}</div>
                <div className="text-xs">coins</div>
                
                {reward.claimed && (
                  <div className="absolute inset-0 flex items-center justify-center bg-green-900/50 rounded-lg">
                    <FiGift className="text-green-400 text-lg" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-900 p-4 border-t border-gray-700">
          {canCheckIn ? (
            <button
              onClick={handleCheckInClick}
              onTouchEnd={handleCheckInClick}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="w-full py-4 px-4 rounded-lg font-semibold transition-all duration-200 min-h-[56px] text-lg bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
              style={{ touchAction: 'manipulation', pointerEvents: 'all' }}
            >
              <div className="flex items-center justify-center gap-2">
                <FiGift />
                Check In (+{dailyCheckInService.getNextReward()} coins)
              </div>
            </button>
          ) : (
            <div className="text-center py-2">
              <div className="text-gray-400 mb-2">Already checked in today!</div>
              <div className="text-sm text-gray-500">Come back tomorrow for your next reward</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};