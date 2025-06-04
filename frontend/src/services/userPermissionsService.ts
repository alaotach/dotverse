import { marketplaceService } from './marketplaceService';
import type { UserInventory } from './marketplaceService';

interface AnimationPermissions {
  canAnimate: boolean;
  maxFps: number;
  maxFrames: number;
}

interface StickerPermissions {
  ownedPacks: string[];
  canAccessPack: (packId: string) => boolean;
}

interface UserPermissions {
  animation: AnimationPermissions;
  stickers: StickerPermissions;
  tools: string[];
  premium: {
    isActive: boolean;
    expiresAt?: Date;
  };
}

class UserPermissionsService {
  private static instance: UserPermissionsService;
  private permissionsCache: Map<string, { permissions: UserPermissions; expires: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000;

  public static getInstance(): UserPermissionsService {
    if (!UserPermissionsService.instance) {
      UserPermissionsService.instance = new UserPermissionsService();
    }
    return UserPermissionsService.instance;
  }

  async getUserPermissions(userId: string): Promise<UserPermissions> {
    const cached = this.permissionsCache.get(userId);
    if (cached && Date.now() < cached.expires) {
      return cached.permissions;
    }

    const inventory = await marketplaceService.getUserInventory(userId);
    const permissions = await this.calculatePermissions(inventory);

    this.permissionsCache.set(userId, {
      permissions,
      expires: Date.now() + this.CACHE_DURATION
    });

    return permissions;
  }

  private async calculatePermissions(inventory: UserInventory): Promise<UserPermissions> {
    const items = await marketplaceService.getMarketplaceItems();
    const ownedItems = items.filter(item => inventory.purchasedItems.includes(item.id));

    const animationItems = ownedItems.filter(item => item.category === 'animation');
    const fpsItems = ownedItems.filter(item => item.category === 'fps');
    
    let maxFps = 10;
    let maxFrames = 5;
    let canAnimate = false;

    if (animationItems.length > 0) {
      canAnimate = true;
      const bestAnimation = animationItems.reduce((best, current) => {
        const currentMaxFps = current.metadata.maxFps || 5;
        const bestMaxFps = best.metadata.maxFps || 5;
        return currentMaxFps > bestMaxFps ? current : best;
      });
      
      maxFps = bestAnimation.metadata.maxFps || 5;
      maxFrames = bestAnimation.metadata.frameLimit || 3;
    }

    fpsItems.forEach(item => {
      if (item.metadata.maxFps && item.metadata.maxFps > maxFps) {
        maxFps = item.metadata.maxFps;
      }
    });
    const stickerItems = ownedItems.filter(item => item.category === 'stickers');
    const ownedPacks = stickerItems.map(item => item.metadata.packId).filter(Boolean) as string[];
    
    if (!ownedPacks.includes('kawaii')) {
      ownedPacks.push('kawaii');
    }

    const toolItems = ownedItems.filter(item => item.category === 'tools');
    const tools = toolItems.map(item => item.metadata.toolType).filter(Boolean) as string[];

    const premiumItems = ownedItems.filter(item => item.category === 'premium');
    const activePremium = premiumItems.find(item => {
      if (!inventory.temporaryItems[item.id]) return false;
      return inventory.temporaryItems[item.id] > Date.now();
    });

    return {
      animation: {
        canAnimate,
        maxFps,
        maxFrames
      },
      stickers: {
        ownedPacks,
        canAccessPack: (packId: string) => ownedPacks.includes(packId)
      },
      tools,
      premium: {
        isActive: !!activePremium,
        expiresAt: activePremium ? new Date(inventory.temporaryItems[activePremium.id]) : undefined
      }
    };
  }

  clearUserCache(userId: string): void {
    this.permissionsCache.delete(userId);
  }

  async canUserAnimate(userId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.animation.canAnimate;
  }

  async getUserMaxFps(userId: string): Promise<number> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.animation.maxFps;
  }

  async getUserMaxFrames(userId: string): Promise<number> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.animation.maxFrames;
  }

  async canUserAccessStickerPack(userId: string, packId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.stickers.canAccessPack(packId);
  }

  async getUserOwnedStickerPacks(userId: string): Promise<string[]> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.stickers.ownedPacks;
  }

  async hasStickerPackAccess(userId: string, packId: string): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(userId);
      return permissions.stickers.ownedPacks.includes(packId);
    } catch (error) {
      console.error('Error checking sticker pack access:', error);
      return packId === 'kawaii';
    }
  }
}

export const userPermissionsService = UserPermissionsService.getInstance();
export type { UserPermissions, AnimationPermissions, StickerPermissions };
