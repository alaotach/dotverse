const LobbyInterface: React.FC<LobbyInterfaceProps> = ({
  lobbyId,
  players,
  gameStatus,
  currentPlayerId,
  hostId,
  isReady,
  maxPlayers,
  onReadyToggle,
  onStartGame,
  onLeaveLobby
}) => {
  const safeePlayers = players || {};
  const playerCount = Object.keys(safeePlayers).length;
  const readyCount = Object.values(safeePlayers).filter(p => p.is_ready).length;
  const allReady = playerCount > 1 && readyCount === playerCount;
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting_for_players': return 'text-yellow-400';
      case 'theme_voting': return 'text-blue-400';
      case 'drawing': return 'text-green-400';
      case 'voting_for_drawings': return 'text-purple-400';
      case 'showcasing_results': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'waiting_for_players': return '⏳';
      case 'theme_voting': return '🗳️';
      case 'drawing': return '🎨';
      case 'voting_for_drawings': return '👆';
      case 'showcasing_results': return '🏆';
      default: return '❓';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 rounded-xl text-center">
        <h2 className="text-2xl font-bold text-white mb-2">🎮 Drawing Lobby</h2>
        <div className="flex items-center justify-center gap-2 text-gray-200">
          <span className="font-mono">ID: {lobbyId?.slice(0, 8) || 'Unknown'}</span>
          <span>•</span>
          <span className={`font-semibold ${getStatusColor(gameStatus || 'waiting')}`}>
            {getStatusEmoji(gameStatus || 'waiting')} {(gameStatus || 'waiting').replace('_', ' ').toUpperCase()}
          </span>
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-800 to-gray-700 p-6 rounded-xl border border-gray-600">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            👥 Players ({playerCount}/{maxPlayers})
          </h3>
          <div className="text-sm text-gray-300">
            {readyCount}/{playerCount} ready
          </div>
        </div>
        
        <div className="space-y-3">
          {players && Object.entries(players).map(([id, player]) => {
            if (!player || typeof player !== 'object') {
              console.warn(`Invalid player data for ID ${id}:`, player);
              return null;
            }
            
            return (
            <div
              key={id}
              className={`flex justify-between items-center p-4 rounded-lg transition-all ${
                id === currentPlayerId
                  ? 'bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-500/50'
                  : 'bg-gray-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                  {(player.display_name || 'Unknown').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-semibold flex items-center gap-2">
                    {player.display_name || 'Unknown Player'}
                    {id === currentPlayerId && (
                      <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">You</span>
                    )}
                    {id === hostId && (
                      <span className="bg-yellow-500 text-black text-xs px-2 py-1 rounded-full font-bold">Host</span>
                    )}
                  </p>
                  <p className="text-gray-300 text-sm">
                    {id === currentPlayerId ? 'That\'s you!' : id === hostId ? 'Can start the game' : 'Fellow artist'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-2xl">
                  {player.is_ready ? '✅' : '⏳'}
                </span>
                <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                  player.is_ready
                    ? 'bg-green-600 text-white'
                    : 'bg-yellow-600 text-white'
                }`}>
                  {player.is_ready ? 'Ready' : 'Waiting'}
                </span>
              </div>
            </div>
            );
          }).filter(Boolean)}
        </div>
        
        {(gameStatus === 'waiting' || gameStatus === 'waiting_for_players') && (
          <div className="mt-6 space-y-3">
            {allReady && playerCount >= 2 && currentPlayerId === hostId && (
              <button
                onClick={onStartGame}
                className="w-full py-4 px-6 rounded-xl font-bold text-lg transition-all transform hover:scale-105 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
              >
                🚀 Start Game
              </button>
            )}
            
            {allReady && playerCount >= 2 && currentPlayerId !== hostId && (
              <div className="bg-green-800 border border-green-600 p-4 rounded-lg text-center">
                <div className="flex items-center justify-center gap-2 text-green-200">
                  <span className="text-2xl animate-bounce">🚀</span>
                  <div>
                    <p className="font-bold">All players ready!</p>
                    <p className="text-green-300 text-sm">Waiting for host to start the game...</p>
                  </div>
                </div>
              </div>
            )}
            
            {(!allReady || playerCount < 2) && currentPlayerId === hostId && playerCount >= 2 && (
              <div className="bg-yellow-800 border border-yellow-600 p-4 rounded-lg text-center">
                <div className="flex items-center justify-center gap-2 text-yellow-200">
                  <span className="text-2xl">⏳</span>
                  <div>
                    <p className="font-bold">Waiting for players</p>
                    <p className="text-yellow-300 text-sm">All players must be ready to start.</p>
                  </div>
                </div>
              </div>
            )}
            
            {currentPlayerId === hostId && playerCount < 2 && (
              <div className="bg-red-800 border border-red-600 p-4 rounded-lg text-center">
                <div className="flex items-center justify-center gap-2 text-red-200">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-bold">Need More Players</p>
                    <p className="text-red-300 text-sm">At least 2 players are needed to start.</p>
                  </div>
                </div>
              </div>
            )}
            
            <button
              onClick={onReadyToggle}
              className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all transform hover:scale-105 ${
                isReady
                  ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white'
                  : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white'
              }`}
            >
              {isReady ? '❌ Not Ready' : '✅ Ready to Play!'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-r from-cyan-900 to-blue-900 border border-cyan-700 p-6 rounded-xl">
        <h4 className="text-white font-bold mb-3 flex items-center gap-2">
          📝 How to Play
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-cyan-100">
          <div className="flex items-start gap-2">
            <span className="text-lg">🗳️</span>
            <div>
              <p className="font-semibold">1. Vote Theme</p>
              <p>Choose what everyone draws</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg">🎨</span>
            <div>
              <p className="font-semibold">2. Draw & Create</p>
              <p>Express your creativity</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg">👆</span>
            <div>
              <p className="font-semibold">3. Vote for Best</p>
              <p>Pick your favorite drawing</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg">🏆</span>
            <div>
              <p className="font-semibold">4. Win Prizes</p>
              <p>Earn coins for your ranking</p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center">
        <button
          onClick={onLeaveLobby}
          className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
        >
          🚪 Leave Lobby
        </button>
      </div>
    </div>
  );
};

export default LobbyInterface;