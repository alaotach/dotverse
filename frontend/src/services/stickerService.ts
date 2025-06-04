import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { fs } from '../firebaseClient';
import { userPermissionsService } from './userPermissionsService';

export interface Sticker {
  id: string;
  packId: string;
  url: string;
  name: string;
}

export interface StickerPack {
  id: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  stickers: Sticker[];
  baseColor: string;
  isOwned?: boolean;
  isLocked?: boolean;
  price?: number;
}

class StickerService {
  private cachedPacks: Map<string, StickerPack> = new Map();
  private localPacks: StickerPack[] = [];
  private initialized = false;
  private async loadLocalStickerPacks() {
    if (this.initialized) return;
    
    try {
      const stickerPacksModule = await import('../data/stickerPacks.json');
      this.localPacks = stickerPacksModule.default || [];
      this.localPacks.forEach(pack => {
        this.cachedPacks.set(pack.id, pack);
      });
      
      this.initialized = true;
      console.log(`Loaded ${this.localPacks.length} local sticker packs`);
    } catch (error) {
      console.warn('Could not load local sticker packs:', error);
      console.log('Run "npm run generate-stickers" to generate sticker data');
      this.initialized = true;
    }
  }
  async getStickerPacks(userId?: string): Promise<StickerPack[]> {
    try {
      await this.loadLocalStickerPacks();
      let packs: StickerPack[] = [];
      
      if (this.localPacks.length > 0) {
        packs = [...this.localPacks];
      } else if (this.cachedPacks.size > 0) {
        packs = Array.from(this.cachedPacks.values());
      } else {
        const packsCollection = collection(fs, 'stickerPacks');
        const packsSnapshot = await getDocs(packsCollection);

        for (const packDoc of packsSnapshot.docs) {
          const packData = packDoc.data();
          const stickersCollection = collection(fs, 'stickerPacks', packDoc.id, 'stickers');
          const stickersSnapshot = await getDocs(stickersCollection);

          const stickers: Sticker[] = stickersSnapshot.docs.map(stickerDoc => ({
            id: stickerDoc.id,
            packId: packDoc.id,
            url: stickerDoc.data().url,
            name: stickerDoc.data().name
          }));

          packs.push({
            id: packDoc.id,
            name: packData.name,
            description: packData.description,
            thumbnailUrl: packData.thumbnailUrl,
            baseColor: packData.baseColor || '#3b82f6',
            stickers
          });
        }
        
        packs.forEach(pack => {
          this.cachedPacks.set(pack.id, pack);
        });
      }
      if (userId) {
        const { marketplaceService } = await import('./marketplaceService');
        const marketplaceItems = await marketplaceService.getMarketplaceItems('stickers');
        
        for (const pack of packs) {
          const hasAccess = await userPermissionsService.hasStickerPackAccess(userId, pack.id);
          const marketplaceItem = marketplaceItems.find(item => item.metadata.packId === pack.id);
          pack.price = marketplaceItem?.price || 0;

          if (pack.id === 'kawaii' && pack.price === 0) {
            pack.isOwned = true;
          } else {
            pack.isOwned = hasAccess;
          }
          
          pack.isLocked = !pack.isOwned;
          
          if (pack.isLocked && pack.stickers.length > 3) {
            pack.stickers = pack.stickers.slice(0, 3);
          }
        }
      }

      return packs;
    } catch (error) {
      console.error("Error fetching sticker packs:", error);
      return this.localPacks;
    }
  }

  async getOwnedStickerPacks(userId: string): Promise<StickerPack[]> {
    const allPacks = await this.getStickerPacks(userId);
    return allPacks.filter(pack => pack.isOwned === true);
  }

  async getStickerPack(packId: string): Promise<StickerPack | null> {
    try {
      await this.loadLocalStickerPacks();
      if (this.cachedPacks.has(packId)) {
        return this.cachedPacks.get(packId)!;
      }
      
      const packDoc = await getDoc(doc(fs, 'stickerPacks', packId));
      
      if (!packDoc.exists()) {
        return null;
      }
      
      const packData = packDoc.data();
      
      const stickersCollection = collection(fs, 'stickerPacks', packId, 'stickers');
      const stickersSnapshot = await getDocs(stickersCollection);
      
      const stickers: Sticker[] = stickersSnapshot.docs.map(stickerDoc => ({
        id: stickerDoc.id,
        packId: packId,
        url: stickerDoc.data().url,
        name: stickerDoc.data().name
      }));
      
      const pack: StickerPack = {
        id: packId,
        name: packData.name,
        description: packData.description,
        thumbnailUrl: packData.thumbnailUrl,
        baseColor: packData.baseColor || '#3b82f6',
        stickers
      };
      
      this.cachedPacks.set(packId, pack);
      return pack;
    } catch (error) {
      console.error('Error fetching sticker pack:', error);
      return null;
    }
  }

  getRandomSticker(packId: string): Sticker | null {
    const pack = this.cachedPacks.get(packId);
    if (!pack || !pack.stickers || pack.stickers.length === 0) {
      return null;
    }
    
    const randomIndex = Math.floor(Math.random() * pack.stickers.length);
    return pack.stickers[randomIndex];
  }
  
  preloadStickerImages(packId: string): void {
    const pack = this.cachedPacks.get(packId);
    if (!pack) return;
    
    pack.stickers.forEach(sticker => {
      const img = new Image();
      img.src = sticker.url;
    });
  }
  async getAllStickers(userId?: string): Promise<Sticker[]> {
    const packs = await this.getStickerPacks(userId);
    return packs.flatMap(pack => pack.stickers);
  }

  async getOwnedStickers(userId: string): Promise<Sticker[]> {
    const ownedPacks = await this.getOwnedStickerPacks(userId);
    return ownedPacks.flatMap(pack => pack.stickers);
  }

  async searchStickers(query: string): Promise<Sticker[]> {
    const allStickers = await this.getAllStickers();
    const lowerQuery = query.toLowerCase();
    
    return allStickers.filter(sticker => 
      sticker.name.toLowerCase().includes(lowerQuery) ||
      sticker.packId.toLowerCase().includes(lowerQuery)
    );
  }
}

export const stickerService = new StickerService();