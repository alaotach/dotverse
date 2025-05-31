import React, { useEffect } from 'react';
import { useMusic } from '../../src/context/MusicContext';
import { FiPlay, FiPause, FiVolume2, FiVolumeX, FiMusic, FiMinimize, FiMaximize } from 'react-icons/fi';

const Controls: React.FC = () => {
  const {
    currentTrack, isPlaying, volume, isMuted, availableTracks,
    togglePlayPause, setVolume, toggleMute, selectTrack,
    hasInteracted, setHasInteracted
  } = useMusic();

  const [isPanelMinimized, setIsPanelMinimized] = React.useState(true);

  useEffect(() => {
    if (!hasInteracted) {
      const handleFirstInteraction = () => {
        setHasInteracted();
        ['click', 'keydown', 'touchstart'].forEach(event => 
          window.removeEventListener(event, handleFirstInteraction, true)
        );
      };
      ['click', 'keydown', 'touchstart'].forEach(event => 
        window.addEventListener(event, handleFirstInteraction, { once: true, capture: true })
      );
      return () => {
        ['click', 'keydown', 'touchstart'].forEach(event => 
          window.removeEventListener(event, handleFirstInteraction, true)
        );
      };
    }
  }, [hasInteracted, setHasInteracted]);

  if (!currentTrack) {
    return (
      <div className="fixed bottom-4 left-4 bg-gray-800 text-white p-3 rounded-lg shadow-lg z-50">
        Loading music...
      </div>
    );
  }

  return (
    <div 
      className={`fixed bottom-0 left-0 mb-4 ml-4 bg-gray-900/80 backdrop-blur-sm text-white rounded-lg shadow-xl z-[1000] border border-gray-700/50 transition-all duration-300 ease-in-out ${isPanelMinimized ? 'w-16 h-16 overflow-hidden p-0' : 'w-72 p-1'}`}
    >
      <div 
        className={`flex items-center cursor-pointer ${isPanelMinimized ? 'justify-center h-full' : 'p-2 bg-gray-700/50 rounded-t-md justify-between'}`}
        onClick={() => setIsPanelMinimized(!isPanelMinimized)}
      >
        <FiMusic className={`text-purple-400 ${isPanelMinimized ? 'mx-auto my-auto' : ''}`} size={isPanelMinimized ? 28 : 18} />
        {!isPanelMinimized && <span className="text-sm font-medium truncate flex-1 mx-2">{currentTrack.name}</span>}
        {!isPanelMinimized && (
          <button className="text-gray-300 hover:text-white">
            <FiMinimize size={16} />
          </button>
        )}
         {isPanelMinimized && (
          <div className="absolute bottom-1 right-1 opacity-50">
            <FiMaximize size={10} />
          </div>
        )}
      </div>

      {!isPanelMinimized && (
        <div className="p-3 space-y-3">
          <div className="text-xs text-gray-400 truncate">Artist: {currentTrack.artist || 'Unknown'}</div>
          
          <div className="flex items-center justify-around">
            <button onClick={togglePlayPause} className="p-2 hover:bg-gray-700/70 rounded-full">
              {isPlaying ? <FiPause size={24} /> : <FiPlay size={24} />}
            </button>
            <button onClick={toggleMute} className="p-2 hover:bg-gray-700/70 rounded-full">
              {isMuted ? <FiVolumeX size={20} /> : <FiVolume2 size={20} />}
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <FiVolumeX size={16} className="text-gray-400" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                if (isMuted && parseFloat(e.target.value) > 0) toggleMute();
              }}
              className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
              disabled={isMuted}
            />
            <FiVolume2 size={16} className="text-gray-400" />
          </div>

          <div>
            <label htmlFor="track-select" className="block text-xs font-medium text-gray-400 mb-1">
              Select Track:
            </label>
            <select
              id="track-select"
              value={currentTrack.id}
              onChange={(e) => selectTrack(e.target.value)}
              className="w-full p-2 bg-gray-700/80 border border-gray-600/50 rounded-md text-sm focus:outline-none focus:border-purple-500"
            >
              {availableTracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </select>
          </div>
          {!hasInteracted && (
            <div className="text-center text-xs text-yellow-400 p-2 bg-yellow-900/50 rounded">
              Click anywhere or press a key to enable sound.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Controls;