import React from 'react';

interface Drawing {
  id?: string;  // Frontend format
  drawing_id?: string;  // Backend format
  player_id: string;
  player_name: string;
  data: string;
  theme: string;
  votes: number;
  current_voters?: string[];
}

interface VotingInterfaceProps {
  drawings: Drawing[];
  currentPlayerVote: string | null;
  timeRemaining: number;
  onVote: (drawingId: string) => void;
  canVote: boolean;
  currentPlayerId: string;
  currentShowcaseIndex?: number;
  showcaseTimeRemaining?: number;
  isShowcaseMode?: boolean;
  // Auto-display voting props
  currentVotingDrawing?: Drawing | null;
  votingDisplayTimeRemaining?: number;
  currentVoters?: { [key: string]: string };
  currentVotingDrawingIndex?: number;
  totalDrawings?: number;
}

const VotingInterface: React.FC<VotingInterfaceProps> = ({
  drawings,
  currentPlayerVote,
  timeRemaining,
  onVote,
  canVote,
  currentPlayerId,
  currentShowcaseIndex = 0,
  isShowcaseMode = false,
  currentVotingDrawing,
  votingDisplayTimeRemaining = 0,
  currentVoters = {},
  currentVotingDrawingIndex = 0,
  totalDrawings = 0
}) => {
  // For auto-display voting, use the current voting drawing
  // For showcase mode, find the drawing by index
  const displayDrawing = isShowcaseMode 
    ? (drawings && typeof currentShowcaseIndex === 'number' && currentShowcaseIndex >= 0 && currentShowcaseIndex < drawings.length 
       ? drawings[currentShowcaseIndex] 
       : null)
    : currentVotingDrawing;
    
  // Debug logging for showcase mode
  if (isShowcaseMode) {
    console.log('[VotingInterface] Showcase mode active:', {
      currentShowcaseIndex,
      drawingsLength: drawings.length,
      displayDrawing: displayDrawing ? 'found' : 'not found',
      drawings: drawings.map(d => ({ id: d.id || d.drawing_id, player_name: d.player_name }))
    });
  }
    
  const isMyDrawing = displayDrawing?.player_id === currentPlayerId;
  
  const handleVote = () => {
    if (!canVote || !displayDrawing || isMyDrawing) return;
    const drawingId = displayDrawing.id || displayDrawing.drawing_id;
    if (!drawingId) return;
    onVote(drawingId);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  // Check if voted for current drawing
  const getDrawingId = (drawing: Drawing) => drawing.id || drawing.drawing_id || '';
  const hasVotedForCurrent = displayDrawing ? currentPlayerVote === getDrawingId(displayDrawing) : false;

  if (isShowcaseMode) {
    return (
      <div className="voting-interface bg-white rounded-lg shadow-lg p-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">🏆 Results</h2>
          <p className="text-gray-600">Final voting results</p>
        </div>        {displayDrawing ? (
          <div className="drawing-display mb-6">
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold">{displayDrawing.player_name}'s Drawing</h3>
                <span className="text-sm text-gray-500">Theme: {displayDrawing.theme}</span>
              </div>
              <div className="drawing-canvas bg-white border-2 border-gray-200 rounded-md mb-3">
                <img 
                  src={displayDrawing.data} 
                  alt={`Drawing by ${displayDrawing.player_name}`}
                  className="w-full h-64 object-contain"
                />
              </div>
              <div className="text-center">
                <span className="text-xl font-bold text-blue-600">
                  {displayDrawing.votes} vote{displayDrawing.votes !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">No drawing to display</p>
            <p className="text-sm text-gray-400 mt-2">
              Index: {currentShowcaseIndex}, Drawings: {drawings.length}
            </p>
          </div>
        )}

        <div className="progress-info text-center">
          <p className="text-sm text-gray-500">
            Showing drawing {(currentShowcaseIndex || 0) + 1} of {drawings.length}
          </p>
          <p className="text-lg font-semibold text-gray-700">
            Time remaining: {formatTime(timeRemaining)}
          </p>
        </div>
      </div>
    );
  }

  // Auto-display voting mode
  return (
    <div className="voting-interface bg-white rounded-lg shadow-lg p-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">🗳️ Vote for Drawings</h2>
        <p className="text-gray-600">Each drawing is displayed for 10 seconds</p>
        <div className="mt-2">
          <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
            Drawing {currentVotingDrawingIndex + 1} of {totalDrawings}
          </span>
        </div>
      </div>      {displayDrawing ? (
        <div className="drawing-display mb-6">
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold">{displayDrawing.player_name}'s Drawing</h3>
              <span className="text-sm text-gray-500">Theme: {displayDrawing.theme}</span>
            </div>
            
            <div className="drawing-canvas bg-white border-2 border-gray-200 rounded-md mb-3">
              <img 
                src={displayDrawing.data} 
                alt={`Drawing by ${displayDrawing.player_name}`}
                className="w-full h-64 object-contain"
              />
            </div>

            {/* Display timer for current drawing */}
            <div className="text-center mb-3">
              <div className="bg-gray-200 rounded-full h-2 mb-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${(votingDisplayTimeRemaining / 10) * 100}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-600">
                {votingDisplayTimeRemaining} seconds remaining for this drawing
              </p>
            </div>

            {/* Show voting status */}
            {isMyDrawing ? (
              <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-3">
                <p className="text-green-800 font-medium text-center">
                  This is your drawing! 🎨
                </p>
                {Object.keys(currentVoters).length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-green-700 mb-1">Currently voting:</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(currentVoters).map(([playerId, playerName]) => (
                        <span 
                          key={playerId}
                          className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs"
                        >
                          {playerName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center">
                <button
                  onClick={handleVote}
                  disabled={!canVote || hasVotedForCurrent}
                  className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                    hasVotedForCurrent
                      ? 'bg-green-500 text-white'
                      : canVote
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {hasVotedForCurrent ? '✓ Voted!' : 'Vote for this Drawing'}
                </button>
                
                {hasVotedForCurrent && (
                  <p className="text-sm text-green-600 mt-2">
                    You can change your vote while this drawing is displayed
                  </p>
                )}
              </div>
            )}

            {/* Show current vote count */}
            <div className="text-center mt-3">
              <span className="text-lg font-bold text-gray-700">
                Current votes: {displayDrawing.votes}
              </span>
            </div>
          </div>
        </div>      ) : (
        <div className="text-center py-8">
          <p className="text-gray-500">No drawing to display</p>
        </div>
      )}
    </div>
  );
};

export default VotingInterface;
