import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { fs } from '../firebaseClient';
import { auctionService } from './auctionService';

class AuctionCleanupService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 60000;

  start() {
    if (this.intervalId) return;

    console.log('Starting auction cleanup service');
    this.intervalId = setInterval(() => {
      this.checkExpiredAuctions();
    }, this.CHECK_INTERVAL);

    this.checkExpiredAuctions();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Stopped auction cleanup service');
    }
  }

  private async checkExpiredAuctions() {
    try {
      const now = Timestamp.now();
      const expiredAuctionsQuery = query(
        collection(fs, 'auctions'),
        where('status', '==', 'active'),
        where('endTime', '<=', now)
      );

      const querySnapshot = await getDocs(expiredAuctionsQuery);
      
      for (const doc of querySnapshot.docs) {
        try {
          await auctionService.processAuctionEnd(doc.id);
          console.log(`Processed expired auction: ${doc.id}`);
        } catch (error) {
          console.error(`Failed to process auction ${doc.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error checking expired auctions:', error);
    }
  }
}

export const auctionCleanupService = new AuctionCleanupService();