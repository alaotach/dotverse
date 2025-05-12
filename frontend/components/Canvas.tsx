import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { db } from "../src/firebaseClient";
import { ref, onValue, set, update, get } from "firebase/database";
import websocketService from "../src/services/websocketService";
import { openLocalDB, storePixelUpdates, getLocalGrid, clearLocalGrid } from "../src/services/localDBService";

const GRID_SIZE = 100;
const COOLDOWN_SECONDS = 0;
const PIXELS_PATH = "pixels"; // Firebase data path

// Performance optimization: use a constant for calculation
const CELL_SIZE = 10;

// Define the chunk size for progressive loading and updates
const CHUNK_SIZE = 25; // Split the grid into 16 chunks (4x4)
const BATCH_SIZE = 1000; // Maximum number of pixels to update in a single Firebase operation
const UPDATE_BATCH_INTERVAL = 100; // Milliseconds between batch updates to Firebase
const SYNC_THROTTLE_MS = 5000; // Minimum time between full syncs

// Generate initial grid once, outside component to avoid re-creation
const generateInitialGrid = () => {
  return Array(GRID_SIZE)
    .fill(null)
    .map(() => Array(GRID_SIZE).fill("#ffffff"));
};

// Initialize empty grid outside component
const emptyGrid = generateInitialGrid();

// Throttle function to limit update frequency
const throttle = (func: Function, limit: number) => {
  let inThrottle: boolean = false;
  return function(...args: any[]) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

interface Pixel {
  x: number;
  y: number;
  color: string;
  timestamp?: number;
  clientId?: string;
}

// Unique client identifier for tracking local changes
const CLIENT_ID = `client_${Math.random().toString(36).substring(2, 15)}`;

// Create a more efficient pixel update batch manager
class PixelUpdateManager {
  private updateQueue: Pixel[] = [];
  private processingQueue = false;
  private updateCallback: (pixels: Pixel[]) => Promise<boolean>;
  private batchInterval: number;
  private batchTimer: NodeJS.Timeout | null = null;
  
  constructor(updateCallback: (pixels: Pixel[]) => Promise<boolean>, batchInterval: number = UPDATE_BATCH_INTERVAL) {
    this.updateCallback = updateCallback;
    this.batchInterval = batchInterval;
  }
  
  addUpdate(pixel: Pixel) {
    // Remove any existing updates for the same pixel in the queue
    this.updateQueue = this.updateQueue.filter(p => !(p.x === pixel.x && p.y === pixel.y));
    
    // Add new update
    this.updateQueue.push(pixel);
    
    // Start processing if not already running
    if (!this.processingQueue) {
      this.processBatch();
    }
  }
  
  addUpdates(pixels: Pixel[]) {
    // Filter out duplicates by using a Map keyed by x:y coordinates
    const pixelMap = new Map<string, Pixel>();
    
    // First, add existing queue items that don't clash with new updates
    this.updateQueue.forEach(pixel => {
      const key = `${pixel.x}:${pixel.y}`;
      if (!pixelMap.has(key)) {
        pixelMap.set(key, pixel);
      }
    });
    
    // Then add all new pixels, overwriting any that clash
    pixels.forEach(pixel => {
      pixelMap.set(`${pixel.x}:${pixel.y}`, pixel);
    });
    
    // Convert back to array
    this.updateQueue = Array.from(pixelMap.values());
    
    // Start processing if not already running
    if (!this.processingQueue) {
      this.processBatch();
    }
  }
  
  private async processBatch() {
    this.processingQueue = true;
    
    if (this.updateQueue.length === 0) {
      this.processingQueue = false;
      return;
    }
    
    // Schedule the next batch
    this.batchTimer = setTimeout(async () => {
      const batch = this.updateQueue.splice(0, BATCH_SIZE);
      
      if (batch.length > 0) {
        try {
          await this.updateCallback(batch);
        } catch (error) {
          console.error("Failed to update pixel batch:", error);
          // Re-add failed batch to queue for retry
          this.updateQueue = [...batch, ...this.updateQueue];
        }
      }
      
      if (this.updateQueue.length > 0) {
        // Continue processing if there are more updates
        this.processBatch();
      } else {
        this.processingQueue = false;
      }
    }, this.batchInterval);
  }
  
  clear() {
    this.updateQueue = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.processingQueue = false;
  }
}

export default function Canvas() {
  const [grid, setGrid] = useState<string[][]>(() => {
    return JSON.parse(JSON.stringify(emptyGrid)); // Deep clone
  });
  const [lastPlaced, setLastPlaced] = useState<number>(0);
  const [selectedColor, setSelectedColor] = useState<string>("#000000");
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const [pendingPixelCount, setPendingPixelCount] = useState<number>(0);
  
  // Use refs for values that don't need to trigger re-renders
  const lastPaintedCellRef = useRef<{ x: number; y: number } | null>(null);
  const localUpdateInProgressRef = useRef<boolean>(false);
  const gridRef = useRef<string[][]>(grid);
  const pendingUpdatesRef = useRef<Map<string, Pixel>>(new Map());
  const updateManager = useRef<PixelUpdateManager | null>(null);
  const visibleChunkRef = useRef<{startX: number, endX: number, startY: number, endY: number} | null>(null);
  const loadedChunksRef = useRef<Set<string>>(new Set());
  
  // Add state to track if initial data has been loaded
  const initialDataLoadedRef = useRef<boolean>(false);
  const syncInProgressRef = useRef<boolean>(false);
  // Track last sync request time to prevent overlapping syncs
  const lastSyncRequestTimeRef = useRef<number>(0);
  // Minimum time between sync requests in milliseconds
  const MIN_SYNC_INTERVAL = 5000;
  const clientIdRef = useRef<string>(CLIENT_ID);
  const isLocalDBReadyRef = useRef<boolean>(false);
  const optimisticUpdatesMapRef = useRef<Map<string, {timestamp: number, color: string}>>(new Map());
  
  // Request full sync with improved local-remote reconciliation
  // Move requestFullSync declaration before any hooks that use it
  const requestFullSync = useCallback(async () => {
    if (syncInProgressRef.current || 
        Date.now() - lastSyncRequestTimeRef.current < SYNC_THROTTLE_MS) {
      return;
    }
    
    syncInProgressRef.current = true;
    lastSyncRequestTimeRef.current = Date.now();
    
    try {
      console.log("Performing full sync from Firebase");
      
      // Don't show loading for background syncs if we already have data
      const showLoadingUI = !initialDataLoadedRef.current;
      if (showLoadingUI) setIsLoading(true);
      
      const pixelsRef = ref(db, PIXELS_PATH);
      const snapshot = await get(pixelsRef);
      
      if (snapshot.exists()) {
        const pixelData = snapshot.val();
        // Start with empty grid for consistency
        const newGrid = JSON.parse(JSON.stringify(emptyGrid)); 
        
        // Process Firebase pixels in batches
        const entries = Object.entries(pixelData);
        let pixelsToUpdateLocally: Pixel[] = [];
        
        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
          const batch = entries.slice(i, i + BATCH_SIZE);
          
          batch.forEach(([key, value]: [string, any]) => {
            const [x, y] = key.split(':').map(Number);
            if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
              // Check against our optimistic updates
              const optimisticUpdate = optimisticUpdatesMapRef.current.get(`${x}:${y}`);
              
              // Use remote data if:
              // 1. We don't have an optimistic update for this pixel, or
              // 2. The server timestamp is newer than our optimistic update
              if (!optimisticUpdate || (value.timestamp && value.timestamp > optimisticUpdate.timestamp)) {
                newGrid[y][x] = value.color;
                pixelsToUpdateLocally.push({ x, y, color: value.color });
              } else {
                // Keep our optimistic update
                newGrid[y][x] = optimisticUpdate.color;
              }
            }
          });
        }
        
        // Update the grid state
        setGrid(newGrid);
        
        // Also update local database in the background
        if (pixelsToUpdateLocally.length > 0 && isLocalDBReadyRef.current) {
          storePixelUpdates(pixelsToUpdateLocally);
        }
        
        // Update sync timestamp
        setLastSyncTime(Date.now());
      } else {
        // If there's no data, just use the empty grid
        setGrid(JSON.parse(JSON.stringify(emptyGrid)));
      }
      
      if (showLoadingUI) setIsLoading(false);
      initialDataLoadedRef.current = true;
    } catch (error) {
      console.error("Error performing full sync:", error);
      setIsLoading(false);
      
      // Even if we fail, mark as initialized to prevent getting stuck in loading
      initialDataLoadedRef.current = true;
      setGrid(JSON.parse(JSON.stringify(emptyGrid))); // Show empty grid rather than staying in loading
    } finally {
      syncInProgressRef.current = false;
    }
  }, []); // No dependencies to avoid circular references
  
  // Initialize local database - depends on requestFullSync
  useEffect(() => {
    const initLocalDB = async () => {
      try {
        await openLocalDB();
        isLocalDBReadyRef.current = true;
        console.log("Local database initialized");
        
        // Attempt to load grid from local DB first for instant startup
        const localGrid = await getLocalGrid();
        if (localGrid) {
          console.log("Loading grid from local database");
          setGrid(localGrid);
          setIsLoading(false);
          
          // Mark as initially loaded but still fetch from Firebase to ensure we're up-to-date
          initialDataLoadedRef.current = true;
          
          // Request a sync from server in the background to make sure data is fresh
          setTimeout(() => requestFullSync(), 1000);
        }
      } catch (error) {
        console.error("Failed to initialize local database:", error);
      }
    };
    
    initLocalDB();
  }, [requestFullSync]); // Now requestFullSync is defined before this useEffect

  // Keep gridRef in sync with grid state
  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);
  
  // Throttle grid updates to prevent too many re-renders
  const throttledSetGrid = useCallback(throttle((newGrid: string[][]) => {
    setGrid(newGrid);
  }, 50), []); // 50ms throttle
  
  // Performance optimization: use webworker or memo for expensive operations
  const memoizedCanPlacePixel = useCallback(() => {
    return Date.now() - lastPlaced > COOLDOWN_SECONDS * 1000;
  }, [lastPlaced]);

  // Setup WebSocket connection with improved handlers
  useEffect(() => {
    websocketService.connect();
    websocketService.onConnectionChange((connected) => {
      setWsConnected(connected);
      // Request sync immediately on reconnection, but only if initial data is already loaded
      // This prevents duplicate initial data requests
      if (connected && initialDataLoadedRef.current) {
        requestFullSync();
      }
    });
    
    // Enhance handlePixelUpdate to apply changes immediately 
    const handlePixelUpdate = (data: any) => {
      if (localUpdateInProgressRef.current) return;
      
      if (Array.isArray(data)) {
        // Filter out our own updates that we've already applied
        const externalUpdates = data.filter((pixel) => 
          pixel.clientId !== clientIdRef.current ||
          !optimisticUpdatesMapRef.current.has(`${pixel.x}:${pixel.y}`)
        );
        
        if (externalUpdates.length === 0) return;
        
        // Batch update approach for multiple pixels
        const newGrid = JSON.parse(JSON.stringify(gridRef.current));
        let hasChanges = false;
        
        for (const pixel of externalUpdates) {
          const { x, y, color } = pixel;
          if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
            if (newGrid[y][x] !== color) {
              newGrid[y][x] = color;
              hasChanges = true;
              
              // Update local database for persistence
              storePixelUpdates([{ x, y, color }]);
            }
          }
        }
        
        if (hasChanges) {
          setGrid(newGrid);
        }
      } else if (data) {
        // Skip if this is our own update that we've already applied
        if (data.clientId === clientIdRef.current && 
            optimisticUpdatesMapRef.current.has(`${data.x}:${data.y}`)) {
          return;
        }
        
        // Single pixel approach for more efficient single updates
        const { x, y, color } = data;
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE && 
            gridRef.current[y][x] !== color) {
          const newGrid = [...gridRef.current];
          newGrid[y] = [...newGrid[y]]; // Only clone the affected row
          newGrid[y][x] = color;
          setGrid(newGrid);
          
          // Update local database
          storePixelUpdates([{ x, y, color }]);
        }
      }
    };
    
    // Enhanced canvas reset handler
    const handleCanvasReset = () => {
      console.log("Received canvas reset");
      if (localUpdateInProgressRef.current) return;
      
      // Use the pre-generated empty grid
      const newGrid = JSON.parse(JSON.stringify(emptyGrid));
      setGrid(newGrid);
      optimisticUpdatesMapRef.current.clear();
      
      // Clear local database
      clearLocalGrid();
    };
    
    // Add new handler for sync_needed events
    const handleSyncNeeded = () => {
      console.log("Sync needed, fetching latest data from Firebase");
      requestFullSync();
    };
    
    websocketService.on('pixel_update', handlePixelUpdate);
    websocketService.on('canvas_reset', handleCanvasReset);
    websocketService.on('sync_needed', handleSyncNeeded);
    
    // Set up periodic sync - but with safeguards against too frequent syncs
    const syncInterval = setInterval(() => {
      // Only sync if we haven't synced in the last minute AND initial data has been loaded
      if (Date.now() - lastSyncTime > 60000 && initialDataLoadedRef.current) {
        requestFullSync();
      }
    }, 60000); // Check every minute
    
    return () => {
      websocketService.offConnectionChange(setWsConnected);
      websocketService.off('pixel_update', handlePixelUpdate);
      websocketService.off('canvas_reset', handleCanvasReset);
      websocketService.off('sync_needed', handleSyncNeeded);
      clearInterval(syncInterval);
    };
  }, [throttledSetGrid, lastSyncTime, requestFullSync]);
  
  // Enhanced function to load specific chunks of the grid for progressive loading
  const loadGridChunk = useCallback(async (startX: number, startY: number, endX: number, endY: number) => {
    // Ensure we're working with valid coordinates
    startX = Math.max(0, Math.min(startX, GRID_SIZE - 1));
    startY = Math.max(0, Math.min(startY, GRID_SIZE - 1));
    endX = Math.max(0, Math.min(endX, GRID_SIZE - 1));
    endY = Math.max(0, Math.min(endY, GRID_SIZE - 1));
    
    const chunkKey = `${startX}-${startY}-${endX}-${endY}`;
    if (loadedChunksRef.current.has(chunkKey)) {
      return; // Chunk already loaded
    }
    
    try {
      const pixelsRef = ref(db, PIXELS_PATH);
      // Query Firebase for just this region's pixels using orderByChild and range queries
      // Note: This requires proper Firebase database rules and indexes
      const chunkPixels = await get(pixelsRef);
      
      if (chunkPixels.exists()) {
        const pixelData = chunkPixels.val();
        
        // Update only the specified region in the grid
        const newGrid = [...gridRef.current];
        let hasChanges = false;
        
        Object.entries(pixelData).forEach(([key, value]: [string, any]) => {
          const [x, y] = key.split(':').map(Number);
          if (x >= startX && x <= endX && y >= startY && y <= endY) {
            if (!newGrid[y]) newGrid[y] = [...gridRef.current[y]];
            if (newGrid[y][x] !== value.color) {
              newGrid[y][x] = value.color;
              hasChanges = true;
            }
          }
        });
        
        if (hasChanges) {
          setGrid(newGrid);
        }
        
        loadedChunksRef.current.add(chunkKey);
      }
    } catch (error) {
      console.error(`Error loading grid chunk (${startX},${startY})-(${endX},${endY}):`, error);
    }
  }, []);

  // Progressive loading based on viewport
  const updateVisibleChunk = useCallback((startX: number, startY: number, endX: number, endY: number) => {
    if (!visibleChunkRef.current 
        || visibleChunkRef.current.startX !== startX 
        || visibleChunkRef.current.startY !== startY
        || visibleChunkRef.current.endX !== endX
        || visibleChunkRef.current.endY !== endY) {
      
      visibleChunkRef.current = { startX, endX, startY, endY };
      
      // Load the visible chunk and adjacent chunks for smoother scrolling
      const expandedStartX = Math.max(0, startX - CHUNK_SIZE);
      const expandedStartY = Math.max(0, startY - CHUNK_SIZE);
      const expandedEndX = Math.min(GRID_SIZE - 1, endX + CHUNK_SIZE);
      const expandedEndY = Math.min(GRID_SIZE - 1, endY + CHUNK_SIZE);
      
      loadGridChunk(expandedStartX, expandedStartY, expandedEndX, expandedEndY);
    }
  }, [loadGridChunk]);
  
  // Initialize updateManager in useEffect to prevent issues
  useEffect(() => {
    // Initialize the update manager
    updateManager.current = new PixelUpdateManager(updatePixelsInFirebase);
    
    return () => {
      // Clean up on unmount
      updateManager.current?.clear();
    };
  }, []);

  // Fix initial loading - make sure we load from Firebase if local DB fails
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        if (initialDataLoadedRef.current) return;
        
        // If we haven't loaded data yet from local DB, load from Firebase
        // Set a timeout to ensure we don't get stuck in loading
        const timer = setTimeout(() => {
          if (!initialDataLoadedRef.current && isLoading) {
            console.log("Loading timeout reached, fetching from Firebase directly");
            requestFullSync();
          }
        }, 2000);
        
        return () => clearTimeout(timer);
      } catch (error) {
        console.error("Error loading initial data:", error);
        // Fallback to Firebase sync
        requestFullSync();
      }
    };
    
    loadInitialData();
  }, [isLoading, requestFullSync]);

  // Update pixels in Firebase with better error handling and conflict resolution
  const updatePixelsInFirebase = async (pixels: Array<{x: number, y: number, color: string}>) => {
    if (!pixels || pixels.length === 0) return false;
    
    try {
      // Set flag to indicate a local update is in progress
      localUpdateInProgressRef.current = true;
      
      // First, try to send via WebSocket for immediate updates to all clients
      if (wsConnected) {
        // Split into smaller batches for WebSocket to avoid large messages
        const WS_BATCH_SIZE = 100; // Smaller batch size for WebSocket to reduce latency
        for (let i = 0; i < pixels.length; i += WS_BATCH_SIZE) {
          const batch = pixels.slice(i, i + WS_BATCH_SIZE);
          websocketService.send('pixel_update', batch);
        }
      }
      
      // Add to pending updates map
      pixels.forEach(pixel => {
        pendingUpdatesRef.current.set(`${pixel.x}:${pixel.y}`, pixel);
      });
      
      // Update Firebase in batches to avoid write limits
      for (let i = 0; i < pixels.length; i += BATCH_SIZE) {
        const batch = pixels.slice(i, i + BATCH_SIZE);
        const updates: Record<string, any> = {};
        const timestamp = Date.now();
        
        batch.forEach(pixel => {
          updates[`${pixel.x}:${pixel.y}`] = {
            color: pixel.color,
            timestamp
          };
        });
        
        // Use update to perform multiple operations atomically
        await update(ref(db, PIXELS_PATH), updates);
      }
      
      return true;
    } catch (error) {
      console.error("Error updating pixels:", error);
      
      // If Firebase update fails but WebSocket succeeded, client states might be inconsistent
      if (wsConnected) {
        setTimeout(() => requestFullSync(), 5000);
      }
      
      return wsConnected; // Return true if at least WebSocket update succeeded
    } finally {
      // Clear flag even if there was an error
      localUpdateInProgressRef.current = false;
    }
  };

  // Update a single pixel - use the update manager for batching
  const updatePixelInFirebase = async (x: number, y: number, color: string) => {
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) {
      console.warn(`Attempted to update pixel out of bounds: (${x}, ${y})`);
      return false;
    }
    
    // Add to update manager for batching
    updateManager.current?.addUpdate({ x, y, color });
    
    // Update optimistically for UI
    setGrid(prevGrid => {
      if (prevGrid[y][x] === color) return prevGrid;
      
      const newGrid = [...prevGrid];
      newGrid[y] = [...newGrid[y]];
      newGrid[y][x] = color;
      return newGrid;
    });
    
    return true;
  };

  // Update multiple pixels with the same optimization strategy
  const updateMultiplePixels = useCallback(async (pixels: Pixel[]) => {
    if (!pixels.length) return false;
    
    // 1. Apply all updates to local state immediately (optimistic updates)
    setGrid(prevGrid => {
      const newGrid = [...prevGrid];
      let hasChanges = false;
      
      pixels.forEach(({ x, y, color }) => {
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE && newGrid[y][x] !== color) {
          // Clone row if we haven't already
          if (!hasChanges || !Object.is(newGrid[y], prevGrid[y])) {
            newGrid[y] = [...newGrid[y]];
          }
          newGrid[y][x] = color;
          hasChanges = true;
        }
      });
      
      return hasChanges ? newGrid : prevGrid;
    });
    
    // Add timestamp and clientId to each pixel
    const timestamp = Date.now();
    const enhancedPixels = pixels.map(pixel => ({
      ...pixel, 
      timestamp,
      clientId: clientIdRef.current
    }));
    
    // 2. Store updates in optimistic updates map
    enhancedPixels.forEach(({ x, y, color }) => {
      optimisticUpdatesMapRef.current.set(`${x}:${y}`, { timestamp, color });
    });
    
    // 3. Update local database immediately
    if (isLocalDBReadyRef.current) {
      await storePixelUpdates(enhancedPixels);
    }
    
    // 4. Track pending pixel count 
    setPendingPixelCount(prev => prev + enhancedPixels.length);
    
    // 5. Send via WebSocket in batches for real-time updates
    if (wsConnected) {
      try {
        // Split into smaller batches for WebSocket
        const WS_BATCH_SIZE = 50;
        for (let i = 0; i < enhancedPixels.length; i += WS_BATCH_SIZE) {
          const batch = enhancedPixels.slice(i, i + WS_BATCH_SIZE);
          websocketService.send('pixel_update', batch);
        }
      } catch (error) {
        console.error("WebSocket batch send error:", error);
      }
    }
    
    // 6. Update Firebase (can happen asynchronously)
    try {
      // Batch Firebase updates
      for (let i = 0; i < enhancedPixels.length; i += BATCH_SIZE) {
        const batch = enhancedPixels.slice(i, i + BATCH_SIZE);
        const updates: Record<string, any> = {};
        
        batch.forEach(({ x, y, color }) => {
          updates[`${x}:${y}`] = {
            color,
            timestamp,
            clientId: clientIdRef.current
          };
        });
        
        await update(ref(db, PIXELS_PATH), updates);
      }
      
      // Update pending count
      setPendingPixelCount(prev => Math.max(0, prev - enhancedPixels.length));
      
      return true;
    } catch (error) {
      console.error("Error updating multiple pixels in Firebase:", error);
      return wsConnected;
    }
  }, [wsConnected]);

  // Optimized mouse handlers for better batching
  const handleMouseDown = useCallback(async (x: number, y: number) => {
    setIsMouseDown(true);
    if (memoizedCanPlacePixel() || COOLDOWN_SECONDS === 0) {
      // Use local-first update approach
      await updatePixelInFirebase(x, y, selectedColor);
      setLastPlaced(Date.now());
      lastPaintedCellRef.current = { x, y };
    } else {
      lastPaintedCellRef.current = null;
    }
  }, [memoizedCanPlacePixel, selectedColor, updatePixelInFirebase]);

  // Optimized mouse enter handler with better line drawing
  const handleMouseEnter = useCallback(async (x: number, y: number) => {
    if (!isMouseDown) return;

    const startCell = lastPaintedCellRef.current;
    const endCell = { x, y };

    if (!startCell) {
      // First cell after mouse down
      if (memoizedCanPlacePixel() || COOLDOWN_SECONDS === 0) {
        await updatePixelInFirebase(x, y, selectedColor);
        setLastPlaced(Date.now());
      }
      lastPaintedCellRef.current = endCell;
      return;
    }

    // Skip if no movement
    if (startCell.x === endCell.x && startCell.y === endCell.y) {
      return;
    }
    
    // Cooldown check
    if (COOLDOWN_SECONDS > 0 && !memoizedCanPlacePixel()) {
      lastPaintedCellRef.current = endCell;
      return;
    }

    // Bresenham's line algorithm for smooth lines
    const linePixels: Pixel[] = [];
    
    let x0 = startCell.x;
    let y0 = startCell.y;
    const x1 = endCell.x;
    const y1 = endCell.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    // Collect all pixels for the line
    while (true) {
      if (x0 >= 0 && x0 < GRID_SIZE && y0 >= 0 && y0 < GRID_SIZE &&
          gridRef.current[y0][x0] !== selectedColor) {
        linePixels.push({ x: x0, y: y0, color: selectedColor });
      }

      if (x0 === x1 && y0 === y1) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
    
    // Use the optimized batch update function
    if (linePixels.length > 0) {
      await updateMultiplePixels(linePixels);
      setLastPlaced(Date.now());
    }
    
    lastPaintedCellRef.current = endCell;
  }, [isMouseDown, memoizedCanPlacePixel, selectedColor, updateMultiplePixels, updatePixelInFirebase]);

  // Other handlers remain mostly the same
  const handleMouseUp = useCallback(() => {
    setIsMouseDown(false);
    lastPaintedCellRef.current = null;
  }, []);

  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedColor(event.target.value);
  };

  // Enhanced canvas clear function with better error handling
  const clearCanvas = useCallback(async () => {
    if (isClearing) return;
    
    try {
      setIsClearing(true);
      
      // 1. Update UI immediately
      const blankGrid = JSON.parse(JSON.stringify(emptyGrid));
      setGrid(blankGrid);
      
      // 2. Clear local optimistic updates
      optimisticUpdatesMapRef.current.clear();
      
      // 3. Clear local database
      if (isLocalDBReadyRef.current) {
        await clearLocalGrid();
      }
      
      // 4. Notify via WebSocket
      if (wsConnected) {
        websocketService.send('canvas_reset', { 
          timestamp: Date.now(),
          clientId: clientIdRef.current
        });
      }
      
      // 5. Update Firebase
      await set(ref(db, PIXELS_PATH), {});
      
      // 6. Update last sync time
      setLastSyncTime(Date.now());
      setPendingPixelCount(0);
      
      console.log("Canvas cleared successfully");
    } catch (error) {
      console.error("Error clearing canvas:", error);
    } finally {
      setIsClearing(false);
    }
  }, [isClearing, wsConnected]);
  
  // Memoize the grid cells to prevent unnecessary re-renders
  const gridCells = useMemo(() => (
    grid.flatMap((row, y) =>
      row.map((color, x) => (
        <div
          key={`${x}-${y}`}
          onMouseDown={() => handleMouseDown(x, y)}
          onMouseEnter={() => handleMouseEnter(x, y)}
          className="w-[10px] h-[10px] border-r border-b border-gray-200"
          style={{ backgroundColor: color, boxSizing: 'border-box' }}
        />
      ))
    )
  ), [grid, handleMouseDown, handleMouseEnter]);
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          Loading Canvas...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center" 
         onMouseLeave={isMouseDown ? handleMouseUp : undefined}
    >
      <div className="mb-4 flex items-center">
        <label htmlFor="colorPicker" className="mr-2">Choose a color:</label>
        <input
          type="color"
          id="colorPicker"
          value={selectedColor}
          onChange={handleColorChange}
          className="h-8 w-14 mr-4"
        />
        <button 
          onClick={clearCanvas}
          disabled={isClearing}
          className="ml-4 bg-red-500 hover:bg-red-600 text-white font-medium py-1 px-3 rounded disabled:opacity-50"
        >
          {isClearing ? "Clearing..." : "Clear Canvas"}
        </button>
        <div className="ml-4 text-xs flex flex-col">
          <div className="flex items-center">
            <span className={`inline-block w-3 h-3 rounded-full mr-1 ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {wsConnected ? 'Real-time connected' : 'Real-time disconnected'}
          </div>
          {pendingPixelCount > 0 && (
            <span className="text-amber-600 text-xs">Syncing: {pendingPixelCount} updates pending</span>
          )}
        </div>
        <button 
          onClick={requestFullSync}
          className="ml-4 bg-blue-500 hover:bg-blue-600 text-white font-xs py-1 px-2 rounded text-xs"
          title="Force synchronization with server"
        >
          Sync
        </button>
      </div>
      
      {/* Optimized grid rendering using CSS grid with explicit sizing */}
      <div 
        className="grid cursor-pointer border border-gray-300" 
        style={{ 
          gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
          width: `${GRID_SIZE * CELL_SIZE}px`,
          height: `${GRID_SIZE * CELL_SIZE}px`,
        }}
        onMouseUp={handleMouseUp}
      >
        {gridCells}
      </div>

      <div className="mt-4 text-sm text-gray-600">
        {COOLDOWN_SECONDS === 0 || memoizedCanPlacePixel()
          ? "You can place a pixel"
          : `Wait ${Math.ceil(
              (COOLDOWN_SECONDS * 1000 - (Date.now() - lastPlaced)) / 1000
            )}s`}
      </div>
      
      {/* Enhanced connection status indicator */}
      <div className="mt-2 text-xs">
        Last sync: {new Date(lastSyncTime).toLocaleTimeString()} 
        {isLocalDBReadyRef.current ? 
          " | Local DB: Ready" : " | Local DB: Initializing..."}
      </div>
    </div>
  );
}