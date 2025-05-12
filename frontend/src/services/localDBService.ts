interface Pixel {
  x: number;
  y: number;
  color: string;
  timestamp?: number;
}

const DB_NAME = 'dotVerse';
const STORE_NAME = 'pixels';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

export const openLocalDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve();
      return;
    }
    
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        console.error('Error opening local database:', event);
        reject(new Error('Failed to open local database'));
      };
      
      request.onsuccess = (event) => {
        db = (event.target as IDBOpenDBRequest).result;
        console.log('Local database opened successfully');
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;
        
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('position', ['x', 'y'], { unique: true });
        }
      };
    } catch (error) {
      console.error('Error initializing local database:', error);
      reject(error);
    }
  });
};

export const storePixelUpdates = async (pixels: Pixel[]): Promise<void> => {
  if (!db) {
    console.warn('Local database not initialized');
    return;
  }
  
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      let completedOps = 0;
      const totalOps = pixels.length;
      
      pixels.forEach(pixel => {
        try {
          const id = `${pixel.x}:${pixel.y}`;
          
          const pixelWithId = {
            id: id, 
            x: pixel.x,
            y: pixel.y,
            color: pixel.color,
            timestamp: pixel.timestamp || Date.now()
          };
          
          const putRequest = store.put(pixelWithId);
          
          putRequest.onsuccess = () => {
            completedOps++;
            if (completedOps === totalOps) {
              resolve();
            }
          };
          
          putRequest.onerror = (event) => {
            console.error(`Error putting pixel at ${pixel.x},${pixel.y}:`, event);
            completedOps++;
            if (completedOps === totalOps) {
              resolve();
            }
          };
        } catch (putError) {
          console.error('Error in put operation:', putError);
          completedOps++;
          if (completedOps === totalOps) {
            resolve();
          }
        }
      });
      
      if (pixels.length === 0) {
        resolve();
      }
      
      transaction.oncomplete = () => {
        resolve();
      };
      
      transaction.onerror = (event) => {
        console.error('Transaction error in storePixelUpdates:', event);
        resolve();
      };
    } catch (error) {
      console.error('Error in storePixelUpdates:', error);
      resolve();
    }
  });
};
export const getLocalGrid = async (): Promise<string[][] | null> => {
  if (!db) {
    console.warn('Local database not initialized');
    return null;
  }
  
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const pixels = request.result;
        
        if (!pixels || pixels.length === 0) {
          resolve(null);
          return;
        }
        
        let maxX = 0, maxY = 0;
        
        pixels.forEach(pixel => {
          if (typeof pixel.x === 'number' && typeof pixel.y === 'number') {
            maxX = Math.max(maxX, pixel.x);
            maxY = Math.max(maxY, pixel.y);
          }
        });
        
        const gridSize = Math.max(100, Math.max(maxX, maxY) + 1);
        
        const grid = Array(gridSize).fill(0).map(() => Array(gridSize).fill("#ffffff"));
        
        pixels.forEach(pixel => {
          if (typeof pixel.x === 'number' && typeof pixel.y === 'number' &&
              pixel.x < gridSize && pixel.y < gridSize && 
              typeof pixel.color === 'string') {
            grid[pixel.y][pixel.x] = pixel.color;
          }
        });
        
        resolve(grid);
      };
      
      request.onerror = (event) => {
        console.error('Error getting grid from IndexedDB:', event);
        reject(new Error('Failed to get grid from local database'));
      };
    } catch (error) {
      console.error('Error in getLocalGrid:', error);
      reject(error);
    }
  });
};

export const clearLocalGrid = async (): Promise<void> => {
  if (!db) {
    console.warn('Local database not initialized');
    return;
  }
  
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      
      request.onsuccess = () => {
        console.log('Local grid data cleared');
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('Error clearing local grid data:', event);
        // Don't reject on error, just log it
        resolve();
      };
      
      transaction.oncomplete = () => {
        resolve();
      };
      
      transaction.onerror = (event) => {
        console.error('Transaction error in clearLocalGrid:', event);
        resolve();
      };
    } catch (error) {
      console.error('Error in clearLocalGrid:', error);
      resolve();
    }
  });
};
export const closeLocalDB = (): void => {
  if (db) {
    db.close();
    db = null;
    console.log('Local database connection closed');
  }
};
