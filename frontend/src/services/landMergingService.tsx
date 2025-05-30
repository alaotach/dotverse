import { doc, updateDoc, deleteDoc, runTransaction, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { fs } from '../firebaseClient';
import { economyService } from './economyService';
import { getUserLands, type UserLandInfo } from './landService';

export interface MergeCandidate {
  land: UserLandInfo;
  direction: 'north' | 'south' | 'east' | 'west';
  resultingSize: number;
  cost: number;
}

export interface MergeResult {
  success: boolean;
  message: string;
  newLandInfo?: {
    centerX: number;
    centerY: number;
    size: number;
  };
}

class LandMergingService {
  private readonly BASE_MERGE_COST = 1000;
  private readonly SIZE_MULTIPLIER = 1.2;

  calculateMergeCost(land1Size: number, land2Size: number): number {
    const totalArea = (land1Size * land1Size) + (land2Size * land2Size);
    const cost = Math.floor(this.BASE_MERGE_COST * Math.pow(totalArea / 2500, this.SIZE_MULTIPLIER));
    return Math.max(cost, this.BASE_MERGE_COST);
  }

  private canLandsMerge(land1: UserLandInfo, land2: UserLandInfo): boolean {
    if (land1.owner !== land2.owner) return false;
    
    if (land1.ownedSize !== land2.ownedSize) return false;
    
    if (land1.isAuctioned || land2.isAuctioned) return false;
    
    const size = land1.ownedSize;
    const halfSize = Math.floor(size / 2);
    
    const land1Bounds = {
      minX: land1.centerX - halfSize,
      maxX: land1.centerX + halfSize,
      minY: land1.centerY - halfSize,
      maxY: land1.centerY + halfSize
    };
    
    const land2Bounds = {
      minX: land2.centerX - halfSize,
      maxX: land2.centerX + halfSize,
      minY: land2.centerY - halfSize,
      maxY: land2.centerY + halfSize
    };
    
    const horizontallyAdjacent = (
      (land1Bounds.maxX === land2Bounds.minX || land1Bounds.minX === land2Bounds.maxX) &&
      !(land1Bounds.maxY < land2Bounds.minY || land1Bounds.minY > land2Bounds.maxY)
    );
    
    const verticallyAdjacent = (
      (land1Bounds.maxY === land2Bounds.minY || land1Bounds.minY === land2Bounds.maxY) &&
      !(land1Bounds.maxX < land2Bounds.minX || land1Bounds.minX > land2Bounds.maxX)
    );
    
    return horizontallyAdjacent || verticallyAdjacent;
  }

  private getMergeDirection(primaryLand: UserLandInfo, secondaryLand: UserLandInfo): 'north' | 'south' | 'east' | 'west' | null {
    const size = primaryLand.ownedSize;
    const halfSize = Math.floor(size / 2);
    
    if (secondaryLand.centerX > primaryLand.centerX) return 'east';
    if (secondaryLand.centerX < primaryLand.centerX) return 'west';
    if (secondaryLand.centerY > primaryLand.centerY) return 'north';
    if (secondaryLand.centerY < primaryLand.centerY) return 'south';
    
    return null;
  }

  private calculateMergedLandProperties(land1: UserLandInfo, land2: UserLandInfo): {
    centerX: number;
    centerY: number;
    newSize: number;
  } {
    const size = land1.ownedSize;
    
    const minX = Math.min(land1.centerX, land2.centerX) - Math.floor(size / 2);
    const maxX = Math.max(land1.centerX, land2.centerX) + Math.floor(size / 2);
    const minY = Math.min(land1.centerY, land2.centerY) - Math.floor(size / 2);
    const maxY = Math.max(land1.centerY, land2.centerY) + Math.floor(size / 2);
    
    const newCenterX = Math.floor((minX + maxX) / 2);
    const newCenterY = Math.floor((minY + maxY) / 2);
    
    const newWidth = maxX - minX;
    const newHeight = maxY - minY;
    const newSize = Math.max(newWidth, newHeight);
    
    return {
      centerX: newCenterX,
      centerY: newCenterY,
      newSize: Math.max(newSize, size + 10)
    };
  }

  async findMergeCandidates(userId: string, targetLandId: string): Promise<MergeCandidate[]> {
    try {
      const userLands = await getUserLands(userId);
      const targetLand = userLands.find(land => land.id === targetLandId);
      
      if (!targetLand) {
        return [];
      }
      
      const candidates: MergeCandidate[] = [];
      
      for (const otherLand of userLands) {
        if (otherLand.id === targetLandId) continue;
        
        if (this.canLandsMerge(targetLand, otherLand)) {
          const direction = this.getMergeDirection(targetLand, otherLand);
          if (direction) {
            const merged = this.calculateMergedLandProperties(targetLand, otherLand);
            const cost = this.calculateMergeCost(targetLand.ownedSize, otherLand.ownedSize);
            
            candidates.push({
              land: otherLand,
              direction,
              resultingSize: merged.newSize,
              cost
            });
          }
        }
      }
      
      return candidates;
    } catch (error) {
      console.error('Error finding merge candidates:', error);
      return [];
    }
  }

  async mergeLands(
    userId: string, 
    primaryLandId: string, 
    secondaryLandId: string
  ): Promise<MergeResult> {
    try {
      const userLands = await getUserLands(userId);
      const primaryLand = userLands.find(land => land.id === primaryLandId);
      const secondaryLand = userLands.find(land => land.id === secondaryLandId);
      
      if (!primaryLand || !secondaryLand) {
        return {
          success: false,
          message: 'One or both lands not found'
        };
      }
      
      if (!this.canLandsMerge(primaryLand, secondaryLand)) {
        return {
          success: false,
          message: 'These lands cannot be merged'
        };
      }
      
      const cost = this.calculateMergeCost(primaryLand.ownedSize, secondaryLand.ownedSize);
      const userEconomy = await economyService.getUserEconomy(userId);
      
      if (!userEconomy || (userEconomy.balance || 0) < cost) {
        return {
          success: false,
          message: `Insufficient funds. Merge cost: ${cost} 🪙`
        };
      }
      
      const mergedProperties = this.calculateMergedLandProperties(primaryLand, secondaryLand);
      
      const conflictCheck = await this.checkMergeConflicts(
        userId,
        mergedProperties.centerX,
        mergedProperties.centerY,
        mergedProperties.newSize,
        [primaryLandId, secondaryLandId]
      );
      
      if (!conflictCheck.success) {
        return conflictCheck;
      }
      
      const result = await runTransaction(fs, async (transaction) => {
        const economyRef = doc(fs, 'economy', userId);
        const economyDoc = await transaction.get(economyRef);
        
        if (!economyDoc.exists()) {
          throw new Error('User economy not found');
        }
        
        const currentBalance = economyDoc.data().balance || 0;
        if (currentBalance < cost) {
          throw new Error('Insufficient funds for merge');
        }
        
        const primaryLandRef = doc(fs, 'lands', primaryLandId);
        transaction.update(primaryLandRef, {
          centerX: mergedProperties.centerX,
          centerY: mergedProperties.centerY,
          ownedSize: mergedProperties.newSize,
          lastMerged: new Date(),
          mergedFrom: [primaryLandId, secondaryLandId]
        });
        
        const secondaryLandRef = doc(fs, 'lands', secondaryLandId);
        transaction.delete(secondaryLandRef);
        
        const userRef = doc(fs, 'users', userId);
        transaction.update(userRef, {
          'landInfo.centerX': mergedProperties.centerX,
          'landInfo.centerY': mergedProperties.centerY,
          'landInfo.ownedSize': mergedProperties.newSize
        });
        
        transaction.update(economyRef, {
          balance: currentBalance - cost
        });
        
        return mergedProperties;
      });
      
      await economyService.recordTransaction(
        userId,
        'purchase',
        -cost,
        `Merged lands at (${primaryLand.centerX}, ${primaryLand.centerY}) and (${secondaryLand.centerX}, ${secondaryLand.centerY})`
      );
      
      return {
        success: true,
        message: `Successfully merged lands! New size: ${result.newSize}×${result.newSize}`,
        newLandInfo: result
      };
      
    } catch (error) {
      console.error('Error merging lands:', error);
      return {
        success: false,
        message: `Failed to merge lands: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
  private async checkMergeConflicts(
    userId: string,
    newCenterX: number,
    newCenterY: number,
    newSize: number,
    excludeLandIds: string[]
  ): Promise<MergeResult> {
    try {
      const allLands = await getUserLands(userId);
      const halfSize = Math.floor(newSize / 2);
      
      const newBounds = {
        minX: newCenterX - halfSize,
        maxX: newCenterX + halfSize,
        minY: newCenterY - halfSize,
        maxY: newCenterY + halfSize
      };
      
      for (const land of allLands) {
        if (excludeLandIds.includes(land.id)) continue;
        
        const landHalfSize = Math.floor(land.ownedSize / 2);
        const landBounds = {
          minX: land.centerX - landHalfSize,
          maxX: land.centerX + landHalfSize,
          minY: land.centerY - landHalfSize,
          maxY: land.centerY + landHalfSize
        };
        
        if (!(newBounds.maxX < landBounds.minX || 
              newBounds.minX > landBounds.maxX || 
              newBounds.maxY < landBounds.minY || 
              newBounds.minY > landBounds.maxY)) {
          return {
            success: false,
            message: `Merge would conflict with existing land at (${land.centerX}, ${land.centerY})`
          };
        }
      }
      
      return { success: true, message: 'No conflicts found' };
    } catch (error) {
      return {
        success: false,
        message: 'Error checking for conflicts'
      };
    }
  }
}

export const landMergingService = new LandMergingService();