import { doc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { fs } from '../firebaseClient';
import { economyService } from './economyService';
import { getAllLandsWithAuctionStatus } from './landService';

export interface LandExpansionRequest {
  userId: string;
  currentCenterX: number;
  currentCenterY: number;
  currentSize: number;
  newSize: number;
  cost: number;
}

export interface LandExpansionResult {
  success: boolean;
  message: string;
  newSize?: number;
  cost?: number;
}

class LandExpansionService {
  private readonly BASE_COST = 500;
  private readonly SIZE_INCREASE = 10;
  private readonly INFLATION_RATE = 1.5;
  private readonly MAX_LAND_SIZE = 200;

  calculateExpansionCost(currentSize: number): number {
    const expansionLevel = Math.floor((currentSize - 50) / this.SIZE_INCREASE); 
    const cost = this.BASE_COST * Math.pow(this.INFLATION_RATE, expansionLevel);
    return Math.round(cost);
  }

  async canExpandLand(
    centerX: number, 
    centerY: number, 
    currentSize: number, 
    newSize: number
  ): Promise<{ canExpand: boolean; conflicts: string[] }> {
    try {
      const allLands = await getAllLandsWithAuctionStatus();
      const conflicts: string[] = [];
      
      const newHalfSize = Math.floor(newSize / 2);
      // const currentHalfSize = Math.floor(currentSize / 2);
      
      for (const land of allLands) {
        if (land.centerX === centerX && land.centerY === centerY) {
          continue;
        }
        
        const landHalfSize = Math.floor(land.ownedSize / 2);
        
        const newMinX = centerX - newHalfSize;
        const newMaxX = centerX + newHalfSize;
        const newMinY = centerY - newHalfSize;
        const newMaxY = centerY + newHalfSize;
        
        const landMinX = land.centerX - landHalfSize;
        const landMaxX = land.centerX + landHalfSize;
        const landMinY = land.centerY - landHalfSize;
        const landMaxY = land.centerY + landHalfSize;
        
        if (newMinX <= landMaxX && newMaxX >= landMinX && 
            newMinY <= landMaxY && newMaxY >= landMinY) {
          conflicts.push(`Land at (${land.centerX}, ${land.centerY}) owned by ${land.owner}`);
        }
      }
      
      return {
        canExpand: conflicts.length === 0,
        conflicts
      };
    } catch (error) {
      console.error('Error checking land expansion conflicts:', error);
      return { canExpand: false, conflicts: ['Error checking conflicts'] };
    }
  }

  async requestLandExpansion(
    userId: string,
    currentCenterX: number,
    currentCenterY: number,
    currentSize: number
  ): Promise<LandExpansionResult> {
    try {
      const newSize = currentSize + this.SIZE_INCREASE;
      const cost = this.calculateExpansionCost(currentSize);

      if (newSize > this.MAX_LAND_SIZE) {
        return {
          success: false,
          message: `Cannot expand beyond maximum size of ${this.MAX_LAND_SIZE}x${this.MAX_LAND_SIZE}`
        };
    }

      const userEconomy = await economyService.getUserEconomy(userId);
      if (!userEconomy || (userEconomy.balance || 0) < cost) {
        return {
          success: false,
          message: `Insufficient funds. Need ${cost} 🪙, but you have ${userEconomy?.balance || 0} 🪙`
        };
      }

      const conflictCheck = await this.canExpandLand(
        currentCenterX,
        currentCenterY,
        currentSize,
        newSize
      );

      if (!conflictCheck.canExpand) {
        return {
          success: false,
          message: `Cannot expand: conflicts with existing lands. ${conflictCheck.conflicts.join(', ')}`
        };
      }



      const result = await runTransaction(fs, async (transaction) => {
        const userRef = doc(fs, 'users', userId);
        const landRef = doc(fs, 'lands', `${currentCenterX},${currentCenterY}`);
        transaction.update(userRef, {
          'landInfo.ownedSize': newSize,
          lastUpdated: serverTimestamp()
        });
        transaction.update(landRef, {
          ownedSize: newSize,
          lastExpanded: serverTimestamp()
        });

        return { success: true };
      });

      if (result.success) {
        await economyService.removeCoins(
          userId,
          cost,
          `Land expansion from ${currentSize}x${currentSize} to ${newSize}x${newSize}`
        );

        return {
          success: true,
          message: `Successfully expanded land to ${newSize}x${newSize} for ${cost} 🪙`,
          newSize,
          cost
        };
      } else {
        return {
          success: false,
          message: 'Failed to update land records'
        };
      }

    } catch (error) {
      console.error('Error processing land expansion:', error);
      return {
        success: false,
        message: `Error processing expansion: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
  getExpansionPreview(currentSize: number) {
    const newSize = currentSize + this.SIZE_INCREASE;
    const cost = this.calculateExpansionCost(currentSize);
    const canAfford = (userBalance: number) => userBalance >= cost;
    
    return {
      currentSize,
      newSize,
      sizeIncrease: this.SIZE_INCREASE,
      cost,
      canAfford,
      maxSize: this.MAX_LAND_SIZE,
      isAtMaxSize: newSize > this.MAX_LAND_SIZE
    };
  }
}

export const landExpansionService = new LandExpansionService();