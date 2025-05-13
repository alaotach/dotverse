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
    console.warn('Local database not initialized. Cannot store pixel updates.');
    return;
  }
  if (!pixels || pixels.length === 0) {
    return; 
  }

  let transaction: IDBTransaction | null = null;
  try {
    transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const putOperations: Promise<void>[] = pixels.map(pixel => {
      if (pixel === null || typeof pixel !== 'object') {
        console.warn('storePixelUpdates: Invalid pixel data (null or not an object), skipping:', JSON.stringify(pixel));
        return Promise.resolve(); 
      }
      if (typeof pixel.x !== 'number' || isNaN(pixel.x)) {
        console.warn('storePixelUpdates: Invalid pixel.x (not a number or NaN), skipping pixel:', JSON.stringify(pixel));
        return Promise.resolve();
      }
      if (typeof pixel.y !== 'number' || isNaN(pixel.y)) {
        console.warn('storePixelUpdates: Invalid pixel.y (not a number or NaN), skipping pixel:', JSON.stringify(pixel));
        return Promise.resolve();
      }
      if (typeof pixel.color !== 'string') {
        console.warn('storePixelUpdates: Invalid pixel.color (not a string), skipping pixel:', JSON.stringify(pixel));
        return Promise.resolve();
      }

      const generatedId = `${pixel.x}:${pixel.y}`;

      const objectToStore: { id: string; x: number; y: number; color: string; timestamp: number } = {
        id: generatedId,
        x: pixel.x,
        y: pixel.y,
        color: pixel.color,
        timestamp: (typeof pixel.timestamp === 'number' && !isNaN(pixel.timestamp)) ? pixel.timestamp : Date.now(),
      };

      if (typeof objectToStore.id !== 'string' || objectToStore.id === undefined) {
          console.error(
            'storePixelUpdates: CRITICAL PRE-FLIGHT CHECK FAILED - objectToStore.id is invalid before put.',
            `Generated ID was: '${generatedId}'. objectToStore.id is: '${objectToStore.id}'.`,
            'Full objectToStore:', JSON.stringify(objectToStore),
            'Original pixel:', JSON.stringify(pixel)
          );
          return Promise.reject(new Error(`Invalid 'id' property on object for IndexedDB keyPath: value was ${objectToStore.id}`));
      }
      
      const finalObjectForPut = { ...objectToStore };

      return new Promise<void>((resolveRequest, rejectRequest) => {
        try {
          const request = store.put(finalObjectForPut);
          
          request.onsuccess = () => resolveRequest();
          request.onerror = (event) => {
            const error = (event.target as IDBRequest).error;
            console.error(
              `storePixelUpdates: IDBRequest failed for id '${finalObjectForPut.id}'. Error: ${error?.name} - ${error?.message}`,
              'Object attempted:', JSON.stringify(finalObjectForPut)
            );
            rejectRequest(error);
          };
        } catch (e: any) { 
          console.error(
            `storePixelUpdates: Synchronous error during store.put() for id '${finalObjectForPut.id}'. Error: ${e?.name} - ${e?.message}`, e,
            'Object attempted:', JSON.stringify(finalObjectForPut)
          );
          rejectRequest(e);
        }
      });
    });

    await Promise.all(putOperations);

    return new Promise<void>((resolve, reject) => {
      if (transaction) {
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = (event) => {
          const error = (event.target as IDBTransaction).error;
          console.error('storePixelUpdates: Transaction failed:', error?.name, error?.message);
          reject(error);
        };
      } else {
        console.warn("storePixelUpdates: Transaction was null after map operations, resolving.");
        resolve();
      }
    });

  } catch (error: any) {
    console.error('storePixelUpdates: Error during pixel storage process:', error?.name, error?.message, error);
    if (transaction && transaction.error === null && transaction.readyState !== "done") {
        try {
            transaction.abort();
            console.log("storePixelUpdates: Transaction aborted due to error.");
        } catch (abortError: any) {
            console.error('storePixelUpdates: Error aborting transaction:', abortError?.name, abortError?.message);
        }
    }
    throw error; 
  }
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
