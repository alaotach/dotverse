import { doc, getDoc, updateDoc, increment, onSnapshot, collection, query, where, orderBy, limit, getDocs, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { fs } from '../firebaseClient';

export interface UserEconomyData {
  userId: string;
  balance: number;
  totalEarned: number;
  lifetimeStats: {
    likesReceived: number;
    commentsReceived: number;
    postsShared: number;
  };
  transactions: EconomyTransaction[];
}

export interface EconomyTransaction {
  id: string;
  userId: string;
  type: 'like_received' | 'comment_received' | 'post_bonus' | 'daily_bonus' | 'purchase' | 'reward';
  amount: number;
  timestamp: number;
  description: string;
  metadata?: {
    postId?: string;
    fromUserId?: string;
    fromUsername?: string;
  };
}

const ECONOMY_RATES = {
  LIKE_REWARD: 2,           
  COMMENT_REWARD: 5,        
  POST_CREATION_BONUS: 10,  
  DAILY_LOGIN_BONUS: 50,    
};

class EconomyService {
  private listeners: Map<string, () => void> = new Map();

  async initializeUserEconomy(userId: string): Promise<void> {
    const userEconomyRef = doc(fs, 'economy', userId);
    
    try {
        const docSnap = await getDoc(userEconomyRef);
        if (!docSnap.exists()) {
        await setDoc(userEconomyRef, {
            userId,
            balance: 0,
            totalEarned: 0,
            lifetimeStats: {
            likesReceived: 0,
            commentsReceived: 0,
            postsShared: 0
            },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        console.log(`Created economy document for user ${userId}`);
        } else {
        await updateDoc(userEconomyRef, {
            updatedAt: serverTimestamp()
        });
        console.log(`Economy document already exists for user ${userId}`);
        }
    } catch (error) {
        console.error('Failed to initialize user economy:', error);
        throw error;
    }
    }

  async addCoins(userId: string, amount: number, description: string): Promise<void> {
    const userEconomyRef = doc(fs, 'economy', userId);
    const transactionRef = doc(collection(fs, 'economyTransactions'));

    const transactionData: Omit<EconomyTransaction, 'id'> = {
      userId,
      type: 'reward',
      amount,
      timestamp: Date.now(),
      description
    };

    try {
      await this.initializeUserEconomy(userId);
      
      await setDoc(userEconomyRef, {
        balance: increment(amount),
        totalEarned: increment(amount),
        updatedAt: serverTimestamp()
      }, { merge: true });

      await setDoc(transactionRef, {
        ...transactionData,
        id: transactionRef.id
      });

      console.log(`Added ${amount} coins to ${userId}`);
    } catch (error) {
      console.error('Failed to add coins:', error);
      throw error;
    }
  }

  async removeCoins(userId: string, amount: number, description: string): Promise<void> {
    const userEconomyRef = doc(fs, 'economy', userId);
    const transactionRef = doc(collection(fs, 'economyTransactions'));

    const transactionData: Omit<EconomyTransaction, 'id'> = {
      userId,
      type: 'purchase',
      amount: -amount,
      timestamp: Date.now(),
      description
    };

    try {
      await this.initializeUserEconomy(userId);
      
      const userEconomy = await this.getUserEconomy(userId);
      if (!userEconomy || userEconomy.balance! < amount) {
        throw new Error('Insufficient funds');
      }

      await setDoc(userEconomyRef, {
        balance: increment(-amount),
        updatedAt: serverTimestamp()
      }, { merge: true });

      await setDoc(transactionRef, {
        ...transactionData,
        id: transactionRef.id
      });

      console.log(`Removed ${amount} coins from ${userId}`);
    } catch (error) {
      console.error('Failed to remove coins:', error);
      throw error;
    }
  }



  async awardLike(userId: string, fromUserId: string, fromUsername: string, postId: string): Promise<void> {
    console.log(`Awarding like to ${userId} from ${fromUsername} for post ${postId}`);
    
    try {
      await this.initializeUserEconomy(userId);
      
      const userEconomyRef = doc(fs, 'economy', userId);
      const transactionRef = doc(collection(fs, 'economyTransactions'));

      const transactionData: Omit<EconomyTransaction, 'id'> = {
        userId,
        type: 'like_received',
        amount: ECONOMY_RATES.LIKE_REWARD,
        timestamp: Date.now(),
        description: `Received like from ${fromUsername}`,
        metadata: {
          postId,
          fromUserId,
          fromUsername
        }
      };

      await runTransaction(fs, async (transaction) => {
        const userDoc = await transaction.get(userEconomyRef);
        
        if (!userDoc.exists()) {
          throw new Error('User economy document not found after initialization');
        }
        
        const currentData = userDoc.data() as UserEconomyData;
        
        transaction.update(userEconomyRef, {
          balance: (currentData.balance || 0) + ECONOMY_RATES.LIKE_REWARD,
          totalEarned: (currentData.totalEarned || 0) + ECONOMY_RATES.LIKE_REWARD,
          'lifetimeStats.likesReceived': (currentData.lifetimeStats?.likesReceived || 0) + 1,
          updatedAt: serverTimestamp()
        });
        
        transaction.set(transactionRef, {
          ...transactionData,
          id: transactionRef.id
        });
      });
      
      console.log(`Successfully awarded ${ECONOMY_RATES.LIKE_REWARD} coins to ${userId} for like`);
    } catch (error) {
      console.error('Failed to award like:', error);
      throw error;
    }
  }

  async removeLike(userId: string, fromUserId: string, fromUsername: string, postId: string): Promise<void> {
        console.log(`Removing like reward from ${userId} by ${fromUsername} for post ${postId}`);
        try {
        await this.initializeUserEconomy(userId);
        
        const userEconomyRef = doc(fs, 'economy', userId);
        const transactionRef = doc(collection(fs, 'economyTransactions'));

        const transactionData: Omit<EconomyTransaction, 'id'> = {
            userId,
            type: 'like_received',
            amount: -ECONOMY_RATES.LIKE_REWARD,
            timestamp: Date.now(),
            description: `Like removed by ${fromUsername}`,
            metadata: {
            postId,
            fromUserId,
            fromUsername
            }
        };

        await runTransaction(fs, async (transaction) => {
        const userDoc = await transaction.get(userEconomyRef);
        
        if (!userDoc.exists()) {
          throw new Error('User economy document not found after initialization');
        }
        
        const currentData = userDoc.data() as UserEconomyData;
        
        const newBalance = Math.max(0, (currentData.balance || 0) - ECONOMY_RATES.LIKE_REWARD);
        const newLikesReceived = Math.max(0, (currentData.lifetimeStats?.likesReceived || 0) - 1);
        
        transaction.update(userEconomyRef, {
          balance: newBalance,
          'lifetimeStats.likesReceived': newLikesReceived,
          updatedAt: serverTimestamp()
        });
        
        transaction.set(transactionRef, {
          ...transactionData,
          id: transactionRef.id
        });
      });
      
      console.log(`Successfully removed ${ECONOMY_RATES.LIKE_REWARD} coins from ${userId} for like removal`);
    } catch (error) {
      console.error('Failed to remove like reward:', error);
      throw error;
    }
  }

  async awardComment(userId: string, fromUserId: string, fromUsername: string, postId: string): Promise<void> {
    const userEconomyRef = doc(fs, 'economy', userId);
    const transactionRef = doc(collection(fs, 'economyTransactions'));

    const transactionData: Omit<EconomyTransaction, 'id'> = {
        userId,
        type: 'comment_received',
        amount: ECONOMY_RATES.COMMENT_REWARD,
        timestamp: Date.now(),
        description: `Received comment from ${fromUsername}`,
        metadata: {
        postId,
        fromUserId,
        fromUsername
        }
    };

    try {
        await this.initializeUserEconomy(userId);
        await setDoc(userEconomyRef, {
            balance: increment(ECONOMY_RATES.COMMENT_REWARD),
            totalEarned: increment(ECONOMY_RATES.COMMENT_REWARD),
            'lifetimeStats.commentsReceived': increment(1),
            updatedAt: serverTimestamp()
            }, { merge: true });

            await setDoc(transactionRef, {
            ...transactionData,
            id: transactionRef.id
            });

            console.log(`Awarded ${ECONOMY_RATES.COMMENT_REWARD} coins to ${userId} for comment`);
        } catch (error) {
            console.error('Failed to award comment:', error);
            throw error;
        }
    }

  async removeComment(userId: string, fromUserId: string, fromUsername: string, postId: string): Promise<void> {
    console.log(`Removing comment reward from ${userId} by ${fromUsername} for post ${postId}`);
    
    try {
      await this.initializeUserEconomy(userId);
      
      const userEconomyRef = doc(fs, 'economy', userId);
      const transactionRef = doc(collection(fs, 'economyTransactions'));

      const transactionData: Omit<EconomyTransaction, 'id'> = {
        userId,
        type: 'comment_received',
        amount: -ECONOMY_RATES.COMMENT_REWARD,
        timestamp: Date.now(),
        description: `Comment removed by ${fromUsername}`,
        metadata: {
          postId,
          fromUserId,
          fromUsername
        }
      };

      await runTransaction(fs, async (transaction) => {
        const userDoc = await transaction.get(userEconomyRef);
        
        if (!userDoc.exists()) {
          throw new Error('User economy document not found after initialization');
        }
        
        const currentData = userDoc.data() as UserEconomyData;
        
        const newBalance = Math.max(0, (currentData.balance || 0) - ECONOMY_RATES.COMMENT_REWARD);
        const newCommentsReceived = Math.max(0, (currentData.lifetimeStats?.commentsReceived || 0) - 1);
        
        transaction.update(userEconomyRef, {
          balance: newBalance,
          'lifetimeStats.commentsReceived': newCommentsReceived,
          updatedAt: serverTimestamp()
        });
        
        transaction.set(transactionRef, {
          ...transactionData,
          id: transactionRef.id
        });
      });

      console.log(`Successfully removed ${ECONOMY_RATES.COMMENT_REWARD} coins from ${userId} for comment removal`);
    } catch (error) {
      console.error('Failed to remove comment reward:', error);
      throw error;
    }
  }

  async hasUserCommentedOnPost(postOwnerId: string, commenterId: string, postId: string): Promise<boolean> {
    try {
      const transactionsRef = collection(fs, 'economyTransactions');
      const q = query(
        transactionsRef,
        where('userId', '==', postOwnerId),
        where('type', '==', 'comment_received'),
        where('metadata.postId', '==', postId),
        where('metadata.fromUserId', '==', commenterId),
        limit(1)
      );
      
      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error('Error checking if user has commented:', error);
      return false;
    }
  }

  async awardPostCreation(userId: string): Promise<void> {
    const userEconomyRef = doc(fs, 'economy', userId);
    const transactionRef = doc(collection(fs, 'economyTransactions'));

    const transactionData: Omit<EconomyTransaction, 'id'> = {
        userId,
        type: 'post_bonus',
        amount: ECONOMY_RATES.POST_CREATION_BONUS,
        timestamp: Date.now(),
        description: 'Bonus for creating a post'
    };

    try {
        await this.initializeUserEconomy(userId);
        
        await setDoc(userEconomyRef, {
        balance: increment(ECONOMY_RATES.POST_CREATION_BONUS),
        totalEarned: increment(ECONOMY_RATES.POST_CREATION_BONUS),
        'lifetimeStats.postsShared': increment(1),
        updatedAt: serverTimestamp()
        }, { merge: true });

        await setDoc(transactionRef, {
        ...transactionData,
        id: transactionRef.id
        });

        console.log(`Awarded ${ECONOMY_RATES.POST_CREATION_BONUS} coins to ${userId} for post creation`);
    } catch (error) {
        console.error('Failed to award post creation bonus:', error);
        throw error;
    }
    }

  subscribeToUserEconomy(userId: string, callback: (data: Partial<UserEconomyData>) => void): () => void {
    const userEconomyRef = doc(fs, 'economy', userId);
    
    const unsubscribe = onSnapshot(userEconomyRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Partial<UserEconomyData>;
        callback(data);
      } else {
        this.initializeUserEconomy(userId).then(() => {
          callback({
            userId,
            balance: 0,
            totalEarned: 0,
            lifetimeStats: {
              likesReceived: 0,
              commentsReceived: 0,
              postsShared: 0
            }
          });
        });
      }
    });

    this.listeners.set(userId, unsubscribe);
    return unsubscribe;
  }

  async removePostCreation(userId: string): Promise<void> {
    console.log(`Removing post creation bonus from ${userId}`);
    try{
        await this.initializeUserEconomy(userId);
        const userEconomyRef = doc(fs, 'economy', userId);
        const transactionRef = doc(collection(fs, 'economyTransactions'));
        const transactionData: Omit<EconomyTransaction, 'id'> = {
            userId,
            type: 'post_bonus',
            amount: -ECONOMY_RATES.POST_CREATION_BONUS,
            timestamp: Date.now(),
            description: 'Post creation bonus removed (post deleted)'
        };
        await runTransaction(fs, async (transaction) => {
        const userDoc = await transaction.get(userEconomyRef);
        
        if (!userDoc.exists()) {
            throw new Error('User economy document not found after initialization');
        }
        
        const currentData = userDoc.data() as UserEconomyData;
        
        const newBalance = Math.max(0, (currentData.balance || 0) - ECONOMY_RATES.POST_CREATION_BONUS);
        const newPostsShared = Math.max(0, (currentData.lifetimeStats?.postsShared || 0) - 1);
        
        transaction.update(userEconomyRef, {
            balance: newBalance,
            'lifetimeStats.postsShared': newPostsShared,
            updatedAt: serverTimestamp()
        });
        
        transaction.set(transactionRef, {
            ...transactionData,
            id: transactionRef.id
        });
        });
        console.log(`Successfully removed ${ECONOMY_RATES.POST_CREATION_BONUS} coins from ${userId} for post deletion`);
    } catch (error) {
        console.error('Failed to remove post creation bonus:', error);
        throw error;
    }
    }

  async getUserEconomy(userId: string): Promise<Partial<UserEconomyData> | null> {
    try {
        await this.initializeUserEconomy(userId);
        
        const userEconomyRef = doc(fs, 'economy', userId);
        const docSnap = await getDoc(userEconomyRef);
        
        if (docSnap.exists()) {
        return docSnap.data() as Partial<UserEconomyData>;
        }
        
        return null;
    } catch (error) {
        console.error('Error getting user economy:', error);
        return null;
    }
    }

  async getRecentTransactions(userId: string, limitCount: number = 10): Promise<EconomyTransaction[]> {
    try {
      const transactionsQuery = query(
        collection(fs, 'economyTransactions'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      
      const querySnapshot = await getDocs(transactionsQuery);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EconomyTransaction));
    } catch (error) {
      console.error('Error getting transactions:', error);
      return [];
    }
  }

  async getLeaderboard(limitCount: number = 20): Promise<Partial<UserEconomyData>[]> {
    try {
      const leaderboardQuery = query(
        collection(fs, 'economy'),
        orderBy('totalEarned', 'desc'),
        limit(limitCount)
      );
      
      const querySnapshot = await getDocs(leaderboardQuery);
      return querySnapshot.docs.map(doc => doc.data() as Partial<UserEconomyData>);
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      return [];
    }
  }

  async lockFunds(userId: string, amount: number, purpose: string): Promise<string> {
    console.log(`Locking ${amount} funds for user ${userId} for ${purpose}`);
    
    try {
      await this.initializeUserEconomy(userId);
      
      const userEconomy = await this.getUserEconomy(userId);
      if (!userEconomy || (userEconomy.balance || 0) < amount) {
        throw new Error('Insufficient funds');
      }

      const lockedFundsRef = doc(collection(fs, 'lockedFunds'));
      const lockId = lockedFundsRef.id;

      const lockData = {
        id: lockId,
        userId,
        amount,
        purpose,
        timestamp: Date.now(),
        status: 'locked',
        createdAt: serverTimestamp()
      };

      await runTransaction(fs, async (transaction) => {
        const userEconomyRef = doc(fs, 'economy', userId);
        const userDoc = await transaction.get(userEconomyRef);
        
        if (!userDoc.exists()) {
          throw new Error('User economy document not found');
        }
        
        const currentData = userDoc.data() as UserEconomyData;
        const currentBalance = currentData.balance || 0;
        
        if (currentBalance < amount) {
          throw new Error('Insufficient funds');
        }
        
        transaction.update(userEconomyRef, {
          balance: currentBalance - amount,
          updatedAt: serverTimestamp()
        });
      
        transaction.set(lockedFundsRef, lockData);
      });

      console.log(`Successfully locked ${amount} coins for user ${userId} with lock ID ${lockId}`);
      return lockId;
    } catch (error) {
      console.error('Failed to lock funds:', error);
      throw error;
    }
  }

  async releaseFunds(lockId: string): Promise<void> {
    console.log(`Releasing locked funds with ID ${lockId}`);
    
    try {
      const lockedFundsRef = doc(fs, 'lockedFunds', lockId);
      
      await runTransaction(fs, async (transaction) => {
        const lockDoc = await transaction.get(lockedFundsRef);
        
        if (!lockDoc.exists()) {
          throw new Error('Lock not found');
        }
        
        const lockData = lockDoc.data();
        if (lockData.status !== 'locked') {
          throw new Error('Funds are not in locked state');
        }
        
        const userEconomyRef = doc(fs, 'economy', lockData.userId);
        const userDoc = await transaction.get(userEconomyRef);
        
        if (!userDoc.exists()) {
          throw new Error('User economy document not found');
        }
        
        const currentData = userDoc.data() as UserEconomyData;
        
        transaction.update(userEconomyRef, {
          balance: (currentData.balance || 0) + lockData.amount,
          updatedAt: serverTimestamp()
        });
        
        transaction.update(lockedFundsRef, {
          status: 'released',
          releasedAt: serverTimestamp()
        });
      });

      console.log(`Successfully released locked funds with ID ${lockId}`);
    } catch (error) {
      console.error('Failed to release funds:', error);
      throw error;
    }
  }

  async transferFunds(fromUserId: string, toUserId: string, amount: number, description: string, lockId?: string): Promise<void> {
    console.log(`Transferring ${amount} coins from ${fromUserId} to ${toUserId}`);
    
    try {
      await this.initializeUserEconomy(fromUserId);
      await this.initializeUserEconomy(toUserId);
      
      const fromTransactionRef = doc(collection(fs, 'economyTransactions'));
      const toTransactionRef = doc(collection(fs, 'economyTransactions'));      await runTransaction(fs, async (transaction) => {
        let lockDoc = null;
        let fromDoc = null;
        const toEconomyRef = doc(fs, 'economy', toUserId);
        const toDoc = await transaction.get(toEconomyRef);
        
        if (!toDoc.exists()) {
          throw new Error('Receiver economy document not found');
        }
        
        if (lockId) {
          const lockedFundsRef = doc(fs, 'lockedFunds', lockId);
          lockDoc = await transaction.get(lockedFundsRef);
          
          if (!lockDoc.exists()) {
            throw new Error('Lock not found');
          }
          
          const lockData = lockDoc.data();
          if (lockData.status !== 'locked' || lockData.userId !== fromUserId) {
            throw new Error('Invalid lock for transfer');
          }
          
          if (lockData.amount !== amount) {
            throw new Error('Lock amount does not match transfer amount');
          }
        } else {
          const fromEconomyRef = doc(fs, 'economy', fromUserId);
          fromDoc = await transaction.get(fromEconomyRef);
          
          if (!fromDoc.exists()) {
            throw new Error('Sender economy document not found');
          }
          
          const fromData = fromDoc.data() as UserEconomyData;
          if ((fromData.balance || 0) < amount) {
            throw new Error('Insufficient funds');
          }
        }
        
        if (lockId && lockDoc) {
          const lockedFundsRef = doc(fs, 'lockedFunds', lockId);
          transaction.update(lockedFundsRef, {
            status: 'used',
            usedAt: serverTimestamp()
          });
        } else if (fromDoc) {
          const fromEconomyRef = doc(fs, 'economy', fromUserId);
          const fromData = fromDoc.data() as UserEconomyData;
          transaction.update(fromEconomyRef, {
            balance: (fromData.balance || 0) - amount,
            updatedAt: serverTimestamp()
          });
        }
        
        const toData = toDoc.data() as UserEconomyData;
        transaction.update(toEconomyRef, {
          balance: (toData.balance || 0) + amount,
          totalEarned: (toData.totalEarned || 0) + amount,
          updatedAt: serverTimestamp()
        });
        
        const timestamp = Date.now();
          transaction.set(fromTransactionRef, {
          id: fromTransactionRef.id,
          userId: fromUserId,
          type: 'purchase' as const,
          amount: -amount,
          timestamp,
          description: `Transfer to user: ${description}`,
          metadata: {
            transferTo: toUserId,
            ...(lockId && { lockId })
          }
        });
        
        transaction.set(toTransactionRef, {
          id: toTransactionRef.id,
          userId: toUserId,
          type: 'reward' as const,
          amount: amount,
          timestamp,
          description: `Transfer from user: ${description}`,
          metadata: {
            transferFrom: fromUserId,
            ...(lockId && { lockId })
          }
        });
      });

      console.log(`Successfully transferred ${amount} coins from ${fromUserId} to ${toUserId}`);
    } catch (error) {
      console.error('Failed to transfer funds:', error);
      throw error;
    }
  }

  async recordTransaction(userId: string, type: EconomyTransaction['type'], amount: number, description: string, metadata?: any): Promise<void> {
    console.log(`Recording transaction for user ${userId}: ${type} ${amount}`);
    
    try {
      await this.initializeUserEconomy(userId);
      
      const transactionRef = doc(collection(fs, 'economyTransactions'));      const transactionData: Omit<EconomyTransaction, 'id'> = {
        userId,
        type,
        amount,
        timestamp: Date.now(),
        description,
        ...(metadata && { metadata })
      };

      await setDoc(transactionRef, {
        ...transactionData,
        id: transactionRef.id
      });

      console.log(`Successfully recorded transaction for user ${userId}`);
    } catch (error) {
      console.error('Failed to record transaction:', error);
      throw error;
    }
  }

  async refundOfferCharge(userId: string, refundAmount: number, description: string): Promise<void> {
    if (refundAmount <= 0) {
      return;
    }
    await this.addCoins(userId, refundAmount, description);
    console.log(`Refunded ${refundAmount} coins to user ${userId}: ${description}`);
  }

  cleanup(userId: string): void {
    const unsubscribe = this.listeners.get(userId);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(userId);
    }
  }
}

export const economyService = new EconomyService();
export { ECONOMY_RATES };