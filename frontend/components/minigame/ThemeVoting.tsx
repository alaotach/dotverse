import React, { useState } from 'react';
import { LobbyState } from '../../src/services/minigameWebSocketService';

interface ThemeVotingProps {
  lobbyState: LobbyState;
  timeRemaining: number;
  onVote: (theme: string) => void;
}

const ThemeVoting: React.FC<ThemeVotingProps> = ({ 
  lobbyState, 
  timeRemaining, 
  onVote 
}) => {
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  const themes = [
    { name: 'Nature', emoji: '🌲', description: 'Trees, flowers, landscapes' },
    { name: 'Animals', emoji: '🐱', description: 'Pets, wildlife, creatures' },
    { name: 'Food', emoji: '🍕', description: 'Meals, snacks, drinks' },
    { name: 'Technology', emoji: '📱', description: 'Gadgets, computers, robots' },
    { name: 'Fantasy', emoji: '🧙', description: 'Magic, dragons, wizards' },
    { name: 'Space', emoji: '🚀', description: 'Planets, aliens, rockets' },
    { name: 'Sports', emoji: '⚽', description: 'Games, activities, competition' },
    { name: 'Music', emoji: '🎵', description: 'Instruments, songs, concerts' }
  ];

  const handleVote = (theme: string) => {
    setSelectedTheme(theme);
    onVote(theme);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const voteCounts = themes.reduce((acc, theme) => {
    acc[theme.name] = 0;
    return acc;
  }, {} as Record<string, number>);

  if (lobbyState.theme_votes) {
    Object.values(lobbyState.theme_votes).forEach((vote) => {
      if (voteCounts.hasOwnProperty(vote)) {
        voteCounts[vote]++;
      }
    });
  }

  const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-3xl font-bold text-white mb-3">🎯 Choose Your Drawing Theme</h3>
        <div className="bg-gradient-to-r from-yellow-600 to-orange-600 rounded-lg p-4 mb-3">
          <p className="text-white text-xl font-bold flex items-center justify-center gap-2">
            <span className="text-2xl">⏱️</span>
            {formatTime(timeRemaining)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-gray-300 flex items-center justify-center gap-2">
            <span className="text-blue-400">👥</span>
            {Object.keys(lobbyState.players).length - totalVotes} players still need to vote
          </p>
        </div>
      </div>

      {/* Theme Options */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {themes.map((theme) => {
          const voteCount = voteCounts[theme.name];
          const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
          const isSelected = selectedTheme === theme.name;
          const isLeading = voteCount > 0 && voteCount === Math.max(...Object.values(voteCounts));

          return (
            <button
              key={theme.name}
              onClick={() => handleVote(theme.name)}
              disabled={selectedTheme !== null}
              className={`
                relative p-5 rounded-xl border-3 transition-all duration-300 transform group
                ${isSelected 
                  ? 'border-blue-500 bg-gradient-to-br from-blue-600 to-blue-700 scale-105 shadow-lg shadow-blue-500/30' 
                  : selectedTheme 
                    ? 'border-gray-600 bg-gray-800 opacity-50 cursor-not-allowed'
                    : 'border-gray-600 bg-gradient-to-br from-gray-700 to-gray-800 hover:bg-gradient-to-br hover:from-gray-600 hover:to-gray-700 hover:border-gray-500 hover:scale-105'
                }
                ${isLeading && voteCount > 0 ? 'ring-2 ring-yellow-400 ring-opacity-50' : ''}
              `}
            >
              {/* Leading indicator */}
              {isLeading && voteCount > 0 && !isSelected && (
                <div className="absolute -top-2 -right-2">
                  <div className="bg-yellow-500 text-black rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold animate-pulse">
                    👑
                  </div>
                </div>
              )}

              <div className="text-center">
                <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-200">
                  {theme.emoji}
                </div>
                <div className="text-white font-bold text-lg mb-1">{theme.name}</div>
                <div className="text-xs text-gray-300 mb-3">{theme.description}</div>
                
                {voteCount > 0 && (
                  <div className="mt-3">
                    <div className="text-sm text-gray-200 font-medium mb-1 flex items-center justify-center gap-1">
                      <span className="text-yellow-400">⭐</span>
                      {voteCount} vote{voteCount !== 1 ? 's' : ''}
                    </div>
                    <div className="w-full bg-gray-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          isLeading ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' : 'bg-gradient-to-r from-blue-400 to-blue-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {percentage.toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>

              {isSelected && (
                <div className="absolute -top-3 -right-3 bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold shadow-lg animate-bounce">
                  ✓
                </div>
              )}

              {/* Hover effect overlay */}
              <div className="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/5 transition-all duration-300 pointer-events-none" />
            </button>
          );
        })}
      </div>

      {/* Voting Status */}
      {selectedTheme && (
        <div className="bg-gradient-to-r from-green-800 to-green-700 border border-green-600 p-4 rounded-xl text-center shadow-lg">
          <div className="flex items-center justify-center gap-3 text-green-200 mb-2">
            <span className="text-2xl animate-bounce">✅</span>
            <div>
              <p className="font-bold text-lg">You voted for <span className="text-green-100">{selectedTheme}</span>!</p>
              <p className="text-green-300 text-sm">Waiting for other players to vote...</p>
            </div>
          </div>
        </div>
      )}

      {/* Player Status */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-700 p-5 rounded-xl border border-gray-600">
        <h4 className="text-white font-bold mb-4 flex items-center gap-2">
          <span className="text-xl">👥</span>
          Player Status
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(lobbyState.players).map(([playerId, player]) => {
            const hasVoted = lobbyState.theme_votes && lobbyState.theme_votes[playerId];
            const playerVote = hasVoted ? lobbyState.theme_votes[playerId] : null;
            
            return (
              <div 
                key={playerId}
                className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                  hasVoted 
                    ? 'bg-green-800/50 border border-green-600/50' 
                    : 'bg-yellow-800/50 border border-yellow-600/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {hasVoted ? '✅' : '⏳'}
                  </span>
                  <span className="text-white font-medium">{player.display_name}</span>
                </div>
                <div className="text-right">
                  {hasVoted ? (
                    <div className="text-xs">
                      <div className="text-green-400 font-medium">Voted</div>
                      {playerVote && (
                        <div className="text-gray-300">{playerVote}</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-yellow-400 text-xs font-medium animate-pulse">
                      Voting...
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gradient-to-r from-indigo-900 to-purple-900 border border-indigo-700 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <span className="text-3xl">💡</span>
          <div>
            <p className="text-indigo-200 font-semibold mb-1">
              Pro Tip: Choose wisely!
            </p>
            <p className="text-indigo-300 text-sm">
              Pick a theme you'd enjoy drawing. The most popular theme will be selected for everyone to draw!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeVoting;
