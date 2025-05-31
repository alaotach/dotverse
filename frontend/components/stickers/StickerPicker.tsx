import React, { useState, useEffect } from 'react';
import { FiSmile, FiX, FiSearch } from 'react-icons/fi';
import { stickerService, StickerPack, Sticker } from '../../src/services/stickerService';

interface StickerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onStickerSelect: (sticker: Sticker) => void;
}

const StickerPicker: React.FC<StickerPickerProps> = ({
  isOpen,
  onClose,
  onStickerSelect
}) => {
  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadStickerPacks();
    }
  }, [isOpen]);

  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const loadStickerPacks = async () => {
    setLoading(true);
    try {
      const packs = await stickerService.getStickerPacks();
      setStickerPacks(packs);
      if (packs.length > 0 && !selectedPackId) {
        setSelectedPackId(packs[0].id);
      }
    } catch (error) {
      console.error('Error loading sticker packs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    try {
      const results = await stickerService.searchStickers(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching stickers:', error);
    }
  };

  const handleStickerClick = (sticker: Sticker) => {
    onStickerSelect(sticker);
    onClose();
  };

  const selectedPack = stickerPacks.find(pack => pack.id === selectedPackId);
  const displayStickers = searchQuery.trim() ? searchResults : (selectedPack?.stickers || []);

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-12 right-0 bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-80 h-96 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 flex justify-between items-center">
        <h3 className="text-white font-medium">Stickers</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white"
        >
          <FiX size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-700">
        <div className="relative">
          <FiSearch className="absolute left-3 top-2.5 text-gray-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stickers..."
            className="w-full pl-10 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Pack Tabs */}
      {!searchQuery.trim() && (
        <div className="flex overflow-x-auto bg-gray-700 p-2 space-x-1">
          {stickerPacks.map((pack) => (
            <button
              key={pack.id}
              onClick={() => setSelectedPackId(pack.id)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPackId === pack.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
              }`}
            >
              {pack.name}
            </button>
          ))}
        </div>
      )}

      {/* Stickers Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">Loading stickers...</div>
          </div>
        ) : displayStickers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">
              {searchQuery.trim() ? 'No stickers found' : 'No stickers available'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {displayStickers.map((sticker) => (
              <button
                key={sticker.id}
                onClick={() => handleStickerClick(sticker)}
                className="aspect-square bg-gray-700 rounded-lg p-2 hover:bg-gray-600 transition-colors flex items-center justify-center"
                title={sticker.name}
              >
                <img
                  src={sticker.url}
                  alt={sticker.name}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StickerPicker;