import { set, ref as dbRef, update } from 'firebase/database';
import { 
  doc, 
  updateDoc,
  setDoc, 
  writeBatch, 
  collection, 
  getDocs, 
  deleteDoc 
} from 'firebase/firestore';
import { db, fs } from '../firebaseClient';
import { openDB, IDBPDatabase } from 'idb';

const OFFLINE_QUEUE_KEY = 'dotverse_offline_queue';
const QUOTA_INFO_KEY = 'dotverse_quota_info';
const DEFAULT_DAILY_QUOTA = 20000;
const QUOTA_RESET_HOUR_UTC = 0;

const LOCAL_STORAGE_KEY = 'dotverse_operations_quota';
const QUOTA_RESET_INTERVAL_MS = 60 * 60 * 1000;
const MAX_OPERATIONS_PER_HOUR = 10000;
const OFFLINE_QUEUE_SIZE_LIMIT = 1000;
const MAX_BATCH_SIZE = 500;

interface OfflineOperation {
  id: string;
  path: string;
  type: 'set' | 'update' | 'delete';
  data?: any;
  timestamp: number;
  retryCount: number;
}

interface QuotaState {
  operations: number;
  lastReset: number;
}

let offlineDB: IDBPDatabase | null = null;

const initOfflineDB = async (): Promise<void> => {
  try {
    offlineDB = await openDB('dotverse-offline', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('operations')) {
          const store = db.createObjectStore('operations', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
        }
      }
    });
    console.log('Offline operations database initialized');
  } catch (error) {
    console.error('Failed to initialize offline database:', error);
  }
};

initOfflineDB();


interface WriteOperation {
  path: string;  
  type: 'set' | 'update' | 'delete';
  data?: any;
}

interface QuotaInfo {
  writesToday: number;
  lastResetTimestamp: number;
  dailyQuota: number;
}

class QuotaManager {
  private dailyQuotaLimit = 20000;
  private usedQuota = 0;
  private quotaResetTime: Date | null = null;

  private offlineQueue: QueuedOperation[] = [];
  private quotaInfo: QuotaInfo;
  private isOnline: boolean = navigator.onLine;
  private syncTimeout: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 5000;

  constructor() {
    this.initQuotaTracking();
    this.loadOfflineQueue();
    this.quotaInfo = this.loadQuotaInfo();
    this.checkAndResetQuota();
    this.initializeEventListeners();
  }

  private initQuotaTracking() {
    const storedQuota = localStorage.getItem('quota_used');
    const storedResetTime = localStorage.getItem('quota_reset_time');
    
    if (storedQuota && storedResetTime) {
      const resetTime = new Date(storedResetTime);
      const now = new Date();
      
      if (now > resetTime) {
        this.resetQuota();
      } else {
        this.usedQuota = parseInt(storedQuota, 10);
        this.quotaResetTime = resetTime;
      }
    } else {
      this.resetQuota();
    }
    
    setInterval(() => this.checkQuotaReset(), 1000 * 60 * 60);
  }

  private checkQuotaReset() {
    if (this.quotaResetTime && new Date() > this.quotaResetTime) {
      this.resetQuota();
    }
  }

  private resetQuota() {
    this.usedQuota = 0;
    
    const now = new Date();
    this.quotaResetTime = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0
      )
    );
    
    localStorage.setItem('quota_used', '0');
    localStorage.setItem('quota_reset_time', this.quotaResetTime.toISOString());
    
    console.log(`Quota reset. Next reset at: ${this.quotaResetTime}`);
  }

  public setDailyQuotaLimit(limit: number) {
    this.dailyQuotaLimit = limit;
  }

  public getQuotaStatus() {
    return {
      used: this.usedQuota,
      total: this.dailyQuotaLimit,
      percentUsed: (this.usedQuota / this.dailyQuotaLimit) * 100,
      nextReset: this.quotaResetTime
    };
  }

  private recordUsage(operationCount: number) {
    this.usedQuota += operationCount;
    localStorage.setItem('quota_used', this.usedQuota.toString());
  }

  public async safeWrite(operation: WriteOperation): Promise<void> {
    if (this.usedQuota > this.dailyQuotaLimit * 0.9) {
      console.warn(`Approaching Firestore quota limit: ${this.usedQuota}/${this.dailyQuotaLimit}`);
      
      if (this.usedQuota >= this.dailyQuotaLimit) {
        throw new Error('Daily Firestore write quota exceeded. Try again after reset.');
      }
    }
    const estimatedOperations = 1;
    
    this.recordUsage(estimatedOperations);
    
    return Promise.resolve();
  }

  private initializeEventListeners() {
    window.addEventListener('online', this.handleOnlineStatus);
    window.addEventListener('offline', this.handleOfflineStatus);
  }

  private loadOfflineQueue() {
    try {
      const storedQueue = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (storedQueue) {
        this.offlineQueue = JSON.parse(storedQueue);
      }
    } catch (error) {
      console.error("Error loading offline queue from localStorage:", error);
      this.offlineQueue = [];
    }
  }

  private saveOfflineQueue() {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.offlineQueue));
    } catch (error) {
      console.error("Error saving offline queue to localStorage:", error);
    }
  }

  private loadQuotaInfo(): QuotaInfo {
    try {
      const storedInfo = localStorage.getItem(QUOTA_INFO_KEY);
      if (storedInfo) {
        const parsedInfo = JSON.parse(storedInfo);
        return {
          ...parsedInfo,
          dailyQuota: parsedInfo.dailyQuota || DEFAULT_DAILY_QUOTA
        };
      }
    } catch (error) {
      console.error("Error loading quota info from localStorage:", error);
    }
    return {
      writesToday: 0,
      lastResetTimestamp: Date.now(),
      dailyQuota: DEFAULT_DAILY_QUOTA,
    };
  }

  private saveQuotaInfo() {
    try {
      localStorage.setItem(QUOTA_INFO_KEY, JSON.stringify(this.quotaInfo));
    } catch (error) {
      console.error("Error saving quota info to localStorage:", error);
    }
  }

  private checkAndResetQuota() {
    const now = new Date();
    const lastReset = new Date(this.quotaInfo.lastResetTimestamp);

    if (
      now.getUTCDate() !== lastReset.getUTCDate() ||
      now.getUTCMonth() !== lastReset.getUTCMonth() ||
      now.getUTCFullYear() !== lastReset.getUTCFullYear()
    ) {
      if (now.getUTCHours() >= QUOTA_RESET_HOUR_UTC) {
        console.log("Daily quota reset.");
        this.quotaInfo.writesToday = 0;
        this.quotaInfo.lastResetTimestamp = now.getTime();
        this.saveQuotaInfo();
      }
    }
  }

  private hasQuota(numWrites: number = 1): boolean {
    this.checkAndResetQuota();
    return this.quotaInfo.writesToday + numWrites <= this.quotaInfo.dailyQuota;
  }

  private incrementQuotaUsage(numWrites: number = 1) {
    this.quotaInfo.writesToday += numWrites;
    this.saveQuotaInfo();
  }

  public getQuotaStatus() {
    this.checkAndResetQuota();
    return {
      used: this.quotaInfo.writesToday,
      total: this.quotaInfo.dailyQuota,
      percentUsed: (this.quotaInfo.writesToday / this.quotaInfo.dailyQuota) * 100,
    };
  }

  public async safeWrite(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    const opId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const queuedOp: QueuedOperation = { ...operation, id: opId, timestamp: Date.now(), retries: 0 };

    const writeCost = operation.type === 'batch' && operation.operations ? operation.operations.length : 1;

    if (this.isOnline && this.hasQuota(writeCost)) {
      try {
        await this.executeOperation(queuedOp);
        this.incrementQuotaUsage(writeCost);
        console.log(`Operation ${opId} executed successfully online.`);
      } catch (error) {
        console.error(`Online execution of ${opId} failed, queueing:`, error);
        this.enqueueOperation(queuedOp);
      }
    } else {
      if (!this.isOnline) console.log(`App is offline. Operation ${opId} queued.`);
      else console.log(`Quota exceeded or app offline. Operation ${opId} queued.`);
      this.enqueueOperation(queuedOp);
    }
  }

  private enqueueOperation(operation: QueuedOperation) {
    this.offlineQueue.push(operation);
    this.saveOfflineQueue();
  }

  private async executeOperation(operation: QueuedOperation): Promise<void> {
    const { type, path, data } = operation;
    const isFirestorePath = path.startsWith('firestore/');
    const actualPath = isFirestorePath ? path.substring('firestore/'.length) : path;

    console.log(`[QuotaManager] executeOperation: Attempting ${type} on ${path}`);
    try {
      if (isFirestorePath) {
        const pathSegments = actualPath.split('/');
        if (pathSegments.length < 1) throw new Error("Invalid Firestore path structure");
        
        const docRef = doc(fs, actualPath);

        if (type === 'set') await setDoc(docRef, data, { merge: true });
        else if (type === 'update') await setDoc(docRef, data, { merge: true }); 
        else if (type === 'delete') await deleteDoc(docRef);
        else if (type === 'batch' && operation.operations) {
          const batch = writeBatch(fs);
          operation.operations.forEach(op => {
            const batchDocRef = doc(fs, op.path);
            if (op.type === 'set') batch.set(batchDocRef, op.data, { merge: true }); 
            else if (op.type === 'update') batch.set(batchDocRef, op.data, { merge: true });
            else if (op.type === 'delete') batch.delete(batchDocRef);
          });
          await batch.commit();
        }
        else throw new Error(`Unsupported Firestore operation type: ${type}`);
        console.log(`[QuotaManager] executeOperation: Firestore ${type} on ${path} successful.`);
      } else {
        const dbRef = ref(db, actualPath);
        
        if (type === 'set') await set(dbRef, data);
        else if (type === 'update') await update(dbRef, data);
        else if (type === 'delete') await remove(dbRef);
        else throw new Error(`Unsupported Realtime Database operation type: ${type}`);
        console.log(`[QuotaManager] executeOperation: RTDB ${type} on ${path} successful.`);
      }
    } catch (error: any) {
      console.error(`[QuotaManager] executeOperation: Error during ${type} on ${path}:`, error);
      if (error?.code === 'not-found' && type === 'update') {
        console.warn(`[QuotaManager] Document at ${actualPath} not found for update, trying set with merge instead`);
        try {
          if (isFirestorePath) {
            const docRef = doc(fs, actualPath);
            await setDoc(docRef, data, { merge: true });
            console.log(`[QuotaManager] executeOperation: Fallback Firestore set on ${path} successful.`);
          } else {
            const dbRef = ref(db, actualPath);
            await set(dbRef, data);
            console.log(`[QuotaManager] executeOperation: Fallback RTDB set on ${path} successful.`);
          }
        } catch (fallbackError) {
          console.error(`[QuotaManager] Fallback operation also failed:`, fallbackError);
          throw fallbackError; 
        }
      } else {
        throw error;
      }
    }
  }

  public async syncOfflineQueue(): Promise<void> {
    if (!this.isOnline || this.offlineQueue.length === 0) {
      if (!this.isOnline) console.log("Sync skipped: App is offline.");
      if (this.offlineQueue.length === 0) console.log("Sync skipped: Offline queue is empty.");
      return;
    }

    console.log(`Attempting to sync ${this.offlineQueue.length} offline operations.`);
    
    const queueToProcess = [...this.offlineQueue];
    this.offlineQueue = []; 

    for (const operation of queueToProcess) {
      const writeCost = operation.type === 'batch' && operation.operations ? operation.operations.length : 1;
      if (this.hasQuota(writeCost)) {
        try {
          await this.executeOperation(operation);
          this.incrementQuotaUsage(writeCost);
          console.log(`Offline operation ${operation.id} synced successfully.`);
        } catch (error) {
          console.error(`Failed to sync operation ${operation.id}, re-queueing:`, error);
          operation.retries = (operation.retries || 0) + 1;
          if (operation.retries <= this.MAX_RETRIES) {
            this.offlineQueue.push(operation); // Re-add to front for retry later if needed
          } else {
            console.error(`Operation ${operation.id} failed after ${this.MAX_RETRIES} retries. Discarding.`);
          }
        }
      } else {
        console.log(`Quota insufficient to sync operation ${operation.id}. Re-queueing.`);
        this.offlineQueue.push(operation);
      }
    }
    this.offlineQueue.sort((a,b) => a.timestamp - b.timestamp);
    this.saveOfflineQueue();

    if (this.offlineQueue.length > 0) {
      console.log(`${this.offlineQueue.length} operations remain in queue after sync attempt.`);
      if (this.syncTimeout) clearTimeout(this.syncTimeout);
      this.syncTimeout = setTimeout(() => this.syncOfflineQueue(), this.RETRY_DELAY_MS);
    } else {
      console.log("Offline queue fully synced.");
    }
  }

  
  private handleOnlineStatus = async () => {
    console.log("Application is now online. Attempting to sync offline queue.");
    this.isOnline = true;
    if (this.syncTimeout) clearTimeout(this.syncTimeout); 
    await this.syncOfflineQueue(); 
  };

  private handleOfflineStatus = () => {
    console.log("Application is now offline.");
    this.isOnline = false;
  };

  public cleanup() {
    window.removeEventListener('online', this.handleOnlineStatus);
    window.removeEventListener('offline', this.handleOfflineStatus);
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.saveOfflineQueue(); 
    this.saveQuotaInfo();
  }
}

export const quotaManager = new QuotaManager();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    quotaManager.syncOfflineQueue();
  }
});