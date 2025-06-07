import React, { useState, useEffect } from 'react';
import { FiX, FiSettings, FiUsers, FiClock, FiEye, FiLock } from 'react-icons/fi';
import ModalWrapper from '../common/ModalWrapper';

interface LobbySettings {
  max_players: number;
  min_players: number;
  theme_voting_time: number;
  drawing_time: number;
  voting_time: number;
  showcase_time_per_drawing: number;
  allow_spectators: boolean;
  private_lobby: boolean;
  has_password: boolean;
  custom_themes: string[];
  enable_chat: boolean;
  auto_start_when_ready: boolean;
  winner_takes_all: boolean;
}

interface LobbySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: LobbySettings;
  onSave: (settings: Partial<LobbySettings>) => void;
  isHost: boolean;
  isInGame: boolean;
}

const LobbySettingsModal: React.FC<LobbySettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSave,
  isHost,
  isInGame
}) => {
  const [settings, setSettings] = useState<LobbySettings>(currentSettings);
  const [password, setPassword] = useState('');
  const [customThemeInput, setCustomThemeInput] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    setSettings(currentSettings);
  }, [currentSettings]);

  const handleSave = () => {
    const validationErrors: string[] = [];

    if (settings.min_players > settings.max_players) {
      validationErrors.push('Minimum players cannot exceed maximum players');
    }
    if (settings.max_players < 2 || settings.max_players > 20) {
      validationErrors.push('Maximum players must be between 2 and 20');
    }
    if (settings.min_players < 2) {
      validationErrors.push('Minimum players must be at least 2');
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    const settingsToSave: any = { ...settings };
    
    if (settings.private_lobby && password) {
      settingsToSave.lobby_password = password;
    } else if (!settings.private_lobby) {
      settingsToSave.lobby_password = null;
    }

    onSave(settingsToSave);
    setErrors([]);
    onClose();
  };

  const addCustomTheme = () => {
    if (customThemeInput.trim() && !settings.custom_themes.includes(customThemeInput.trim())) {
      setSettings(prev => ({
        ...prev,
        custom_themes: [...prev.custom_themes, customThemeInput.trim()]
      }));
      setCustomThemeInput('');
    }
  };

  const removeCustomTheme = (theme: string) => {
    setSettings(prev => ({
      ...prev,
      custom_themes: prev.custom_themes.filter(t => t !== theme)
    }));
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
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <FiSettings className="text-blue-400" size={24} />
            <h2 className="text-xl font-bold text-white">Lobby Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2"
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!isHost && (
            <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4">
              <p className="text-yellow-200">Only the lobby host can modify settings.</p>
            </div>
          )}

          {isInGame && (
            <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4">
              <p className="text-red-200">Settings cannot be changed while a game is in progress.</p>
            </div>
          )}

          {errors.length > 0 && (
            <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4">
              <ul className="text-red-200 text-sm space-y-1">
                {errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <FiUsers className="text-blue-400" />
              Player Settings
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-300 text-sm mb-2">Max Players</label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={settings.max_players}
                  onChange={(e) => setSettings(prev => ({ ...prev, max_players: parseInt(e.target.value) || 2 }))}
                  disabled={!isHost || isInGame}
                  className="w-full bg-gray-600 text-white rounded px-3 py-2 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-2">Min Players</label>
                <input
                  type="number"
                  min="2"
                  max={settings.max_players}
                  value={settings.min_players}
                  onChange={(e) => setSettings(prev => ({ ...prev, min_players: parseInt(e.target.value) || 2 }))}
                  disabled={!isHost || isInGame}
                  className="w-full bg-gray-600 text-white rounded px-3 py-2 disabled:opacity-50"
                />
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.allow_spectators}
                  onChange={(e) => setSettings(prev => ({ ...prev, allow_spectators: e.target.checked }))}
                  disabled={!isHost || isInGame}
                  className="rounded"
                />
                <span className="text-gray-300">Allow spectators</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.auto_start_when_ready}
                  onChange={(e) => setSettings(prev => ({ ...prev, auto_start_when_ready: e.target.checked }))}
                  disabled={!isHost || isInGame}
                  className="rounded"
                />
                <span className="text-gray-300">Auto-start when all players ready</span>
              </label>
            </div>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <FiClock className="text-green-400" />
              Time Settings
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  Theme Voting ({formatTime(settings.theme_voting_time)})
                </label>
                <input
                  type="range"
                  min="10"
                  max="120"
                  step="5"
                  value={settings.theme_voting_time}
                  onChange={(e) => setSettings(prev => ({ ...prev, theme_voting_time: parseInt(e.target.value) }))}
                  disabled={!isHost || isInGame}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  Drawing Time ({formatTime(settings.drawing_time)})
                </label>                <input
                  type="range"
                  min="60"
                  max="259200"
                  step="60"
                  value={settings.drawing_time}
                  onChange={(e) => setSettings(prev => ({ ...prev, drawing_time: parseInt(e.target.value) }))}
                  disabled={!isHost || isInGame}
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
                  disabled={!isHost || isInGame}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  Showcase Time ({formatTime(settings.showcase_time_per_drawing)})
                </label>
                <input
                  type="range"
                  min="3"
                  max="30"
                  step="1"
                  value={settings.showcase_time_per_drawing}
                  onChange={(e) => setSettings(prev => ({ ...prev, showcase_time_per_drawing: parseInt(e.target.value) }))}
                  disabled={!isHost || isInGame}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <FiLock className="text-purple-400" />
              Privacy Settings
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.private_lobby}
                  onChange={(e) => setSettings(prev => ({ ...prev, private_lobby: e.target.checked }))}
                  disabled={!isHost || isInGame}
                  className="rounded"
                />
                <span className="text-gray-300">Private lobby</span>
              </label>
              {settings.private_lobby && (
                <div>
                  <label className="block text-gray-300 text-sm mb-2">Lobby Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={!isHost || isInGame}
                    placeholder="Enter lobby password..."
                    className="w-full bg-gray-600 text-white rounded px-3 py-2 disabled:opacity-50"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <FiEye className="text-orange-400" />
              Game Settings
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.enable_chat}
                  onChange={(e) => setSettings(prev => ({ ...prev, enable_chat: e.target.checked }))}
                  disabled={!isHost || isInGame}
                  className="rounded"
                />
                <span className="text-gray-300">Enable chat during game</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.winner_takes_all}
                  onChange={(e) => setSettings(prev => ({ ...prev, winner_takes_all: e.target.checked }))}
                  disabled={!isHost || isInGame}
                  className="rounded"
                />
                <span className="text-gray-300">Winner takes all (only 1st place gets rewards)</span>
              </label>
            </div>
          </div>

          {/* Custom Themes */}
          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-4">Custom Themes</h3>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={customThemeInput}
                onChange={(e) => setCustomThemeInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addCustomTheme()}
                disabled={!isHost || isInGame}
                placeholder="Add custom theme..."
                className="flex-1 bg-gray-600 text-white rounded px-3 py-2 disabled:opacity-50"
              />
              <button
                onClick={addCustomTheme}
                disabled={!isHost || isInGame || !customThemeInput.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.custom_themes.map((theme, index) => (
                <span
                  key={index}
                  className="bg-blue-900/50 text-blue-200 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                >
                  {theme}
                  {isHost && !isInGame && (
                    <button
                      onClick={() => removeCustomTheme(theme)}
                      className="text-blue-300 hover:text-white"
                    >
                      <FiX size={14} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Cancel
          </button>
          {isHost && !isInGame && (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save Settings
            </button>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
};

export default LobbySettingsModal;