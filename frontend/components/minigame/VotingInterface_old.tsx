import React from 'react';

interface Drawing {
  id: string;
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
  };

  const handlePrevious = () => {
    if (!isShowcaseMode && currentDrawingIndex > 0) {
      setCurrentDrawingIndex(currentDrawingIndex - 1);
    }
  };

  const handleNext = () => {
    if (!isShowcaseMode && currentDrawingIndex < votableDrawings.length - 1) {
      setCurrentDrawingIndex(currentDrawingIndex + 1);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isShowcaseMode) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-white mb-2">🎨 Showcase Voting</h3>
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <span className="text-xl">⏱️</span>
                <span className={`font-mono text-lg ${timeRemaining <= 5 ? 'text-yellow-300 animate-pulse' : ''}`}>
                  {formatTime(Math.ceil(timeRemaining))}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🏆</span>
                <span className="text-sm">Drawing {currentShowcaseIndex + 1} of {drawings.length}</span>
              </div>
            </div>
            
            <div className="mt-3 bg-gray-700 rounded-full h-2">
              <div 
                className="bg-yellow-400 h-2 rounded-full transition-all duration-1000"
                style={{ width: `${((currentShowcaseIndex + 1) / drawings.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {currentDrawing && (
          <div className="bg-gradient-to-br from-gray-800 to-gray-700 rounded-xl p-6 border-2 border-gray-600 shadow-lg">
            <div className="text-center mb-6">
              <h4 className="text-2xl font-bold text-white flex items-center justify-center gap-2 mb-2">
                <span className="text-2xl">👨‍🎨</span>
                {currentDrawing.player_name}
                {isMyDrawing && <span className="text-green-400 text-lg">(You)</span>}
              </h4>
              <p className="text-gray-400 flex items-center justify-center gap-2">
                <span className="text-purple-400">🎯</span>
                Theme: <span className="font-semibold text-purple-300">{currentDrawing.theme}</span>
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 mb-6 flex items-center justify-center shadow-inner min-h-80">
              {currentDrawing.data ? (
                <img
                  src={currentDrawing.data.startsWith('data:') ? currentDrawing.data : `data:image/png;base64,${currentDrawing.data}`}
                  alt={`Drawing by ${currentDrawing.player_name}`}
                  className="max-w-full max-h-72 object-contain rounded border border-gray-300"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <div className="text-gray-500 text-lg flex flex-col items-center gap-3">
                  <span className="text-6xl">🎨</span>
                  <span>No preview available</span>
                </div>
              )}
            </div>

            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-4 text-gray-300">
                <span className="text-yellow-400 text-xl">⭐</span>
                <span className="font-semibold text-lg">{currentDrawing.votes}</span>
                <span>vote{currentDrawing.votes !== 1 ? 's' : ''}</span>
              </div>

              {isMyDrawing ? (
                <div className="bg-blue-900/50 border border-blue-600 p-4 rounded-lg">
                  <div className="flex items-center justify-center gap-2 text-blue-400">
                    <span className="text-xl">✨</span>
                    <div>
                      <p className="font-medium">This is your drawing!</p>
                      <p className="text-blue-300 text-sm">Watch the votes come in real-time!</p>
                    </div>
                  </div>
                </div>
              ) : canVote ? (
                <button
                  onClick={() => handleVote()}
                  className={`px-8 py-3 rounded-lg font-bold text-lg transition-all duration-200 transform ${
                    hasVotedForCurrent
                      ? 'bg-green-600 text-white shadow-lg shadow-green-500/20 scale-105'
                      : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 hover:shadow-lg'
                  }`}
                >
                  {hasVotedForCurrent ? (
                    <span className="flex items-center gap-2">
                      <span className="text-xl">✅</span>
                      You voted for this!
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="text-xl">👍</span>
                      Vote for this drawing
                    </span>
                  )}
                </button>
              ) : (
                <div className="bg-gray-700 p-3 rounded-lg">
                  <div className="flex items-center justify-center gap-2 text-gray-400">
                    <span className="text-xl">⚠️</span>
                    <span className="font-medium">Voting disabled</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="text-center">
        <h3 className="text-2xl font-bold text-white mb-2">🏆 Vote for the Best Drawing!</h3>
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg p-3 mb-3">
          <div className="flex justify-between items-center text-white">
            <div className="flex items-center gap-2">
              <span className="text-xl">⏱️</span>
              <span className={`font-mono text-lg ${timeRemaining <= 30 ? 'text-yellow-300 animate-pulse' : ''}`}>
                {formatTime(Math.ceil(timeRemaining))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🎨</span>
              <span className="text-sm">{votableDrawings.length} drawing{votableDrawings.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {votableDrawings.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎨</div>
          <p className="text-gray-400 text-lg">No other drawings to vote on</p>
          <p className="text-gray-500 text-sm">You cannot vote for your own drawing</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-gray-800 rounded-lg p-4">
            <button
              onClick={handlePrevious}
              disabled={currentDrawingIndex === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                currentDrawingIndex === 0
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
              }`}
            >
              <span className="text-lg">←</span>
              Previous
            </button>
            
            <div className="flex flex-col items-center gap-2">
              <div className="text-white font-semibold">
                Drawing {currentDrawingIndex + 1} of {votableDrawings.length}
              </div>
              <div className="flex gap-1">
                {votableDrawings.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentDrawingIndex(index)}
                    className={`w-3 h-3 rounded-full transition-all duration-200 ${
                      index === currentDrawingIndex
                        ? 'bg-blue-500 scale-125'
                        : 'bg-gray-600 hover:bg-gray-500'
                    }`}
                  />
                ))}
              </div>
            </div>
            
            <button
              onClick={handleNext}
              disabled={currentDrawingIndex === votableDrawings.length - 1}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                currentDrawingIndex === votableDrawings.length - 1
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
              }`}
            >
              Next
              <span className="text-lg">→</span>
            </button>
          </div>

          {currentDrawing && (
            <div className="bg-gradient-to-br from-gray-800 to-gray-700 rounded-xl p-6 border-2 border-gray-600 shadow-lg">
              <div className="text-center mb-6">
                <h4 className="text-2xl font-bold text-white flex items-center justify-center gap-2 mb-2">
                  <span className="text-2xl">👨‍🎨</span>
                  {currentDrawing.player_name}
                </h4>
                <p className="text-gray-400 flex items-center justify-center gap-2">
                  <span className="text-purple-400">🎯</span>
                  Theme: <span className="font-semibold text-purple-300">{currentDrawing.theme}</span>
                </p>
              </div>

              <div className="bg-white rounded-lg p-6 mb-6 flex items-center justify-center shadow-inner min-h-80">
                {currentDrawing.data ? (
                  <img
                    src={currentDrawing.data.startsWith('data:') ? currentDrawing.data : `data:image/png;base64,${currentDrawing.data}`}
                    alt={`Drawing by ${currentDrawing.player_name}`}
                    className="max-w-full max-h-72 object-contain rounded border border-gray-300"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : (
                  <div className="text-gray-500 text-lg flex flex-col items-center gap-3">
                    <span className="text-6xl">🎨</span>
                    <span>No preview available</span>
                  </div>
                )}
              </div>

              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-4 text-gray-300">
                  <span className="text-yellow-400 text-xl">⭐</span>
                  <span className="font-semibold text-lg">{currentDrawing.votes}</span>
                  <span>vote{currentDrawing.votes !== 1 ? 's' : ''}</span>
                </div>

                {canVote ? (
                  <button
                    onClick={() => handleVote(currentDrawing.id)}
                    className={`px-8 py-3 rounded-lg font-bold text-lg transition-all duration-200 transform ${
                      selectedDrawing === currentDrawing.player_id
                        ? 'bg-green-600 text-white shadow-lg shadow-green-500/20 scale-105'
                        : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 hover:shadow-lg'
                    }`}
                  >
                    {selectedDrawing === currentDrawing.player_id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-xl">✅</span>
                        You voted for this!
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="text-xl">👍</span>
                        Vote for this drawing
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="bg-yellow-900/50 border border-yellow-600 p-3 rounded-lg">
                    <div className="flex items-center justify-center gap-2 text-yellow-400">
                      <span className="text-xl">⚠️</span>
                      <span className="font-medium">You cannot vote on your own drawing</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {selectedDrawing && canVote && (
          <div className="text-center bg-green-900/50 border border-green-600 p-3 rounded-lg">
            <div className="flex items-center justify-center gap-2 text-green-400">
              <span className="text-xl">✅</span>
              <div>
                <p className="font-medium">Vote submitted!</p>
                <p className="text-green-300 text-sm">You can change your vote by selecting a different drawing.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VotingInterface;
