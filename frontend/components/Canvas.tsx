import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { db } from "../src/firebaseClient";
import { ref, onValue, set, update, get } from "firebase/database";
import websocketService from "../src/services/websocketService";

const CELL_SCROLL_STEP = 5; // How many cells to scroll with arrow keys

const COOLDOWN_SECONDS = 0;
const PIXELS_PATH = "pixels"; // Firebase data path
const CELL_SIZE = 10; // Base cell size, effective size will be CELL_SIZE * zoomLevel
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_SENSITIVITY = 0.1;
const CHUNK_SIZE = 25; 
const BATCH_SIZE = 1000; 
const UPDATE_BATCH_INTERVAL = 100; 
const SYNC_THROTTLE_MS = 5000; 
const PIXELS_PER_LINE = 20; // For normalizing scroll when deltaMode is by lines

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

// Add this utility function for line drawing (Bresenham's algorithm)
const plotLine = (x0: number, y0: number, x1: number, y1: number): {x: number, y: number}[] => {
  const points: {x: number, y: number}[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    points.push({x: x0, y: y0});
    
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
  
  return points;
};

export default function Canvas() {
  const [grid, setGrid] = useState<Map<string, string>>(new Map());
  const [viewportOffset, setViewportOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [lastPlaced, setLastPlaced] = useState<number>(0);
  const [selectedColor, setSelectedColor] = useState<string>("#000000");
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false); // For drawing
  const [isPanning, setIsPanning] = useState<boolean>(false); // For panning
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const [pendingPixelCount, setPendingPixelCount] = useState<number>(0);
  const [isBrowserFullScreen, setIsBrowserFullScreen] = useState<boolean>(false);
  const [isEraserActive, setIsEraserActive] = useState<boolean>(false); 
  const [eraserSize, setEraserSize] = useState<number>(1); 
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Initialize with reasonable defaults instead of 0
  const [viewportCellWidth, setViewportCellWidth] = useState(100); 
  const [viewportCellHeight, setViewportCellHeight] = useState(100);
  
  const masterGridDataRef = useRef<Map<string, string>>(new Map()); // Holds ALL pixel data
  const activeChunkKeysRef = useRef<Set<string>>(new Set()); // Holds keys of chunks in current `grid` state

  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastPaintedCellRef = useRef<{ x: number; y: number } | null>(null);
  const localUpdateInProgressRef = useRef<boolean>(false);
  const pendingUpdatesRef = useRef<Map<string, Pixel>>(new Map());
  const updateManager = useRef<PixelUpdateManager | null>(null);
  const initialDataLoadedRef = useRef<boolean>(false);
  const syncInProgressRef = useRef<boolean>(false);
  const lastSyncRequestTimeRef = useRef<number>(0);
  const MIN_SYNC_INTERVAL = 5000;
  const clientIdRef = useRef<string>(CLIENT_ID);
  const optimisticUpdatesMapRef = useRef<Map<string, {timestamp: number, color: string}>>(new Map());
  const canvasContainerRef = useRef<HTMLDivElement>(null); 
  const pixelPaintBatchRef = useRef<Pixel[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);
  const panStartMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const panStartViewportOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const isSpacebarHeldRef = useRef<boolean>(false); // For Spacebar + Left Click panning

  const effectiveCellSize = useMemo(() => CELL_SIZE * zoomLevel, [zoomLevel]);

  // Effect to calculate viewport dimensions in cells
  useEffect(() => {
    const calculateAndSetDimensions = () => {
      if (canvasContainerRef.current && effectiveCellSize > 0) {
        const containerWidth = canvasContainerRef.current.clientWidth;
        const containerHeight = canvasContainerRef.current.clientHeight;
        
        console.log("Container dimensions:", { width: containerWidth, height: containerHeight });
        
        if (containerWidth > 0 && containerHeight > 0) {
          const newWidth = Math.ceil(containerWidth / effectiveCellSize);
          const newHeight = Math.ceil(containerHeight / effectiveCellSize);
          
          console.log("Calculated viewport dimensions:", { newWidth, newHeight });
          
          setViewportCellWidth(newWidth);
          setViewportCellHeight(newHeight);
        } else {
          console.warn("Container dimensions are zero or negative");
        }
      } else {
        console.log("Cannot calculate dimensions:", {
          containerRef: canvasContainerRef.current ? "exists" : "null",
          effectiveCellSize
        });
      }
    };

    // Initial calculation
    calculateAndSetDimensions();

    // Set up resize observer for dynamic recalculation
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          console.log("Resize observed:", entry.contentRect);
          calculateAndSetDimensions();
        }
      }
    });
    
    if (canvasContainerRef.current) {
      observer.observe(canvasContainerRef.current);
    }

    // Handle window resize as a fallback
    const handleResize = () => calculateAndSetDimensions();
    window.addEventListener('resize', handleResize);

    return () => {
      if (canvasContainerRef.current) {
        observer.unobserve(canvasContainerRef.current);
      }
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [effectiveCellSize]); // Dependency: only effectiveCellSize. ResizeObserver handles container changes.

  const getPixelKey = (x: number, y: number) => `${x}:${y}`;
  
  const getChunkKeyForPixel = useCallback((worldX: number, worldY: number): string => {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkY = Math.floor(worldY / CHUNK_SIZE);
    return `${chunkX}:${chunkY}`;
  }, []);

  const getVisibleChunkKeys = useCallback((): Set<string> => {
    const keys = new Set<string>();
    if (viewportCellWidth === 0 || viewportCellHeight === 0 || effectiveCellSize === 0) return keys;

    const startWorldX = viewportOffset.x;
    const endWorldX = viewportOffset.x + viewportCellWidth; // One past the last visible column index
    const startWorldY = viewportOffset.y;
    const endWorldY = viewportOffset.y + viewportCellHeight; // One past the last visible row index

    const startChunkX = Math.floor(startWorldX / CHUNK_SIZE);
    const endChunkX = Math.floor(endWorldX / CHUNK_SIZE);
    const startChunkY = Math.floor(startWorldY / CHUNK_SIZE);
    const endChunkY = Math.floor(endWorldY / CHUNK_SIZE);

    for (let cy = startChunkY; cy <= endChunkY; cy++) {
      for (let cx = startChunkX; cx <= endChunkX; cx++) {
        keys.add(`${cx}:${cy}`);
      }
    }
    return keys;
  }, [viewportOffset, viewportCellWidth, viewportCellHeight, effectiveCellSize, CHUNK_SIZE]);


  const updateGridFromVisibleChunks = useCallback(() => {
    if (!initialDataLoadedRef.current) return;

    const visibleKeys = getVisibleChunkKeys();
    const newGrid = new Map<string, string>();
    
    visibleKeys.forEach(chunkKey => {
      const [chunkRegX, chunkRegY] = chunkKey.split(':').map(Number);
      const startX = chunkRegX * CHUNK_SIZE;
      const endX = startX + CHUNK_SIZE;
      const startY = chunkRegY * CHUNK_SIZE;
      const endY = startY + CHUNK_SIZE;

      for (let wy = startY; wy < endY; wy++) {
        for (let wx = startX; wx < endX; wx++) {
          // Check if this world pixel is within the actual viewport bounds
          // This check is implicitly handled by gridCells iterating screen coords
          const pixelKey = getPixelKey(wx, wy);
          const color = masterGridDataRef.current.get(pixelKey);
          if (color) {
            newGrid.set(pixelKey, color);
          }
        }
      }
    });
    
    activeChunkKeysRef.current = visibleKeys;
    setGrid(newGrid);
  }, [getVisibleChunkKeys, CHUNK_SIZE]); // masterGridDataRef is a ref, setGrid is stable


  useEffect(() => {
    if (initialDataLoadedRef.current) {
      updateGridFromVisibleChunks();
    }
  }, [viewportOffset, zoomLevel, viewportCellWidth, viewportCellHeight, updateGridFromVisibleChunks]); 

  const requestFullSync = useCallback(async () => {
    if (syncInProgressRef.current || 
        Date.now() - lastSyncRequestTimeRef.current < SYNC_THROTTLE_MS) {
      console.log("Full sync request throttled or already in progress.");
      return;
    }
    
    syncInProgressRef.current = true;
    lastSyncRequestTimeRef.current = Date.now();
    
    try {
      console.log("Performing full sync from Firebase");
      
      const pixelsRef = ref(db, PIXELS_PATH);
      const snapshot = await get(pixelsRef);
      
      masterGridDataRef.current.clear(); 

      if (snapshot.exists()) {
        const pixelData = snapshot.val();
        
        Object.entries(pixelData).forEach(([key, value]: [string, any]) => {
          const [xStr, yStr] = key.split(':');
          const x = parseInt(xStr, 10);
          const y = parseInt(yStr, 10);

          if (!isNaN(x) && !isNaN(y) && value && typeof value.color === 'string') {
            masterGridDataRef.current.set(`${x}:${y}`, value.color);
          }
        });
      }
      
      setLastSyncTime(Date.now());
      initialDataLoadedRef.current = true;
      console.log("Initial data loaded:", initialDataLoadedRef.current);
      console.log("Current viewport dimensions:", {viewportCellWidth, viewportCellHeight});

      updateGridFromVisibleChunks(); 
      
      console.log("Full sync completed and master grid populated.");
    } catch (error) {
      console.error("Error performing full sync:", error);
    } finally {
      syncInProgressRef.current = false;
    }
  }, [updateGridFromVisibleChunks, SYNC_THROTTLE_MS, viewportCellWidth, viewportCellHeight]); 
  
  useEffect(() => {
    if (!initialDataLoadedRef.current && !syncInProgressRef.current) {
      requestFullSync();
    }
  }, [requestFullSync]);

  const updateMultiplePixels = useCallback(async (pixels: Pixel[]) => {
    if (!pixels.length) return false;
    
    const timestamp = Date.now();
    const enhancedPixels = pixels.map(pixel => ({
      ...pixel, 
      timestamp,
      clientId: clientIdRef.current
    }));

    // Update masterGridDataRef and optimisticUpdatesMapRef
    enhancedPixels.forEach(({ x, y, color }) => {
      const pixelKey = getPixelKey(x, y);
      masterGridDataRef.current.set(pixelKey, color);
      optimisticUpdatesMapRef.current.set(pixelKey, { timestamp, color });
    });

    // Optimistically update the visible grid state
    setGrid(prevGrid => {
      const newGrid = new Map(prevGrid);
      let hasChanges = false;
      enhancedPixels.forEach(({ x, y, color }) => {
        const pixelKey = getPixelKey(x, y);
        const chunkKey = getChunkKeyForPixel(x, y);
        if (activeChunkKeysRef.current.has(chunkKey)) { 
          if (newGrid.get(pixelKey) !== color) {
            newGrid.set(pixelKey, color);
            hasChanges = true;
          }
        }
      });
      return hasChanges ? newGrid : prevGrid;
    });
    
    setPendingPixelCount(prev => prev + enhancedPixels.length);
    
    const backendPromise = (async () => {
      if (wsConnected) {
        try {
          const WS_BATCH_SIZE = 50;
          for (let i = 0; i < enhancedPixels.length; i += WS_BATCH_SIZE) {
            const batch = enhancedPixels.slice(i, i + WS_BATCH_SIZE);
            websocketService.send('pixel_update', batch);
          }
        } catch (error) {
          console.error("WebSocket batch send error:", error);
        }
      }
      
      try {
        for (let i = 0; i < enhancedPixels.length; i += BATCH_SIZE) {
          const batch = enhancedPixels.slice(i, i + BATCH_SIZE);
          const updates: Record<string, any> = {};
          
          batch.forEach(({ x, y, color }) => {
            updates[getPixelKey(x,y)] = {
              color,
              timestamp, 
              clientId: clientIdRef.current
            };
          });
          
          await update(ref(db, PIXELS_PATH), updates);
        }
        
        setPendingPixelCount(prev => Math.max(0, prev - enhancedPixels.length));
        return true;
      } catch (error) {
        console.error("Error updating multiple pixels in Firebase:", error);
        return wsConnected; 
      }
    })();
    
    return backendPromise; 
  }, [wsConnected, clientIdRef, getChunkKeyForPixel]);

  const memoizedCanPlacePixel = useCallback(() => {
    return Date.now() - lastPlaced > COOLDOWN_SECONDS * 1000;
  }, [lastPlaced]);

  const getEffectiveColor = useCallback(() => {
    return isEraserActive ? "#ffffff" : selectedColor;
  }, [isEraserActive, selectedColor]);

  const getPixelsInEraserArea = useCallback((centerX: number, centerY: number, size: number, color: string): Pixel[] => {
    const pixelsToUpdate: Pixel[] = [];
    if (size <= 0) return pixelsToUpdate;

    const halfSizeFloor = Math.floor((size -1) / 2);
    const halfSizeCeil = Math.ceil((size -1) / 2);

    const startX = centerX - halfSizeFloor;
    const endX = centerX + halfSizeCeil;
    const startY = centerY - halfSizeFloor;
    const endY = centerY + halfSizeCeil;

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        pixelsToUpdate.push({ x, y, color }); // x, y are world coordinates
      }
    }
    return pixelsToUpdate;
  }, []);


  const paintCellOnMove = useCallback((worldX: number, worldY: number) => {
    if (!isMouseDown || isPanning) { 
      return;
    }

    if (COOLDOWN_SECONDS > 0 && !memoizedCanPlacePixel()) {
      return;
    }

    const currentPosition = { x: worldX, y: worldY };
    const lastPosition = lastPositionRef.current || currentPosition;
      
    const linePoints = plotLine(lastPosition.x, lastPosition.y, currentPosition.x, currentPosition.y);
      
    const pixelsToBatch: Pixel[] = [];
    const effectiveColor = getEffectiveColor();

    linePoints.forEach(point => {
      if (isEraserActive) {
        pixelsToBatch.push(...getPixelsInEraserArea(point.x, point.y, eraserSize, effectiveColor));
      } else {
        pixelsToBatch.push({
          x: point.x,
          y: point.y,
          color: effectiveColor
        });
      }
    });
      
    const uniquePixelsMap = new Map<string, Pixel>();
    pixelPaintBatchRef.current.forEach(p => uniquePixelsMap.set(getPixelKey(p.x, p.y), p));
    pixelsToBatch.forEach(p => uniquePixelsMap.set(getPixelKey(p.x, p.y), p));
    pixelPaintBatchRef.current = Array.from(uniquePixelsMap.values());
      
    lastPositionRef.current = currentPosition;
      
    if (animationFrameIdRef.current === null) {
      animationFrameIdRef.current = requestAnimationFrame(() => {
        if (pixelPaintBatchRef.current.length > 0) {
          const batchToProcess = [...pixelPaintBatchRef.current];
          pixelPaintBatchRef.current = []; 
            
          setGrid(prevGrid => {
            const newGrid = new Map(prevGrid);
            let hasChanges = false;
            batchToProcess.forEach(({ x, y, color }) => {
              const key = getPixelKey(x,y);
              const chunkKey = getChunkKeyForPixel(x,y);
              if(activeChunkKeysRef.current.has(chunkKey)){
                if (newGrid.get(key) !== color) {
                  newGrid.set(key, color);
                  hasChanges = true;
                }
              }
            });
            return hasChanges ? newGrid : prevGrid;
          });

          updateMultiplePixels(batchToProcess);
            
          if (batchToProcess.length > 0) {
            setLastPlaced(Date.now()); 
          }
        }
        animationFrameIdRef.current = null;
      });
    }
  }, [isMouseDown, isPanning, getEffectiveColor, memoizedCanPlacePixel, updateMultiplePixels, setLastPlaced, isEraserActive, eraserSize, getPixelsInEraserArea, getChunkKeyForPixel]);

  const handleWindowMouseMove = useCallback((event: MouseEvent) => {
    if (isPanning && panStartMousePositionRef.current && panStartViewportOffsetRef.current) {
        const deltaX = event.clientX - panStartMousePositionRef.current.x;
        const deltaY = event.clientY - panStartMousePositionRef.current.y;

        const offsetDeltaX = deltaX / effectiveCellSize; 
        const offsetDeltaY = deltaY / effectiveCellSize;
        
        const newViewportX = panStartViewportOffsetRef.current.x - offsetDeltaX;
        const newViewportY = panStartViewportOffsetRef.current.y - offsetDeltaY;

        setViewportOffset({ x: newViewportX, y: newViewportY }); // Allow float viewport offset

    } else if (isMouseDown /* for drawing */ && !isPanning && canvasContainerRef.current) { // isMouseDown is true only for drawing
        const rect = canvasContainerRef.current.getBoundingClientRect();
        
        const canvasX = Math.floor((event.clientX - rect.left) / effectiveCellSize);
        const canvasY = Math.floor((event.clientY - rect.top) / effectiveCellSize);

        // Ensure world coordinates are integers
        const worldX = Math.floor(canvasX + viewportOffset.x);
        const worldY = Math.floor(canvasY + viewportOffset.y);

        paintCellOnMove(worldX, worldY);
        lastPaintedCellRef.current = { x: worldX, y: worldY };
    }
  }, [isPanning, isMouseDown, panStartMousePositionRef, panStartViewportOffsetRef, viewportOffset, paintCellOnMove, effectiveCellSize]);

  const handleWindowMouseUp = useCallback((event: MouseEvent) => {
    const wasPanning = isPanning; // Capture if a pan operation was active

    if (isPanning) {
        setIsPanning(false);
        panStartMousePositionRef.current = null;
        panStartViewportOffsetRef.current = null;
        if (canvasContainerRef.current) {
            canvasContainerRef.current.style.cursor = isSpacebarHeldRef.current ? 'grab' : 'default';
        }
        document.body.style.cursor = 'default';
    }
    
    // Only process drawing mouseup if mousedown was for drawing
    if (isMouseDown) { 
        setIsMouseDown(false); // Stop drawing state
        if (animationFrameIdRef.current) {
            cancelAnimationFrame(animationFrameIdRef.current);
            animationFrameIdRef.current = null;
        }
        if (pixelPaintBatchRef.current.length > 0) {
            const batchToProcess = [...pixelPaintBatchRef.current];
            pixelPaintBatchRef.current = [];
            
            setGrid(prevGrid => {
                const newGrid = new Map(prevGrid);
                let hasChanges = false;
                batchToProcess.forEach(({ x, y, color }) => {
                    const key = getPixelKey(x,y);
                    const chunkKey = getChunkKeyForPixel(x,y);
                    if(activeChunkKeysRef.current.has(chunkKey)){
                      if (newGrid.get(key) !== color) {
                          newGrid.set(key, color);
                          hasChanges = true;
                      }
                    }
                });
                return hasChanges ? newGrid : prevGrid;
            });
            
            updateMultiplePixels(batchToProcess);
            
            if (batchToProcess.length > 0) {
                setLastPlaced(Date.now());
            }
        }
        lastPaintedCellRef.current = null;
        lastPositionRef.current = null; 
    }
  }, [isPanning, isMouseDown, setIsPanning, setIsMouseDown, updateMultiplePixels, setLastPlaced, getChunkKeyForPixel]);

  const handleCanvasMouseDown = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const screenX = event.clientX;
    const screenY = event.clientY;

    if (event.button === 0) { // Left click
        if (isSpacebarHeldRef.current) { // Spacebar is held: Left click initiates panning
            event.preventDefault(); // Prevent text selection, etc.
            setIsPanning(true);
            // isMouseDown remains false, as this is a pan, not a draw.
            panStartMousePositionRef.current = { x: screenX, y: screenY };
            panStartViewportOffsetRef.current = { ...viewportOffset };
            if (canvasContainerRef.current) canvasContainerRef.current.style.cursor = 'grabbing';
            document.body.style.cursor = 'grabbing';
        } else { // Spacebar is NOT held: Left click initiates drawing
            // Prevent drawing if a pan just ended with this click (e.g. middle mouse was released)
            if (isPanning) return;

            const canvasX = Math.floor((screenX - rect.left) / effectiveCellSize);
            const canvasY = Math.floor((screenY - rect.top) / effectiveCellSize);
            const worldX = Math.floor(canvasX + viewportOffset.x);
            const worldY = Math.floor(canvasY + viewportOffset.y);
            
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
            pixelPaintBatchRef.current = [];
            lastPositionRef.current = { x: worldX, y: worldY };

            if (memoizedCanPlacePixel() || COOLDOWN_SECONDS === 0) {
                const effectiveColor = getEffectiveColor();
                let pixelsToUpdate: Pixel[];

                if (isEraserActive) {
                    pixelsToUpdate = getPixelsInEraserArea(worldX, worldY, eraserSize, effectiveColor);
                } else {
                    pixelsToUpdate = [{ x: worldX, y: worldY, color: effectiveColor }];
                }
                
                if (pixelsToUpdate.length > 0) {
                    const timestamp = Date.now();
                    pixelsToUpdate.forEach(pixel => {
                        masterGridDataRef.current.set(getPixelKey(pixel.x, pixel.y), pixel.color);
                        optimisticUpdatesMapRef.current.set(getPixelKey(pixel.x, pixel.y), { timestamp, color: pixel.color });
                    });

                    setGrid(prevGrid => {
                        const newGrid = new Map(prevGrid);
                        let hasChanges = false;
                        pixelsToUpdate.forEach(pixel => {
                          const key = getPixelKey(pixel.x, pixel.y);
                          const chunkKey = getChunkKeyForPixel(pixel.x, pixel.y);
                          if(activeChunkKeysRef.current.has(chunkKey)){
                            if (newGrid.get(key) !== pixel.color) {
                              newGrid.set(key, pixel.color);
                              hasChanges = true;
                            }
                          }
                        });
                        return hasChanges ? newGrid : prevGrid;
                    });
                    
                    await updateMultiplePixels(pixelsToUpdate.map(p => ({...p, clientId: clientIdRef.current, timestamp })));
                    setLastPlaced(Date.now());
                    lastPaintedCellRef.current = { x: worldX, y: worldY };
                }
            }
            setIsMouseDown(true); // For drawing state
        }
    } else if (event.button === 1) { // Middle click for panning
        event.preventDefault(); // Prevent default middle-click behavior (e.g., autoscroll)
        setIsPanning(true);
        // isMouseDown remains false
        panStartMousePositionRef.current = { x: screenX, y: screenY };
        panStartViewportOffsetRef.current = { ...viewportOffset };
        if (canvasContainerRef.current) canvasContainerRef.current.style.cursor = 'grabbing';
        document.body.style.cursor = 'grabbing'; // Also set on body to ensure cursor stays during fast drags
    }
  }, [viewportOffset, memoizedCanPlacePixel, getEffectiveColor, isEraserActive, eraserSize, getPixelsInEraserArea, updateMultiplePixels, setLastPlaced, setIsMouseDown, setIsPanning, clientIdRef, isPanning, effectiveCellSize, getChunkKeyForPixel]);


  useEffect(() => {
    if (isMouseDown || isPanning) { 
        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
        if (isMouseDown && !isPanning) {
             document.body.style.userSelect = 'none';
        }
        return () => {
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
            document.body.style.userSelect = '';
            if (isPanning && canvasContainerRef.current) canvasContainerRef.current.style.cursor = 'default';
            if (isPanning) document.body.style.cursor = 'default';
        };
    }
  }, [isMouseDown, isPanning, handleWindowMouseMove, handleWindowMouseUp]);


  // Effect for Spacebar pan mode activation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === ' ' || event.code === 'Space') {
            // Only activate spacebar pan mode if not already held and no other pan is active
            if (!isSpacebarHeldRef.current && !isPanning) { 
                event.preventDefault();
                isSpacebarHeldRef.current = true;
                if (canvasContainerRef.current) {
                    canvasContainerRef.current.style.cursor = 'grab';
                }
            }
        }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
        if (event.key === ' ' || event.code === 'Space') {
            if (isSpacebarHeldRef.current) {
                event.preventDefault();
                isSpacebarHeldRef.current = false;
                
                // If a pan was active (started with space+left_click) and space is released,
                // the pan should stop. The mouse button might still be down.
                if (isPanning && panStartMousePositionRef.current) { // Check if pan was likely space-initiated
                    setIsPanning(false);
                    panStartMousePositionRef.current = null;
                    panStartViewportOffsetRef.current = null;
                    if (canvasContainerRef.current) canvasContainerRef.current.style.cursor = 'default';
                    document.body.style.cursor = 'default';
                } else if (canvasContainerRef.current && !isPanning) {
                    // If no pan is active, just reset cursor
                    canvasContainerRef.current.style.cursor = 'default';
                }
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        if (isSpacebarHeldRef.current && canvasContainerRef.current) {
            canvasContainerRef.current.style.cursor = 'default'; // Reset cursor on unmount
        }
        isSpacebarHeldRef.current = false; // Ensure ref is reset
    };
  }, [isPanning]); // isPanning dependency helps manage cursor correctly when space is released


  useEffect(() => {
    websocketService.connect();
    websocketService.onConnectionChange((connected) => {
      setWsConnected(connected);
      if (connected && initialDataLoadedRef.current) { // Sync if already loaded, otherwise initial load will handle
        requestFullSync();
      }
    });
    
    const handlePixelUpdate = (data: any) => {
      if (localUpdateInProgressRef.current) return;
      
      const updatesToApply: Pixel[] = [];

      if (Array.isArray(data)) {
        data.forEach((pixel) => { 
          if (pixel.clientId !== clientIdRef.current || !optimisticUpdatesMapRef.current.has(getPixelKey(pixel.x, pixel.y))) {
            updatesToApply.push(pixel);
            masterGridDataRef.current.set(getPixelKey(pixel.x, pixel.y), pixel.color); 
          }
        });
      } else if (data) { 
        if (data.clientId !== clientIdRef.current || !optimisticUpdatesMapRef.current.has(getPixelKey(data.x, data.y))) {
          updatesToApply.push(data);
          masterGridDataRef.current.set(getPixelKey(data.x, data.y), data.color); 
        }
      }

      if (updatesToApply.length === 0) return;

      setGrid(prevGrid => {
        const newGrid = new Map(prevGrid);
        let hasChanges = false;
        updatesToApply.forEach(pixel => {
          const { x, y, color } = pixel; 
          const key = getPixelKey(x,y);
          const chunkKey = getChunkKeyForPixel(x,y);
          if(activeChunkKeysRef.current.has(chunkKey)){ 
            if (newGrid.get(key) !== color) {
              newGrid.set(key, color);
              hasChanges = true;
            }
          }
        });
        return hasChanges ? newGrid : prevGrid;
      });
    };
    
    const handleCanvasReset = () => {
      console.log("Received canvas reset via WebSocket");
      // Check if this client initiated the reset to avoid redundant operations
      const resetInitiator = (arguments[0] as any)?.clientId;
      if (resetInitiator && resetInitiator === clientIdRef.current) {
          console.log("Reset was initiated by this client, already handled locally.");
          return;
      }

      masterGridDataRef.current.clear(); 
      setGrid(new Map()); 
      optimisticUpdatesMapRef.current.clear();
      activeChunkKeysRef.current.clear();
      console.log("Canvas reset based on WebSocket event.");
      // Optionally, trigger a full sync if there's a concern about missed updates
      // requestFullSync(); 
    };
    
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
  }, [requestFullSync, lastSyncTime, getChunkKeyForPixel]); 
  
  
  const loadGridChunk = useCallback(async (startX: number, startY: number, endX: number, endY: number) => {
    console.warn("loadGridChunk is stubbed for infinite canvas. Data is loaded via requestFullSync.");
    // In a full implementation, this would fetch a specific region from Firebase.
  }, []);

  const updateVisibleChunk = useCallback((startX: number, startY: number, endX: number, endY: number) => {
     console.warn("updateVisibleChunk is stubbed for infinite canvas.");
    // This would typically trigger loadGridChunk for the new viewport.
  }, [loadGridChunk]);
  
  useEffect(() => {
    // Initialize the update manager
    updateManager.current = new PixelUpdateManager(
        updateMultiplePixels, // Pass updateMultiplePixels directly
        UPDATE_BATCH_INTERVAL
    );
    
    return () => {
      updateManager.current?.clear();
    };
  }, [updateMultiplePixels]);

  useEffect(() => {
    const loadInitialData = async () => {
      if (!initialDataLoadedRef.current && !syncInProgressRef.current) {
        console.log("Fallback initial data load check.");
        await requestFullSync(); // This will set initialDataLoadedRef and call updateGridFromVisibleChunks
      }
    };
    
    loadInitialData();
  }, [requestFullSync]); 

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

  const updatePixelInFirebase = async (x: number, y: number, color: string) => {
    updateManager.current?.addUpdate({ x, y, color }); 
    
    const pixelKey = getPixelKey(x,y);
    masterGridDataRef.current.set(pixelKey, color);
    optimisticUpdatesMapRef.current.set(pixelKey, { timestamp: Date.now(), color });

    setGrid(prevGrid => {
      const newGrid = new Map(prevGrid);
      const chunkKey = getChunkKeyForPixel(x,y);
      if(activeChunkKeysRef.current.has(chunkKey)){
        if (newGrid.get(pixelKey) === color) return prevGrid; 
        newGrid.set(pixelKey, color);
        return newGrid;
      }
      return prevGrid; 
    });
    return true;
  };

  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedColor(event.target.value);
  };

  const toggleEraser = useCallback(() => {
    setIsEraserActive(prev => !prev);
  }, []);

  const handleEraserSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(event.target.value, 10);
    if (newSize >= 1 && newSize <= 25) { // Max eraser size 25x25 for performance
        setEraserSize(newSize);
    }
  };

  const clearCanvas = useCallback(async () => {
    if (isClearing) return;
    
    try {
      setIsClearing(true);
      masterGridDataRef.current.clear(); 
      setGrid(new Map()); 
      optimisticUpdatesMapRef.current.clear();
      activeChunkKeysRef.current.clear(); 
      
      if (wsConnected) {
        websocketService.send('canvas_reset', { 
          timestamp: Date.now(),
          clientId: clientIdRef.current 
        });
      }
      
      await set(ref(db, PIXELS_PATH), {}); 
      setLastSyncTime(Date.now());
      setPendingPixelCount(0);
      console.log("Canvas cleared successfully");
    } catch (error) {
      console.error("Error clearing canvas:", error);
      requestFullSync(); 
      alert("Failed to clear canvas. Please try again.");
    } finally {
      setIsClearing(false);
    }
  }, [isClearing, wsConnected, requestFullSync, clientIdRef]); 
  
  const getCoordsFromTouchEvent = (event: React.TouchEvent<HTMLDivElement>): { x: number, y: number } | null => {
    if (!canvasContainerRef.current) return null;
    const touch = event.touches[0];
    const rect = canvasContainerRef.current.getBoundingClientRect();

    const canvasX = Math.floor((touch.clientX - rect.left) / effectiveCellSize);
    const canvasY = Math.floor((touch.clientY - rect.top) / effectiveCellSize);

    const worldX = Math.floor(canvasX + viewportOffset.x); // Ensure integer world coords
    const worldY = Math.floor(canvasY + viewportOffset.y);
    
    return { x: worldX, y: worldY };
  };

  const [initialTouchDistance, setInitialTouchDistance] = useState<number | null>(null);
  const [initialZoom, setInitialZoom] = useState<number>(1);
  const touchCenterRef = useRef<{x: number, y: number} | null>(null);

  // Add a function to calculate distance between two touch points
  const getTouchDistance = useCallback((touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Calculate the center point between two touches
  const getTouchCenter = useCallback((touches: React.TouchList): {x: number, y: number} | null => {
    if (touches.length < 2) return null;
    
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }, []);

  const handleTouchStart = useCallback(async (event: React.TouchEvent<HTMLDivElement>) => {
    // Always prevent default to block all browser behaviors
    event.preventDefault();
    event.stopPropagation();
    
    // Handle pinch-to-zoom gesture
    if (event.touches.length === 2) {
      const distance = getTouchDistance(event.touches);
      setInitialTouchDistance(distance);
      setInitialZoom(zoomLevel);
      touchCenterRef.current = getTouchCenter(event.touches);
      return;
    }
    
    // Handle regular touch for drawing
    if (isPanning) return;

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    pixelPaintBatchRef.current = [];

    const coords = getCoordsFromTouchEvent(event); 
    if (coords) {
      const { x: worldX, y: worldY } = coords;
      lastPositionRef.current = coords; 
      
      if (memoizedCanPlacePixel() || COOLDOWN_SECONDS === 0) {
        const effectiveColor = getEffectiveColor();
        let pixelsToUpdate: Pixel[];

        if (isEraserActive) {
          pixelsToUpdate = getPixelsInEraserArea(worldX, worldY, eraserSize, effectiveColor);
        } else {
          pixelsToUpdate = [{ x: worldX, y: worldY, color: effectiveColor }];
        }

        if (pixelsToUpdate.length > 0) {
          const timestamp = Date.now();
          pixelsToUpdate.forEach(pixel => {
            masterGridDataRef.current.set(getPixelKey(pixel.x, pixel.y), pixel.color);
            optimisticUpdatesMapRef.current.set(getPixelKey(pixel.x, pixel.y), { timestamp, color: pixel.color });
          });

          setGrid(prevGrid => {
            const newGrid = new Map(prevGrid);
            let hasChanges = false;
            pixelsToUpdate.forEach(pixel => {
              const key = getPixelKey(pixel.x, pixel.y);
              const chunkKey = getChunkKeyForPixel(pixel.x, pixel.y);
              if(activeChunkKeysRef.current.has(chunkKey)){
                if (newGrid.get(key) !== pixel.color) {
                  newGrid.set(key, pixel.color);
                  hasChanges = true;
                }
              }
            });
            return hasChanges ? newGrid : prevGrid;
          });
          
          await updateMultiplePixels(pixelsToUpdate.map(p => ({...p, clientId: clientIdRef.current, timestamp })));
          setLastPlaced(Date.now());
          lastPaintedCellRef.current = coords;
        }
        setIsMouseDown(true); 
      } else {
        lastPaintedCellRef.current = null;
        setIsMouseDown(true); 
      }
    }
  }, [
    memoizedCanPlacePixel, getEffectiveColor, updateMultiplePixels, setIsMouseDown, 
    clientIdRef, setLastPlaced, isEraserActive, eraserSize, getPixelsInEraserArea, 
    viewportOffset, isPanning, effectiveCellSize, getCoordsFromTouchEvent, 
    getChunkKeyForPixel, getTouchDistance, getTouchCenter, zoomLevel
  ]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    // Always prevent default to block all browser behaviors
    event.preventDefault();
    event.stopPropagation();
    
    // Handle pinch-to-zoom
    if (event.touches.length === 2 && initialTouchDistance && touchCenterRef.current && canvasContainerRef.current) {
      const currentDistance = getTouchDistance(event.touches);
      const scale = currentDistance / initialTouchDistance;
      const newZoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initialZoom * scale));
      
      if (newZoomLevel === zoomLevel) return; // No change
      
      // Calculate the center point in world coordinates
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const centerX = touchCenterRef.current.x - rect.left;
      const centerY = touchCenterRef.current.y - rect.top;
      
      // World coordinates before zoom
      const worldXBeforeZoom = viewportOffset.x + centerX / effectiveCellSize;
      const worldYBeforeZoom = viewportOffset.y + centerY / effectiveCellSize;
      
      // Apply new zoom
      setZoomLevel(newZoomLevel);
      
      // Calculate new effective cell size with the updated zoom level
      const newEffectiveCellSize = CELL_SIZE * newZoomLevel;
      
      // Keep the point under the touch center stationary
      const newViewportX = worldXBeforeZoom - centerX / newEffectiveCellSize;
      const newViewportY = worldYBeforeZoom - centerY / newEffectiveCellSize;
      
      setViewportOffset({ x: newViewportX, y: newViewportY });
      return;
    }
    
    // Handle regular touch movement for drawing
    if (!isMouseDown || isPanning || !canvasContainerRef.current) return;

    const coords = getCoordsFromTouchEvent(event);
    if (coords) {
      paintCellOnMove(coords.x, coords.y);
      lastPaintedCellRef.current = coords;
    }
  }, [
    isMouseDown, isPanning, paintCellOnMove, viewportOffset, getCoordsFromTouchEvent,
    initialTouchDistance, zoomLevel, initialZoom, effectiveCellSize, getTouchDistance
  ]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    // Always prevent default to block all browser behaviors
    event.preventDefault();
    event.stopPropagation();
    
    // Reset pinch zoom tracking when fingers are lifted
    if (event.touches.length < 2) {
      setInitialTouchDistance(null);
      setInitialZoom(zoomLevel);
      touchCenterRef.current = null;
    }
    
    if (isMouseDown && !isPanning) { 
      setIsMouseDown(false); 
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      if (pixelPaintBatchRef.current.length > 0) {
        const batchToProcess = [...pixelPaintBatchRef.current];
        pixelPaintBatchRef.current = [];
        
        setGrid(prevGrid => {
          const newGrid = new Map(prevGrid);
          let hasChanges = false;
          batchToProcess.forEach(({ x, y, color }) => {
            const key = getPixelKey(x,y);
            const chunkKey = getChunkKeyForPixel(x,y);
            if(activeChunkKeysRef.current.has(chunkKey)){
              if (newGrid.get(key) !== color) {
                newGrid.set(key, color);
                hasChanges = true;
              }
            }
          });
          return hasChanges ? newGrid : prevGrid;
        });
        
        updateMultiplePixels(batchToProcess);
        
        if (batchToProcess.length > 0) {
          setLastPlaced(Date.now());
        }
      }
      lastPaintedCellRef.current = null;
      lastPositionRef.current = null; 
    }
  }, [isMouseDown, isPanning, setIsMouseDown, updateMultiplePixels, setLastPlaced, getChunkKeyForPixel, zoomLevel]);

  const toggleBrowserFullScreen = useCallback(() => {
    const elem = document.documentElement;
    if (!document.fullscreenElement) {
      elem.requestFullscreen().then(() => setIsBrowserFullScreen(true)).catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen().then(() => setIsBrowserFullScreen(false));
    }
  }, []);

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsBrowserFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);

  // Keyboard Panning
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      let dx = 0;
      let dy = 0;
      switch (event.key) {
        case "ArrowLeft":
          dx = -CELL_SCROLL_STEP;
          break;
        case "ArrowRight":
          dx = CELL_SCROLL_STEP;
          break;
        case "ArrowUp":
          dy = -CELL_SCROLL_STEP;
          break;
        case "ArrowDown":
          dy = CELL_SCROLL_STEP;
          break;
        default:
          return;
      }
      // Prevent scrolling the page when arrow keys are used for canvas panning
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
      }
      setViewportOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!canvasContainerRef.current) return;
    
    // Always prevent default to avoid browser zoom
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) { // Support both Ctrl (Windows/Linux) and Cmd (Mac)
      // Zooming logic
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const mouseXOnCanvas = event.clientX - rect.left; // Mouse X relative to canvas
      const mouseYOnCanvas = event.clientY - rect.top;  // Mouse Y relative to canvas

      // World coordinates of the pixel under the mouse before zoom
      const worldXBeforeZoom = viewportOffset.x + mouseXOnCanvas / effectiveCellSize;
      const worldYBeforeZoom = viewportOffset.y + mouseYOnCanvas / effectiveCellSize;

      // Calculate new zoom level
      const zoomFactor = event.deltaY < 0 ? (1 + ZOOM_SENSITIVITY) : (1 - ZOOM_SENSITIVITY);
      let newZoomLevel = zoomLevel * zoomFactor;
      newZoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));
      
      setZoomLevel(newZoomLevel);
      const newEffectiveCellSize = CELL_SIZE * newZoomLevel;

      // Calculate new viewport offset to keep the mouse pointer stationary
      const newViewportX = worldXBeforeZoom - mouseXOnCanvas / newEffectiveCellSize;
      const newViewportY = worldYBeforeZoom - mouseYOnCanvas / newEffectiveCellSize;
      
      setViewportOffset({ x: newViewportX, y: newViewportY });
    } else { // Panning
      let scrollPixelX = event.deltaX;
      let scrollPixelY = event.deltaY;

      // Normalize scroll delta based on deltaMode
      if (event.deltaMode === 1) { // DOM_DELTA_LINE
          scrollPixelX *= PIXELS_PER_LINE;
          scrollPixelY *= PIXELS_PER_LINE;
      } else if (event.deltaMode === 2) { // DOM_DELTA_PAGE
          if (canvasContainerRef.current) {
              scrollPixelX *= canvasContainerRef.current.clientWidth * 0.8; // 80% of viewport width
              scrollPixelY *= canvasContainerRef.current.clientHeight * 0.8; // 80% of viewport height
          }
      }

      // If Shift key is pressed with vertical scroll, interpret as horizontal scroll
      if (event.shiftKey && scrollPixelY !== 0 && scrollPixelX === 0) {
          scrollPixelX = scrollPixelY;
          scrollPixelY = 0;
      }
      
      const panXAmount = scrollPixelX / effectiveCellSize;
      const panYAmount = scrollPixelY / effectiveCellSize;

      setViewportOffset(prevOffset => ({
          x: prevOffset.x + panXAmount,
          y: prevOffset.y + panYAmount,
      }));
    }
  }, [zoomLevel, viewportOffset, effectiveCellSize, setZoomLevel, setViewportOffset]);
  

  const gridCells = useMemo(() => {
    if (viewportCellWidth === 0 || viewportCellHeight === 0) {
      return []; // Don't render if dimensions are not yet calculated
    }
    const cells = [];
    const roundedViewportX = Math.floor(viewportOffset.x);
    const roundedViewportY = Math.floor(viewportOffset.y);

    for (let screenY = 0; screenY < viewportCellHeight; screenY++) {
      for (let screenX = 0; screenX < viewportCellWidth; screenX++) {
        const worldX = screenX + roundedViewportX;
        const worldY = screenY + roundedViewportY;
        const pixelKey = getPixelKey(worldX, worldY);
        const color = grid.get(pixelKey) || "#ffffff"; // `grid` now only contains active chunk pixels

        cells.push(
          <div
            key={pixelKey} 
            className="border-r border-b border-gray-200" 
            style={{ 
              backgroundColor: color, 
              width: `${effectiveCellSize}px`, 
              height: `${effectiveCellSize}px`, 
              boxSizing: 'border-box' 
            }}
          />
        );
      }
    }
    return cells;
  }, [grid, viewportOffset, viewportCellWidth, viewportCellHeight, effectiveCellSize]); 


  // Modify the loading check to only depend on initialDataLoaded
  if (!initialDataLoadedRef.current) {
    console.log("Loading state:", {
      initialDataLoaded: initialDataLoadedRef.current,
      viewportCellWidth,
      viewportCellHeight,
    });

    return (
      <div ref={canvasContainerRef} className="flex justify-center items-center h-screen">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          Loading Canvas...
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={canvasContainerRef}
      className="relative w-screen h-screen overflow-hidden bg-gray-200" 
      style={{ 
        touchAction: "none",  // Prevent browser's default touch behaviors
        WebkitOverflowScrolling: "touch", // Better scrolling on iOS
        overscrollBehavior: "none" // Prevent pull-to-refresh
      }} 
    >
      <div className="absolute top-4 left-4 z-20 bg-white p-2 rounded shadow-lg flex items-center flex-wrap gap-2">
        <label htmlFor="colorPicker" className="mr-1">Color:</label>
        <input
          type="color"
          id="colorPicker"
          value={selectedColor}
          onChange={handleColorChange}
          className="h-8 w-14 mr-4"
        />
        <button 
          onClick={toggleEraser}
          className={`px-3 py-1 rounded text-white ${isEraserActive ? 'bg-gray-700' : 'bg-gray-400 hover:bg-gray-500'}`}
          title="Toggle eraser tool"
        >
          {isEraserActive ? "Eraser On" : "Eraser"}
        </button>
        {isEraserActive && (
          <div className="flex items-center">
            <label htmlFor="eraserSize" className="mr-1 text-xs">Size:</label>
            <input
              type="number"
              id="eraserSize"
              value={eraserSize}
              onChange={handleEraserSizeChange}
              min="1"
              max="25" // Max size constraint
              className="h-6 w-12 text-xs p-1 border rounded"
            />
          </div>
        )}
        <button 
          onClick={clearCanvas}
          disabled={isClearing}
          className="bg-red-500 hover:bg-red-600 text-white font-medium py-1 px-3 rounded disabled:opacity-50"
        >
          {isClearing ? "Clearing..." : "Clear"}
        </button>
        <button
          onClick={toggleBrowserFullScreen} // Changed from toggleFullScreen
          className="bg-purple-500 hover:bg-purple-600 text-white font-xs py-1 px-2 rounded text-xs"
          title={isBrowserFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
        >
          {isBrowserFullScreen ? "Exit FS" : "Full Screen"}
        </button>
        <div className="text-xs flex flex-col">
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
          className="bg-blue-500 hover:bg-blue-600 text-white font-xs py-1 px-2 rounded text-xs"
          title="Force synchronization with server"
        >
          Sync
        </button>
         <div className="text-xs">
            Viewport: ({viewportOffset.x.toFixed(2)}, {viewportOffset.y.toFixed(2)})
        </div>
         <div className="text-xs">
            Cells: {viewportCellWidth}x{viewportCellHeight} @ {Math.round(zoomLevel*100)}%
        </div>
         <div className="text-xs">
            Last sync: {new Date(lastSyncTime).toLocaleTimeString()}
        </div>
      </div>
      
      <div 
        className="absolute inset-0 grid z-10" 
        style={{ 
          gridTemplateColumns: `repeat(${viewportCellWidth}, ${effectiveCellSize}px)`,
          cursor: 'default', 
          userSelect: 'none',
          touchAction: "none" // Prevent browser's default touch behavior
        }}
        onMouseDown={handleCanvasMouseDown} 
        onContextMenu={(e) => e.preventDefault()} 
        onWheel={handleWheel} 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {gridCells}
      </div>
      
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-sm text-gray-700 bg-white bg-opacity-75 p-2 rounded shadow">
        {COOLDOWN_SECONDS === 0 || memoizedCanPlacePixel()
          ? "You can place a pixel."
          : `Wait ${Math.ceil(
              (COOLDOWN_SECONDS * 1000 - (Date.now() - lastPlaced)) / 1000
            )}s`}
      </div>
    </div>
  );
}