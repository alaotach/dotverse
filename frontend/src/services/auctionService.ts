import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc,
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp,
  Timestamp,
  runTransaction
} from 'firebase/firestore';
import { fs } from '../firebaseClient';
import { economyService } from './economyService';
import { markLandAsAuctioned, unmarkLandAsAuctioned } from './landService';

export interface AuctionBid {
  userId: string;
  userDisplayName: string;
  amount: number;
  timestamp: Timestamp;
}

export interface LandAuction {
  id: string;
  landId: string;
  ownerId: string;
  ownerDisplayName: string;
  landCenterX: number;
  landCenterY: number;
  landSize: number;
  startTime: Timestamp;
  endTime: Timestamp;
  startingPrice: number;
  currentBid: number;
  buyNowPrice?: number;
  highestBidderId: string | null;
  highestBidderName: string | null;
  bidHistory: AuctionBid[];
  status: 'pending' | 'active' | 'ended' | 'cancelled';
  createdAt: Timestamp;
  imageUrl?: string;
}

export interface CreateAuctionData {
  landCenterX: number;
  landCenterY: number;
  landSize: number;
  startingPrice: number;
  duration: number;
  buyNowPrice?: number;
  imageUrl?: string;
}

class AuctionService {
  private listeners: Map<string, () => void> = new Map();
  async createAuction(ownerId: string, ownerDisplayName: string, auctionData: CreateAuctionData): Promise<string> {
    try {
      console.log('[AuctionService] Creating auction with ownerId:', ownerId, 'displayName:', ownerDisplayName);
      
      const now = new Date();
      const endTime = new Date(now.getTime() + auctionData.duration * 60 * 60 * 1000);
      
      const landId = `${auctionData.landCenterX},${auctionData.landCenterY}`;
      
      const landRef = doc(fs, 'lands', landId);
      const landDoc = await getDoc(landRef);
      
      if (!landDoc.exists() || landDoc.data().owner !== ownerId) {
        throw new Error('You do not own this land');
      }
      const existingAuctionQuery = query(
        collection(fs, 'auctions'),
        where('landId', '==', landId),
        where('status', 'in', ['pending', 'active'])
      );
      const existingAuctions = await getDocs(existingAuctionQuery);
      
      if (!existingAuctions.empty) {
        throw new Error('This land is already being auctioned');
      }      const auctionDoc: Omit<LandAuction, 'id'> = {
        landId,
        ownerId,
        ownerDisplayName,
        landCenterX: auctionData.landCenterX,
        landCenterY: auctionData.landCenterY,
        landSize: auctionData.landSize,
        startTime: Timestamp.now(),
        endTime: Timestamp.fromDate(endTime),
        startingPrice: auctionData.startingPrice,
        currentBid: auctionData.startingPrice,
        buyNowPrice: auctionData.buyNowPrice,
        highestBidderId: null,
        highestBidderName: null,
        bidHistory: [],
        status: 'active',
        createdAt: serverTimestamp() as Timestamp,
        imageUrl: auctionData.imageUrl
      };const docRef = await addDoc(collection(fs, 'auctions'), auctionDoc);
      console.log('Auction created with ID:', docRef.id, 'for ownerId:', ownerId);
      
      await markLandAsAuctioned(landId, docRef.id);
      console.log('Land marked as auctioned:', landId);
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating auction:', error);
      throw error;
    }
  }

  async placeBid(auctionId: string, userId: string, userDisplayName: string, bidAmount: number): Promise<void> {
    try {
      await runTransaction(fs, async (transaction) => {
        const auctionRef = doc(fs, 'auctions', auctionId);
        const auctionDoc = await transaction.get(auctionRef);
        
        if (!auctionDoc.exists()) {
          throw new Error('Auction not found');
        }

        const auction = auctionDoc.data() as LandAuction;
        
        if (auction.status !== 'active') {
          throw new Error('Auction is not active');
        }

        if (auction.ownerId === userId) {
          throw new Error('You cannot bid on your own auction');
        }

        if (bidAmount <= auction.currentBid) {
          throw new Error(`Bid must be higher than current bid of ${auction.currentBid}`);
        }
        const userEconomy = await economyService.getUserEconomy(userId);
        if (!userEconomy || userEconomy.balance! < bidAmount) {
          throw new Error('Insufficient funds');
        }
        const now = new Date();
        const endTime = auction.endTime.toDate();
        const timeLeft = endTime.getTime() - now.getTime();
        const tenMinutes = 10 * 60 * 1000;
        
        let newEndTime = auction.endTime;
        if (timeLeft < tenMinutes) {
          newEndTime = Timestamp.fromDate(new Date(endTime.getTime() + 30 * 60 * 1000));
        }

        const newBid: AuctionBid = {
          userId,
          userDisplayName,
          amount: bidAmount,
          timestamp: Timestamp.now()
        };

        const updatedBidHistory = [...auction.bidHistory, newBid];

        transaction.update(auctionRef, {
          currentBid: bidAmount,
          highestBidderId: userId,
          highestBidderName: userDisplayName,
          bidHistory: updatedBidHistory,
          endTime: newEndTime
        });
      });

      console.log('Bid placed successfully');
    } catch (error) {
      console.error('Error placing bid:', error);
      throw error;
    }
  }

  async buyNow(auctionId: string, userId: string, userDisplayName: string): Promise<void> {
    try {
      await runTransaction(fs, async (transaction) => {
        const auctionRef = doc(fs, 'auctions', auctionId);
        const auctionDoc = await transaction.get(auctionRef);
        
        if (!auctionDoc.exists()) {
          throw new Error('Auction not found');
        }

        const auction = auctionDoc.data() as LandAuction;
        
        if (auction.status !== 'active') {
          throw new Error('Auction is not active');
        }

        if (!auction.buyNowPrice) {
          throw new Error('Buy now option not available');
        }

        if (auction.ownerId === userId) {
          throw new Error('You cannot buy your own auction');
        }
        const userEconomy = await economyService.getUserEconomy(userId);
        if (!userEconomy || userEconomy.balance! < auction.buyNowPrice) {
          throw new Error('Insufficient funds');
        }
        transaction.update(auctionRef, {
          status: 'ended',
          currentBid: auction.buyNowPrice,
          highestBidderId: userId,
          highestBidderName: userDisplayName,
          endTime: Timestamp.now()
        });
      });
      await this.processAuctionEnd(auctionId);
      
      console.log('Buy now completed successfully');
    } catch (error) {
      console.error('Error with buy now:', error);
      throw error;
    }
  }

  async getActiveAuctions(filters?: {
    endingSoon?: boolean;
    cheapest?: boolean;
    mostBids?: boolean;
    maxPrice?: number;
  }): Promise<LandAuction[]> {
    try {
      let q = query(
        collection(fs, 'auctions'),
        where('status', '==', 'active'),
        orderBy('endTime', 'asc')
      );

      const querySnapshot = await getDocs(q);
      let auctions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as LandAuction));
      if (filters?.endingSoon) {
        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
        auctions = auctions.filter(auction => 
          auction.endTime.toDate() <= oneHourFromNow
        );
      }

      if (filters?.cheapest) {
        auctions.sort((a, b) => a.currentBid - b.currentBid);
      }

      if (filters?.mostBids) {
        auctions.sort((a, b) => b.bidHistory.length - a.bidHistory.length);
      }

      if (filters?.maxPrice) {
        auctions = auctions.filter(auction => auction.currentBid <= filters.maxPrice!);
      }

      return auctions;
    } catch (error) {
      console.error('Error getting active auctions:', error);
      return [];
    }
  }
  async getUserAuctions(userId: string): Promise<LandAuction[]> {
    try {
      console.log('[AuctionService] Getting auctions for user:', userId);
      
      const q = query(
        collection(fs, 'auctions'),
        where('ownerId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const userAuctions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as LandAuction));
      
      console.log('[AuctionService] Found user auctions:', userAuctions.length, userAuctions);
      
      return userAuctions;
    } catch (error) {
      console.error('Error getting user auctions:', error);
      return [];
    }
  }

  async getUserBids(userId: string): Promise<LandAuction[]> {
    try {
      const q = query(
        collection(fs, 'auctions'),
        where('highestBidderId', '==', userId),
        where('status', 'in', ['active', 'ended'])
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as LandAuction));
    } catch (error) {
      console.error('Error getting user bids:', error);
      return [];
    }
  }

  async getAuction(auctionId: string): Promise<LandAuction | null> {
    try {
      const auctionRef = doc(fs, 'auctions', auctionId);
      const auctionDoc = await getDoc(auctionRef);
      
      if (!auctionDoc.exists()) {
        return null;
      }

      return {
        id: auctionDoc.id,
        ...auctionDoc.data()
      } as LandAuction;
    } catch (error) {
      console.error('Error fetching auction:', error);
      return null;
    }
  }

  async cancelAuction(auctionId: string, userId: string): Promise<void> {
    try {
      const auctionRef = doc(fs, 'auctions', auctionId);
      const auctionDoc = await getDoc(auctionRef);
      
      if (!auctionDoc.exists()) {
        throw new Error('Auction not found');
      }

      const auction = auctionDoc.data() as LandAuction;
      
      if (auction.ownerId !== userId) {
        throw new Error('You can only cancel your own auctions');
      }

      if (auction.status !== 'active') {
        throw new Error('Can only cancel active auctions');
      }

      if (auction.bidHistory.length > 0) {
        throw new Error('Cannot cancel auction with existing bids');
      }      await updateDoc(auctionRef, {
        status: 'cancelled'
      });
      
      await unmarkLandAsAuctioned(auction.landId);
      console.log('Land unmarked from auction:', auction.landId);

      console.log('Auction cancelled successfully');
    } catch (error) {
      console.error('Error cancelling auction:', error);
      throw error;
    }
  }

  async processAuctionEnd(auctionId: string): Promise<void> {
    try {
      await runTransaction(fs, async (transaction) => {
        const auctionRef = doc(fs, 'auctions', auctionId);
        const auctionDoc = await transaction.get(auctionRef);
        
        if (!auctionDoc.exists()) {
          throw new Error('Auction not found');
        }

        const auction = auctionDoc.data() as LandAuction;
        
        if (auction.status !== 'ended') {
          transaction.update(auctionRef, { status: 'ended' });
        }

        if (auction.highestBidderId) {
          const landRef = doc(fs, 'lands', auction.landId);
          transaction.update(landRef, {
            owner: auction.highestBidderId,
            claimedAt: serverTimestamp()
          });
          const newOwnerRef = doc(fs, 'users', auction.highestBidderId);
          const oldOwnerRef = doc(fs, 'users', auction.ownerId);

          transaction.update(newOwnerRef, {
            landInfo: {
              centerX: auction.landCenterX,
              centerY: auction.landCenterY,
              ownedSize: auction.landSize
            }
          });
          transaction.update(oldOwnerRef, {
            landInfo: null
          });
        }
      if (auction.highestBidderId) {
        await economyService.removeCoins(auction.highestBidderId, auction.currentBid, 'Land purchase');
        await economyService.addCoins(auction.ownerId, auction.currentBid, 'Land sale');
      }
    });

      console.log('Auction processing completed');
    } catch (error) {
      console.error('Error processing auction end:', error);
      throw error;
    }
  }

  subscribeToAuction(auctionId: string, callback: (auction: LandAuction | null) => void): () => void {
    const auctionRef = doc(fs, 'auctions', auctionId);
    
    const unsubscribe = onSnapshot(auctionRef, (doc) => {
      if (doc.exists()) {
        callback({ id: doc.id, ...doc.data() } as LandAuction);
      } else {
        callback(null);
      }
    });

    this.listeners.set(auctionId, unsubscribe);
    return unsubscribe;
  }

  subscribeToActiveAuctions(callback: (auctions: LandAuction[]) => void): () => void {
    const q = query(
      collection(fs, 'auctions'),
      where('status', '==', 'active'),
      orderBy('endTime', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const auctions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as LandAuction));
      callback(auctions);
    });

    return unsubscribe;
  }

  cleanup(id: string): void {
    const unsubscribe = this.listeners.get(id);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(id);
    }
  }
}

export const auctionService = new AuctionService();