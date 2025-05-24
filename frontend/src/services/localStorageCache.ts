
import { openDB } from 'idb';

interface CacheItem {
  key: string;
  value: any;
  timestamp: number;
}
let db: Promise<IDBDatabase> | null = null;
const initDB = async (): Promise<IDBDatabase> => {
  if (!db) {
    db = new Promise((resolve, reject) => {
      const request = indexedDB.open('dotverse-cache', 1);
      
      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;
        
        if (!database.objectStoreNames.contains('pixels')) {
          const store = database.createObjectStore('pixels', { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      
      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };
      
      request.onerror = (event) => {
        console.error('Error opening IndexedDB:', event);
        reject(new Error('Failed to open IndexedDB'));
      };
    });
  }
  
  return db;
};

export const getLocalCacheItem = async (key: string): Promise<any | null> => {
  try {
    const database = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('pixels', 'readonly');
      const store = transaction.objectStore('pixels');
      const request = store.get(key);
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.value);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = (event) => {
        console.error('Error reading from cache:', event);
        reject(new Error('Failed to read from cache'));
      };
    });
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
};

export const getLocalCache = async (): Promise<Map<string, any> | null> => {
  try {
    const database = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('pixels', 'readonly');
      const store = transaction.objectStore('pixels');
      const request = store.getAll();
      
      request.onsuccess = () => {
        if (request.result) {
          const cacheMap = new Map<string, any>();
          request.result.forEach((item: CacheItem) => {
            cacheMap.set(item.key, item.value);
          });
          resolve(cacheMap);
        } else {
          resolve(new Map());
        }
      };
      
      request.onerror = (event) => {
        console.error('Error reading cache:', event);
        reject(new Error('Failed to read cache'));
      };
    });
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
};

export const updateLocalCache = async (items: CacheItem[]): Promise<void> => {
  if (!items.length) return;
  
  try {
    const database = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('pixels', 'readwrite');
      const store = transaction.objectStore('pixels');
      
      let completed = 0;
      let errors = 0;
      
      items.forEach(item => {
        const request = store.put(item);
        
        request.onsuccess = () => {
          completed++;
          if (completed + errors === items.length) {
            if (errors > 0) {
              reject(new Error(`${errors} items failed to update in cache`));
            } else {
              resolve();
            }
          }
        };
        
        request.onerror = (event) => {
          console.error('Error updating cache item:', event, item);
          errors++;
          if (completed + errors === items.length) {
            reject(new Error(`${errors} items failed to update in cache`));
          }
        };
      });
      
      transaction.oncomplete = () => {
        resolve();
      };
      
      transaction.onerror = (event) => {
        console.error('Transaction error:', event);
        reject(new Error('Transaction failed'));
      };
    });
  } catch (error) {
    console.error('Cache update error:', error);
    throw error;
  }
};
export const clearLocalCache = async (): Promise<void> => {
  try {
    const database = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('pixels', 'readwrite');
      const store = transaction.objectStore('pixels');
      const request = store.clear();
      
      request.onsuccess = () => {
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('Error clearing cache:', event);
        reject(new Error('Failed to clear cache'));
      };
    });
  } catch (error) {
    console.error('Cache clear error:', error);
    throw error;
  }
};
