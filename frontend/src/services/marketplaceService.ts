import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, orderBy, serverTimestamp, runTransaction, increment } from 'firebase/firestore';
import { fs } from '../firebaseClient';
import generatedStickerItems from '../data/generatedStickerMarketplaceItems.json';

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  category: 'animation' | 'stickers' | 'fps' | 'themes' | 'tools' | 'premium';
  price: number;
  icon: string;
  thumbnailUrl?: string;
  isActive: boolean;
  features: string[];
  metadata: {
    maxFps?: number;
    frameLimit?: number;
    packId?: string;
    stickerCount?: number;
    themeId?: string;
    toolType?: string;
    duration?: number;
  };
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  requiresLevel?: number;
  createdAt: any;
  updatedAt: any;
}

export interface UserPurchase {
  id: string;
  userId: string;
  itemId: string;
  purchasePrice: number;
  purchasedAt: any;
  isActive: boolean;
  expiresAt?: any;
}

export interface UserInventory {
  userId: string;
  purchasedItems: string[];
  activeSubscriptions: string[];
  temporaryItems: { [itemId: string]: number }
  totalSpent: number;
  lastUpdated: any;
}

const STATIC_MARKETPLACE_ITEMS: Omit<MarketplaceItem, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'animation_basic',
    name: 'Basic Animation',
    description: 'Unlock land animation with up to 10 FPS and 5 frames',
    category: 'animation',
    price: 500,
    icon: '🎬',
    isActive: true,
    features: ['Up to 10 FPS', '5 frames max', 'Loop animation'],
    metadata: { maxFps: 10, frameLimit: 5 },
    rarity: 'common',
  },
  {
    id: 'animation_pro',
    name: 'Pro Animation',
    description: 'Advanced animation with up to 30 FPS and 15 frames',
    category: 'animation',
    price: 1500,
    icon: '🎭',
    isActive: true,
    features: ['Up to 30 FPS', '15 frames max', 'Advanced controls', 'Speed control'],
    metadata: { maxFps: 30, frameLimit: 15 },
    rarity: 'rare',
  },
  {
    id: 'animation_master',
    name: 'Master Animation',
    description: 'Ultimate animation package with unlimited FPS and frames',
    category: 'animation',
    price: 5000,
    icon: '🎪',
    isActive: true,
    features: ['Unlimited FPS', 'Unlimited frames', 'All effects', 'Priority rendering'],
    metadata: { maxFps: 60, frameLimit: 100 },
    rarity: 'legendary',
  },
  {
    id: 'fps_boost_20',
    name: '20 FPS Boost',
    description: 'Increase your animation FPS limit to 20',
    category: 'fps',
    price: 200,
    icon: '⚡',
    isActive: true,
    features: ['20 FPS limit', 'Smooth animations'],
    metadata: { maxFps: 20 },
    rarity: 'common',
  },
  {
    id: 'fps_boost_40',
    name: '40 FPS Boost',
    description: 'Increase your animation FPS limit to 40',
    category: 'fps',
    price: 800,
    icon: '💨',
    isActive: true,
    features: ['40 FPS limit', 'Ultra smooth animations'],
    metadata: { maxFps: 40 },
    rarity: 'rare',
  },
  {
    id: 'premium_weekly',
    name: 'Weekly Premium',
    description: '7 days of premium features',
    category: 'premium',
    price: 100,
    icon: '👑',
    isActive: true,
    features: ['All tools unlocked', 'Priority support', 'Exclusive themes', 'Unlimited storage'],
    metadata: { duration: 7 },
    rarity: 'common',
  },
  {
    id: 'premium_monthly',
    name: 'Monthly Premium',
    description: '30 days of premium features',
    category: 'premium',
    price: 300,
    icon: '💎',
    isActive: true,
    features: ['All tools unlocked', 'Priority support', 'Exclusive themes', 'Unlimited storage', '20% marketplace discount'],
    metadata: { duration: 30 },
    rarity: 'rare',
  }
];

class MarketplaceService {
  private static instance: MarketplaceService;
  
  public static getInstance(): MarketplaceService {
    if (!MarketplaceService.instance) {
      MarketplaceService.instance = new MarketplaceService();
    }
    return MarketplaceService.instance;
  }

  async initializeMarketplace(): Promise<void> {
    try {
      const marketplaceRef = collection(fs, 'marketplace');
      const existingItemsSnapshot = await getDocs(marketplaceRef);

      const allMarketplaceSeedItems: Omit<MarketplaceItem, 'createdAt' | 'updatedAt'>[] = [
        ...STATIC_MARKETPLACE_ITEMS,
        ...(generatedStickerItems as Omit<MarketplaceItem, 'createdAt' | 'updatedAt'>[]).map(item => ({
          ...item,
          rarity: item.rarity || 'common',
        }))
      ];

      if (existingItemsSnapshot.empty) {
        console.log('Initializing marketplace with combined static and generated items...');
        for (const itemData of allMarketplaceSeedItems) {
          const itemWithTimestamps: MarketplaceItem = {
            ...itemData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(doc(fs, 'marketplace', itemData.id), itemWithTimestamps);
        }
        console.log(`Initialized marketplace with ${allMarketplaceSeedItems.length} items`);
      } else {
        console.log('Marketplace already initialized. Skipping seed.');
        const existingItemIds = new Set(existingItemsSnapshot.docs.map(d => d.id));
        let itemsAdded = 0;
        for (const itemData of allMarketplaceSeedItems) {
          if (!existingItemIds.has(itemData.id)) {
            const itemWithTimestamps: MarketplaceItem = {
              ...itemData,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(doc(fs, 'marketplace', itemData.id), itemWithTimestamps);
            itemsAdded++;
            console.log(`Added new marketplace item: ${itemData.name} (ID: ${itemData.id})`);
          }
        }
        if (itemsAdded > 0) {
          console.log(`Added ${itemsAdded} new items to the marketplace.`);
        }
      }
    } catch (error) {
      console.error('Error initializing marketplace:', error);
    }
  }

  async getMarketplaceItems(category?: string): Promise<MarketplaceItem[]> {
    try {
      const marketplaceRef = collection(fs, 'marketplace');
      let q = query(marketplaceRef, where('isActive', '==', true), orderBy('price', 'asc'));
      
      if (category) {
        q = query(marketplaceRef, where('category', '==', category), where('isActive', '==', true), orderBy('price', 'asc'));
      }
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketplaceItem));
    } catch (error) {
      console.error('Error fetching marketplace items:', error);
      return [];
    }
  }

  async getMarketplaceItem(itemId: string): Promise<MarketplaceItem | null> {
    try {
      const items = await this.getMarketplaceItems();
      return items.find(item => item.id === itemId) || null;
    } catch (error) {
      console.error('Error getting marketplace item:', error);
      return null;
    }
  }

  async getUserInventory(userId: string): Promise<UserInventory> {
    try {
      const inventoryRef = doc(fs, 'inventory', userId);
      const inventorySnap = await getDoc(inventoryRef);
      
      if (!inventorySnap.exists()) {
        const defaultInventory: UserInventory = {
          userId,
          purchasedItems: [],
          activeSubscriptions: [],
          temporaryItems: {},
          totalSpent: 0,
          lastUpdated: serverTimestamp()
        };
        await setDoc(inventoryRef, defaultInventory);
        return defaultInventory;
      }
      
      return inventorySnap.data() as UserInventory;
    } catch (error) {
      console.error('Error fetching user inventory:', error);
      throw error;
    }
  }

  async getUserPurchases(userId: string): Promise<UserPurchase[]> {
    try {
      const purchasesRef = collection(fs, 'purchases');
      const q = query(purchasesRef, where('userId', '==', userId), orderBy('purchasedAt', 'desc'));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserPurchase));
    } catch (error) {
      console.error('Error fetching user purchases:', error);
      return [];
    }
  }
  async purchaseItem(userId: string, itemId: string): Promise<{ success: boolean; message: string; purchase?: UserPurchase }> {
    try {
      const result = await runTransaction(fs, async (transaction) => {
        const economyRef = doc(fs, 'economy', userId);
        const economySnap = await transaction.get(economyRef);
        
        if (!economySnap.exists()) {
          throw new Error('User economy data not found');
        }
        
        const economyData = economySnap.data();
        const userBalance = economyData.balance || 0;
        
        const itemRef = doc(fs, 'marketplace', itemId);
        const itemSnap = await transaction.get(itemRef);
        
        if (!itemSnap.exists()) {
          throw new Error('Item not found');
        }
        
        const item = itemSnap.data() as MarketplaceItem;
        
        if (!item.isActive) {
          throw new Error('Item is not available for purchase');
        }
        
        if (userBalance < item.price) {
          throw new Error('Insufficient balance');
        }
        
        const inventoryRef = doc(fs, 'inventory', userId);
        const inventorySnap = await transaction.get(inventoryRef);
        
        if (inventorySnap.exists()) {
          const inventory = inventorySnap.data() as UserInventory;
          if (inventory.purchasedItems.includes(itemId) && item.category !== 'premium') {
            throw new Error('You already own this item');
          }
        }
        
        const purchaseId = `${userId}_${itemId}_${Date.now()}`;
        const purchaseData: UserPurchase = {
          id: purchaseId,
          userId,
          itemId,
          purchasePrice: item.price,
          purchasedAt: serverTimestamp(),
          isActive: true,
          expiresAt: item.metadata.duration ? 
            new Date(Date.now() + item.metadata.duration * 24 * 60 * 60 * 1000) : 
            null
        };
        
        const purchaseRef = doc(fs, 'purchases', purchaseId);
        transaction.set(purchaseRef, purchaseData);
        
        transaction.update(economyRef, {
          balance: increment(-item.price),
          'transactions': [...(economyData.transactions || []), {
            id: `purchase_${Date.now()}`,
            userId,
            type: 'purchase',
            amount: -item.price,
            timestamp: Date.now(),
            description: `Purchased ${item.name}`,
            metadata: { itemId }
          }]
        });
        
        const currentInventory = inventorySnap.exists() ? inventorySnap.data() as UserInventory : {
          userId,
          purchasedItems: [],
          activeSubscriptions: [],
          temporaryItems: {},
          totalSpent: 0,
          lastUpdated: serverTimestamp()
        };
        
        const updatedInventory: UserInventory = {
          ...currentInventory,
          purchasedItems: [...currentInventory.purchasedItems, itemId],
          totalSpent: (currentInventory.totalSpent || 0) + item.price,
          lastUpdated: serverTimestamp()
        };
        
        if (item.metadata.duration) {
          updatedInventory.temporaryItems[itemId] = Date.now() + (item.metadata.duration * 24 * 60 * 60 * 1000);
        }
          transaction.set(inventoryRef, updatedInventory);
        
        return {
          success: true,
          message: `Successfully purchased ${item.name}!`,
          purchase: purchaseData
        };
      });
      
      const { userPermissionsService } = await import('./userPermissionsService');
      userPermissionsService.clearUserCache(userId);
      
      return result;
    } catch (error) {
      console.error('Error purchasing item:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Purchase failed'
      };
    }
  }

  async hasItem(userId: string, itemId: string): Promise<boolean> {
    try {
      const inventory = await this.getUserInventory(userId);
      
      if (inventory.purchasedItems.includes(itemId)) {
        if (inventory.temporaryItems[itemId]) {
          return Date.now() < inventory.temporaryItems[itemId];
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking item ownership:', error);
      return false;
    }
  }

  async getMaxFpsForUser(userId: string): Promise<number> {
    try {
      const inventory = await this.getUserInventory(userId);
      const items = await this.getMarketplaceItems();
      
      let maxFps = 5; 
      
      for (const itemId of inventory.purchasedItems) {
        const item = items.find(i => i.id === itemId);
        if (item && item.metadata.maxFps) {
          if (inventory.temporaryItems[itemId]) {
            if (Date.now() > inventory.temporaryItems[itemId]) {
              continue;
            }
          }
          maxFps = Math.max(maxFps, item.metadata.maxFps);
        }
      }
      
      return maxFps;
    } catch (error) {
      console.error('Error getting max FPS for user:', error);
      return 5;
    }
  }

  async getMaxFramesForUser(userId: string): Promise<number> {
    try {
      const inventory = await this.getUserInventory(userId);
      const items = await this.getMarketplaceItems();
      
      let maxFrames = 3;
      
      for (const itemId of inventory.purchasedItems) {
        const item = items.find(i => i.id === itemId);
        if (item && item.metadata.frameLimit) {
          if (inventory.temporaryItems[itemId]) {
            if (Date.now() > inventory.temporaryItems[itemId]) {
              continue;
            }
          }
          maxFrames = Math.max(maxFrames, item.metadata.frameLimit);
        }
      }
      
      return maxFrames;
    } catch (error) {
      console.error('Error getting max frames for user:', error);
      return 3;
    }
  }

  async getUserAvailableStickers(userId: string): Promise<string[]> {
    try {
      const inventory = await this.getUserInventory(userId);
      const items = await this.getMarketplaceItems('stickers');
      
      const availablePacks: string[] = [];
      
      for (const itemId of inventory.purchasedItems) {
        const item = items.find(i => i.id === itemId);
        if (item && item.metadata.packId) {
          if (inventory.temporaryItems[itemId]) {
            if (Date.now() > inventory.temporaryItems[itemId]) {
              continue;
            }
          }
          availablePacks.push(item.metadata.packId);
        }
      }
      
      return availablePacks;
    } catch (error) {
      console.error('Error getting available stickers for user:', error);
      return [];
    }
  }

  async cleanupExpiredItems(): Promise<void> {
    try {
      const inventoryRef = collection(fs, 'inventory');
      const snapshot = await getDocs(inventoryRef);
      
      for (const doc of snapshot.docs) {
        const inventory = doc.data() as UserInventory;
        const now = Date.now();
        let hasChanges = false;
        
        const updatedTemporaryItems: { [itemId: string]: number } = {};
        const updatedPurchasedItems: string[] = [];
        
        for (const [itemId, expiration] of Object.entries(inventory.temporaryItems)) {
          if (now < expiration) {
            updatedTemporaryItems[itemId] = expiration;
            updatedPurchasedItems.push(itemId);
          } else {
            hasChanges = true;
          }
        }
        
        for (const itemId of inventory.purchasedItems) {
          if (!inventory.temporaryItems[itemId]) {
            updatedPurchasedItems.push(itemId);
          }
        }
        
        if (hasChanges) {
          await updateDoc(doc.ref, {
            purchasedItems: updatedPurchasedItems,
            temporaryItems: updatedTemporaryItems,
            lastUpdated: serverTimestamp()
          });
        }
      }
    } catch (error) {
      console.error('Error cleaning up expired items:', error);
    }
  }
  async grantFreeStarterItems(userId: string): Promise<void> {
    try {
      const items = await this.getMarketplaceItems();
      const kawaiiItem = items.find(item => item.id === 'sticker_pack_kawaii');
      
      if (kawaiiItem && kawaiiItem.price === 0) {
        const hasItem = await this.hasItem(userId, 'sticker_pack_kawaii');
        if (!hasItem) {
          await this.purchaseItem(userId, 'sticker_pack_kawaii');
          console.log('Granted free kawaii sticker pack to user:', userId);
        }
      }
    } catch (error) {
      console.error('Error granting free starter items:', error);
    }
  }
}

export const marketplaceService = MarketplaceService.getInstance();
