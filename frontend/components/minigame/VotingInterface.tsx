import React, { useState } from 'react';

interface Drawing {
  id: string;
  player_id: string;
  player_name: string;
  data: string;
  theme: string;
  votes: number;
}

interface VotingInterfaceProps {
  drawings: Drawing[];
  currentPlayerVote: string | null;
  timeRemaining: number;
  onVote: (drawingId: string) => void;
  canVote: boolean;
}

const VotingInterface: React.FC<VotingInterfaceProps> = ({
  drawings,
  currentPlayerVote,
  timeRemaining,
  onVote,
  canVote
}) => {
  const [selectedDrawing, setSelectedDrawing] = useState<string | null>(currentPlayerVote);

  const handleVote = (drawingId: string) => {
    if (!canVote || selectedDrawing === drawingId) return;
    
    setSelectedDrawing(drawingId);
    onVote(drawingId);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  return (
    <div className="space-y-6">
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
              <span className="text-sm">{drawings.length} drawing{drawings.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {drawings.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎨</div>
          <p className="text-gray-400 text-lg">No drawings to vote on</p>
          <p className="text-gray-500 text-sm">Waiting for players to submit their artwork...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-h-96 overflow-y-auto pr-2">
          {drawings.map((drawing, index) => (
            <div
              key={drawing.id}
              className={`group relative bg-gradient-to-br from-gray-800 to-gray-700 rounded-xl p-4 border-2 transition-all duration-300 cursor-pointer transform hover:scale-102 ${
                selectedDrawing === drawing.id
                  ? 'border-blue-500 bg-gradient-to-br from-blue-900/50 to-purple-900/50 shadow-lg shadow-blue-500/20'
                  : 'border-gray-600 hover:border-gray-500 hover:shadow-lg'
              } ${!canVote ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={() => handleVote(drawing.id)}
            >
              {/* Rank Badge for Top 3 */}
              {index < 3 && (
                <div className="absolute -top-2 -left-2 z-10">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                    index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : 'bg-amber-600'
                  }`}>
                    {index + 1}
                  </div>
                </div>
              )}

              {/* Selected Indicator */}
              {selectedDrawing === drawing.id && (
                <div className="absolute -top-2 -right-2 z-10">
                  <div className="bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg">
                    ✓
                  </div>
                </div>
              )}

              <div className="flex flex-col space-y-4">
                {/* Drawing preview */}
                <div className="bg-white rounded-lg p-3 min-h-40 flex items-center justify-center shadow-inner">
                  {drawing.data ? (
                    <img
                      src={drawing.data.startsWith('data:') ? drawing.data : `data:image/png;base64,${drawing.data}`}
                      alt={`Drawing by ${drawing.player_name}`}
                      className="max-w-full max-h-36 object-contain rounded"
                    />
                  ) : (
                    <div className="text-gray-500 text-sm flex flex-col items-center gap-2">
                      <span className="text-3xl">🎨</span>
                      <span>No preview available</span>
                    </div>
                  )}
                </div>

                {/* Drawing info */}
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <p className="text-white font-semibold text-lg flex items-center gap-2">
                      <span className="text-xl">👨‍🎨</span>
                      {drawing.player_name}
                    </p>
                    <p className="text-gray-400 text-sm flex items-center gap-1">
                      <span className="text-purple-400">🎯</span>
                      Theme: {drawing.theme}
                    </p>
                  </div>
                  <div className="text-right">
                    {selectedDrawing === drawing.id && canVote && (
                      <div className="text-blue-400 text-sm font-medium mb-1 flex items-center gap-1">
                        <span className="text-lg">👍</span>
                        Your Vote
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-gray-300">
                      <span className="text-yellow-400">⭐</span>
                      <span className="font-semibold">{drawing.votes}</span>
                      <span className="text-sm">vote{drawing.votes !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hover effect overlay */}
              {canVote && (
                <div className="absolute inset-0 rounded-xl bg-blue-500/0 group-hover:bg-blue-500/10 transition-all duration-300 pointer-events-none" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Status Messages */}
      <div className="space-y-2">
        {!canVote && (
          <div className="text-center bg-yellow-900/50 border border-yellow-600 p-3 rounded-lg">
            <div className="flex items-center justify-center gap-2 text-yellow-400">
              <span className="text-xl">⚠️</span>
              <span className="font-medium">You cannot vote on your own drawing</span>
            </div>
          </div>
        )}

        {selectedDrawing && canVote && (
          <div className="text-center bg-green-900/50 border border-green-600 p-3 rounded-lg">
            <div className="flex items-center justify-center gap-2 text-green-400">
              <span className="text-xl">✅</span>
              <div>
                <p className="font-medium">Vote submitted!</p>
                <p className="text-green-300 text-sm">You can change your vote anytime before time runs out.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VotingInterface;
