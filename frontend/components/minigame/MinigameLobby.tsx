import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import minigameWebSocketService, { type LobbyState } from '../../src/services/minigameWebSocketService';
import DrawingCanvas from './DrawingCanvas';
import VotingInterface from './VotingInterface';
import ResultsDisplay from './ResultsDisplay';
import ThemeVoting from './ThemeVoting';
import MinigameEntry from './MinigameEntry';
import LobbyInterface from './LobbyInterface';
import LoadingSpinner from '../common/LoadingSpinner';

interface MinigameLobbyProps {
  onClose?: () => void;
}

const MinigameLobby: React.FC<MinigameLobbyProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [currentLobby, setCurrentLobby] = useState<LobbyState | null>(null);
  const [availableLobbies, setAvailableLobbies] = useState<Array<{
    id: string;
    player_count: number;
    max_players: number;
    status: string;
  }>>([]);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  useEffect(() => {
    const connect = async () => {
      try {
        await minigameWebSocketService.connect();
      } catch (error) {
        console.error('Failed to connect to minigame server:', error);
      }
    };
    connect();

    const handleConnected = (isConnected: boolean) => {
      setConnected(isConnected);
      if (isConnected) {
        minigameWebSocketService.getLobbyList();
      }
    };

    const handlePlayerIdAssigned = (id: string) => {
      setPlayerId(id);
    };    const handleLobbyUpdate = (message: any) => {
      const lobbyState = message?.data || message;
      console.log('[MinigameLobby] Received lobby_update:', lobbyState);

      if (!lobbyState) {
        console.warn('[MinigameLobby] No lobby state found in update message');
        return;
      }

      if (lobbyState.game_status === 'voting') {
        console.log('[MinigameLobby] Game status is VOTING. Drawings:', lobbyState.drawings);
        console.log('[MinigameLobby] Drawing votes:', lobbyState.drawing_votes);
      }
      
      console.log('Available players in update:', Object.keys(lobbyState?.players || {}));
      
      setCurrentLobby(lobbyState);
      
      const currentPlayerId = minigameWebSocketService.getPlayerId();
      console.log('Current player ID:', currentPlayerId);
      
      if (currentPlayerId && lobbyState && lobbyState.players) {
        if (lobbyState.players[currentPlayerId]) {
          setIsReady(lobbyState.players[currentPlayerId].is_ready);
        } else {
          setCurrentLobby(null);
          setIsReady(false);
        }
      }
    };
      const handleLobbyJoined = (message: any) => {
      const lobbyState = message?.data || message;
      
      if (lobbyState) {
        setCurrentLobby(lobbyState);
        minigameWebSocketService.getLobbyList();
      } else {
        console.error('No lobby state found in join response');
      }
    };
    
    const handleLobbyList = (message: any) => {
      const lobbies = message?.data || message;
      setAvailableLobbies(Array.isArray(lobbies) ? lobbies : []);
    };

    const handleError = (errorData: { message?: string } | null) => {
      const errorMessage = errorData?.message || 'Unknown error connecting to minigame server';
      console.error('Minigame error:', errorMessage);
      
      setErrorMessage(errorMessage);
      setTimeout(() => setErrorMessage(''), 5000);
    };

    minigameWebSocketService.on('connected', handleConnected);
    minigameWebSocketService.on('player_id_assigned', handlePlayerIdAssigned);
    minigameWebSocketService.on('lobby_update', handleLobbyUpdate);
    minigameWebSocketService.on('lobby_joined', handleLobbyJoined);
    minigameWebSocketService.on('lobby_list', handleLobbyList);
    minigameWebSocketService.on('error', handleError);

    return () => {
      minigameWebSocketService.off('connected', handleConnected);
      minigameWebSocketService.off('player_id_assigned', handlePlayerIdAssigned);
      minigameWebSocketService.off('lobby_update', handleLobbyUpdate);
      minigameWebSocketService.off('lobby_joined', handleLobbyJoined);
      minigameWebSocketService.off('lobby_list', handleLobbyList);
      minigameWebSocketService.off('error', handleError);
      
      const currentPlayerId = minigameWebSocketService.getPlayerId();
      if (currentLobby && currentPlayerId) {
        minigameWebSocketService.leaveLobby();
      }
      minigameWebSocketService.disconnect();
    };
  }, []);

  const handleCreateLobby = () => {
    if (!playerName.trim()) {
      alert('Please enter a player name');
      return;
    }
    minigameWebSocketService.createLobby(playerName.trim());
  };

  const handleJoinLobby = (lobbyId: string) => {
    if (!playerName.trim()) {
      alert('Please enter a player name');
      return;
    }
    minigameWebSocketService.joinLobby(lobbyId, playerName.trim());
  };
  const handleReadyToggle = () => {
    const currentPlayerId = minigameWebSocketService.getPlayerId();
    if (currentLobby && currentPlayerId) {
      const newReadyState = !isReady;
      minigameWebSocketService.setPlayerReady(newReadyState);
    }
  };

  const handleStartGame = () => {
    const currentPlayerId = minigameWebSocketService.getPlayerId();
    if (currentLobby && currentPlayerId && currentLobby.host_id === currentPlayerId) {
      minigameWebSocketService.startGame();
    }
  };

  const handleThemeVote = useCallback((theme: string) => {
    const currentPlayerId = minigameWebSocketService.getPlayerId();
    if (currentLobby && currentPlayerId) {
      minigameWebSocketService.voteTheme(theme);
    }
  }, [currentLobby]);

  const handleSubmitDrawing = useCallback((drawingData: string) => {
    const currentPlayerId = minigameWebSocketService.getPlayerId();
    if (currentLobby && currentPlayerId) {
      minigameWebSocketService.submitDrawing(drawingData);
    }
  }, [currentLobby]);

  const handleSubmitVote = useCallback((votedPlayerId: string) => {
    const currentPlayerId = minigameWebSocketService.getPlayerId();
    if (currentLobby && currentPlayerId) {
      minigameWebSocketService.voteForDrawing(votedPlayerId);
    }
  }, [currentLobby]);

  const handleLeaveLobby = () => {
    const currentPlayerId = minigameWebSocketService.getPlayerId();
    if (currentLobby && currentPlayerId) {
      minigameWebSocketService.leaveLobby();
    }
    setCurrentLobby(null);
    setIsReady(false);
    minigameWebSocketService.getLobbyList();
  };const renderLobbyContent = () => {
    if (!connected) {
      return (
        <div className="text-center text-gray-300 py-20">
          <LoadingSpinner />
          <p className="text-lg mt-4">Connecting to the Minigame Universe...</p>
          {errorMessage && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 animate-pulse">
              {errorMessage}
            </div>
          )}
        </div>
      );
    }
    if (!currentLobby) {
      return (
        <MinigameEntry
          playerName={playerName}
          onPlayerNameChange={setPlayerName}
          availableLobbies={availableLobbies}
          onCreateLobby={handleCreateLobby}
          onJoinLobby={handleJoinLobby}
        />
      );
    }

    const gameStatus = currentLobby.game_status || 'waiting';
    const currentEffectivePlayerId = playerId || minigameWebSocketService.getPlayerId();

    console.log(`[MinigameLobby] renderLobbyContent: gameStatus='${gameStatus}', currentLobby.drawings exists: ${!!currentLobby.drawings}, currentEffectivePlayerId: ${currentEffectivePlayerId}`);
    if (currentLobby.drawings) {
        console.log('[MinigameLobby] renderLobbyContent: currentLobby.drawings:', currentLobby.drawings);
    }    
    
    if (gameStatus === 'waiting_for_players') {      
      return (        
      <LobbyInterface
          lobbyId={currentLobby.id || ''}
          players={currentLobby.players || {}}
          gameStatus={gameStatus}
          currentPlayerId={playerId || minigameWebSocketService.getPlayerId() || ''}
          hostId={currentLobby.host_id || ''}
          isReady={isReady}
          maxPlayers={currentLobby.max_players || 4}
          onReadyToggle={handleReadyToggle}
          onStartGame={handleStartGame}
          onLeaveLobby={handleLeaveLobby}
        />
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-4 rounded-lg">
          <h3 className="text-xl font-bold text-white">Lobby: {currentLobby.id?.slice(0, 8) || 'Unknown'}</h3>
          <div className="text-right">
            <p className="text-sm text-gray-300">Phase</p>
            <p className="text-lg font-bold text-yellow-400 capitalize">{gameStatus?.replace('_', ' ') || 'Waiting'}</p>
          </div>
        </div>

        {gameStatus === 'theme_voting' && (
          <ThemeVoting
            lobbyState={currentLobby}
            onVote={handleThemeVote}
            timeRemaining={currentLobby.phase_time_remaining}
          />
        )}

        {gameStatus === 'drawing' && (
          <DrawingCanvas
            lobbyState={currentLobby}
            timeRemaining={currentLobby.phase_time_remaining}
            onSubmitDrawing={handleSubmitDrawing}
          />
        )}        
        
        {(gameStatus === 'voting' || gameStatus === 'showcase_voting') && currentLobby.drawings && (playerId || minigameWebSocketService.getPlayerId()) && (
          <VotingInterface
            drawings={Object.values(currentLobby.drawings)}
            currentPlayerVote={currentLobby.drawing_votes?.[playerId || minigameWebSocketService.getPlayerId() || ''] || null}
            onVote={handleSubmitVote}
            timeRemaining={currentLobby.phase_time_remaining}
            canVote={!!(playerId || minigameWebSocketService.getPlayerId())}
            currentPlayerId={playerId || minigameWebSocketService.getPlayerId() || ''}
            currentShowcaseIndex={currentLobby.showcase_current_index}
            showcaseTimeRemaining={currentLobby.phase_time_remaining}
            isShowcaseMode={gameStatus === 'showcase_voting'}
          />
        )}        
        
        {(gameStatus === 'showcasing' || gameStatus === 'ended') && currentLobby.results && (
          <ResultsDisplay            players={currentLobby.results.map(([playerId, votes], index) => {
              const player = currentLobby.players[playerId];
              return {
                id: playerId,
                name: player?.display_name || 'Unknown',
                votes: votes,
                rank: index + 1,
              };
            })}
            drawings={Object.values(currentLobby.drawings || {})}
            currentPlayerId={playerId || ''}
            theme={currentLobby.theme || 'Unknown'}
            onContinue={handleLeaveLobby}
            onNewGame={handleLeaveLobby}
          />
        )}

        {gameStatus !== 'ended' && gameStatus !== 'showcasing' && (
          <button
            onClick={handleLeaveLobby}
            className="w-full bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
          >
            Leave Lobby
          </button>
        )}
      </div>
    );
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-indigo-900">
      {/* Navigation Header */}
      <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur-sm border-b border-purple-500/30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-purple-400">🎮 Drawing Minigame</h1>
            <div className="flex items-center gap-4">
              {playerId && (
                <div className="text-xs text-gray-400">
                  Player ID: {playerId.slice(0,8)}...
                </div>
              )}
              <button
                onClick={() => onClose ? onClose() : navigate('/')}
                className="text-gray-400 hover:text-white text-2xl leading-none transform hover:scale-110 transition-transform px-3 py-1 rounded-lg hover:bg-gray-800/50"
                aria-label="Back to Home"
              >
                🏠
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {renderLobbyContent()}
        </div>
      </div>
    </div>
  );
};

export default MinigameLobby;
