import React, { useState, useEffect } from 'react';
import { FiShoppingCart, FiX, FiStar, FiCheck, FiClock, FiPackage } from 'react-icons/fi';
import { useAuth } from '../../src/context/AuthContext';
import { useEconomy } from '../../src/context/EconomyContext';
import { marketplaceService } from '../../src/services/marketplaceService';
import type { MarketplaceItem, UserInventory } from '../../src/services/marketplaceService';
import ModalWrapper from '../common/ModalWrapper';

interface MarketplaceProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_ICONS = {
  animation: '🎬',
  stickers: '✨', 
  fps: '⚡',
  themes: '🎨',
  tools: '🛠️',
  premium: '👑'
};

const RARITY_COLORS = {
  common: 'border-gray-400 bg-gray-900',
  rare: 'border-blue-400 bg-blue-900',
  epic: 'border-purple-400 bg-purple-900',
  legendary: 'border-yellow-400 bg-yellow-900'
};

const RARITY_STARS = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4
};

const Marketplace: React.FC<MarketplaceProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const { userEconomy, refreshEconomy } = useEconomy();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [inventory, setInventory] = useState<UserInventory | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      loadMarketplaceData();
    }
  }, [isOpen, currentUser]);

  const loadMarketplaceData = async () => {
    if (!currentUser) return;
    
    setIsLoading(true);
    try {
      await marketplaceService.initializeMarketplace();
      
      const [marketplaceItems, userInventory] = await Promise.all([
        marketplaceService.getMarketplaceItems(selectedCategory === 'all' ? undefined : selectedCategory),
        marketplaceService.getUserInventory(currentUser.uid)
      ]);
      
      setItems(marketplaceItems);
      setInventory(userInventory);
    } catch (error) {
      console.error('Error loading marketplace data:', error);
      setMessage({ type: 'error', text: 'Failed to load marketplace' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryChange = async (category: string) => {
    setSelectedCategory(category);
    setIsLoading(true);
    try {
      const marketplaceItems = await marketplaceService.getMarketplaceItems(
        category === 'all' ? undefined : category
      );
      setItems(marketplaceItems);
    } catch (error) {
      console.error('Error filtering items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async (item: MarketplaceItem) => {
    if (!currentUser || !userEconomy) return;
      if ((userEconomy.balance || 0) < item.price) {
      setMessage({ type: 'error', text: 'Insufficient balance!' });
      return;
    }

    setPurchaseLoading(item.id);
    try {
      const result = await marketplaceService.purchaseItem(currentUser.uid, item.id);
      
      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        await refreshEconomy();
        await loadMarketplaceData();
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (error) {
      console.error('Error purchasing item:', error);
      setMessage({ type: 'error', text: 'Purchase failed' });
    } finally {
      setPurchaseLoading(null);
    }
  };

  const isItemOwned = (itemId: string): boolean => {
    if (!inventory) return false;
    
    // Check if user owns the item
    if (inventory.purchasedItems.includes(itemId)) {
      // If it's a temporary item, check if it's still valid
      if (inventory.temporaryItems[itemId]) {
        return Date.now() < inventory.temporaryItems[itemId];
      }
      return true;
    }
    return false;
  };

  const getItemExpirationTime = (itemId: string): Date | null => {
    if (!inventory || !inventory.temporaryItems[itemId]) return null;
    return new Date(inventory.temporaryItems[itemId]);
  };

  const renderStars = (rarity: string) => {
    const count = RARITY_STARS[rarity as keyof typeof RARITY_STARS] || 1;
    return Array.from({ length: count }, (_, i) => (
      <FiStar key={i} className="text-yellow-400" size={12} />
    ));
  };

  const formatTimeRemaining = (expirationDate: Date): string => {
    const now = new Date();
    const diff = expirationDate.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const categories = [
    { id: 'all', name: 'All Items', icon: '🛍️' },
    { id: 'animation', name: 'Animation', icon: CATEGORY_ICONS.animation },
    { id: 'fps', name: 'FPS Boost', icon: CATEGORY_ICONS.fps },
    { id: 'stickers', name: 'Stickers', icon: CATEGORY_ICONS.stickers },
    { id: 'tools', name: 'Tools', icon: CATEGORY_ICONS.tools },
    { id: 'premium', name: 'Premium', icon: CATEGORY_ICONS.premium }
  ];

  if (!isOpen) return null;
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
      <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <FiShoppingCart className="text-blue-400" size={24} />
            <h2 className="text-2xl font-bold text-white">Marketplace</h2>
          </div>
          
          <div className="flex items-center space-x-4">
            {userEconomy && (
              <div className="bg-gradient-to-r from-yellow-600 to-orange-600 px-4 py-2 rounded-lg">
                <span className="font-semibold text-white">
                  {userEconomy.balance?.toLocaleString() || 0} 🪙
                </span>
              </div>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <FiX size={24} />
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex space-x-2 overflow-x-auto">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => handleCategoryChange(category.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <span>{category.icon}</span>
                <span className="text-sm font-medium">{category.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-6 mt-4 p-3 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-900 border border-green-600 text-green-200'
              : 'bg-red-900 border border-red-600 text-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Items Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-300">Loading marketplace...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((item) => {
                const isOwned = isItemOwned(item.id);
                const expirationDate = getItemExpirationTime(item.id);
                
                return (
                  <div
                    key={item.id}
                    className={`border-2 rounded-lg p-4 transition-all ${
                      RARITY_COLORS[item.rarity]
                    } ${isOwned ? 'opacity-75' : 'hover:scale-105'}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl">{item.icon}</span>
                        <div className="flex space-x-1">
                          {renderStars(item.rarity)}
                        </div>
                      </div>
                      {isOwned && (
                        <div className="flex items-center space-x-1 bg-green-600 px-2 py-1 rounded-full">
                          <FiCheck size={12} />
                          <span className="text-xs font-medium">Owned</span>
                        </div>
                      )}
                    </div>

                    <h3 className="text-lg font-semibold text-white mb-2">{item.name}</h3>
                    <p className="text-gray-300 text-sm mb-3 line-clamp-2">{item.description}</p>

                    {/* Features */}
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-1">
                        {item.features.slice(0, 2).map((feature, index) => (
                          <span
                            key={index}
                            className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded"
                          >
                            {feature}
                          </span>
                        ))}
                        {item.features.length > 2 && (
                          <span className="text-xs bg-gray-600 text-gray-400 px-2 py-1 rounded">
                            +{item.features.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expiration info for owned temporary items */}
                    {isOwned && expirationDate && (
                      <div className="mb-3 flex items-center space-x-1 text-orange-400 text-sm">
                        <FiClock size={12} />
                        <span>Expires in {formatTimeRemaining(expirationDate)}</span>
                      </div>
                    )}

                    {/* Price and Purchase */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-yellow-400 font-bold text-lg">
                          {item.price.toLocaleString()}
                        </span>
                        <span className="text-yellow-400">🪙</span>
                      </div>
                      
                      {isOwned ? (
                        <div className="flex items-center space-x-1 text-green-400">
                          <FiPackage size={16} />
                          <span className="text-sm font-medium">In Inventory</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePurchase(item)}                          disabled={
                            !userEconomy || 
                            (userEconomy.balance || 0) < item.price || 
                            purchaseLoading === item.id
                          }
                          className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${
                            !userEconomy || (userEconomy.balance || 0) < item.price
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {purchaseLoading === item.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                          ) : (
                            <>
                              <FiShoppingCart size={16} />
                              <span>Buy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {!isLoading && items.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FiPackage className="mx-auto text-gray-500 mb-4" size={48} />
                <p className="text-gray-400 text-lg">No items found in this category</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900 rounded-b-lg">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <div className="flex items-center space-x-4">
              <span>Total Items: {items.length}</span>
              {inventory && (
                <span>Owned: {inventory.purchasedItems.length}</span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <span>Need more coins?</span>
              <button
                onClick={onClose}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Complete daily tasks
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
};

export default Marketplace;
