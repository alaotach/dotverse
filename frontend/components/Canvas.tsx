import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { db } from "../src/firebaseClient";
import { ref, onValue, set, update, get } from "firebase/database";
import websocketService from "../src/services/websocketService";
import { useAuth } from "../src/context/AuthContext";
import { quotaManager } from "../src/services/quotaManager";
import { openDB } from 'idb';
import { getLocalCache, updateLocalCache } from "../src/services/localStorageCache";
import { doc, getDoc, collection, getDocs, query, writeBatch } from "firebase/firestore"; // Added writeBatch
import { fs } from "../src/firebaseClient";
import { PixelBatchManager } from "../src/services/pixelBatchManager"; // Import PixelBatchManager
import { firestoreDebugger, isMissingDocError, isNetworkError } from "../src/services/debugTools";

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

// Add these missing constants near the other constants
const LOCAL_CACHE_ENABLED = true;
const QUOTA_SAFETY_MARGIN = 0.8; // Use 80% of available quota
const USE_CHUNKED_STORAGE = true;
const CHUNK_COLLECTION = 'pixelChunks';

// Constants for localStorage keys
const LOCAL_STORAGE_VIEWPORT_X_KEY = 'dotverse_viewport_x';
const LOCAL_STORAGE_VIEWPORT_Y_KEY = 'dotverse_viewport_y';
const LOCAL_STORAGE_ZOOM_LEVEL_KEY = 'dotverse_zoom_level';

// Near the top after other constants
const GRID_LINE_COLOR = "rgba(200, 200, 200, 0.3)"; // Subtle grid lines
const SHOW_GRID_LINES = true; // Toggle for grid lines
const GRID_LINE_THRESHOLD = 0.6; // Only show grid lines when zoom level is at least this value

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

// New types and constants for land visualization
interface LandInfo {
  centerX: number;
  centerY: number;
  ownedSize: number;
  owner: string;
  displayName?: string;
  isEmpty?: boolean;
}

// Unique client identifier for tracking local changes
const CLIENT_ID = `client_${Math.random().toString(36).substring(2, 15)}`;

// Add this utility function for line drawing (Bresenham's algorithm)
const plotLine = (x0: number, y0: number, x1: number, y1: number): {x: number, y: number}[] => {
  const points: {x: number, y: number}[] = [];
  
  // Use high-quality line algorithm with pixel-perfect coverage
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  
  // Create a set to track unique points (avoid duplicates for efficiency)
  const addedPoints = new Set<string>();

  while (true) {
    // Only add points we haven't seen before
    const pointKey = `${x0},${y0}`;
    if (!addedPoints.has(pointKey)) {
      addedPoints.add(pointKey);
      points.push({x: x0, y: y0});
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
  
  return points;
};

// Near the top of the file, add this constant for event options
const NON_PASSIVE_EVENT_OPTIONS = { passive: false };

// Utility function for handling browser fullscreen
const toggleBrowserFullScreen = () => {
  if (!document.fullscreenElement) {
    // Enter fullscreen
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    // Exit fullscreen
    document.exitFullscreen().catch(err => {
      console.error(`Error attempting to exit fullscreen: ${err.message}`);
    });
  }
};

export default function Canvas() {
  const [grid, setGrid] = useState<Map<string, string>>(new Map());
  const [viewportOffset, setViewportOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [lastPlaced, setLastPlaced] = useState<number>(0);
  const [selectedColor, setSelectedColor] = useState<string>("#000000");
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  // isLoading state might be redundant if initialDataLoaded covers the main loading screen
  // const [isLoading, setIsLoading] = useState<boolean>(true); 
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  // pendingPixelCount will now be managed by PixelBatchManager instance
  // const [pendingPixelCount, setPendingPixelCount] = useState<number>(0); 
  const [isBrowserFullScreen, setIsBrowserFullScreen] = useState<boolean>(false);
  const [isEraserActive, setIsEraserActive] = useState<boolean>(false); 
  const [eraserSize, setEraserSize] = useState<number>(1); 
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showAuthWarning, setShowAuthWarning] = useState<boolean>(false);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [quotaStatus, setQuotaStatus] = useState<{used: number, total: number, percentUsed: number}>({
    used: 0, 
    total: 100,
    percentUsed: 0
  });
  
  const [allLands, setAllLands] = useState<LandInfo[]>([]);
  const [loadingLands, setLoadingLands] = useState<boolean>(true);
  const [initialDataLoaded, setInitialDataLoaded] = useState<boolean>(false); // CHANGED from ref to state
  const [initialViewportSet, setInitialViewportSet] = useState<boolean>(false);
  
  // Colors for different land types
  const userLandBorderColor = "rgba(255, 0, 0, 0.7)"; // Current user's land - red
  const otherLandBorderColor = "rgba(0, 128, 255, 0.5)"; // Other users' lands - blue
  // FOR DEBUGGING BORDER VISIBILITY / TESTING:
  // const userLandBorderColor = "lime"; // Bright green, fully opaque
  // const otherLandBorderColor = "magenta"; // Bright magenta,fully opaque
  const emptyLandFillColor = "rgba(200, 200, 200, 0.2)"; // Light gray background for empty lands

  // Initialize with reasonable defaults instead of 0
  const [viewportCellWidth, setViewportCellWidth] = useState(100); 
  const [viewportCellHeight, setViewportCellHeight] = useState(100);
  
  // Calculate effective cell size early - MOVED UP to fix the reference error
  const effectiveCellSize = useMemo(() => CELL_SIZE * zoomLevel, [zoomLevel]);
  
  const { currentUser, userProfile } = useAuth(); // Added

  // Add a reference for the previous grid state to prevent flicker during zoom
  const previousGridRef = useRef<Map<string, string>>(new Map());
  
  const masterGridDataRef = useRef<Map<string, string>>(new Map()); // Holds ALL pixel data
  const activeChunkKeysRef = useRef<Set<string>>(new Set()); // Holds keys of chunks in current `grid` state

  const lastPositionRef = useRef<{ x: number, y: number } | null>(null);
  const lastPaintedCellRef = useRef<{ x: number, y: number } | null>(null);
  // REMOVE: localUpdateInProgressRef is not strictly needed with PixelBatchManager handling flow
  // const localUpdateInProgressRef = useRef<boolean>(false); 
  // REMOVE: pendingUpdatesRef is managed by PixelBatchManager
  // const pendingUpdatesRef = useRef<Map<string, Pixel>>(new Map()); 
  
  // USE PixelBatchManager from services
  const pixelBatchManagerRef = useRef<PixelBatchManager | null>(null);
  
  // REMOVE: updateManager was for the old PixelUpdateManager
  // const updateManager = useRef<PixelUpdateManager | null>(null); 
  // REMOVE: const initialDataLoadedRef = useRef<boolean>(false); // This is now state
  const syncInProgressRef = useRef<boolean>(false);
  const lastSyncRequestTimeRef = useRef<number>(0);
  const MIN_SYNC_INTERVAL = 5000;
  const clientIdRef = useRef<string>(CLIENT_ID);
  const optimisticUpdatesMapRef = useRef<Map<string, {timestamp: number, color: string}>>(new Map());
  const canvasContainerRef = useRef<HTMLDivElement>(null); 
  // REMOVE: pixelPaintBatchRef is managed by PixelBatchManager
  // const pixelPaintBatchRef = useRef<Pixel[]>([]); 
  // REMOVE: animationFrameIdRef is now animationFrameRequestRef for viewport/zoom
  // const animationFrameIdRef = useRef<number | null>(null);
  const panStartMousePositionRef = useRef<{ x: number, y: number } | null>(null);
  const panStartViewportOffsetRef = useRef<{ x: number, y: number } | null>(null);
  const isSpacebarHeldRef = useRef<boolean>(false); // For Spacebar + Left Click panning

  // Refs for requestAnimationFrame based viewport/zoom updates
  const latestViewportOffsetTargetRef = useRef(viewportOffset);
  const latestZoomLevelTargetRef = useRef(zoomLevel);
  const animationFrameRequestRef = useRef<number | null>(null);

  // Fixed: Properly define toggleDebugMode as a useCallback function
  const toggleDebugMode = useCallback(() => {
    setDebugMode(prev => !prev);
    console.log("Debug mode toggled:", !debugMode);
  }, [debugMode]);

  // Effect to keep RAF target refs in sync with state if changed by other means
  useEffect(() => {
    latestViewportOffsetTargetRef.current = viewportOffset;
  }, [viewportOffset]);

  useEffect(() => {
    latestZoomLevelTargetRef.current = zoomLevel;
  }, [zoomLevel]);

  // RAF callback to apply batched viewport/zoom state updates
  const processViewportUpdatesRAF = useCallback(() => {
    setViewportOffset(latestViewportOffsetTargetRef.current);
    setZoomLevel(latestZoomLevelTargetRef.current);
    animationFrameRequestRef.current = null;
  }, [setViewportOffset, setZoomLevel]); // setViewportOffset and setZoomLevel are stable

  // Function to request an animation frame for viewport/zoom updates
  const requestViewportUpdateRAF = useCallback(() => {
    if (!animationFrameRequestRef.current) {
      animationFrameRequestRef.current = requestAnimationFrame(processViewportUpdatesRAF);
    }
  }, [processViewportUpdatesRAF]);


  // Add the handleWheel function here inside the component
  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement> | WheelEvent) => {
    if (!canvasContainerRef.current) return;
    
    event.preventDefault(); // Always prevent default for custom handling

    const currentZoom = latestZoomLevelTargetRef.current; // Use target ref for calculations
    const currentOffset = latestViewportOffsetTargetRef.current; // Use target ref
    const currentEffectiveCellSize = CELL_SIZE * currentZoom;


    if (event.ctrlKey || event.metaKey) { // Support both Ctrl (Windows/Linux) and Cmd (Mac)
      previousGridRef.current = new Map(grid); // For flicker reduction, not direct responsiveness
      
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const mouseXOnCanvas = event.clientX - rect.left;
      const mouseYOnCanvas = event.clientY - rect.top;

      const worldXBeforeZoom = currentOffset.x + mouseXOnCanvas / currentEffectiveCellSize;
      const worldYBeforeZoom = currentOffset.y + mouseYOnCanvas / currentEffectiveCellSize;

      const zoomFactor = event.deltaY < 0 ? (1 + ZOOM_SENSITIVITY) : (1 - ZOOM_SENSITIVITY);
      let newZoomLevelTarget = currentZoom * zoomFactor;
      newZoomLevelTarget = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevelTarget));
      
      const newEffectiveCellSizeTarget = CELL_SIZE * newZoomLevelTarget;

      const newViewportXTarget = worldXBeforeZoom - mouseXOnCanvas / newEffectiveCellSizeTarget;
      const newViewportYTarget = worldYBeforeZoom - mouseYOnCanvas / newEffectiveCellSizeTarget;
      
      latestZoomLevelTargetRef.current = newZoomLevelTarget;
      latestViewportOffsetTargetRef.current = { x: newViewportXTarget, y: newViewportYTarget };
      requestViewportUpdateRAF();

    } else { // Panning
      let scrollPixelX = event.deltaX;
      let scrollPixelY = event.deltaY;

      if (event.deltaMode === 1) { 
          scrollPixelX *= PIXELS_PER_LINE;
          scrollPixelY *= PIXELS_PER_LINE;
      } else if (event.deltaMode === 2) { 
          if (canvasContainerRef.current) {
              scrollPixelX *= canvasContainerRef.current.clientWidth * 0.8;
              scrollPixelY *= canvasContainerRef.current.clientHeight * 0.8;
          }
      }

      if (event.shiftKey && scrollPixelY !== 0 && scrollPixelX === 0) {
          scrollPixelX = scrollPixelY;
          scrollPixelY = 0;
      }
      
      const panXAmount = scrollPixelX / currentEffectiveCellSize;
      const panYAmount = scrollPixelY / currentEffectiveCellSize;

      latestViewportOffsetTargetRef.current = {
          x: currentOffset.x + panXAmount,
          y: currentOffset.y + panYAmount,
      };
      // Ensure zoom target ref is also current, even if only offset changes
      latestZoomLevelTargetRef.current = currentZoom; 
      requestViewportUpdateRAF();
    }
  }, [grid, requestViewportUpdateRAF]); // Removed zoomLevel, viewportOffset, effectiveCellSize as direct deps

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
    if (!initialDataLoaded) return;

    const visibleKeys = getVisibleChunkKeys();
    const newGrid = new Map(grid); // Start with the current grid state

    visibleKeys.forEach(chunkKey => {
      const [chunkRegX, chunkRegY] = chunkKey.split(':').map(Number);
      const startX = chunkRegX * CHUNK_SIZE;
      const endX = startX + CHUNK_SIZE;
      const startY = chunkRegY * CHUNK_SIZE;
      const endY = startY + CHUNK_SIZE;

      for (let wy = startY; wy < endY; wy++) {
        for (let wx = startX; wx < endX; wx++) {
          const pixelKey = getPixelKey(wx, wy);
          const color = masterGridDataRef.current.get(pixelKey);
          if (color && (!newGrid.has(pixelKey) || newGrid.get(pixelKey) !== color)) {
            newGrid.set(pixelKey, color);
          }
        }
      }
    });

    activeChunkKeysRef.current = visibleKeys;
    setGrid(newGrid);
  }, [getVisibleChunkKeys, CHUNK_SIZE, initialDataLoaded, grid]);

  useEffect(() => {
    if (initialDataLoaded) { // CHANGED
      updateGridFromVisibleChunks();
    }
  }, [viewportOffset, zoomLevel, viewportCellWidth, viewportCellHeight, updateGridFromVisibleChunks, initialDataLoaded]); // CHANGED: Added initialDataLoaded

  // Modify the requestFullSync function to ensure initial data is loaded
  const requestFullSync = useCallback(async () => {
    if (syncInProgressRef.current || 
        Date.now() - lastSyncRequestTimeRef.current < SYNC_THROTTLE_MS) {
      console.log("Full sync request throttled or already in progress.");
      return;
    }
    
    pixelBatchManagerRef.current?.clear(); // Clear any pending batches before full sync

    syncInProgressRef.current = true;
    lastSyncRequestTimeRef.current = Date.now();
    
    let cachedPixels: Array<{ key: string, value: string, timestamp: number }> = [];
    if (LOCAL_CACHE_ENABLED) {
      try {
        cachedPixels = await getLocalCache(true) || [];
        console.log(`[Canvas] requestFullSync: Loaded ${cachedPixels.length} pixels from local cache.`);
      } catch (error) {
        console.error("[Canvas] requestFullSync: Error loading from local cache:", error);
      }
    }

    try {
      masterGridDataRef.current.clear(); 

      if (USE_CHUNKED_STORAGE) {
        console.log("requestFullSync: Performing full sync from Firestore chunks");
        const chunksCollectionRef = collection(fs, CHUNK_COLLECTION); // fs is Firestore
        const querySnapshot = await getDocs(chunksCollectionRef);

        querySnapshot.forEach(doc => {
            const chunkData = doc.data();
            if (chunkData.pixels) {
                // The 'pixels' field is an object where keys are local coords "lx:ly"
                // and values are objects { worldX, worldY, color, ... }
                Object.values(chunkData.pixels).forEach((pixelEntry: any) => {
                    if (pixelEntry && typeof pixelEntry.worldX === 'number' && typeof pixelEntry.worldY === 'number' && typeof pixelEntry.color === 'string') {
                        masterGridDataRef.current.set(getPixelKey(pixelEntry.worldX, pixelEntry.worldY), pixelEntry.color);
                    }
                });
            }
        });
        console.log(`requestFullSync: Loaded ${masterGridDataRef.current.size} pixels from ${querySnapshot.size} Firestore chunks.`);
      } else {
        console.log("requestFullSync: Performing full sync from Firebase Realtime Database");
        const pixelsRef = ref(db, PIXELS_PATH); // db is Realtime Database
        const snapshot = await get(pixelsRef);
        
        if (snapshot.exists()) {
          const pixelData = snapshot.val();
          
          Object.entries(pixelData).forEach(([key, value]: [string, any]) => {
            const [xStr, yStr] = key.split(':');
            const x = parseInt(xStr, 10);
            const y = parseInt(yStr, 10);

            if (!isNaN(x) && !isNaN(y) && value && typeof value.color === 'string') {
              masterGridDataRef.current.set(getPixelKey(x,y), value.color);
            }
          });
        }
        console.log(`requestFullSync: Loaded ${masterGridDataRef.current.size} pixels from Realtime Database.`);
      }

      // Merge cached pixels back into masterGridDataRef, prioritizing cached versions.
      if (LOCAL_CACHE_ENABLED && cachedPixels.length > 0) {
        let mergedCount = 0;
        cachedPixels.forEach(cachedPixel => {
          // Assuming cachedPixel.key is in "x:y" format
          // And cachedPixel.value is the color string
          // Timestamps could be used here for a more sophisticated merge if server data also had reliable timestamps.
          // For now, local cache wins.
          masterGridDataRef.current.set(cachedPixel.key, cachedPixel.value);
          
          // Also, ensure optimisticUpdatesMapRef reflects these important cached values
          // if their timestamp is recent enough or if we want to ensure they are treated as optimistic.
          // This helps prevent immediate overwrites by slightly delayed WebSocket updates if the cache
          // held something more recent than what the server just provided.
          const existingOptimistic = optimisticUpdatesMapRef.current.get(cachedPixel.key);
          if (!existingOptimistic || (cachedPixel.timestamp && existingOptimistic.timestamp < cachedPixel.timestamp)) {
            optimisticUpdatesMapRef.current.set(cachedPixel.key, {
              timestamp: cachedPixel.timestamp || Date.now(), // Fallback timestamp if undefined
              color: cachedPixel.value
            });
          }
          mergedCount++;
        });
        console.log(`[Canvas] requestFullSync: Merged ${mergedCount} pixels from local cache into master grid.`);
      }
      
      setLastSyncTime(Date.now());
      setInitialDataLoaded(true); 
      console.log("requestFullSync: Called setInitialDataLoaded(true).");
      console.log("Current viewport dimensions:", {viewportCellWidth, viewportCellHeight});

      updateGridFromVisibleChunks(); 
      
      console.log("Full sync completed and master grid populated.");
    } catch (error) {
      console.error("requestFullSync: Error performing sync:", error);
      setInitialDataLoaded(true); 
      console.log("requestFullSync (error path): Called setInitialDataLoaded(true).");
      updateGridFromVisibleChunks();
    } finally {
      syncInProgressRef.current = false;
    }
  }, [updateGridFromVisibleChunks, SYNC_THROTTLE_MS, viewportCellWidth, viewportCellHeight, setInitialDataLoaded, getPixelKey]); // Added getPixelKey

  // Debug logging for landInfo and permissions
  useEffect(() => {
    if (currentUser && userProfile && userProfile.landInfo) {
      console.log("LAND BOUNDARIES DEBUG INFO:");
      console.log("Current User:", currentUser.uid);
      console.log("Land Info:", {
        centerX: userProfile.landInfo.centerX,
        centerY: userProfile.landInfo.centerY,
        ownedSize: userProfile.landInfo.ownedSize,
        expandableRadius: userProfile.landInfo.expandableRadius
      });
    } else {
      console.log("No land info available - User not logged in or profile not loaded");
    }
  }, [currentUser, userProfile]);

  const canDrawAtPoint = useCallback((worldX: number, worldY: number): boolean => {
    // CRITICAL FIX: Ensure this function always returns false if no land info
    if (!currentUser || !userProfile || !userProfile.landInfo) {
      console.log(`canDrawAtPoint DENIED: No user/profile/landInfo. User: ${!!currentUser}, Profile: ${!!userProfile}, LandInfo: ${!!userProfile?.landInfo}`);
      return false;
    }
    
    if (!userProfile.landInfo.centerX && userProfile.landInfo.centerX !== 0) {
      console.error("CRITICAL ERROR: userProfile.landInfo.centerX is undefined or null!");
      return false;
    }
    if (!userProfile.landInfo.centerY && userProfile.landInfo.centerY !== 0) {
      console.error("CRITICAL ERROR: userProfile.landInfo.centerY is undefined or null!");
      return false;
    }
    if (!userProfile.landInfo.ownedSize) {
      console.error("CRITICAL ERROR: userProfile.landInfo.ownedSize is undefined or null!");
      return false;
    }

    const { centerX, centerY, ownedSize } = userProfile.landInfo;
    const halfSize = Math.floor(ownedSize / 2);
    
    // For debug mode logging
    if (debugMode) {
      console.log(
        `canDrawAtPoint CHECK: Point (${worldX}, ${worldY}), Center: (${centerX}, ${centerY}), halfSize: ${halfSize}`
      );
    }

    // Check if the point is within the user's owned area (square)
    const isWithinX = worldX >= centerX - halfSize && worldX <= centerX + halfSize;
    const isWithinY = worldY >= centerY - halfSize && worldY <= centerY + halfSize;
    const canDraw = isWithinX && isWithinY;

    // Log denied attempts 
    if (!canDraw && debugMode) {
      console.warn(
        `canDrawAtPoint DENIED: Point (${worldX}, ${worldY}), Center: (${centerX}, ${centerY}), halfSize: ${halfSize}, ` +
        `isWithinX: ${isWithinX}, isWithinY: ${isWithinY}`
      );
    }
    
    return canDraw;
  }, [currentUser, userProfile, debugMode]);

  const updateMultiplePixels = useCallback(async (pixelsToProcess: Pixel[]) => {
    if (!pixelsToProcess.length) return false;
    
    const allowedPixels = pixelsToProcess.filter(p => canDrawAtPoint(p.x, p.y));
    
    if (!allowedPixels.length) {
      if (!currentUser && !showAuthWarning) { 
        setShowAuthWarning(true);
      }
      console.log('[Canvas] updateMultiplePixels: No allowed pixels to process.');
      return false; // Indicate no pixels were processed
    }
    
    setShowAuthWarning(false);
    
    const timestamp = Date.now();
    const enhancedPixels = allowedPixels.map(pixel => ({
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

    // Optimistically update the visible grid state - this makes drawing feel responsive
    setGrid(prevGrid => {
      const newGrid = new Map(prevGrid);
      let hasChanges = false;
      enhancedPixels.forEach(({ x, y, color }) => {
        const pixelKey = getPixelKey(x, y);
        const chunkKey = getChunkKeyForPixel(x, y);
        if(activeChunkKeysRef.current.has(chunkKey)) { 
          if (newGrid.get(pixelKey) !== color) {
            newGrid.set(pixelKey, color);
            hasChanges = true;
          }
        }
      });
      return hasChanges ? newGrid : prevGrid;
    });
    
    // Local cache update (immediately) - this improves offline experience
    if (LOCAL_CACHE_ENABLED) {
      try {
        await updateLocalCache(enhancedPixels.map(p => ({ 
          key: getPixelKey(p.x, p.y), 
          value: p.color,
          timestamp
        })));
      } catch (err) {
        console.error("Error updating local cache:", err);
      }
    }
    
    // WebSocket updates - these are fast but not guaranteed persistent
    let wsUpdateSuccess = false;
    if (wsConnected) {
      try {
        const WS_BATCH_SIZE = 50;
        for (let i = 0; i < enhancedPixels.length; i += WS_BATCH_SIZE) { 
          const batch = enhancedPixels.slice(i, i + WS_BATCH_SIZE); 
          websocketService.send('pixel_update', batch); // Assuming send is fire-and-forget or returns boolean quickly
        }
        wsUpdateSuccess = true; // Assume success if send doesn't throw immediately
        console.log('[Canvas] updateMultiplePixels: WebSocket update sent.');
      } catch (error) {
        console.error("[Canvas] updateMultiplePixels: WebSocket batch send error:", error);
        wsUpdateSuccess = false;
      }
    }
      
    // Firestore operations via QuotaManager - more robust but slower
    let firestoreUpdateAttempted = false;
    let firestoreUpdateSuccess = false;
    try {
      const currentQuotaStatus = quotaManager.getQuotaStatus();
      setQuotaStatus(currentQuotaStatus);
      const hasQuotaLeft = currentQuotaStatus.percentUsed < (QUOTA_SAFETY_MARGIN * 100);
        
      if (!hasQuotaLeft) {
        console.warn(`[Canvas] updateMultiplePixels: Firestore quota at ${currentQuotaStatus.percentUsed.toFixed(1)}%, using local/WS only operations for this batch`);
        // If quota is full, we don't attempt Firestore write, so success depends on WebSocket
        return wsUpdateSuccess; 
      }
        
      firestoreUpdateAttempted = true;
      if (USE_CHUNKED_STORAGE) {
        const pixelsByChunk = new Map<string, Pixel[]>();
        
        // Group pixels by chunk to minimize Firestore operations
        enhancedPixels.forEach(pixel => {
          const chunkKey = getChunkKeyForPixel(pixel.x, pixel.y);
          if (!pixelsByChunk.has(chunkKey)) {
            pixelsByChunk.set(chunkKey, []);
          }
          pixelsByChunk.get(chunkKey)!.push(pixel);
        });
          
        for (const [chunkKey, chunkPixels] of pixelsByChunk.entries()) {
          try {
            const pixelUpdatesForFirestore: Record<string, any> = {};
            chunkPixels.forEach(({ x, y, color, timestamp: opTimestamp, clientId: opClientId }) => {
              const localKey = `${x % CHUNK_SIZE}:${y % CHUNK_SIZE}`;
              pixelUpdatesForFirestore[localKey] = { 
                worldX: x, 
                worldY: y, 
                color, 
                timestamp: opTimestamp, 
                clientId: opClientId 
              };
            });
            
            console.log(`[Canvas] updateMultiplePixels: Queuing chunk ${chunkKey} for Firestore write.`);
            await quotaManager.safeWrite({
              path: `firestore/${CHUNK_COLLECTION}/${chunkKey}`,
              type: 'update',
              data: { 
                pixels: pixelUpdatesForFirestore, 
                lastUpdated: timestamp 
              }
            });
            // Assuming safeWrite queues successfully, we mark this part as "successful" for now
            // The actual write happens asynchronously via QuotaManager
          } catch (chunkError) {
            // Log chunk error but continue with other chunks
            console.error(`[Canvas] updateMultiplePixels: Error queuing chunk ${chunkKey}:`, chunkError);
            firestoreDebugger.logError(chunkError, `${CHUNK_COLLECTION}/${chunkKey}`, 'update');
            // If one chunk fails to queue, we might still succeed with others.
            // For simplicity, we'll still aim for an overall success if any chunk is queued.
          }
        }
        firestoreUpdateSuccess = true; // If loop completes, assume queuing was successful for attempts made
      } else {
        // Original non-chunked batch update approach via quotaManager
        const updates: Record<string, any> = {};
        enhancedPixels.forEach(({ x, y, color, timestamp: opTimestamp, clientId: opClientId }) => {
          updates[getPixelKey(x,y)] = { color, timestamp: opTimestamp, clientId: opClientId };
        });
        
        console.log('[Canvas] updateMultiplePixels: Queuing non-chunked update for Firestore write.');
        await quotaManager.safeWrite({ 
          path: `${PIXELS_PATH}`, 
          type: 'update', 
          data: updates 
        });
        firestoreUpdateSuccess = true; // Assume queuing was successful
      }
    } catch (error) {
      console.error("[Canvas] updateMultiplePixels: Error during Firestore operation queuing:", error);
      firestoreDebugger.logError(error, 'updateMultiplePixels', 'batch');
      firestoreUpdateSuccess = false;
    }

    // Return true if either WebSocket or Firestore queuing was successful.
    // The PixelBatchManager uses this return value. If true, batch is cleared.
    // If false, batch might be retried.
    // Prioritize Firestore success for persistence.
    if (firestoreUpdateAttempted) {
      return firestoreUpdateSuccess;
    }
    return wsUpdateSuccess; // Fallback to WS success if Firestore wasn't attempted (e.g. no quota)

  }, [wsConnected, clientIdRef, getChunkKeyForPixel, canDrawAtPoint, currentUser, showAuthWarning, getPixelKey, CHUNK_SIZE, PIXELS_PATH, quotaManager, firestoreDebugger, setQuotaStatus]);


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
    
    // Ensure we have a last position, even if doing first click-drag
    const lastPosition = lastPositionRef.current || currentPosition;
      
    // Calculate distance moved since last point
    const dx = Math.abs(currentPosition.x - lastPosition.x);
    const dy = Math.abs(currentPosition.y - lastPosition.y);
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Generate line points between last position and current position
    // For very fast movements, generate more intermediary points
    // This ensures we don't miss pixels even during fast drawing
    let linePoints: {x: number, y: number}[] = [];
    
    // For longer distances, increase density of points for smoother lines
    if (distance > 10) {
      // Create more intermediary points for long lines
      const steps = Math.ceil(distance * 1.5); // 1.5 points per unit of distance
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(lastPosition.x + (currentPosition.x - lastPosition.x) * t);
        const y = Math.round(lastPosition.y + (currentPosition.y - lastPosition.y) * t);
        linePoints.push({x, y});
      }
    } else {
      // For shorter movements, use the standard Bresenham line algorithm
      linePoints = plotLine(lastPosition.x, lastPosition.y, currentPosition.x, currentPosition.y);
    }
      
    const pixelsToBatch: Pixel[] = [];
    const effectiveColor = getEffectiveColor();

    // Process each point in the line
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
      
    // Add to PixelBatchManager
    if (pixelsToBatch.length > 0 && pixelBatchManagerRef.current) {
      // Filter for optimistic update before adding to batch manager
      const drawablePixelsForOptimisticUpdate = pixelsToBatch.filter(p => canDrawAtPoint(p.x, p.y));
      
      // Use a Set to ensure we don't have duplicate pixels in the update
      // This prevents wasteful redrawing of the same pixel
      const uniqueDrawablePixels = new Map<string, Pixel>();
      drawablePixelsForOptimisticUpdate.forEach(pixel => {
        const key = `${pixel.x}:${pixel.y}`;
        uniqueDrawablePixels.set(key, pixel);
      });
      
      const uniquePixelsArray = Array.from(uniqueDrawablePixels.values());
      
      if (uniquePixelsArray.length > 0) {
        // Optimistic UI update for responsiveness
        setGrid(prevGrid => {
          const newGrid = new Map(prevGrid);
          let hasChanges = false;
          uniquePixelsArray.forEach(({ x, y, color }) => {
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
        setLastPlaced(Date.now());
        
        // Add all pixels to the batch manager
        console.log(`[Canvas] paintCellOnMove: Adding ${uniquePixelsArray.length} unique updates to PixelBatchManager`);
        pixelBatchManagerRef.current.addUpdates(uniquePixelsArray);
      }
    }
      
    // Always update lastPositionRef with the current position to ensure continuous drawing
    lastPositionRef.current = currentPosition;
  }, [isMouseDown, isPanning, getEffectiveColor, memoizedCanPlacePixel, isEraserActive, eraserSize, getPixelsInEraserArea, getChunkKeyForPixel, canDrawAtPoint, setLastPlaced, getPixelKey]);

  // Improve mouse movement handling for smoother drawing
  const handleWindowMouseMove = useCallback((event: MouseEvent) => {
    if (isPanning && panStartMousePositionRef.current && panStartViewportOffsetRef.current) {
      const currentEffectiveCellSize = CELL_SIZE * latestZoomLevelTargetRef.current; // Use target ref
      if (currentEffectiveCellSize === 0) return; // Avoid division by zero

      const deltaX = event.clientX - panStartMousePositionRef.current.x;
      const deltaY = event.clientY - panStartMousePositionRef.current.y;

      const offsetDeltaX = deltaX / currentEffectiveCellSize; 
      const offsetDeltaY = deltaY / currentEffectiveCellSize;
      
      const newViewportXTarget = panStartViewportOffsetRef.current.x - offsetDeltaX;
      const newViewportYTarget = panStartViewportOffsetRef.current.y - offsetDeltaY;

      latestViewportOffsetTargetRef.current = { x: newViewportXTarget, y: newViewportYTarget };
      // Ensure zoom target ref is also current
      latestZoomLevelTargetRef.current = zoomLevel; // Read from current state for this one-off sync
      requestViewportUpdateRAF();

    } else if (isMouseDown && !isPanning && canvasContainerRef.current) { // isMouseDown is true only for drawing
      const currentEffectiveCellSize = CELL_SIZE * zoomLevel; // Use committed zoom for drawing coordinate calculation
      if (currentEffectiveCellSize === 0) return;

      const rect = canvasContainerRef.current.getBoundingClientRect();
      
      const canvasX = Math.floor((event.clientX - rect.left) / currentEffectiveCellSize);
      const canvasY = Math.floor((event.clientY - rect.top) / currentEffectiveCellSize);

      const currentCommittedOffset = viewportOffset; // Use committed offset for drawing coordinate calculation
      const worldX = Math.floor(canvasX + currentCommittedOffset.x);
      const worldY = Math.floor(canvasY + currentCommittedOffset.y);

      // Get the last painted cell position
      const lastCell = lastPaintedCellRef.current;
      
      // If the new position is different from the last painted cell,
      // or we don't have a last painted cell yet, paint the cell
      if (!lastCell || lastCell.x !== worldX || lastCell.y !== worldY) {
        paintCellOnMove(worldX, worldY);
        lastPaintedCellRef.current = { x: worldX, y: worldY };
        
        // Set a timestamp for debugging fast-drawing issues
        const now = Date.now();
        if (debugMode && (!lastDrawTimestampRef.current || now - lastDrawTimestampRef.current > 100)) {
          console.log(`[Canvas] Drew at (${worldX}, ${worldY}) at ${new Date().toISOString().slice(11, 23)}`);
          lastDrawTimestampRef.current = now;
        }
      }
    }
  }, [isPanning, isMouseDown, paintCellOnMove, requestViewportUpdateRAF, zoomLevel, viewportOffset, debugMode]);

  // Add this missing handler for mouse up events
  const handleWindowMouseUp = useCallback((event: MouseEvent) => {
    // End panning if active
    if (isPanning) {
      setIsPanning(false);
      panStartMousePositionRef.current = null;
      panStartViewportOffsetRef.current = null;
      if (canvasContainerRef.current) {
        canvasContainerRef.current.style.cursor = isSpacebarHeldRef.current ? 'grab' : 'default';
      }
      document.body.style.cursor = 'default';
    }
    // End drawing if active
    if (isMouseDown) {
      setIsMouseDown(false);
      lastPaintedCellRef.current = null;
      lastPositionRef.current = null;
    }
  }, [isPanning, isMouseDown]);

  // Improve canvas mouse down to better initialize the drawing state
  const handleCanvasMouseDown = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const screenX = event.clientX;
    const screenY = event.clientY;

    // console.log("handleCanvasMouseDown: UserProfile in Canvas:", userProfile ? userProfile.landInfo : "No profile");

    if (event.button === 0) { // Left click
        if (isSpacebarHeldRef.current) {
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
            
            // console.log(`handleCanvasMouseDown: Attempting to draw at (${worldX}, ${worldY}). Checking canDrawAtPoint.`);

            if (!canDrawAtPoint(worldX, worldY)) {
                if (!currentUser && !showAuthWarning) { 
                    setShowAuthWarning(true);
                    console.warn("Login required to draw.");
                } else if (currentUser && userProfile?.landInfo) { 
                    console.warn(`Cannot draw at (${worldX}, ${worldY}). Outside land boundaries. Center: (${userProfile.landInfo.centerX}, ${userProfile.landInfo.centerY}), Radius: ${userProfile.landInfo.expandableRadius}`);
                }
                return; // Prevent drawing
            }
            setShowAuthWarning(false); // Clear warning if drawing is allowed


            // if (animationFrameIdRef.current) {
            //     cancelAnimationFrame(animationFrameIdRef.current);
            //     animationFrameIdRef.current = null;
            // }
            // pixelPaintBatchRef.current = []; // Not needed with PixelBatchManager
            lastPositionRef.current = { x: worldX, y: worldY };
            lastPaintedCellRef.current = { x: worldX, y: worldY }; // Ensure last painted cell is set

            if (memoizedCanPlacePixel() || COOLDOWN_SECONDS === 0) {
                const effectiveColor = getEffectiveColor();
                let pixelsToUpdate: Pixel[];

                if (isEraserActive) {
                    pixelsToUpdate = getPixelsInEraserArea(worldX, worldY, eraserSize, effectiveColor);
                } else {
                    pixelsToUpdate = [{ x: worldX, y: worldY, color: effectiveColor }];
                }
                
                const drawablePixels = pixelsToUpdate.filter(p => canDrawAtPoint(p.x, p.y));

                if (drawablePixels.length > 0) {
                  // Optimistic UI update
                  const timestamp = Date.now();
                  drawablePixels.forEach(pixel => {
                      masterGridDataRef.current.set(getPixelKey(pixel.x, pixel.y), pixel.color);
                      optimisticUpdatesMapRef.current.set(getPixelKey(pixel.x, pixel.y), { timestamp, color: pixel.color });
                  });

                  setGrid(prevGrid => {
                      const newGrid = new Map(prevGrid);
                      let hasChanges = false;
                      drawablePixels.forEach(pixel => {
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
                  
                  // Add to PixelBatchManager
                  if (pixelBatchManagerRef.current) {
                    const pixelsForBatchManager = drawablePixels.map(p => ({...p, clientId: clientIdRef.current, timestamp }));
                    console.log('[Canvas] handleCanvasMouseDown: Adding updates to PixelBatchManager:', pixelsForBatchManager);
                    pixelBatchManagerRef.current.addUpdates(pixelsForBatchManager);
                  }
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
  }, [viewportOffset, memoizedCanPlacePixel, getEffectiveColor, isEraserActive, eraserSize, getPixelsInEraserArea, updateMultiplePixels, setLastPlaced, setIsMouseDown, setIsPanning, clientIdRef, isPanning, effectiveCellSize, getChunkKeyForPixel, canDrawAtPoint, currentUser, userProfile, showAuthWarning, setShowAuthWarning, debugMode]);
  

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
  }, [effectiveCellSize]); 

  // This effect runs once to load all initial data
  useEffect(() => {
    const loadData = async () => {
      console.log("Canvas mount: Requesting initial data sync from Firebase.");
      await requestFullSync();
    };

    loadData();
  }, [requestFullSync]); // requestFullSync is stable due to useCallback

  const fetchAllLands = useCallback(async () => {
    console.log("fetchAllLands: Function called.");
    setLoadingLands(true);
    
    // Ensure currentUser is available before proceeding
    if (!currentUser) {
      console.log("fetchAllLands: No current user, aborting land fetch.");
      setLoadingLands(false);
      setAllLands([]); // Clear any existing lands if user logs out
      return;
    }
    
    try {
      // Attempt to load from IndexedDB first
      const dbInstance = await openDB('dotverse', 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('lands')) {
            db.createObjectStore('lands', { keyPath: 'id' });
          }
        },
      });
      
      const txCache = dbInstance.transaction('lands', 'readonly');
      const storeCache = txCache.objectStore('lands');
      
      // Track all lands with a Set to avoid duplicates
      const lands: LandInfo[] = [];
      const seenCenters = new Set<string>();
      
      console.log("fetchAllLands: Starting to fetch all user lands from Firestore (global)...");

      // 1. Check the dedicated 'lands' collection (global lands)
      console.log("fetchAllLands: Querying 'lands' collection...");
      const landsCollectionRef = collection(fs, 'lands');
      const landsCollectionQuery = query(landsCollectionRef);
      const landsSnapshot = await getDocs(landsCollectionQuery);

      if (!landsSnapshot.empty) {
        console.log(`fetchAllLands: Found ${landsSnapshot.size} documents in 'lands' collection.`);
        landsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          const docId = doc.id;

          if (data.size && data.owner && data.isBorder !== true) {
            const coords = docId.split(',');
            if (coords.length === 2) {
              const centerX = parseInt(coords[0], 10);
              const centerY = parseInt(coords[1], 10);

              if (!isNaN(centerX) && !isNaN(centerY)) {
                const centerKey = `${centerX}:${centerY}`;

                const isCurrentUserOwnLand = currentUser && userProfile?.landInfo &&
                                        userProfile.landInfo.centerX === centerX &&
                                        userProfile.landInfo.centerY === centerY &&
                                        currentUser.uid === data.owner;

                if (isCurrentUserOwnLand) {
                  // Skip current user's own land
                } else if (seenCenters.has(centerKey)) {
                  // Skip already seen land
                } else {
                  seenCenters.add(centerKey);
                  lands.push({
                    centerX,
                    centerY,
                    ownedSize: data.size,
                    owner: data.owner,
                    displayName: data.displayName || `User ${data.owner.substring(0, 6)}`,
                    isEmpty: data.isEmpty === undefined ? false : data.isEmpty, // Default to not empty unless specified
                  });
                }
              }
            }
          }
        });
      } else {
        console.log("fetchAllLands: 'lands' collection is empty or no matching documents.");
      }

      // 2. Check user profiles for land info (if `lands` collection isn't the sole source)
      console.log("fetchAllLands: Querying 'users' collection for landInfo...");
      const usersRef = collection(fs, 'users');
      const usersQueryFs = query(usersRef);
      const usersSnapshot = await getDocs(usersQueryFs);

      if (!usersSnapshot.empty) {
        console.log(`fetchAllLands: Found ${usersSnapshot.size} user profiles in 'users' collection.`);
        usersSnapshot.docs.forEach(userDoc => {
          const userData = userDoc.data();
          const userId = userDoc.id;

          if (userData?.landInfo?.centerX !== undefined &&
              userData?.landInfo?.centerY !== undefined &&
              userData?.landInfo?.ownedSize &&
              userId !== currentUser.uid) { // Ensure it's not the current user's land from their profile

            const { centerX, centerY, ownedSize } = userData.landInfo;
            const owner = userId;
            const centerKey = `${centerX}:${centerY}`;

            if (!seenCenters.has(centerKey)) { // Check if already added from 'lands' collection
              seenCenters.add(centerKey);
              lands.push({
                centerX,
                centerY,
                ownedSize,
                owner,
                displayName: userData.displayName || `User ${owner.substring(0,6)}`,
                isEmpty: userData.landInfo.isEmpty === undefined ? false : userData.landInfo.isEmpty,
              });
            }
          }
        });
      } else {
        console.log("fetchAllLands: 'users' collection is empty.");
      }
      
      console.log(`fetchAllLands: Total unique other lands compiled: ${lands.length}.`);
      setAllLands(lands);

    } catch (error) {
      console.error("Error fetching all lands:", error);
      setAllLands([]); // Clear lands on error
    } finally {
      setLoadingLands(false);
      console.log("fetchAllLands: Function finished.");
    }
  }, [currentUser, userProfile]); // fs, collection, getDocs, query from 'firebase/firestore' are stable

  // Effect to load lands from IndexedDB on initial load
  useEffect(() => {
    // This effect was for loading current user's lands from cache.
    // Since fetchAllLands now fetches global lands, this might be redundant or need adjustment
    // if current user's land is also part of `allLands` and needs caching.
    // For now, let's rely on the main fetchAllLands triggered by initialDataLoaded.
    // If caching for *other* lands is desired, fetchAllLands would need to implement it.
    console.log("useEffect for loading lands from cache (currently placeholder). currentUser:", !!currentUser);
    if (initialDataLoaded && currentUser) {
        // fetchAllLands is already called when initialDataLoaded becomes true.
        // No need for a separate call here unless the logic is different.
    }
  }, [currentUser, initialDataLoaded, fetchAllLands]); // Added fetchAllLands to dependencies

  useEffect(() => {
    websocketService.connect();
    websocketService.onConnectionChange((connected) => {
      setWsConnected(connected);
      if (connected && initialDataLoaded) { // CHANGED
        requestFullSync();
      }
    });
    
    const handlePixelUpdate = (data: any) => {
      const incomingPixels: Pixel[] = Array.isArray(data) ? data : (data ? [data] : []);
      if (incomingPixels.length === 0) return;

      const actuallyChangedMasterGrid: Pixel[] = [];

      incomingPixels.forEach((pixel) => {
        if (typeof pixel.x !== 'number' || typeof pixel.y !== 'number' || typeof pixel.color !== 'string') {
          console.warn("[Canvas] WS handlePixelUpdate: Received invalid pixel data", pixel);
          return; // Skip this invalid pixel
        }

        const pixelKey = getPixelKey(pixel.x, pixel.y);
        const optimisticEntry = optimisticUpdatesMapRef.current.get(pixelKey);
        let applyUpdateToMaster = true;

        if (optimisticEntry) {
          if (pixel.clientId === clientIdRef.current) {
            // Echo of our own write
            if (pixel.timestamp && optimisticEntry.timestamp > pixel.timestamp) {
              // Our local optimistic update is newer than this echo. Ignore the echo.
              applyUpdateToMaster = false;
              // console.log(`[Canvas] WS handlePixelUpdate: Ignored older echo for ${pixelKey}. Optimistic: ${optimisticEntry.timestamp}, Echo: ${pixel.timestamp}`);
            } else {
              // Echo confirms our optimistic update (or is newer). Clear optimistic flag.
              // console.log(`[Canvas] WS handlePixelUpdate: Confirmed optimistic ${pixelKey} by echo. Optimistic: ${optimisticEntry.timestamp}, Echo: ${pixel.timestamp}`);
              optimisticUpdatesMapRef.current.delete(pixelKey);
            }
          } else {
            // Update from another client for a pixel we optimistically updated.
            // Their update takes precedence over our unconfirmed one. Clear our optimistic flag.
            // console.log(`[Canvas] WS handlePixelUpdate: Other client ${pixel.clientId} overwrote optimistic ${pixelKey}.`);
            optimisticUpdatesMapRef.current.delete(pixelKey);
          }
        }

        if (applyUpdateToMaster) {
          if (masterGridDataRef.current.get(pixelKey) !== pixel.color) {
            masterGridDataRef.current.set(pixelKey, pixel.color);
            actuallyChangedMasterGrid.push(pixel);
          }
        }
      });

      if (actuallyChangedMasterGrid.length > 0) {
        setGrid(prevGrid => {
          const newGrid = new Map(prevGrid);
          actuallyChangedMasterGrid.forEach(p => {
            const currentPixelKey = getPixelKey(p.x, p.y);
            const chunkKeyForPixel = getChunkKeyForPixel(p.x, p.y);
            if (activeChunkKeysRef.current.has(chunkKeyForPixel)) {
              newGrid.set(currentPixelKey, p.color);
            }
          });
          return newGrid;
        });
      }
    };

    
    const handleCanvasReset = () => {
      console.log("Received canvas reset via WebSocket");
      
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
      if (Date.now() - 60000 > lastSyncTime && initialDataLoaded) { // CHANGED
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
  }, [requestFullSync, lastSyncTime, getChunkKeyForPixel, initialDataLoaded]); // CHANGED: Added initialDataLoaded
  
  
  const loadGridChunk = useCallback(async (startX: number, startY: number, endX: number, endY: number) => {
    console.warn("loadGridChunk is stubbed for infinite canvas. Data is loaded via requestFullSync.");
    // In a full implementation, this would fetch a specific region from Firebase.
  }, []);

  const updateVisibleChunk = useCallback((startX: number, startY: number, endX: number, endY: number) => {
     console.warn("updateVisibleChunk is stubbed for infinite canvas.");
    // This would typically trigger loadGridChunk for the new viewport.
  }, [loadGridChunk]);
  
  useEffect(() => {
    // Initialize the PixelBatchManager
    pixelBatchManagerRef.current = new PixelBatchManager(
        updateMultiplePixels, // Pass the refined updateMultiplePixels as the callback
        { 
          initialBatchInterval: UPDATE_BATCH_INTERVAL, // from existing constant
          maxBatchSize: BATCH_SIZE, // from existing constant
          // minBatchInterval can be set if needed, e.g., 16 for ~60fps target for processing start
        }
    );
    
    return () => {
      pixelBatchManagerRef.current?.clear(); // Clear any pending batches on unmount
    };
  }, [updateMultiplePixels]); // updateMultiplePixels is stable due to useCallback

  // Improve the PixelBatchManager initialization to optimize for low-latency drawing
  useEffect(() => {
    // Initialize the PixelBatchManager with improved parameters
    pixelBatchManagerRef.current = new PixelBatchManager(
        updateMultiplePixels,
        { 
          initialBatchInterval: 50, // Reduced from 200ms to 50ms for more responsive updates
          maxBatchSize: BATCH_SIZE, 
          minBatchInterval: 16  // ~60fps target for processing start
        }
    );
    
    return () => {
      pixelBatchManagerRef.current?.clear();
    };
  }, [updateMultiplePixels]);
  
  // This is the key useEffect for fetching lands
  useEffect(() => {
    console.log(`useEffect[fetchAllLands, initialDataLoaded]: Effect triggered. initialDataLoaded = ${initialDataLoaded}`);
    if (initialDataLoaded) { // CHANGED
      console.log("useEffect[fetchAllLands, initialDataLoaded]: Condition initialDataLoaded is true. Calling fetchAllLands.");
      fetchAllLands();
    } else {
      console.log("useEffect[fetchAllLands, initialDataLoaded]: Condition initialDataLoaded is false. Not calling fetchAllLands yet.");
    }
  }, [fetchAllLands, initialDataLoaded]); // CHANGED: Depends on initialDataLoaded state

  // Periodic refresh of lands data
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (initialDataLoaded) { // CHANGED
        console.log("Periodic land refresh: Calling fetchAllLands.");
        fetchAllLands();
      }
    }, 60000); // Refresh every minute
    
    return () => clearInterval(refreshInterval);
  }, [fetchAllLands, initialDataLoaded]); // CHANGED: Added initialDataLoaded

  const updatePixelsInFirebase = async (pixels: Array<{x: number, y: number, color: string}>) => {
    if (!pixels.length) return;
    
    // This function might be deprecated if all updates go through PixelBatchManager -> updateMultiplePixels
    // For now, ensure it uses quotaManager correctly if called directly.
    const updates: Record<string, any> = {};
    const timestamp = Date.now();
    
    pixels.forEach(({ x, y, color }) => {
      updates[getPixelKey(x, y)] = {
        color,
        timestamp,
        clientId: clientIdRef.current
      };
    });
    
    try {
      await quotaManager.safeWrite({
        path: `${PIXELS_PATH}`,
        type: 'update',
        data: updates
      });
      setLastSyncTime(Date.now());
    } catch (error) {
      console.error("Error updating pixels in Firebase:", error);
    }
  };

  const updatePixelInFirebase = async (x: number, y: number, color: string) => {
    // This function might be deprecated if all updates go through PixelBatchManager -> updateMultiplePixels
    try {
      await quotaManager.safeWrite({
        path: `${PIXELS_PATH}`,
        type: 'update',
        data: {
          [getPixelKey(x, y)]: {
            color,
            timestamp: Date.now(),
            clientId: clientIdRef.current
          }
        }
      });
      setLastSyncTime(Date.now());
    } catch (error) {
      console.error("Error updating pixel in Firebase:", error);
    }
  };

  const navigateToUserLand = useCallback(() => {
    if (currentUser && userProfile && userProfile.landInfo && canvasContainerRef.current) {
      const { centerX, centerY } = userProfile.landInfo;
      
      // Target values for RAF update if needed, or direct set for one-off navigation
      let targetOffsetX, targetOffsetY;
      const targetZoom = 1; // Example: reset zoom to 1

      if (viewportCellWidth > 0 && viewportCellHeight > 0) {
          targetOffsetX = centerX - (viewportCellWidth / 2);
          targetOffsetY = centerY - (viewportCellHeight / 2);
      } else {
          console.warn("Cannot navigate to user land: Viewport dimensions not yet calculated. Centering approximately.");
          const approxCellsWide = (canvasContainerRef.current.clientWidth / (CELL_SIZE * targetZoom)) / 2;
          const approxCellsHigh = (canvasContainerRef.current.clientHeight / (CELL_SIZE * targetZoom)) / 2;
          targetOffsetX = centerX - approxCellsWide;
          targetOffsetY = centerY - approxCellsHigh;
      }
      
      // For one-off navigation, direct state update is fine, or use RAF refs
      latestViewportOffsetTargetRef.current = { x: targetOffsetX, y: targetOffsetY };
      latestZoomLevelTargetRef.current = targetZoom;
      requestViewportUpdateRAF(); // Use RAF for smooth transition if desired
      // Alternatively, for immediate jump:
      // setViewportOffset({ x: targetOffsetX, y: targetOffsetY });
      // setZoomLevel(targetZoom);

      console.log("Navigated to user land:", { newOffsetX: targetOffsetX, newOffsetY: targetOffsetY });
    } else {
      console.log("Cannot navigate to user land: Missing user/profile/landInfo or canvas ref.");
    }
  }, [currentUser, userProfile, viewportCellWidth, viewportCellHeight, requestViewportUpdateRAF]); // Removed zoomLevel, setViewportOffset, setZoomLevel

  // Effect for loading initial viewport position or navigating to user's land
  useEffect(() => {
    if (!initialDataLoaded || initialViewportSet || !canvasContainerRef.current) return;

    const savedX = localStorage.getItem(LOCAL_STORAGE_VIEWPORT_X_KEY);
    const savedY = localStorage.getItem(LOCAL_STORAGE_VIEWPORT_Y_KEY);
    const savedZoom = localStorage.getItem(LOCAL_STORAGE_ZOOM_LEVEL_KEY);

    let loadedFromStorage = false;
    if (savedX !== null && savedY !== null && savedZoom !== null) {
      try {
        const x = parseFloat(savedX);
        const y = parseFloat(savedY);
        const z = parseFloat(savedZoom);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          setViewportOffset({ x, y });
          setZoomLevel(z);
          console.log("Restored viewport from localStorage:", { x, y, zoom: z });
          loadedFromStorage = true;
        } else {
          console.warn("Invalid viewport data in localStorage. Clearing.");
          localStorage.removeItem(LOCAL_STORAGE_VIEWPORT_X_KEY);
          localStorage.removeItem(LOCAL_STORAGE_VIEWPORT_Y_KEY);
          localStorage.removeItem(LOCAL_STORAGE_ZOOM_LEVEL_KEY);
        }
      } catch (e) {
        console.error("Error parsing viewport data from localStorage:", e);
        localStorage.removeItem(LOCAL_STORAGE_VIEWPORT_X_KEY);
        localStorage.removeItem(LOCAL_STORAGE_VIEWPORT_Y_KEY);
        localStorage.removeItem(LOCAL_STORAGE_ZOOM_LEVEL_KEY);
      }
    }

    if (!loadedFromStorage && currentUser && userProfile && userProfile.landInfo) {
      // This is the first time or localStorage was cleared, and user has land
      const { centerX, centerY } = userProfile.landInfo;
      const defaultZoom = 1;
      const effectiveCell = CELL_SIZE * defaultZoom;
      const containerWidth = canvasContainerRef.current.clientWidth;
      const containerHeight = canvasContainerRef.current.clientHeight;
      
      if (containerWidth > 0 && containerHeight > 0 && effectiveCell > 0) {
        const cellsWide = containerWidth / effectiveCell;
        const cellsHigh = containerHeight / effectiveCell;
        const newOffsetX = centerX - (cellsWide / 2);
        const newOffsetY = centerY - (cellsHigh / 2);
        
        setViewportOffset({ x: newOffsetX, y: newOffsetY });
        setZoomLevel(defaultZoom);
        console.log("Initial load: Navigated to user's land and set default zoom.");
      } else {
         console.warn("Initial load: Could not calculate viewport for user land due to zero dimensions. Centering approximately.");
         setViewportOffset({ x: centerX, y: centerY });
         setZoomLevel(defaultZoom);
      }
    }
    setInitialViewportSet(true); // Mark as set
  }, [initialDataLoaded, currentUser, userProfile, initialViewportSet, setViewportOffset, setZoomLevel]);

  // Effect for saving viewport changes
  useEffect(() => {
    if (!initialDataLoaded || !initialViewportSet) return; // Don't save until initial setup is done

    try {
      localStorage.setItem(LOCAL_STORAGE_VIEWPORT_X_KEY, viewportOffset.x.toString());
      localStorage.setItem(LOCAL_STORAGE_VIEWPORT_Y_KEY, viewportOffset.y.toString());
      localStorage.setItem(LOCAL_STORAGE_ZOOM_LEVEL_KEY, zoomLevel.toString());
    } catch (e) {
      console.error("Error saving viewport to localStorage:", e);
    }
  }, [viewportOffset, zoomLevel, initialDataLoaded, initialViewportSet]);


  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedColor(event.target.value);
  };

  const toggleEraser = useCallback(() => {
    setIsEraserActive(prev => !prev);
    if (!isEraserActive) {
      setSelectedColor("#ffffff"); // Set to white when eraser is active
    }
  }, [isEraserActive]);

 

  const handleEraserSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const size = Math.max(1, Math.min(25, parseInt(event.target.value, 10))); // Clamp between 1 and 25
    setEraserSize(size);
  };

  const clearCanvas = useCallback(async () => {
    // Optional: Add an authorization check here (e.g., if (!currentUser || !isAdmin)) return;
    if (!currentUser) {
        setShowAuthWarning(true);
        console.warn("Clear canvas: User not logged in.");
        return;
    }
    setShowAuthWarning(false);

    setIsClearing(true);
    
    try {
      // 1. Clear Backend Data
      if (USE_CHUNKED_STORAGE) {
        console.log("Clearing Firestore chunks...");
        const chunksCollectionRef = collection(fs, CHUNK_COLLECTION);
        const querySnapshot = await getDocs(chunksCollectionRef);
        if (!querySnapshot.empty) {
          const batch = writeBatch(fs);
          querySnapshot.forEach(docSnapshot => {
            batch.delete(docSnapshot.ref);
          });
          await batch.commit();
          console.log(`Deleted ${querySnapshot.size} Firestore chunks.`);
        } else {
          console.log("No Firestore chunks to delete.");
        }
      } else {
        console.log("Clearing Realtime Database pixels...");
        await set(ref(db, PIXELS_PATH), null);
        console.log("Realtime Database pixels cleared.");
      }

      // 2. Clear Local Data
      masterGridDataRef.current.clear();
      setGrid(new Map());
      optimisticUpdatesMapRef.current.clear();
      activeChunkKeysRef.current.clear();
      console.log("Local canvas data cleared.");

      // 3. Notify Other Clients
      if (websocketService.isConnected()) {
        websocketService.send('canvas_reset', { clientId: clientIdRef.current });
        console.log("Sent canvas_reset WebSocket message.");
      } else {
        console.warn("WebSocket not connected. Cannot send canvas_reset message.");
      }
      
      // 4. Perform a full sync to ensure consistency with the now-empty backend
      // This also updates lastSyncTime.
      await requestFullSync(); 
      console.log("Full sync after clear completed.");

    } catch (error) {
      console.error("Error during canvas clear:", error);
      // Attempt to re-sync even on error to get a consistent state
      await requestFullSync();
    } finally {
      setIsClearing(false);
    }
  }, [requestFullSync, clientIdRef, currentUser, setShowAuthWarning]); // fs, db, collection, getDocs, writeBatch, set, ref are stable
  
  const getCoordsFromTouchEvent = (event: React.TouchEvent<HTMLDivElement>): { x: number, y: number } | null => {
    if (event.touches.length !== 1) return null;
    
    const touch = event.touches[0];
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    
    if (!rect) return null;
    
    const x = Math.floor((touch.clientX - rect.left) / effectiveCellSize) + viewportOffset.x;
    const y = Math.floor((touch.clientY - rect.top) / effectiveCellSize) + viewportOffset.y;
    
    return { x, y };
  };

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault(); 
    const coords = getCoordsFromTouchEvent(event);
    if (coords) {
      const { x, y } = coords;
      
      if (isSpacebarHeldRef.current) {
        setIsPanning(true);
        panStartMousePositionRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        panStartViewportOffsetRef.current = { ...latestViewportOffsetTargetRef.current }; // Use target ref
      } else {
        lastPositionRef.current = { x, y };
        paintCellOnMove(x, y); // Direct call for immediate feedback
        setIsMouseDown(true);
      }
    }
  }, [paintCellOnMove, viewportOffset]); // viewportOffset for getCoordsFromTouchEvent

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault(); 
    
    if (isPanning && panStartMousePositionRef.current && panStartViewportOffsetRef.current) {
      const currentEffectiveCellSize = CELL_SIZE * latestZoomLevelTargetRef.current;
      if (currentEffectiveCellSize === 0) return;

      const deltaX = event.touches[0].clientX - panStartMousePositionRef.current.x;
      const deltaY = event.touches[0].clientY - panStartMousePositionRef.current.y;

      const offsetDeltaX = deltaX / currentEffectiveCellSize; 
      const offsetDeltaY = deltaY / currentEffectiveCellSize;
      
      const newViewportXTarget = panStartViewportOffsetRef.current.x - offsetDeltaX;
      const newViewportYTarget = panStartViewportOffsetRef.current.y - offsetDeltaY;

      latestViewportOffsetTargetRef.current = { x: newViewportXTarget, y: newViewportYTarget };
      latestZoomLevelTargetRef.current = zoomLevel; // Read from current state
      requestViewportUpdateRAF();

    } else if (isMouseDown && !isPanning) {
      const coords = getCoordsFromTouchEvent(event);
      if (coords) {
        const { x, y } = coords;
        
        // Similar check as in mouse move to avoid redundant draws of the same pixel
        const lastCell = lastPaintedCellRef.current;
        if (!lastCell || lastCell.x !== x || lastCell.y !== y) {
          paintCellOnMove(x, y);
          lastPaintedCellRef.current = { x, y };
        }
      }
    }
  }, [isPanning, isMouseDown, paintCellOnMove, requestViewportUpdateRAF, zoomLevel, viewportOffset]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isPanning) {
      setIsPanning(false);
      panStartMousePositionRef.current = null;
      panStartViewportOffsetRef.current = null;
    } else {
      setIsMouseDown(false);
      lastPositionRef.current = null; // Clear the last position
    }
  }, [setIsPanning, setIsMouseDown]);

  // Effect to attach global mouse move and up listeners for panning
  useEffect(() => {
    // Ensure passive: false for mousemove if preventDefault might be called by its logic or downstream.
    // paintCellOnMove doesn't call preventDefault, but panning logic might.
    // handleWindowMouseMove itself doesn't call preventDefault, but it's good practice if it controls behavior that should override defaults.
    window.addEventListener('mousemove', handleWindowMouseMove, NON_PASSIVE_EVENT_OPTIONS);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      // Clean up animation frame request on unmount
      if (animationFrameRequestRef.current) {
        cancelAnimationFrame(animationFrameRequestRef.current);
        animationFrameRequestRef.current = null;
      }
    };
  }, [handleWindowMouseMove, handleWindowMouseUp]); // handleWindowMouseMove will be stable with useCallback

  // Add keyboard event listeners for spacebar handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpacebarHeldRef.current) {
        isSpacebarHeldRef.current = true;
        if (canvasContainerRef.current) {
          canvasContainerRef.current.style.cursor = 'grab';
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isSpacebarHeldRef.current) {
        isSpacebarHeldRef.current = false;
        if (canvasContainerRef.current) {
          canvasContainerRef.current.style.cursor = 'default';
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Render logic
  const gridCellsMemoDeps = useMemo(() => {
    // Extract only the necessary data for comparison to reduce re-renders
    return {
      gridSize: grid.size,
      viewportX: Math.floor(viewportOffset.x),
      viewportY: Math.floor(viewportOffset.y),
      width: viewportCellWidth,
      height: viewportCellHeight,
      zoom: effectiveCellSize,
      debugMode,
      hasUser: !!currentUser,
      hasLandInfo: !!(userProfile?.landInfo)
    };
  }, [grid.size, viewportOffset.x, viewportOffset.y, viewportCellWidth, viewportCellHeight, effectiveCellSize, debugMode, currentUser, userProfile?.landInfo]);

  // Define handleCellClick BEFORE gridCells useMemo to fix the reference error
  const handleCellClick = useCallback((worldX: number, worldY: number, event: React.MouseEvent) => {
    // Only handle left clicks
    if (event.button !== 0) return;
    
    // Check if we can draw at this point
    if (!canDrawAtPoint(worldX, worldY)) {
      if (!currentUser && !showAuthWarning) { 
        setShowAuthWarning(true);
        console.warn("Login required to draw.");
      } else if (currentUser && userProfile?.landInfo) { 
        console.warn(`Cannot draw at (${worldX}, ${worldY}). Outside land boundaries.`);
      }
      return;
    }
    
    setShowAuthWarning(false);
    
    // Start drawing
    setIsMouseDown(true); // Still set this for mouse move tracking
    lastPositionRef.current = { x: worldX, y: worldY };
    
    if (memoizedCanPlacePixel() || COOLDOWN_SECONDS === 0) {
      const effectiveColor = getEffectiveColor();
      let pixelsToUpdate: Pixel[];
      
      if (isEraserActive) {
        pixelsToUpdate = getPixelsInEraserArea(worldX, worldY, eraserSize, effectiveColor);
      } else {
        pixelsToUpdate = [{ x: worldX, y: worldY, color: effectiveColor }];
      }
      
      const drawablePixels = pixelsToUpdate.filter(p => canDrawAtPoint(p.x, p.y));
      
      if (drawablePixels.length > 0) {
        // Optimistic UI update
        const timestamp = Date.now();
        drawablePixels.forEach(pixel => {
          masterGridDataRef.current.set(getPixelKey(pixel.x, pixel.y), pixel.color);
          optimisticUpdatesMapRef.current.set(getPixelKey(pixel.x, pixel.y), { timestamp, color: pixel.color });
        });
        
        setGrid(prevGrid => {
          const newGrid = new Map(prevGrid);
          let hasChanges = false;
          drawablePixels.forEach(pixel => {
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
        
        // Add to PixelBatchManager
        if (pixelBatchManagerRef.current) {
          const pixelsForBatchManager = drawablePixels.map(p => ({...p, clientId: clientIdRef.current, timestamp }));
          console.log('[Canvas] handleCellClick: Adding updates to PixelBatchManager:', pixelsForBatchManager);
          pixelBatchManagerRef.current.addUpdates(pixelsForBatchManager);
        }
        
        setLastPlaced(Date.now());
        lastPaintedCellRef.current = { x: worldX, y: worldY };
      }
    }
  }, [
    canDrawAtPoint, 
    memoizedCanPlacePixel, 
    getEffectiveColor, 
    isEraserActive, 
    eraserSize, 
    getPixelsInEraserArea,
    updateMultiplePixels,
    currentUser,
    userProfile,
    showAuthWarning,
    setShowAuthWarning,
    getChunkKeyForPixel,
    clientIdRef
  ]);

  const gridCells = useMemo(() => {
    console.log(`gridCells: Computing. initialDataLoaded = ${initialDataLoaded}, allLands.length = ${allLands.length}`);
    if (viewportCellWidth === 0 || viewportCellHeight === 0) {
      return []; 
    }
    
    const cells = [];
    const roundedViewportX = Math.floor(viewportOffset.x);
    const roundedViewportY = Math.floor(viewportOffset.y);
    
    // Build the land map
    const cellLandMap = new Map<string, {landInfo: LandInfo, isCurrentUserLand: boolean}>();
    
    // Add current user's land to map
    if (currentUser && userProfile && userProfile.landInfo) {
      const { centerX, centerY, ownedSize } = userProfile.landInfo;
      const halfOwnedSize = Math.floor(ownedSize / 2);
      
      for (let y = centerY - halfOwnedSize; y <= centerY + halfOwnedSize; y++) {
        for (let x = centerX - halfOwnedSize; x <= centerX + halfOwnedSize; x++) {
          cellLandMap.set(`${x}:${y}`, { 
            landInfo: {
              centerX,
              centerY,
              ownedSize,
              owner: currentUser.uid,
              displayName: userProfile.displayName || "You"
            },
            isCurrentUserLand: true
          });
        }
      }
    }
    
    // Add other users' lands to map
    allLands.forEach(land => {
      const isCurrentUserLand = currentUser && userProfile && userProfile.landInfo && 
                            userProfile.landInfo.centerX === land.centerX && 
                            userProfile.landInfo.centerY === land.centerY;
    
      if (!isCurrentUserLand) {
        const halfSize = Math.floor(land.ownedSize / 2);
        for (let y = land.centerY - halfSize; y <= land.centerY + halfSize; y++) {
          for (let x = land.centerX - halfSize; x <= land.centerX + halfSize; x++) {
            if (!cellLandMap.has(`${x}:${y}`)) {
              cellLandMap.set(`${x}:${y}`, { 
                landInfo: land, 
                isCurrentUserLand: false 
              });
            }
          }
        }
      }
    });
    
    // Determine if we should show grid lines based on zoom level
    const showGridLines = SHOW_GRID_LINES && zoomLevel >= GRID_LINE_THRESHOLD;
    
    // Generate visible cells
    for (let screenY = 0; screenY < viewportCellHeight; screenY++) {
      for (let screenX = 0; screenX < viewportCellWidth; screenX++) {
        const worldX = screenX + roundedViewportX;
        const worldY = screenY + roundedViewportY;
        const pixelKey = getPixelKey(worldX, worldY);
        
        // Get cell color from grid data
        const color = grid.get(pixelKey) || "#ffffff";
        
        const isDrawableHere = currentUser && userProfile && canDrawAtPoint(worldX, worldY);
        
        const cellStyle: React.CSSProperties = {
          width: `${effectiveCellSize}px`,
          height: `${effectiveCellSize}px`,
          boxSizing: 'border-box',
          backgroundColor: color,
          position: 'relative'
        };
        
        let landOwnerInfo = null;
        
        const landMapEntry = cellLandMap.get(pixelKey);
        if (landMapEntry) {
          const { landInfo: land, isCurrentUserLand } = landMapEntry;
          const { centerX, centerY, ownedSize, owner, displayName, isEmpty } = land;
          const halfSize = Math.floor(ownedSize / 2);
          
          const borderColor = isCurrentUserLand ? userLandBorderColor : otherLandBorderColor;
          const borderWidth = "3px"; // Kept at 3px as it helped visibility
          
          if (worldX === centerX - halfSize) { // Left border
            cellStyle.borderLeft = `${borderWidth} solid ${borderColor}`;
          }
          if (worldX === centerX + halfSize) { // Right border
            cellStyle.borderRight = `${borderWidth} solid ${borderColor}`;
          }
          if (worldY === centerY - halfSize) { // Top border
            cellStyle.borderTop = `${borderWidth} solid ${borderColor}`;
          }
          if (worldY === centerY + halfSize) { // Bottom border
            cellStyle.borderBottom = `${borderWidth} solid ${borderColor}`;
          }
          
          // For empty lands, apply background styling
          if (isEmpty && color === "#ffffff") {
            cellStyle.backgroundColor = emptyLandFillColor;
          }
          
          // Add tooltip for showing owner info
          landOwnerInfo = {
            owner: isCurrentUserLand ? "Your Land" : (displayName || "Another User"),
            coords: `(${centerX}, ${centerY})`,
            size: ownedSize
          };
        }
        
        // Debug mode styling - apply after other styles
        if (debugMode && !isDrawableHere && currentUser && userProfile) {
          cellStyle.backgroundColor = color === "#ffffff" ? 
            "rgba(255, 0, 0, 0.1)" : 
            `linear-gradient(rgba(255, 0, 0, 0.3), rgba(255, 0, 0, 0.3)), ${color}`;
        }
        
        // Add grid lines ONLY if enabled, at sufficient zoom level, AND this cell doesn't have land borders
        const hasLandBorder = 
          cellStyle.borderLeft || cellStyle.borderRight || 
          cellStyle.borderTop || cellStyle.borderBottom;
          
        if (showGridLines && !hasLandBorder) {
          // Use a subtle inset box shadow for grid lines that won't interfere with borders
          cellStyle.boxShadow = `inset 0 0 0 1px ${GRID_LINE_COLOR}`;
        }
        
        // Create cell with click handler
        cells.push(
          <div
            key={pixelKey}
            className={`${isPanning ? 'cursor-move' : (isDrawableHere ? 'cursor-crosshair' : 'cursor-not-allowed')}`}
            style={cellStyle}
            title={landOwnerInfo ? `${landOwnerInfo.owner} - ${landOwnerInfo.coords} (${landOwnerInfo.size}×${landOwnerInfo.size})` : undefined}
            // onMouseDown is handled by handleCanvasMouseDown for the whole canvas
            // Individual cell onMouseDown might conflict or be redundant.
            // If specific cell click logic beyond drawing is needed, it can be added here.
            // For drawing, handleCanvasMouseDown initiates it.
            // onMouseDown={(e) => !isPanning && handleCellClick(worldX, worldY, e)} // This was the previous line
            
            // MouseOver for continuous drawing is handled by global mousemove when isMouseDown is true
            onMouseOver={(e) => {
              // This local onMouseOver might still be useful if global mousemove isn't precise enough
              // or if specific cell hover effects are needed.
              // For drawing, paintCellOnMove is called by the global mousemove.
              // if (isMouseDown && !isPanning) {
              //   paintCellOnMove(worldX, worldY);
              // }
            }}
          >
            {/* Center marker for lands */}
            {landMapEntry && worldX === landMapEntry.landInfo.centerX && worldY === landMapEntry.landInfo.centerY && effectiveCellSize > 5 && (
              <div 
                className="absolute inset-0 flex items-center justify-center"
                style={{ pointerEvents: 'none' }}
              >
                <div className={`w-2 h-2 rounded-full ${landMapEntry.isCurrentUserLand ? 'bg-red-500' : 'bg-blue-500'}`}></div>
              </div>
            )}
            
            {/* Debug overlay */}
            {debugMode && !isDrawableHere && (
              <div className="absolute inset-0 flex items-center justify-center">
                {effectiveCellSize > 20 && <span className="text-xs text-red-800">X</span>}
              </div>
            )}
          </div>
        );
      }
    }
    return cells;
  }, [
    gridCellsMemoDeps,
    grid,
    userProfile, 
    allLands, 
    currentUser, 
    canDrawAtPoint, 
    debugMode, 
    userLandBorderColor, // Included as it's now defined in component scope
    otherLandBorderColor, // Included as it's now defined in component scope
    emptyLandFillColor, 
    effectiveCellSize,
    viewportOffset, 
    initialDataLoaded,
    isPanning,
    isMouseDown,
    // paintCellOnMove, // Removed as individual cell mouseover for drawing is complex with RAF viewport
    handleCellClick,
    zoomLevel,
  ]);

  // Modify the loading check to only depend on initialDataLoaded
  if (!initialDataLoaded) { // CHANGED
    console.log("Canvas render: Displaying LOADING screen because initialDataLoaded is false.");
    // setIsLoading(true); // Potentially set global loading state if needed elsewhere

    return (
      <div ref={canvasContainerRef} className="flex justify-center items-center h-screen" onWheel={handleWheel}>
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <div>Loading Canvas...</div>
          <button 
            onClick={() => {
              setInitialDataLoaded(true); // CHANGED
              setGrid(new Map());
            }}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Skip Loading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={canvasContainerRef}
      className="relative w-screen h-screen overflow-hidden bg-gray-200 cursor-default" // Added cursor-default
      style={{ 
        touchAction: "none", // Crucial for preventing default touch behaviors
        WebkitOverflowScrolling: "touch", // For momentum scrolling on iOS (though touch-action: none might override)
        overscrollBehavior: "none", // Prevents pull-to-refresh, etc.
      }} 
      onWheel={handleWheel} // Already calls preventDefault
      onMouseDown={handleCanvasMouseDown}
      // Touch events for drawing and panning
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* UI controls */}
      <div className="absolute top-4 left-4 z-30 bg-white p-2 rounded shadow-lg flex items-center flex-wrap gap-2">
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
        {showAuthWarning && !currentUser && ( // Only show if not logged in
            <span className="text-red-500 text-xs font-semibold ml-2">
                Please log in to draw or interact with the canvas.
            </span>
        )}
        <div className="text-xs flex flex-col">
          <div className="flex items-center">
            <span className={`inline-block w-3 h-3 rounded-full mr-1 ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {wsConnected ? 'Real-time connected' : 'Real-time disconnected'}
          </div>
          {pixelBatchManagerRef.current && pixelBatchManagerRef.current.pendingCount > 0 && (
            <span className="text-amber-600 text-xs">Syncing: {pixelBatchManagerRef.current.pendingCount} updates pending</span>
          )}
        </div>
        <button 
          onClick={requestFullSync}
          className="bg-blue-500 hover:bg-blue-600 text-white font-xs py-1 px-2 rounded text-xs"
          title="Force synchronization with server"
        >
          Sync
        </button>
        {currentUser && userProfile?.landInfo && (
          <button
            onClick={navigateToUserLand}
            className="bg-green-500 hover:bg-green-600 text-white font-xs py-1 px-2 rounded text-xs"
            title="Go to your land"
          >
            My Land
          </button>
        )}
         <div className="text-xs">
            Viewport: ({viewportOffset.x.toFixed(2)}, {viewportOffset.y.toFixed(2)})
        </div>
         <div className="text-xs">
            Cells: {viewportCellWidth}x{viewportCellHeight} @ {Math.round(zoomLevel*100)}%
        </div>
         <div className="text-xs">
            Last sync: {new Date(lastSyncTime).toLocaleTimeString()}
        </div>
        {/* Add Debug Mode toggle */}
        <button
          onClick={toggleDebugMode}
          className={`px-3 py-1 rounded text-white ${debugMode ? 'bg-yellow-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}
        >
          {debugMode ? "Debug: ON" : "Debug"}
        </button>
        
        {/* Display boundaries info in debug mode */}
        {debugMode && currentUser && userProfile?.landInfo && (
          <div className="text-xs bg-gray-100 p-1 rounded">
            Center: ({userProfile.landInfo.centerX}, {userProfile.landInfo.centerY}), 
            Size: {userProfile.landInfo.ownedSize}x{userProfile.landInfo.ownedSize}
          </div>
        )}
      </div>
      
      {/* Grid for pixels and land overlays with modified styles for better rendering */}
      <div 
        className="absolute inset-0 grid z-10"
        style={{ 
          gridTemplateColumns: `repeat(${viewportCellWidth}, ${effectiveCellSize}px)`,
          willChange: 'transform', // Hint to browser for transform optimization
          contain: 'layout paint style', // Performance hint for rendering isolation
          // The cursor style will be managed by canvasContainerRef.current.style.cursor
        }}
      >
        {gridCells}
      </div>
      
      {/* Add zoom level indicator to UI */}
      <div className="absolute bottom-4 right-4 bg-white px-3 py-1 rounded shadow-md text-xs">
        Zoom: {Math.round(zoomLevel * 100)}%
        {zoomLevel < GRID_LINE_THRESHOLD && SHOW_GRID_LINES && 
          <span className="ml-2 text-gray-500">(Zoom in to see grid)</span>
        }
      </div>
      
      {/* ...existing UI elements... */}
    </div>
  );
}