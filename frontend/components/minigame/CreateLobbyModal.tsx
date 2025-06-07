import React, { useState } from 'react';
import { FiX, FiSettings, FiPlay } from 'react-icons/fi';
import ModalWrapper from '../common/ModalWrapper';

interface CreateLobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateLobby: (playerName: string, settings?: any) => void;
  playerName: string;
  onPlayerNameChange: (name: string) => void;
}

const CreateLobbyModal: React.FC<CreateLobbyModalProps> = ({
  isOpen,
  onClose,
  onCreateLobby,
  playerName,
  onPlayerNameChange
}) => {  const [settings, setSettings] = useState({
    max_players: 4,
    min_players: 2,
    theme_voting_time: 30,
    drawing_time: 300, // Default to 5 minutes (300 seconds)
    voting_time: 60,
    showcase_time_per_drawing: 10,
    allow_spectators: true,
    private_lobby: false,
    enable_chat: true,
    auto_start_when_ready: false,
    winner_takes_all: false
  });
  
  const [password, setPassword] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = () => {
    if (isSubmitting) return;
    
    if (!playerName.trim()) {
      alert('Please enter a player name');
      return;
    }    setIsSubmitting(true);
    const finalSettings: any = { ...settings };
    if (settings.private_lobby && password) {
      finalSettings.lobby_password = password;
    }
    onCreateLobby(playerName.trim(), finalSettings);
    setTimeout(() => {
      setIsSubmitting(false);
      onClose();
    }, 100);
  };
  const formatTime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  if (!isOpen) return null;

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
      <div className="bg-gray-800 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FiPlay className="text-green-400" />
            Create Lobby
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-white transition-colors p-2"
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              placeholder="Enter your name..."
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
              maxLength={20}
            />
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-4">Basic Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-300 text-sm mb-2">Max Players</label>
                <select
                  value={settings.max_players}
                  onChange={(e) => setSettings(prev => ({ ...prev, max_players: parseInt(e.target.value) }))}
                  className="w-full bg-gray-600 text-white rounded px-3 py-2"
                >
                  {[2, 3, 4, 5, 6, 8, 10].map(num => (
                    <option key={num} value={num}>{num} players</option>
                  ))}
                </select>
              </div>              <div>
                <label className="block text-gray-300 text-sm mb-2">Drawing Time</label>
                <select
                  value={settings.drawing_time}
                  onChange={(e) => setSettings(prev => ({ ...prev, drawing_time: parseInt(e.target.value) }))}
                  className="w-full bg-gray-600 text-white rounded px-3 py-2"
                >
                  <option value={60}>1 minute</option>
                  <option value={90}>1.5 minutes</option>
                  <option value={120}>2 minutes</option>
                  <option value={180}>3 minutes</option>
                  <option value={240}>4 minutes</option>
                  <option value={300}>5 minutes (Default)</option>
                  <option value={360}>6 minutes</option>
                  <option value={600}>10 minutes</option>
                  <option value={900}>15 minutes</option>
                  <option value={1800}>30 minutes</option>
                  <option value={3600}>1 hour</option>
                  <option value={7200}>2 hours</option>
                  <option value={21600}>6 hours</option>
                  <option value={43200}>12 hours</option>
                  <option value={86400}>24 hours</option>
                  <option value={259200}>72 hours (Max)</option>
                </select>
              </div>
            </div>
            
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.private_lobby}
                  onChange={(e) => setSettings(prev => ({ ...prev, private_lobby: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-gray-300">Private lobby</span>
              </label>
              
              {settings.private_lobby && (
                <div>
                  <label className="block text-gray-300 text-sm mb-2">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full bg-gray-600 text-white rounded px-3 py-2"
                  />
                </div>
              )}
              
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.auto_start_when_ready}
                  onChange={(e) => setSettings(prev => ({ ...prev, auto_start_when_ready: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-gray-300">Auto-start when all ready</span>
              </label>
            </div>
          </div>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-center gap-2 text-blue-400 hover:text-blue-300 py-2"
          >
            <FiSettings size={16} />
            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
          </button>

          {showAdvanced && (
            <div className="bg-gray-700 rounded-lg p-4 space-y-4">
              <h3 className="text-white font-semibold">Advanced Settings</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 text-sm mb-2">
                    Theme Voting ({formatTime(settings.theme_voting_time)})
                  </label>
                  <input
                    type="range"
                    min="15"
                    max="60"
                    step="5"
                    value={settings.theme_voting_time}
                    onChange={(e) => setSettings(prev => ({ ...prev, theme_voting_time: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 text-sm mb-2">
                    Voting Time ({formatTime(settings.voting_time)})
                  </label>
                  <input
                    type="range"
                    min="30"
                    max="120"
                    step="5"
                    value={settings.voting_time}
                    onChange={(e) => setSettings(prev => ({ ...prev, voting_time: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.allow_spectators}
                    onChange={(e) => setSettings(prev => ({ ...prev, allow_spectators: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-gray-300">Allow spectators</span>
                </label>
                
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.enable_chat}
                    onChange={(e) => setSettings(prev => ({ ...prev, enable_chat: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-gray-300">Enable chat during game</span>
                </label>
                
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.winner_takes_all}
                    onChange={(e) => setSettings(prev => ({ ...prev, winner_takes_all: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-gray-300">Winner takes all rewards</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!playerName.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Lobby
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
};

export default CreateLobbyModal;