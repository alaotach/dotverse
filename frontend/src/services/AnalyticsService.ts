import { collection, addDoc, doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { fs } from '../firebaseClient';
import { useAuth } from '../context/AuthContext';

interface AnalyticsEvent {
  type: 'pixel_placed' | 'land_claimed' | 'user_login' | 'session_start' | 'session_end';
  userId: string;
  userDisplayName?: string;
  metadata?: Record<string, any>;
  timestamp?: any;
}

class AnalyticsService {
  private sessionStartTime: number | null = null;

  async trackEvent(event: AnalyticsEvent) {
    try {
      await addDoc(collection(fs, 'pixelActivity'), {
        ...event,
        timestamp: serverTimestamp()
      });

      if (event.type === 'pixel_placed') {
        await this.incrementUserStat(event.userId, 'pixelsPlaced');
      }

      console.log('Analytics event tracked:', event.type);
    } catch (error) {
      console.error('Failed to track analytics event:', error);
    }
  }

  async trackPixelPlacement(userId: string, userDisplayName: string, x: number, y: number, color: string) {
    await this.trackEvent({
      type: 'pixel_placed',
      userId,
      userDisplayName,
      metadata: { x, y, color }
    });
  }

  async trackLandClaim(userId: string, userDisplayName: string, centerX: number, centerY: number) {
    await this.trackEvent({
      type: 'land_claimed',
      userId,
      userDisplayName,
      metadata: { centerX, centerY }
    });
  }

  async trackUserLogin(userId: string, userDisplayName: string) {
    await this.trackEvent({
      type: 'user_login',
      userId,
      userDisplayName
    });

    try {
      const userRef = doc(fs, 'users', userId);
      await updateDoc(userRef, {
        lastActive: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update user last active:', error);
    }
  }

  startSession(userId: string) {
    this.sessionStartTime = Date.now();
    this.trackEvent({
      type: 'session_start',
      userId
    });
  }

  async endSession(userId: string) {
    if (this.sessionStartTime) {
      const sessionDuration = Date.now() - this.sessionStartTime;
      await this.trackEvent({
        type: 'session_end',
        userId,
        metadata: { duration: sessionDuration }
      });

      try {
        const userRef = doc(fs, 'users', userId);
        await updateDoc(userRef, {
          totalSessionTime: increment(sessionDuration)
        });
      } catch (error) {
        console.error('Failed to update user session time:', error);
      }

      this.sessionStartTime = null;
    }
  }

  private async incrementUserStat(userId: string, field: string) {
    try {
      const userRef = doc(fs, 'users', userId);
      await updateDoc(userRef, {
        [field]: increment(1)
      });
    } catch (error) {
      console.error(`Failed to increment user ${field}:`, error);
    }
  }

  async getDashboardStats() {
    return {
      totalUsers: 0,
      activeUsers: 0,
      totalPixelsPlaced: 0,
      pixelsPlacedToday: 0,
      totalLandsClaimed: 0
    };
  }
}

export const analyticsService = new AnalyticsService();

export const useAnalytics = () => {
  const { currentUser, userProfile } = useAuth();

  const trackPixel = async (x: number, y: number, color: string) => {
    if (currentUser && userProfile) {
      await analyticsService.trackPixelPlacement(
        currentUser.uid,
        userProfile.displayName || userProfile.email || 'Unknown',
        x,
        y,
        color
      );
    }
  };

  const trackLogin = async () => {
    if (currentUser && userProfile) {
      await analyticsService.trackUserLogin(
        currentUser.uid,
        userProfile.displayName || userProfile.email || 'Unknown'
      );
    }
  };

  return {
    trackPixel,
    trackLogin,
    startSession: (userId: string) => analyticsService.startSession(userId),
    endSession: (userId: string) => analyticsService.endSession(userId)
  };
};