import { collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, limit, getDocs } from 'firebase/firestore';
import { fs } from '../firebaseClient';

export interface Notification {
  id: string;
  userId: string;
  type: 'auction_outbid' | 'auction_won' | 'auction_ended' | 'land_sold' | 'comment_received' | 'like_received' | 'system' | 'economy';
  title: string;
  message: string;
  read: boolean;
  createdAt: any;
  metadata?: {
    auctionId?: string;
    landId?: string;
    postId?: string;
    fromUserId?: string;
    amount?: number;
    [key: string]: any;
  };
}

export interface NotificationPreferences {
  auctionUpdates: boolean;
  economyUpdates: boolean;
  socialUpdates: boolean;
  systemUpdates: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

class NotificationService {
  private listeners: Map<string, () => void> = new Map();
  private notificationCallbacks: Set<(notifications: Notification[]) => void> = new Set();

  async createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<void> {
    try {
      await addDoc(collection(fs, 'notifications'), {
        ...notification,
        createdAt: serverTimestamp()
      });
      console.log('Notification created:', notification.type);
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }

  async getUserNotifications(userId: string, limitCount: number = 20): Promise<Notification[]> {
    try {
      const q = query(
        collection(fs, 'notifications'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Notification));
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }
  }

  subscribeToNotifications(userId: string, callback: (notifications: Notification[]) => void): () => void {
    const q = query(
      collection(fs, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Notification));
      
      callback(notifications);
    });

    this.listeners.set(userId, unsubscribe);
    return unsubscribe;
  }

  async markAsRead(notificationId: string): Promise<void> {
    try {
      const notificationRef = doc(fs, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        read: true
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    try {
      const q = query(
        collection(fs, 'notifications'),
        where('userId', '==', userId),
        where('read', '==', false)
      );

      const querySnapshot = await getDocs(q);
      const batch = [];

      querySnapshot.forEach(docSnapshot => {
        const notificationRef = doc(fs, 'notifications', docSnapshot.id);
        batch.push(updateDoc(notificationRef, { read: true }));
      });

      await Promise.all(batch);
      console.log('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }

  async notifyAuctionOutbid(userId: string, auctionId: string, landId: string, newBidAmount: number): Promise<void> {
    await this.createNotification({
      userId,
      type: 'auction_outbid',
      title: 'You\'ve been outbid!',
      message: `Someone placed a higher bid of ${newBidAmount} 🪙 on your auction.`,
      read: false,
      metadata: {
        auctionId,
        landId,
        amount: newBidAmount
      }
    });
  }

  async notifyAuctionWon(userId: string, auctionId: string, landId: string, winningBid: number): Promise<void> {
    await this.createNotification({
      userId,
      type: 'auction_won',
      title: 'Congratulations! You won an auction!',
      message: `You won the land auction with a bid of ${winningBid} 🪙.`,
      read: false,
      metadata: {
        auctionId,
        landId,
        amount: winningBid
      }
    });
  }

  async notifyAuctionEnded(userId: string, auctionId: string, landId: string, sold: boolean, finalPrice?: number): Promise<void> {
    await this.createNotification({
      userId,
      type: 'auction_ended',
      title: sold ? 'Your auction has ended!' : 'Your auction ended without bids',
      message: sold 
        ? `Your land was sold for ${finalPrice} 🪙.`
        : 'Your auction ended without any bids.',
      read: false,
      metadata: {
        auctionId,
        landId,
        amount: finalPrice,
        sold
      }
    });
  }

  async notifyLandSold(userId: string, landId: string, salePrice: number, buyerName: string): Promise<void> {
    await this.createNotification({
      userId,
      type: 'land_sold',
      title: 'Land sold!',
      message: `Your land was purchased by ${buyerName} for ${salePrice} 🪙.`,
      read: false,
      metadata: {
        landId,
        amount: salePrice,
        buyerName
      }
    });
  }

  async notifyCommentReceived(userId: string, postId: string, commenterName: string): Promise<void> {
    await this.createNotification({
      userId,
      type: 'comment_received',
      title: 'New comment on your post',
      message: `${commenterName} commented on your gallery post.`,
      read: false,
      metadata: {
        postId,
        fromUserId: commenterName
      }
    });
  }

  async notifyLikeReceived(userId: string, postId: string, likerName: string): Promise<void> {
    await this.createNotification({
      userId,
      type: 'like_received',
      title: 'Someone liked your post!',
      message: `${likerName} liked your gallery post.`,
      read: false,
      metadata: {
        postId,
        fromUserId: likerName
      }
    });
  }

  async notifyEconomyUpdate(userId: string, amount: number, reason: string): Promise<void> {
    await this.createNotification({
      userId,
      type: 'economy',
      title: amount > 0 ? 'Coins earned!' : 'Coins spent',
      message: amount > 0 
        ? `You earned ${amount} 🪙 for ${reason}.`
        : `You spent ${Math.abs(amount)} 🪙 on ${reason}.`,
      read: false,
      metadata: {
        amount,
        reason
      }
    });
  }

  async notifySystem(userId: string, title: string, message: string, metadata?: any): Promise<void> {
    await this.createNotification({
      userId,
      type: 'system',
      title,
      message,
      read: false,
      metadata
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      const q = query(
        collection(fs, 'notifications'),
        where('userId', '==', userId),
        where('read', '==', false)
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.size;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  cleanup(userId: string): void {
    const unsubscribe = this.listeners.get(userId);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(userId);
    }
  }
}

export const notificationService = new NotificationService();