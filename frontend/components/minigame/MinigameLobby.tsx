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
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);  const [availableLobbies, setAvailableLobbies] = useState<Array<{
    id: string;
    player_count: number;
    max_players: number;
    status: string;
    private_lobby?: boolean;
    has_password?: boolean;
  }>>([]);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentPlayerId, setCurrentPlayerId] = useState<string>('');
  useEffect(() => {
    const connect = async () => {
      try {
        await minigameWebSocketService.connect();
      } catch (error) {
        console.error('Failed to connect to minigame server:', error);
      }
    };
    connect();

    const handleSettingsUpdated = (data: { message: string; settings: any }) => {
      toast.success(data.message);
      console.log('Lobby settings updated:', data.settings);
    };

    const handleConnected = (isConnected: boolean) => {
      setConnected(isConnected);
      if (isConnected) {
        minigameWebSocketService.getLobbyList();
      }
    };

    const handlePlayerIdAssigned = (id: string) => {
      console.log('[MinigameLobby] Player ID assigned:', id);
      setPlayerId(id);
      if (!minigameWebSocketService.getPlayerId()) {
        console.warn('[MinigameLobby] Service doesn\'t have player ID, this might indicate a sync issue');
      }
    };
    
    const handleLobbyUpdate = (message: any) => {
      const lobbyState = message?.data || message;
      console.log('[MinigameLobby] Received lobby_update:', lobbyState);

      if (!lobbyState) {
        console.warn('[MinigameLobby] No lobby state found in update message');
        return;
      }      if (lobbyState.game_status === 'voting_for_drawings' || lobbyState.game_status === 'voting') {
        console.log('[MinigameLobby] Game status is VOTING. Drawings:', lobbyState.drawings);
        console.log('[MinigameLobby] Drawing votes:', lobbyState.drawing_votes);
        console.log('[MinigameLobby] Current voting drawing:', lobbyState.current_voting_drawing);
        console.log('[MinigameLobby] Voting display time remaining:', lobbyState.voting_display_time_remaining);
        console.log('[MinigameLobby] Current voters:', lobbyState.current_voters);
      }
      
      console.log('Available players in update:', Object.keys(lobbyState?.players || {}));
      
      setCurrentLobby(lobbyState);
      
      const currentEffectivePlayerId = playerId || minigameWebSocketService.getPlayerId();
      console.log('Current player ID:', currentEffectivePlayerId);
      
      if (currentEffectivePlayerId && lobbyState && lobbyState.players) {
        if (lobbyState.players[currentEffectivePlayerId]) {
          setIsReady(lobbyState.players[currentEffectivePlayerId].is_ready);
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
        setIsCreatingLobby(false);
      } else {
        console.error('No lobby state found in join response');
        setIsCreatingLobby(false);
      }
    };
    
    const handleLobbyList = (message: any) => {
      const lobbies = message?.data || message;
      setAvailableLobbies(Array.isArray(lobbies) ? lobbies : []);
    };

    const handleError = (errorData: { message?: string } | null) => {
      const message = errorData?.message || 'An unknown error occurred';
      console.error('Minigame error:', message);
      setErrorMessage(message);
      setIsCreatingLobby(false);
      
      setTimeout(() => setErrorMessage(''), 5000);
    }; 

    const handleKickedFromLobby = (data: { message: string }) => {
      setCurrentLobby(null);
      setIsReady(false);
      setErrorMessage(`${data.message}. You can rejoin the lobby if you want.`);
      setTimeout(() => setErrorMessage(''), 7000);
    };

    const handleBannedFromLobby = (data: { message: string }) => {
      setCurrentLobby(null);
      setIsReady(false);
      setErrorMessage(data.message);
      setTimeout(() => setErrorMessage(''), 5000);
    };
    const handlePlayerKicked = (data: { kicked_player_name: string; message: string }) => {
      console.log(`Player kicked: ${data.message}`);
    };

    const handlePlayerBanned = (data: { banned_player_name: string; message: string }) => {
      console.log(`Player banned: ${data.message}`);
    };

    const handleHostTransferred = (data: { 
      new_host_name: string; 
      message: string; 
      reason?: string;
      new_host_id: string;
    }) => {
      console.log('Host transferred:', data);
      
      let toastMessage = data.message;
      if (data.reason === 'host_disconnected') {
        toastMessage = `${data.new_host_name} is now the host (previous host disconnected)`;
      } else if (data.reason === 'host_left') {
        toastMessage = `${data.new_host_name} is now the host (previous host left)`;
      }
      
      toast.info(toastMessage, {
        autoClose: 5000,
        icon: '👑'
      });
      
      if (playerId === data.new_host_id) {
        toast.success('You are now the lobby host!', {
          autoClose: 5000,
          icon: '🎉'
        });
      }
    };

    minigameWebSocketService.on('connected', handleConnected);
    minigameWebSocketService.on('player_id_assigned', handlePlayerIdAssigned);
    minigameWebSocketService.on('lobby_update', handleLobbyUpdate);
    minigameWebSocketService.on('lobby_joined', handleLobbyJoined);
    minigameWebSocketService.on('lobby_list', handleLobbyList);
    minigameWebSocketService.on('error', handleError);
    minigameWebSocketService.on('kicked_from_lobby', handleKickedFromLobby);
    minigameWebSocketService.on('banned_from_lobby', handleBannedFromLobby);
    minigameWebSocketService.on('player_kicked', handlePlayerKicked);
    minigameWebSocketService.on('player_banned', handlePlayerBanned);
    minigameWebSocketService.on('host_transferred', handleHostTransferred);
    minigameWebSocketService.on('settings_updated', handleSettingsUpdated);

    return () => {
      minigameWebSocketService.off('connected', handleConnected);
      minigameWebSocketService.off('player_id_assigned', handlePlayerIdAssigned);
      minigameWebSocketService.off('lobby_update', handleLobbyUpdate);
      minigameWebSocketService.off('lobby_joined', handleLobbyJoined);
      minigameWebSocketService.off('lobby_list', handleLobbyList);
      minigameWebSocketService.off('error', handleError);
      minigameWebSocketService.off('kicked_from_lobby', handleKickedFromLobby);
      minigameWebSocketService.off('banned_from_lobby', handleBannedFromLobby);
      minigameWebSocketService.off('player_kicked', handlePlayerKicked);
      minigameWebSocketService.off('player_banned', handlePlayerBanned);
      minigameWebSocketService.off('host_transferred', handleHostTransferred);
      minigameWebSocketService.off('settings_updated', handleSettingsUpdated);

      const currentPlayerId = minigameWebSocketService.getPlayerId();
      if (currentLobby && currentPlayerId) {
        minigameWebSocketService.leaveLobby();
      }
      minigameWebSocketService.disconnect();
    };
  }, []);

  const handleKickPlayer = useCallback((playerId: string) => {
    minigameWebSocketService.kickPlayer(playerId);
  }, []);

  const handleBanPlayer = useCallback((playerId: string) => {
    minigameWebSocketService.banPlayer(playerId);
  }, []);

  const handleTransferHost = useCallback((playerId: string) => {
    minigameWebSocketService.transferHost(playerId);
  }, []);

  const handleCreateLobby = (playerName: string, settings?: any) => {
    if (isCreatingLobby) {
      console.log('Already creating lobby, ignoring duplicate request');
      return;
    }

    if (!playerName.trim()) {
      alert('Please enter a player name');
      return;
    }

    console.log('Creating lobby with name:', playerName.trim(), 'and settings:', settings);
    setIsCreatingLobby(true);
    
    try {
      const success = minigameWebSocketService.createLobby(playerName.trim(), settings);
      if (!success) {
        setIsCreatingLobby(false);
        alert('Failed to create lobby - not connected to server');
      }
    } catch (error) {
      console.error('Error creating lobby:', error);
      setIsCreatingLobby(false);
      alert('Error creating lobby');
    }
  };
  const handleJoinLobby = (lobbyId: string) => {
    if (!playerName.trim()) {
      alert('Please enter a player name');
      return;
    }

    // Find the lobby to check if it's password protected
    const lobby = availableLobbies.find(l => l.id === lobbyId);
    if (lobby && lobby.has_password) {
      // Prompt for password
      const password = prompt('This lobby requires a password:');
      if (password === null) {
        return; // User cancelled
      }
      minigameWebSocketService.joinLobbyWithPassword(lobbyId, playerName.trim(), password);
    } else {
      // No password required
      minigameWebSocketService.joinLobby(lobbyId, playerName.trim());
    }
  };
  const handleReadyToggle = () => {
  const currentEffectivePlayerId = playerId || minigameWebSocketService.getPlayerId();
  const newReadyState = !isReady;
  setIsReady(newReadyState);
  
  const success = minigameWebSocketService.setPlayerReady(newReadyState);
  if (!success) {
    setIsReady(!newReadyState);
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
  const handleSubmitVote = useCallback((drawingId: string) => {
    const currentPlayerId = minigameWebSocketService.getPlayerId();
    if (currentLobby && currentPlayerId) {
      minigameWebSocketService.voteForDrawing(drawingId);
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
  };

  const handleUpdateSettings = useCallback((newSettings: any) => {
    const success = minigameWebSocketService.updateLobbySettings(newSettings);
    if (!success) {
      console.error('Failed to update lobby settings');
    }
  }, []);

  // Add a helper function to format time values safely
const formatTimeValue = (timeValue: any): string => {
  if (!timeValue) return '--:--';
  
  try {
    const endTime = new Date(timeValue).getTime();
    const now = new Date().getTime();
    const diff = Math.max(0, endTime - now);
    
    if (isNaN(diff) || diff <= 0) return '00:00';
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } catch (error) {
    console.error('Error formatting time:', error);
    return '--:--';
  }
};

  const renderLobbyContent = () => {
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

    const handlePlayAgain = () => {
      setIsReady(false);
      const currentPlayerId = minigameWebSocketService.getPlayerId();
      if (currentLobby && currentPlayerId) {
        minigameWebSocketService.setPlayerReady(false);
      }
    };    const gameStatus = currentLobby.game_status || 'waiting';
    const currentEffectivePlayerId = playerId || minigameWebSocketService.getPlayerId();

    // Debug logging for results data
    console.log(`[MinigameLobby] renderLobbyContent: gameStatus='${gameStatus}'`);
    console.log('[MinigameLobby] results debug:', {
      resultsExists: !!currentLobby.results,
      resultsType: typeof currentLobby.results,
      resultsIsArray: Array.isArray(currentLobby.results),
      resultsLength: Array.isArray(currentLobby.results) ? currentLobby.results.length : 'N/A',
      results: currentLobby.results
    });

    console.log(`[MinigameLobby] renderLobbyContent: gameStatus='${gameStatus}', currentLobby.drawings exists: ${!!currentLobby.drawings}, currentEffectivePlayerId: ${currentEffectivePlayerId}`);
    if (currentLobby.drawings) {
        console.log('[MinigameLobby] renderLobbyContent: currentLobby.drawings:', currentLobby.drawings);
    }
    
    if (gameStatus === 'waiting_for_players' || gameStatus === 'waiting') {      
      return (        
      <LobbyInterface
          lobbyId={currentLobby.id || ''}
          players={currentLobby.players || {}}
          gameStatus={gameStatus}
          currentPlayerId={playerId || minigameWebSocketService.getPlayerId() || ''}
          hostId={currentLobby.host_id || ''}
          isReady={isReady}
          maxPlayers={currentLobby.settings?.max_players || 4}
          settings={currentLobby.settings}
          onReadyToggle={handleReadyToggle}
          onStartGame={handleStartGame}
          onLeaveLobby={handleLeaveLobby}
          onKickPlayer={handleKickPlayer}
          onBanPlayer={handleBanPlayer}
          onTransferHost={handleTransferHost}
          onUpdateSettings={handleUpdateSettings}
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
        </div>        {gameStatus === 'theme_voting' && (
          <ThemeVoting
            lobbyState={currentLobby}
            onVote={handleThemeVote}
            timeRemaining={currentLobby.phase_time_remaining}
          />
        )}        
        {gameStatus === 'drawing' && (
          <DrawingCanvas
            theme={currentLobby.theme || 'Unknown'}
            timeRemaining={currentLobby.phase_time_remaining}
            onSubmit={handleSubmitDrawing}
          />
        )}          {(() => {
            // Determine if we have drawings to show
            const hasDrawings = (currentLobby.drawings && Object.keys(currentLobby.drawings).length > 0);
            const hasDrawingsForVoting = (gameStatus === 'voting_for_drawings' && currentLobby.drawings_for_voting && currentLobby.drawings_for_voting.length > 0);
            
            console.log('[MinigameLobby] Voting logic:', {
              gameStatus,
              hasDrawings,
              hasDrawingsForVoting,
              drawingsKeys: currentLobby.drawings ? Object.keys(currentLobby.drawings) : 'null',
              drawingsForVotingLength: currentLobby.drawings_for_voting?.length || 0,
              drawingsForVoting: currentLobby.drawings_for_voting
            });
            
            if (!hasDrawings && !hasDrawingsForVoting) {
              console.log('[MinigameLobby] No drawings available for voting/showcase');
              return null;
            }

            // Convert drawings_for_voting to the format expected by VotingInterface
            let drawingsToUse = [];
            if (hasDrawings) {
              drawingsToUse = Object.values(currentLobby.drawings);
              console.log('[MinigameLobby] Using drawings from drawings field:', drawingsToUse);
            } else if (hasDrawingsForVoting) {
              drawingsToUse = currentLobby.drawings_for_voting!.map(drawing => ({
                id: drawing.drawing_id,
                drawing_id: drawing.drawing_id,
                player_id: drawing.player_id,
                player_name: currentLobby.players[drawing.player_id]?.display_name || 'Unknown',
                data: drawing.drawing_data,
                theme: drawing.drawing_theme,
                votes: 0, // No votes yet during voting phase
                current_voters: []
              }));
              console.log('[MinigameLobby] Using converted drawings from drawings_for_voting:', drawingsToUse);
            }

            return (gameStatus === 'voting_for_drawings' || gameStatus === 'voting' || gameStatus === 'showcasing_results') && (playerId || minigameWebSocketService.getPlayerId()) ? (
              <VotingInterface
                drawings={drawingsToUse}
                currentPlayerVote={currentLobby.drawing_votes?.[playerId || minigameWebSocketService.getPlayerId() || ''] || null}
                onVote={handleSubmitVote}
                timeRemaining={currentLobby.phase_time_remaining}
                canVote={!!(playerId || minigameWebSocketService.getPlayerId())}
                currentPlayerId={playerId || minigameWebSocketService.getPlayerId() || ''}
                currentShowcaseIndex={currentLobby.showcase_current_index}
                showcaseTimeRemaining={currentLobby.phase_time_remaining}
                isShowcaseMode={gameStatus === 'showcasing_results'}                // Auto-display voting props
                currentVotingDrawing={currentLobby.current_voting_drawing || null}
                votingDisplayTimeRemaining={currentLobby.voting_display_time_remaining || 0}
                currentVoters={currentLobby.current_voters || {}}
                currentVotingDrawingIndex={currentLobby.current_voting_drawing_index || 0}
                totalDrawings={drawingsToUse.length}
              />
            ) : null;
          })()}
          
          {(gameStatus === 'showcasing_results' || gameStatus === 'ended') && currentLobby.results && Array.isArray(currentLobby.results) && currentLobby.results.length > 0 && (
          <ResultsDisplay
            players={currentLobby.results.map((result, index) => ({
              id: result.player_id,
              name: result.player_name || 'Unknown',
              votes: result.votes,
              rank: index + 1,
            }))}
            drawings={Object.values(currentLobby.drawings || {})}
            currentPlayerId={playerId || ''}
            theme={currentLobby.theme || 'Unknown'}
            onContinue={handleLeaveLobby}
            onNewGame={handleLeaveLobby}
            onPlayAgain={gameStatus === 'ended' ? handlePlayAgain : undefined}
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

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {renderLobbyContent()}
        </div>
      </div>
    </div>
  );
};

export default MinigameLobby;
