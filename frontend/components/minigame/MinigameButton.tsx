import React, { useState } from 'react';
import MinigameLobby from './MinigameLobby';

interface MinigameButtonProps {
  className?: string;
}

const MinigameButton: React.FC<MinigameButtonProps> = ({ className = '' }) => {
  const [showMinigame, setShowMinigame] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    setShowMinigame(true);
  };

  const handleClose = () => {
    setShowMinigame(false);
  };

  return (
    <>
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 flex items-center gap-3 transform hover:scale-105 hover:shadow-lg active:scale-95 ${className}`}
        title="Join the Drawing Minigame - Express your creativity and compete with other players!"
      >
        <div className={`transition-transform duration-300 ${isHovered ? 'rotate-12' : ''}`}>
          <svg 
            className="w-5 h-5" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" 
            />
          </svg>
        </div>
        <span className="flex items-center gap-2">
          🎨 Drawing Game
          {isHovered && <span className="text-yellow-300">✨</span>}
        </span>
      </button>

      {showMinigame && (
        <MinigameLobby onClose={handleClose} />
      )}
    </>
  );
};

export default MinigameButton;
