import { collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, limit, getDocs, getDoc } from 'firebase/firestore';
import { fs } from '../firebaseClient';
import { economyService } from './economyService';
import { notificationService } from './notificationService';
import websocketService from './websocketService';

export interface LandOffer {
  id: string;
  fromUserId: string;
  fromUserDisplayName: string;
  toUserId: string;
  toUserDisplayName: string;
  landId: string;
  landCenterX: number;
  landCenterY: number;
  landSize: number;
  offerAmount: number;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
  createdAt: any;
  expiresAt: any;
  respondedAt?: any;
  lockId?: string;
  counterOffer?: {
    amount: number;
    message?: string;
    createdAt: any;
  };
}

export interface CreateOfferData {
  landId: string;
  toUserId: string;
  toUserDisplayName: string;
  offerAmount: number;
  message?: string;
}

export interface OfferResponse {
  success: boolean;
  message: string;
  error?: string;
  landSaleCompleted?: boolean;
  buyerUserId?: string;
  sellerUserId?: string;
}

const OFFER_EXPIRY_HOURS = 48;
const OFFER_COOLDOWN_MINUTES = 30;
const MAX_OFFERS_PER_USER_PER_DAY = 10;

class LandOfferService {
  async createOffer(fromUserId: string, fromUserDisplayName: string, offerData: CreateOfferData): Promise<OfferResponse> {
    try {
      const userEconomy = await economyService.getUserEconomy(fromUserId);
      if (!userEconomy || userEconomy.balance === undefined || userEconomy.balance < offerData.offerAmount) {
        return {
          success: false,
          message: 'Insufficient balance to make this offer.'
        };
      }      const landDoc = await getDoc(doc(fs, 'lands', offerData.landId));
      if (!landDoc.exists()) {
        return {
          success: false,
          message: 'Land not found.'
        };
      }      const landData = landDoc.data();
      if (landData.owner !== offerData.toUserId) {
        return {
          success: false,
          message: 'Land is not owned by the specified user.'
        };
      }

      if (landData.isAuctioned) {
        return {
          success: false,
          message: 'This land is currently being auctioned and cannot be purchased directly.'
        };
      }

      const existingOffers = await this.getOffersForLand(offerData.landId, 'pending');
      const userExistingOffer = existingOffers.find(offer => offer.fromUserId === fromUserId);
      if (userExistingOffer) {
        return {
          success: false,
          message: 'You already have a pending offer for this land.'
        };
      }

      const todayOffers = await this.getUserOffersToday(fromUserId);
      if (todayOffers.length >= MAX_OFFERS_PER_USER_PER_DAY) {
        return {
          success: false,
          message: `You can only make ${MAX_OFFERS_PER_USER_PER_DAY} offers per day.`
        };
      }

      const recentRejection = await this.getRecentRejection(fromUserId, offerData.landId);
      if (recentRejection) {
        const cooldownEnd = new Date(recentRejection.respondedAt.toDate().getTime() + (OFFER_COOLDOWN_MINUTES * 60 * 1000));
        if (new Date() < cooldownEnd) {
          const remainingMinutes = Math.ceil((cooldownEnd.getTime() - new Date().getTime()) / (60 * 1000));
          return {
            success: false,
            message: `You must wait ${remainingMinutes} more minutes before making another offer on this land.`
          };
        }
      }

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + OFFER_EXPIRY_HOURS);      const offer: Omit<LandOffer, 'id'> = {
        fromUserId,
        fromUserDisplayName,
        toUserId: offerData.toUserId,
        toUserDisplayName: offerData.toUserDisplayName,
        landId: offerData.landId,
        landCenterX: landData.centerX || parseInt(offerData.landId.split(',')[0]),
        landCenterY: landData.centerY || parseInt(offerData.landId.split(',')[1]),
        landSize: landData.ownedSize || landData.size,
        offerAmount: offerData.offerAmount,
        status: 'pending',
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
        ...(offerData.message && { message: offerData.message })
      };      
      
      const docRef = await addDoc(collection(fs, 'landOffers'), offer);

      await notificationService.createNotification({
        userId: offerData.toUserId,
        type: 'system',
        title: 'New Land Offer Received!',
        message: `${fromUserDisplayName} offered ${offerData.offerAmount} 🪙 for your land at (${landData.centerX}, ${landData.centerY}).`,
        read: false,
        metadata: {
          offerId: docRef.id,
          landId: offerData.landId,
          fromUserId,
          amount: offerData.offerAmount
        }
      });

      return {
        success: true,
        message: 'Offer sent successfully! The landowner will be notified.'
      };

    } catch (error) {
      console.error('Error creating land offer:', error);
      return {
        success: false,
        message: 'Failed to create offer. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async respondToOffer(offerId: string, response: 'accepted' | 'rejected', responderId: string): Promise<OfferResponse> {
    try {
      const offerDoc = await getDoc(doc(fs, 'landOffers', offerId));
      if (!offerDoc.exists()) {
        return {
          success: false,
          message: 'Offer not found.'
        };
      }

      const offer = { id: offerDoc.id, ...offerDoc.data() } as LandOffer;

      if (offer.toUserId !== responderId) {
        return {
          success: false,
          message: 'You are not authorized to respond to this offer.'
        };
      }

      if (offer.status !== 'pending') {
        return {
          success: false,
          message: 'This offer is no longer pending.'
        };
      }

      if (new Date() > offer.expiresAt.toDate()) {
        await this.expireOffer(offerId);
        return {
          success: false,
          message: 'This offer has expired.'
        };
      }      
      if (response === 'accepted') {
        const userEconomy = await economyService.getUserEconomy(offer.fromUserId);
        if (!userEconomy || (userEconomy.balance || 0) < offer.offerAmount) {
          return {
            success: false,
            message: 'Insufficient balance to complete this purchase.'
          };
        }

        const saleResult = await this.processLandSale(offer);
        if (!saleResult.success) {
          return saleResult;
        }
      }

      await updateDoc(doc(fs, 'landOffers', offerId), {
        status: response,
        respondedAt: serverTimestamp()
      });

      const notificationTitle = response === 'accepted' 
        ? 'Land Offer Accepted!' 
        : 'Land Offer Rejected';
      
      const notificationMessage = response === 'accepted'
        ? `${offer.toUserDisplayName} accepted your offer of ${offer.offerAmount} 🪙! The land is now yours.`
        : `${offer.toUserDisplayName} rejected your offer of ${offer.offerAmount} 🪙.`;

      await notificationService.createNotification({
        userId: offer.fromUserId,
        type: response === 'accepted' ? 'land_sold' : 'system',
        title: notificationTitle,
        message: notificationMessage,
        read: false,
        metadata: {
          offerId,
          landId: offer.landId,
          amount: offer.offerAmount,
          response
        }
      });      return {
        success: true,
        message: response === 'accepted' 
          ? 'Offer accepted! Land ownership has been transferred.'
          : 'Offer rejected successfully.',
        landSaleCompleted: response === 'accepted',
        buyerUserId: response === 'accepted' ? offer.fromUserId : undefined,
        sellerUserId: response === 'accepted' ? offer.toUserId : undefined
      };

    } catch (error) {
      console.error('Error responding to offer:', error);
      return {
        success: false,
        message: 'Failed to respond to offer. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async createCounterOffer(offerId: string, counterAmount: number, counterMessage: string = '', responderId: string): Promise<OfferResponse> {
    try {
      const offerDoc = await getDoc(doc(fs, 'landOffers', offerId));
      if (!offerDoc.exists()) {
        return {
          success: false,
          message: 'Offer not found.'
        };
      }

      const offer = { id: offerDoc.id, ...offerDoc.data() } as LandOffer;

      if (offer.toUserId !== responderId) {
        return {
          success: false,
          message: 'You are not authorized to counter this offer.'
        };
      }

      if (offer.status !== 'pending') {
        return {
          success: false,
          message: 'This offer is no longer pending.'
        };
      }

      await updateDoc(doc(fs, 'landOffers', offerId), {
        counterOffer: {
          amount: counterAmount,
          message: counterMessage,
          createdAt: serverTimestamp()
        }
      });

      await notificationService.createNotification({
        userId: offer.fromUserId,
        type: 'system',
        title: 'Counter Offer Received!',
        message: `${offer.toUserDisplayName} countered your offer with ${counterAmount} 🪙 for the land at (${offer.landCenterX}, ${offer.landCenterY}).`,
        read: false,
        metadata: {
          offerId,
          landId: offer.landId,
          originalAmount: offer.offerAmount,
          counterAmount
        }
      });

      return {
        success: true,
        message: 'Counter offer sent successfully!'
      };

    } catch (error) {
      console.error('Error creating counter offer:', error);
      return {
        success: false,
        message: 'Failed to create counter offer. Please try again.'
      };
    }
  }  async acceptCounterOffer(offerId: string, accepterId: string): Promise<OfferResponse> {
    try {
      const offerDoc = await getDoc(doc(fs, 'landOffers', offerId));
      if (!offerDoc.exists()) {
        return {
          success: false,
          message: 'Offer not found.'
        };
      }

      const offer = { id: offerDoc.id, ...offerDoc.data() } as LandOffer;

      if (offer.fromUserId !== accepterId) {
        return {
          success: false,
          message: 'You are not authorized to accept this counter offer.'
        };
      }

      if (!offer.counterOffer) {
        return {
          success: false,
          message: 'No counter offer found.'
        };
      }

      const originalOfferAmount = offer.offerAmount;
      const counterOfferAmount = offer.counterOffer.amount;
      const userEconomy = await economyService.getUserEconomy(accepterId);
      if (!userEconomy) {
        return {
          success: false,
          message: 'Unable to verify user balance.'
        };
      }
      const currentBalance = userEconomy.balance || 0;
      if (currentBalance < counterOfferAmount) {
        return {
          success: false,
          message: 'Insufficient balance to accept the counter offer.'
        };
      }

      const saleOffer: LandOffer = { 
        ...offer, 
        offerAmount: counterOfferAmount
      };
      
      const saleResult = await this.processLandSale(saleOffer);
      if (!saleResult.success) {
        return saleResult;
      }

      if (originalOfferAmount !== counterOfferAmount) {
        try {
          if (counterOfferAmount < originalOfferAmount) {
            const refundAmount = originalOfferAmount - counterOfferAmount;
            await economyService.refundOfferCharge(
              accepterId, 
              refundAmount, 
              `Refund for price adjustment: original ${originalOfferAmount} vs final ${counterOfferAmount}`
            );
          }
        } catch (adjustmentError) {
          console.error('Error adjusting payment for counter offer:', adjustmentError);
        }
      }

      await updateDoc(doc(fs, 'landOffers', offerId), {
        status: 'accepted',
        respondedAt: serverTimestamp(),
        offerAmount: counterOfferAmount
      });

      await notificationService.createNotification({
        userId: offer.toUserId,
        type: 'land_sold',
        title: 'Counter Offer Accepted!',
        message: `Your counter offer of ${counterOfferAmount} 🪙 was accepted! The land has been sold.`,
        read: false,
        metadata: {
          offerId,
          landId: offer.landId,
          amount: counterOfferAmount
        }
      });

      return {
        success: true,
        message: 'Counter offer accepted! Land ownership has been transferred.',
        landSaleCompleted: true,
        buyerUserId: offer.fromUserId,
        sellerUserId: offer.toUserId
      };

    } catch (error) {
      console.error('Error accepting counter offer:', error);
      return {
        success: false,
        message: 'Failed to accept counter offer. Please try again.'
      };
    }
  }

  async cancelOffer(offerId: string, cancelerId: string): Promise<OfferResponse> {
    try {
      const offerDoc = await getDoc(doc(fs, 'landOffers', offerId));
      if (!offerDoc.exists()) {
        return {
          success: false,
          message: 'Offer not found.'
        };
      }

      const offer = { id: offerDoc.id, ...offerDoc.data() } as LandOffer;

      if (offer.fromUserId !== cancelerId) {
        return {
          success: false,
          message: 'You can only cancel your own offers.'
        };
      }

      if (offer.status !== 'pending') {
        return {
          success: false,
          message: 'Only pending offers can be cancelled.'
        };
      }      await updateDoc(doc(fs, 'landOffers', offerId), {
        status: 'cancelled',
        respondedAt: serverTimestamp()
      });


      await notificationService.createNotification({
        userId: offer.toUserId,
        type: 'system',
        title: 'Land Offer Cancelled',
        message: `${offer.fromUserDisplayName} cancelled their offer of ${offer.offerAmount} 🪙 for your land.`,
        read: false,
        metadata: {
          offerId,
          landId: offer.landId,
          amount: offer.offerAmount
        }
      });

      return {
        success: true,
        message: 'Offer cancelled successfully.'
      };

    } catch (error) {
      console.error('Error cancelling offer:', error);
      return {
        success: false,
        message: 'Failed to cancel offer. Please try again.'
      };
    }
  }

  async getOffersForLand(landId: string, status?: string): Promise<LandOffer[]> {
    try {
      let q = query(
        collection(fs, 'landOffers'),
        where('landId', '==', landId),
        orderBy('createdAt', 'desc')
      );

      if (status) {
        q = query(
          collection(fs, 'landOffers'),
          where('landId', '==', landId),
          where('status', '==', status),
          orderBy('createdAt', 'desc')
        );
      }

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as LandOffer));
    } catch (error) {
      console.error('Error fetching offers for land:', error);
      return [];
    }
  }

  async getUserOffers(userId: string): Promise<LandOffer[]> {
    try {
      const q = query(
        collection(fs, 'landOffers'),
        where('fromUserId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as LandOffer));
    } catch (error) {
      console.error('Error fetching user offers:', error);
      return [];
    }
  }

  async getReceivedOffers(userId: string): Promise<LandOffer[]> {
    try {
      const q = query(
        collection(fs, 'landOffers'),
        where('toUserId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as LandOffer));
    } catch (error) {
      console.error('Error fetching received offers:', error);
      return [];
    }
  }

  subscribeToUserOffers(userId: string, callback: (offers: LandOffer[]) => void): () => void {
    const q = query(
      collection(fs, 'landOffers'),
      where('fromUserId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const offers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as LandOffer));
      callback(offers);
    });
  }

  subscribeToReceivedOffers(userId: string, callback: (offers: LandOffer[]) => void): () => void {
    const q = query(
      collection(fs, 'landOffers'),
      where('toUserId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const offers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as LandOffer));
      callback(offers);
    });
  }  private async processLandSale(offer: LandOffer): Promise<OfferResponse> {
    try {
      const userEconomy = await economyService.getUserEconomy(offer.fromUserId);
      if (!userEconomy || (userEconomy.balance || 0) < offer.offerAmount) {
        return {
          success: false,
          message: 'Insufficient balance to complete this purchase.'
        };
      }

      await updateDoc(doc(fs, 'lands', offer.landId), {
        owner: offer.fromUserId,
        ownerDisplayName: offer.fromUserDisplayName,
        lastTransferDate: serverTimestamp(),
        purchasePrice: offer.offerAmount
      });

      await updateDoc(doc(fs, 'users', offer.fromUserId), {
        landInfo: {
          centerX: offer.landCenterX,
          centerY: offer.landCenterY,
          ownedSize: offer.landSize
        }
      });

      await updateDoc(doc(fs, 'users', offer.toUserId), {
        landInfo: null
      });      
      await economyService.transferFunds(offer.fromUserId, offer.toUserId, offer.offerAmount, 'Land sale');

      websocketService.send('land_sold', {
        landId: offer.landId,
        landCenterX: offer.landCenterX,
        landCenterY: offer.landCenterY,
        previousOwner: offer.toUserId,
        newOwner: offer.fromUserId,
        salePrice: offer.offerAmount
      });

      return {
        success: true,
        message: 'Land sale completed successfully.'
      };
    } catch (error) {
      console.error('Error processing land sale:', error);
      return {
        success: false,
        message: 'Failed to process land sale.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getUserOffersToday(userId: string): Promise<LandOffer[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const q = query(
      collection(fs, 'landOffers'),
      where('fromUserId', '==', userId),
      where('createdAt', '>=', today)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as LandOffer));
  }

  private async getRecentRejection(userId: string, landId: string): Promise<LandOffer | null> {
    const cooldownTime = new Date();
    cooldownTime.setMinutes(cooldownTime.getMinutes() - OFFER_COOLDOWN_MINUTES);

    const q = query(
      collection(fs, 'landOffers'),
      where('fromUserId', '==', userId),
      where('landId', '==', landId),
      where('status', '==', 'rejected'),
      where('respondedAt', '>=', cooldownTime),
      orderBy('respondedAt', 'desc'),
      limit(1)
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;

    return {
      id: querySnapshot.docs[0].id,
      ...querySnapshot.docs[0].data()
    } as LandOffer;
  }

  private async expireOffer(offerId: string): Promise<void> {
    try {
      const offerDoc = await getDoc(doc(fs, 'landOffers', offerId));
      if (!offerDoc.exists()) return;

      const offer = { id: offerDoc.id, ...offerDoc.data() } as LandOffer;

      await updateDoc(doc(fs, 'landOffers', offerId), {
        status: 'expired',
        respondedAt: serverTimestamp()      });


      await notificationService.createNotification({
        userId: offer.fromUserId,
        type: 'system',
        title: 'Land Offer Expired',
        message: `Your offer of ${offer.offerAmount} 🪙 for land at (${offer.landCenterX}, ${offer.landCenterY}) has expired.`,
        read: false,
        metadata: {
          offerId,
          landId: offer.landId,
          amount: offer.offerAmount
        }
      });
    } catch (error) {
      console.error('Error expiring offer:', error);
    }
  }

  async cleanupExpiredOffers(): Promise<void> {
    try {
      const now = new Date();
      const q = query(
        collection(fs, 'landOffers'),
        where('status', '==', 'pending'),
        where('expiresAt', '<=', now)
      );

      const querySnapshot = await getDocs(q);
      
      for (const doc of querySnapshot.docs) {
        await this.expireOffer(doc.id);
      }

      console.log(`Cleaned up ${querySnapshot.size} expired offers`);
    } catch (error) {
      console.error('Error cleaning up expired offers:', error);
    }
  }
}

export const landOfferService = new LandOfferService();