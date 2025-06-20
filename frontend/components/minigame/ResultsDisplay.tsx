import React from 'react';

interface ResultsPlayer {
  id: string;
  name: string;
  drawing_id?: string;
  votes: number;
  rank: number;
  prize?: number;
}

interface ResultsDisplayProps {
  players: ResultsPlayer[];
  drawings: Array<{
    id: string;
    player_id: string;
    player_name: string;
    data: string;
    theme: string;
    votes: number;
  }>;
  currentPlayerId: string;
  theme: string;
  onContinue?: () => void;
  onNewGame?: () => void;
  onPlayAgain?: () => void;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  players,
  drawings,
  currentPlayerId,
  theme,
  onContinue,
  onNewGame,
  onPlayAgain
}) => {
  const sortedPlayers = [...players].sort((a, b) => a.rank - b.rank);
  const currentPlayer = players.find(p => p.id === currentPlayerId);

  const getRankEmoji = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '🏅';
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1: return 'text-yellow-400';
      case 2: return 'text-gray-300';
      case 3: return 'text-amber-600';
      default: return 'text-gray-400';
    }
  };
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-3xl font-bold text-white mb-3 flex items-center justify-center gap-2">
          � Game Results
        </h3>
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg p-4">
          <p className="text-white text-lg">
            Theme: <span className="font-bold text-yellow-300">"{theme}"</span>
          </p>
        </div>
      </div>

      {currentPlayer && (
        <div className="bg-gradient-to-br from-blue-900/70 to-purple-900/70 rounded-xl p-6 border border-blue-500/50 shadow-lg">
          <div className="text-center">
            <h4 className="text-xl font-bold text-white mb-4">🎯 Your Performance</h4>
            <div className="flex justify-center items-center space-x-6">
              <div className="text-center">
                <span className="text-6xl block mb-2">{getRankEmoji(currentPlayer.rank)}</span>
                <p className={`text-2xl font-bold ${getRankColor(currentPlayer.rank)}`}>
                  Rank #{currentPlayer.rank}
                </p>
              </div>
              <div className="text-center">
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-3xl font-bold text-yellow-400">{currentPlayer.votes}</p>
                  <p className="text-gray-300">vote{currentPlayer.votes !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {currentPlayer.prize && currentPlayer.prize > 0 && (
                <div className="text-center">
                  <div className="bg-green-800 rounded-lg p-4">
                    <p className="text-3xl font-bold text-green-400">+{currentPlayer.prize}</p>
                    <p className="text-green-300">coins</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-gray-800 to-gray-700 rounded-xl p-6 border border-gray-600">
        <h4 className="text-xl font-bold text-white mb-6 text-center flex items-center justify-center gap-2">
          🏆 Winner's Podium
        </h4>
        <div className="flex justify-center items-end space-x-4">
          {sortedPlayers.slice(0, 3).map((player, index) => {
            const heights = ['h-32', 'h-24', 'h-20'];
            const bgColors = ['bg-yellow-500', 'bg-gray-400', 'bg-amber-600'];
            
            return (
              <div key={player.id} className="text-center">
                <div className={`${bgColors[index]} ${heights[index]} w-20 rounded-t-lg flex flex-col justify-center items-center relative`}>
                  <span className="text-3xl">{getRankEmoji(index + 1)}</span>
                  <span className="text-white font-bold text-lg">{index + 1}</span>
                  {player.id === currentPlayerId && (
                    <div className="absolute -top-2 -right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                      You
                    </div>
                  )}
                </div>
                <div className="bg-gray-600 p-2 rounded-b-lg">
                  <p className="text-white font-medium text-sm truncate">{player.name}</p>
                  <p className="text-gray-300 text-xs">{player.votes} votes</p>
                  {player.prize && player.prize > 0 && (
                    <p className="text-green-400 text-xs">+{player.prize}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-800 to-gray-700 rounded-xl p-6 border border-gray-600">
        <h4 className="text-lg font-bold text-white mb-4 text-center flex items-center justify-center gap-2">
          📊 Full Leaderboard
        </h4>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {sortedPlayers.map((player, index) => (
            <div
              key={player.id}
              className={`flex items-center justify-between p-4 rounded-lg transition-all ${
                player.id === currentPlayerId
                  ? 'bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-500/50 shadow-md'
                  : 'bg-gray-600 hover:bg-gray-500'
              } ${index < 3 ? 'ring-1 ring-yellow-400/30' : ''}`}
            >
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{getRankEmoji(player.rank)}</span>
                  <span className={`font-bold text-lg ${getRankColor(player.rank)}`}>
                    #{player.rank}
                  </span>
                </div>
                <div>
                  <p className="text-white font-semibold flex items-center gap-2">
                    {player.name}
                    {player.id === currentPlayerId && (
                      <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">You</span>
                    )}
                  </p>
                  <p className="text-gray-300 text-sm flex items-center gap-1">
                    <span className="text-yellow-400">⭐</span>
                    {player.votes} vote{player.votes !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                {player.prize && player.prize > 0 && (
                  <div className="bg-green-800 px-3 py-1 rounded-lg">
                    <p className="text-green-400 font-bold">+{player.prize}</p>
                    <p className="text-green-300 text-xs">coins</p>
                  </div>
                )}
              </div>
            </div>
          ))}        
          </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {onPlayAgain && (
          <button
            onClick={onPlayAgain}
            className="flex-1 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white py-3 px-6 rounded-lg font-semibold transition-all transform hover:scale-105 flex items-center justify-center gap-2"
          >
            🎮 Play Again in Same Lobby
          </button>
        )}
        {onNewGame && (
          <button
            onClick={onNewGame}
            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white py-3 px-6 rounded-lg font-semibold transition-all transform hover:scale-105 flex items-center justify-center gap-2"
          >
            🆕 Find New Lobby
          </button>
        )}
        {onContinue && (
          <button
            onClick={onContinue}
            className="flex-1 bg-gradient-to-r from-gray-600 to-gray-500 hover:from-gray-700 hover:to-gray-600 text-white py-3 px-6 rounded-lg font-semibold transition-all transform hover:scale-105 flex items-center justify-center gap-2"
          >
            🚪 Leave Game
          </button>
        )}
      </div>
    </div>
  );
};

export default ResultsDisplay;
