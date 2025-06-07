import React, { useState } from 'react';
import CreateLobbyModal from './CreateLobbyModal';

interface LobbyCardProps {
  id: string;
  playerCount: number;
  maxPlayers: number;
  status: string;
  onJoin: () => void;
  disabled?: boolean;
  privateLobby?: boolean;
  hasPassword?: boolean;
}

const LobbyCard: React.FC<LobbyCardProps> = ({
  id,
  playerCount,
  maxPlayers,
  status,
  onJoin,
  disabled = false,
  privateLobby = false,
  hasPassword = false
}) => {const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting_for_players': return 'bg-green-600';
      case 'theme_voting': return 'bg-blue-600';
      case 'drawing': return 'bg-yellow-600';
      case 'voting_for_drawings': return 'bg-purple-600';
      case 'showcasing_results': return 'bg-orange-600';
      case 'ended': return 'bg-gray-600';
      default: return 'bg-gray-600';
    }
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'waiting_for_players': return '⏳';
      case 'theme_voting': return '🗳️';
      case 'drawing': return '🎨';
      case 'voting_for_drawings': return '👆';
      case 'showcasing_results': return '🏆';
      case 'ended': return '✅';
      default: return '❓';
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-700 to-gray-600 p-4 rounded-xl border border-gray-500 hover:border-gray-400 transition-all hover:scale-105">      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className="text-white font-bold text-lg flex items-center gap-2">
            🎮 Lobby
            {privateLobby && <span className="text-yellow-400">🔒</span>}
            {hasPassword && <span className="text-red-400">🔑</span>}
          </h4>
          <p className="text-gray-300 text-sm font-mono">ID: {id?.slice(0, 8) || 'Unknown'}...</p>
        </div>
        <span className={`${getStatusColor(status)} text-white text-xs px-2 py-1 rounded-full font-medium`}>
          {getStatusEmoji(status)} {(status || '').replace('_', ' ')}
        </span>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-gray-300">
          <span className="flex items-center gap-1">
            👥 {playerCount}/{maxPlayers}
          </span>
          <div className="w-2 h-2 rounded-full bg-gray-500"></div>
          <span className={`text-sm ${playerCount === maxPlayers ? 'text-red-400' : 'text-green-400'}`}>
            {playerCount === maxPlayers ? 'Full' : 'Open'}
          </span>
        </div>
          <button
          onClick={onJoin}
          disabled={disabled}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            disabled
              ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white transform hover:scale-105'
          }`}
        >
          {playerCount === maxPlayers ? '🚫 Full' : status !== 'waiting_for_players' ? '🎮 In Game' : '🚀 Join'}
        </button>
      </div>
    </div>
  );
};

interface MinigameEntryProps {
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  onCreateLobby: (playerName: string, settings?: any) => void;  availableLobbies: Array<{
    id: string;
    player_count: number;
    max_players: number;
    status: string;
    private_lobby?: boolean;
    has_password?: boolean;
  }>;
  onJoinLobby: (lobbyId: string) => void;
}

const MinigameEntry: React.FC<MinigameEntryProps> = ({
  playerName,
  onPlayerNameChange,
  onCreateLobby,
  availableLobbies,
  onJoinLobby
}) => {
  const safeAvailableLobbies = Array.isArray(availableLobbies) ? availableLobbies : [];
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const handleCreateLobby = (name: string, settings?: any) => {
    if (isCreating) return;
    
    setIsCreating(true);
    onCreateLobby(name, settings);
    setShowCreateModal(false);
    setTimeout(() => setIsCreating(false), 5000);
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="mb-6">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
            🎨 Drawing Minigame
          </h1>
          <p className="text-xl text-gray-300">
            Create, compete, and win in real-time drawing battles!
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-2xl mb-2">🗳️</div>
            <div className="text-sm text-gray-300">Vote Themes</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-2xl mb-2">🎨</div>
            <div className="text-sm text-gray-300">Draw Art</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-2xl mb-2">👆</div>
            <div className="text-sm text-gray-300">Vote Best</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-2xl mb-2">🏆</div>
            <div className="text-sm text-gray-300">Win Coins</div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-800 to-gray-700 p-6 rounded-xl border border-gray-600">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          👤 Player Setup
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">Your Display Name</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="Enter your artistic name..."
              maxLength={20}
            />
            <p className="text-gray-400 text-sm mt-1">
              This is how other players will see you
            </p>
          </div>
          
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={!playerName.trim() || isCreating}
            className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 disabled:from-gray-600 disabled:to-gray-700 text-white py-4 px-6 rounded-xl font-bold text-lg transition-all transform hover:scale-105 disabled:scale-100 shadow-lg"
          >
            🚀 Create New Lobby
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-800 to-gray-700 p-6 rounded-xl border border-gray-600">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          🏠 Available Lobbies
        </h2>
        
        {safeAvailableLobbies.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-xl font-bold text-white mb-2">No Active Lobbies</h3>
            <p className="text-gray-400 mb-6">
              Be the first to create a lobby and start the fun!
            </p>            <button
              onClick={() => onCreateLobby(playerName)}
              disabled={!playerName.trim()}
              className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-700 text-white px-8 py-3 rounded-lg font-semibold transition-all transform hover:scale-105 disabled:scale-100"
            >
              🎮 Create First Lobby
            </button>
          </div>
        ) : (          <div className="grid gap-4 max-h-96 overflow-y-auto">            {safeAvailableLobbies.map((lobby) => (
              <LobbyCard
                key={lobby.id}
                id={lobby.id}
                playerCount={lobby.player_count}
                maxPlayers={lobby.max_players}
                status={lobby.status}
                privateLobby={lobby.private_lobby}
                hasPassword={lobby.has_password}
                onJoin={() => onJoinLobby(lobby.id)}
                disabled={
                  !playerName.trim() ||
                  lobby.player_count >= lobby.max_players ||
                  lobby.status !== 'waiting_for_players'
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-gradient-to-r from-indigo-900 to-purple-900 border border-indigo-700 p-6 rounded-xl">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          💡 Pro Tips
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-indigo-200 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-lg">🎨</span>
            <div>
              <p className="font-semibold">Practice Makes Perfect</p>
              <p>The more you play, the better your drawings become!</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg">⚡</span>
            <div>
              <p className="font-semibold">Think Fast</p>
              <p>You only have limited time to draw, so plan quickly!</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg">🤝</span>
            <div>
              <p className="font-semibold">Be Creative</p>
              <p>Unique interpretations often win more votes!</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg">🏆</span>
            <div>
              <p className="font-semibold">Win Rewards</p>
              <p>Top players earn coins they can spend in the marketplace!</p>
            </div>
          </div>
        </div>
      </div>
      <CreateLobbyModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateLobby={handleCreateLobby}
        playerName={playerName}
        onPlayerNameChange={onPlayerNameChange}
      />
    </div>
  );
};

export default MinigameEntry;
