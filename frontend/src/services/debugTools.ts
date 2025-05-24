
type ErrorLogEntry = {
  timestamp: number;
  message: string;
  code?: string;
  path?: string;
  operation?: string;
  stack?: string;
};

class FirestoreDebugger {
  private static instance: FirestoreDebugger;
  private errorLog: ErrorLogEntry[] = [];
  private MAX_LOG_ENTRIES = 100;
  private connectionState: 'online' | 'offline' | 'error' = 'online';
  private listeners: ((state: string, errors: ErrorLogEntry[]) => void)[] = [];

  private constructor() {
    window.addEventListener('online', () => {
      this.setConnectionState('online');
    });
    
    window.addEventListener('offline', () => {
      this.setConnectionState('offline');
    });
  }

  public static getInstance() {
    if (!FirestoreDebugger.instance) {
      FirestoreDebugger.instance = new FirestoreDebugger();
    }
    return FirestoreDebugger.instance;
  }

  public logError(error: any, path?: string, operation?: string) {
    const entry: ErrorLogEntry = {
      timestamp: Date.now(),
      message: error?.message || String(error),
      code: error?.code,
      path,
      operation,
      stack: error?.stack
    };

    this.errorLog.unshift(entry);
    if (this.errorLog.length > this.MAX_LOG_ENTRIES) {
      this.errorLog = this.errorLog.slice(0, this.MAX_LOG_ENTRIES);
    }

    console.error(`Firestore error: ${entry.message}`, {
      code: entry.code,
      path: entry.path,
      operation: entry.operation,
      timestamp: new Date(entry.timestamp).toISOString()
    });

    this.setConnectionState('error');

    this.notifyListeners();

    return entry;
  }

  public getErrorLog(): ErrorLogEntry[] {
    return [...this.errorLog];
  }

  public clearErrorLog() {
    this.errorLog = [];
    this.notifyListeners();
  }

  public getConnectionState(): string {
    return this.connectionState;
  }

  private setConnectionState(state: 'online' | 'offline' | 'error') {
    this.connectionState = state;
    this.notifyListeners();
  }

  public addListener(callback: (state: string, errors: ErrorLogEntry[]) => void) {
    this.listeners.push(callback);
  }

  public removeListener(callback: (state: string, errors: ErrorLogEntry[]) => void) {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.connectionState, this.getErrorLog());
      } catch (error) {
        console.error('Error in FirestoreDebugger listener:', error);
      }
    });
  }


  public static isMissingDocError(error: any): boolean {
    if (!error) return false;
    
    return (
      error?.code === 'not-found' || 
      error?.message?.includes('No document to update') ||
      error?.message?.includes('no document to update') ||
      error?.message?.includes('NOT_FOUND') ||
      error?.message?.includes('document does not exist')
    );
  }
  

  public static isNetworkError(error: any): boolean {
    if (!error) return false;
    
    return (
      error?.code === 'unavailable' ||
      error?.code === 'network-request-failed' ||
      error?.message?.includes('network') ||
      error?.message?.includes('unavailable') ||
      error?.message?.includes('failed to fetch') ||
      error?.message?.includes('UNAVAILABLE') ||
      error?.message?.includes('Bad Request')
    );
  }
}

export const firestoreDebugger = {
  logError: (error: any, path: string, operation: string) => {
    console.error(`Firestore error in ${operation} at path ${path}:`, error);
    
    if (error && error.code) {
      if (error.code === 'not-found') {
        console.warn('Document not found error - this might be expected for new chunks');
        return true;
      }
      if (error.code === 'permission-denied') {
        console.error('Permission denied error - check security rules');
      }
      if (error.code === 'unavailable') {
        console.error('Network connection is unavailable - local changes will be lost');
      }
    }
    return false;
  }
};

export const isMissingDocError = (error: any): boolean => {
  return error && 
    (error.code === 'not-found' || 
     (error.message && error.message.includes('No document to update')));
};

export const isNetworkError = (error: any): boolean => {
  return error && 
    (error.code === 'unavailable' || 
     error.code === 'network-request-failed' ||
     (error.message && (
       error.message.includes('network') || 
       error.message.includes('offline') ||
       error.message.includes('unavailable')
     )));
};
