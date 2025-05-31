import { getUserLands, updateLandAfterMerge } from './landService';
import { economyService } from './economyService';
import { runTransaction, doc } from 'firebase/firestore';
import { fs } from '../firebaseClient';
import type { UserLandInfo } from './landService';

export interface MergeCandidate {
  land: UserLandInfo;
  direction: 'north' | 'south' | 'east' | 'west' | 'irregular';
  resultingSize: number;
  resultingShape: 'rectangle' | 'irregular';
  cost: number;
  mergedBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  occupiedCells?: Set<string>;
}

export interface MergeResult {
  success: boolean;
  message: string;
  newLandInfo?: {
    centerX: number;
    centerY: number;
    size: number;
    shape: 'rectangle' | 'irregular';
    occupiedCells?: string[];
  };
}

interface LandBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

class LandMergingService {
  private readonly BASE_MERGE_COST = 100;
  private readonly SIZE_MULTIPLIER = 1.2;
  private readonly IRREGULAR_SHAPE_MULTIPLIER = 1.2; 

  calculateMergeCost(land1Size: number, land2Size: number, isIrregular: boolean = false): number {
    const totalArea = (land1Size * land1Size) + (land2Size * land2Size);
    let cost = Math.floor(this.BASE_MERGE_COST * Math.pow(totalArea / 2500, this.SIZE_MULTIPLIER));
    
    if (isIrregular) {
      cost = Math.floor(cost * this.IRREGULAR_SHAPE_MULTIPLIER);
    }
    
    return Math.max(cost, this.BASE_MERGE_COST);
  }
  private getLandCells(land: UserLandInfo): Set<string> {
    const cells = new Set<string>();
    const halfSize = Math.floor(land.ownedSize / 2);
    
    for (let x = land.centerX - halfSize; x <= land.centerX + halfSize; x++) {
      for (let y = land.centerY - halfSize; y <= land.centerY + halfSize; y++) {
        cells.add(`${x}:${y}`);
      }
    }
    
    return cells;
  }
  private getLandBounds(land: UserLandInfo): LandBounds {
    const halfSize = Math.floor(land.ownedSize / 2);
    return {
      minX: land.centerX - halfSize,
      maxX: land.centerX + halfSize,
      minY: land.centerY - halfSize,
      maxY: land.centerY + halfSize
    };
  }
  private areAdjacent(land1: UserLandInfo, land2: UserLandInfo): boolean {
    const bounds1 = this.getLandBounds(land1);
    const bounds2 = this.getLandBounds(land2);
    const horizontallyAdjacent = (
      (bounds1.maxX + 1 === bounds2.minX || bounds2.maxX + 1 === bounds1.minX) &&
      !(bounds1.maxY < bounds2.minY || bounds1.minY > bounds2.maxY)
    );
    const verticallyAdjacent = (
      (bounds1.maxY + 1 === bounds2.minY || bounds2.maxY + 1 === bounds1.minY) &&
      !(bounds1.maxX < bounds2.minX || bounds1.minX > bounds2.maxX)
    );

    return horizontallyAdjacent || verticallyAdjacent;
  }
  private canLandsMerge(land1: UserLandInfo, land2: UserLandInfo): boolean {
    if (land1.owner !== land2.owner) return false;
    if (land1.isAuctioned || land2.isAuctioned) return false;
    
    return this.areAdjacent(land1, land2);
  }
  private getMergeDirection(primaryLand: UserLandInfo, secondaryLand: UserLandInfo): 'north' | 'south' | 'east' | 'west' | 'irregular' | null {
    const bounds1 = this.getLandBounds(primaryLand);
    const bounds2 = this.getLandBounds(secondaryLand);

    if (primaryLand.ownedSize === secondaryLand.ownedSize) {
      if (bounds2.minX === bounds1.maxX + 1 && bounds1.minY === bounds2.minY && bounds1.maxY === bounds2.maxY) {
        return 'east';
      }
      if (bounds2.maxX + 1 === bounds1.minX && bounds1.minY === bounds2.minY && bounds1.maxY === bounds2.maxY) {
        return 'west';
      }
      if (bounds2.minY === bounds1.maxY + 1 && bounds1.minX === bounds2.minX && bounds1.maxX === bounds2.maxX) {
        return 'south';
      }
      if (bounds2.maxY + 1 === bounds1.minY && bounds1.minX === bounds2.minX && bounds1.maxX === bounds2.maxX) {
        return 'north';
      }
    }
    return 'irregular';
  }
  private calculateMergedLandProperties(land1: UserLandInfo, land2: UserLandInfo): {
    centerX: number;
    centerY: number;
    newSize: number;
    shape: 'rectangle' | 'irregular';
    mergedBounds: LandBounds;
    occupiedCells?: Set<string>;
  } {
    const bounds1 = this.getLandBounds(land1);
    const bounds2 = this.getLandBounds(land2);
    
    const mergedBounds = {
      minX: Math.min(bounds1.minX, bounds2.minX),
      maxX: Math.max(bounds1.maxX, bounds2.maxX),
      minY: Math.min(bounds1.minY, bounds2.minY),
      maxY: Math.max(bounds1.maxY, bounds2.maxY)
    };

    const newCenterX = Math.floor((mergedBounds.minX + mergedBounds.maxX) / 2);
    const newCenterY = Math.floor((mergedBounds.minY + mergedBounds.maxY) / 2);
    
    const newWidth = mergedBounds.maxX - mergedBounds.minX + 1;
    const newHeight = mergedBounds.maxY - mergedBounds.minY + 1;
    
    const totalArea = (land1.ownedSize * land1.ownedSize) + (land2.ownedSize * land2.ownedSize);
    const boundingRectArea = newWidth * newHeight;
    
    const isRectangular = (totalArea === boundingRectArea) && (newWidth === newHeight);
    
    let occupiedCells: Set<string> | undefined;
    let newSize: number;

    if (isRectangular) {
      newSize = newWidth;
    } else {
      occupiedCells = new Set([
        ...this.getLandCells(land1),
        ...this.getLandCells(land2)
      ]);
      newSize = Math.max(newWidth, newHeight);
    }

    return {
      centerX: newCenterX,
      centerY: newCenterY,
      newSize,
      shape: isRectangular ? 'rectangle' : 'irregular',
      mergedBounds,
      occupiedCells
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
            const isIrregular = merged.shape === 'irregular';
            const cost = this.calculateMergeCost(targetLand.ownedSize, otherLand.ownedSize, isIrregular);
            
            candidates.push({
              land: otherLand,
              direction,
              resultingSize: merged.newSize,
              resultingShape: merged.shape,
              cost,
              mergedBounds: merged.mergedBounds,
              occupiedCells: merged.occupiedCells
            });
          }
        }
      }
      
      return candidates.sort((a, b) => a.cost - b.cost);
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
      
      const mergedProperties = this.calculateMergedLandProperties(primaryLand, secondaryLand);
      const isIrregular = mergedProperties.shape === 'irregular';
      const cost = this.calculateMergeCost(primaryLand.ownedSize, secondaryLand.ownedSize, isIrregular);
      
      const userEconomy = await economyService.getUserEconomy(userId);
      if (!userEconomy || (userEconomy.balance || 0) < cost) {
        return {
          success: false,
          message: `Insufficient funds. Merge cost: ${cost} 🪙`
        };
      }
      const conflictCheck = await this.checkMergeConflicts(
        userId,
        mergedProperties.centerX,
        mergedProperties.centerY,
        mergedProperties.newSize,
        [primaryLandId, secondaryLandId],
        mergedProperties.occupiedCells
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
        const updateData: any = {
          centerX: mergedProperties.centerX,
          centerY: mergedProperties.centerY,
          ownedSize: mergedProperties.newSize,
          lastMerged: new Date(),
          mergedFrom: [primaryLandId, secondaryLandId],
          shape: mergedProperties.shape
        };
        
        if (mergedProperties.occupiedCells) {
          updateData.occupiedCells = Array.from(mergedProperties.occupiedCells);
        }
        
        transaction.update(primaryLandRef, updateData);
        
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
        
        return {
          ...mergedProperties,
          occupiedCells: mergedProperties.occupiedCells ? Array.from(mergedProperties.occupiedCells) : undefined
        };
      });
      await economyService.recordTransaction(
        userId,
        'purchase',
        -cost,
        `Merged lands at (${primaryLand.centerX}, ${primaryLand.centerY}) and (${secondaryLand.centerX}, ${secondaryLand.centerY}) - ${isIrregular ? 'Irregular' : 'Regular'} merge`
      );
      
      return {
        success: true,
        message: `Successfully merged lands! New ${isIrregular ? 'irregular' : 'rectangular'} land: ${result.newSize}×${result.newSize}`,
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
    excludeLandIds: string[],
    occupiedCells?: Set<string>
  ): Promise<MergeResult> {
    try {
      const allLands = await getUserLands(userId);
      if (occupiedCells) {
        for (const land of allLands) {
          if (excludeLandIds.includes(land.id)) continue;
          
          const landCells = this.getLandCells(land);
          for (const cell of occupiedCells) {
            if (landCells.has(cell)) {
              return {
                success: false,
                message: `Merge would conflict with existing land at (${land.centerX}, ${land.centerY})`
              };
            }
          }
        }
      } else {
        const halfSize = Math.floor(newSize / 2);
        const newBounds = {
          minX: newCenterX - halfSize,
          maxX: newCenterX + halfSize,
          minY: newCenterY - halfSize,
          maxY: newCenterY + halfSize
        };
        
        for (const land of allLands) {
          if (excludeLandIds.includes(land.id)) continue;
          
          const landBounds = this.getLandBounds(land);
          
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