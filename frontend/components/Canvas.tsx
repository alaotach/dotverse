import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { db } from "../src/firebaseClient";
import { ref, onValue, set, update, get } from "firebase/database";
import websocketService from "../src/services/websocketService";
import { useAuth } from "../src/context/AuthContext";
import { openDB } from 'idb';
import { getLocalCache, updateLocalCache } from "../src/services/localStorageCache";
import { doc, getDoc, collection, getDocs, query, writeBatch, setDoc } from "firebase/firestore"; // Added setDoc import here
import { fs } from "../src/firebaseClient";
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
const SYNC_THROTTLE_MS = 30000; // Changed from 5000 to 30000 (30 seconds)
const PIXELS_PER_LINE = 20; // For normalizing scroll when deltaMode is by lines

// Add debounce utility function
const debounce = (func: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
};

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

// Near the top of the file, modify the event options to allow preventDefault
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
  const [initialDataLoaded, setInitialDataLoaded] = useState<boolean>(false);
  const [initialViewportSet, setInitialViewportSet] = useState<boolean>(false);
  
  // Define debouncedSaveViewport here, before it's used
  const debouncedSaveViewport = useCallback(
    debounce((vpOffset: { x: number; y: number }, zmLevel: number) => {
      if (!initialDataLoaded || !initialViewportSet) return;
      try {
        localStorage.setItem(LOCAL_STORAGE_VIEWPORT_X_KEY, vpOffset.x.toString());
        localStorage.setItem(LOCAL_STORAGE_VIEWPORT_Y_KEY, vpOffset.y.toString());
        localStorage.setItem(LOCAL_STORAGE_ZOOM_LEVEL_KEY, zmLevel.toString());
      } catch (e) {
        console.error("Error saving viewport to localStorage:", e);
      }
    }, 1000), // Debounce by 1 second
    [initialDataLoaded, initialViewportSet]
  );
  
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
  // const pixelBatchManagerRef = useRef<PixelBatchManager | null>(null);
  
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
  const lastDrawTimestampRef = useRef<number | null>(null); // Ensure this ref is initialized

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
    
    // Always prevent default for custom handling
    if (event.cancelable) {
      event.preventDefault();
    }

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
  }, [requestViewportUpdateRAF]); // Removed zoomLevel, viewportOffset, effectiveCellSize as direct deps

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
  }, [getVisibleChunkKeys, CHUNK_SIZE, initialDataLoaded]);

  useEffect(() => {
    if (initialDataLoaded) { // CHANGED
      updateGridFromVisibleChunks();
    }
  }, [viewportOffset, zoomLevel, viewportCellWidth, viewportCellHeight, initialDataLoaded, updateGridFromVisibleChunks]); // CHANGED: Added initialDataLoaded

  // Modify the requestFullSync function to add more logging
  const requestFullSync = useCallback(async () => {
  console.log("requestFullSync called:", { 
    syncInProgress: syncInProgressRef.current,
    timeSinceLastSync: Date.now() - lastSyncRequestTimeRef.current,
    wsConnected
  });
  
  if (syncInProgressRef.current) {
    console.log("Full sync request ignored: sync already in progress.");
    return;
  }
  
  const timeSinceLastSync = Date.now() - lastSyncRequestTimeRef.current;
  if (timeSinceLastSync < SYNC_THROTTLE_MS) {
    console.log(`Full sync request throttled: last sync was ${timeSinceLastSync}ms ago, min interval is ${SYNC_THROTTLE_MS}ms`);
    return;
  }
  
  // Continue with existing implementation...
  console.log("Starting full sync operation...");
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

  // Modify the updateMultiplePixels function to prioritize WebSockets for real-time updates
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
    
    // WebSocket updates - PRIORITY CHANGE: WebSocket is now the primary real-time path
    // All drawing operations go through WebSocket first for real-time sync
    let wsUpdateSuccess = false;
    if (wsConnected) {
      try {
        const WS_BATCH_SIZE = 50;
        for (let i = 0; i < enhancedPixels.length; i += WS_BATCH_SIZE) { 
          const batch = enhancedPixels.slice(i, i + WS_BATCH_SIZE); 
          wsUpdateSuccess = websocketService.send('pixel_update', batch);
        }
        console.log('[Canvas] updateMultiplePixels: WebSocket update sent successfully.');
        
        // If WebSocket succeeds, we still persist to Firestore but can consider it a background operation
        // This allows for lower-priority Firebase operations, reducing quota usage
        setTimeout(() => {
          persistToFirestore(enhancedPixels, timestamp).catch(error => {
            console.error("[Canvas] Background Firestore persistence failed:", error);
          });
        }, 1000); // Wait 1 second before persisting to Firestore
        
        return true; // If WebSocket succeeds, consider the operation successful
      } catch (error) {
        console.error("[Canvas] updateMultiplePixels: WebSocket batch send error:", error);
        wsUpdateSuccess = false;
      }
    }
      
    // If WebSocket failed or disconnected, fall back to direct Firestore
    if (!wsUpdateSuccess) {
      console.log('[Canvas] WebSocket update failed, falling back to direct Firestore...');
      return await persistToFirestore(enhancedPixels, timestamp);
    }
    
    return wsUpdateSuccess;
  }, [wsConnected, clientIdRef, getChunkKeyForPixel, canDrawAtPoint, currentUser, showAuthWarning, getPixelKey, CHUNK_SIZE, PIXELS_PATH, firestoreDebugger]);

  // New function to extract Firestore persistence logic
  const persistToFirestore = async (pixels: Pixel[], timestamp: number): Promise<boolean> => {
    try {
      if (USE_CHUNKED_STORAGE) {
        const pixelsByChunk = new Map<string, Pixel[]>();
        
        // Group pixels by chunk to minimize Firestore operations
        pixels.forEach(pixel => {
          const chunkKey = getChunkKeyForPixel(pixel.x, pixel.y);
          if (!pixelsByChunk.has(chunkKey)) {
            pixelsByChunk.set(chunkKey, []);
          }
          pixelsByChunk.get(chunkKey)!.push(pixel);
        });
          
        // Process chunks in smaller batches to avoid large writes
        const chunkEntries = Array.from(pixelsByChunk.entries());
        for (const [chunkKey, chunkPixels] of chunkEntries) {
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
            
            console.log(`[Canvas] persistToFirestore: Writing chunk ${chunkKey} to Firestore.`);
            const chunkDocRef = doc(fs, `${CHUNK_COLLECTION}/${chunkKey}`);
            
            // Use merge: true to avoid overwriting other pixels in the chunk
            await setDoc(chunkDocRef, { 
              pixels: pixelUpdatesForFirestore, 
              lastUpdated: timestamp 
            }, { merge: true });
            
            console.log(`[Canvas] persistToFirestore: Successfully wrote chunk ${chunkKey} to Firestore.`);
          } catch (chunkError) {
            console.error(`[Canvas] persistToFirestore: Error writing chunk ${chunkKey}:`, chunkError);
            firestoreDebugger.logError(chunkError, `${CHUNK_COLLECTION}/${chunkKey}`, 'update');
          }
        }
        
        // Update last sync time to indicate successful write
        setLastSyncTime(Date.now());
        return true;
      } else {
        // Original non-chunked direct update (for Realtime DB)
        const updates: Record<string, any> = {};
        pixels.forEach(({ x, y, color, timestamp: opTimestamp, clientId: opClientId }) => {
          updates[getPixelKey(x,y)] = { color, timestamp: opTimestamp, clientId: opClientId };
        });
        
        console.log('[Canvas] persistToFirestore: Writing directly to Realtime Database.');
        await update(ref(db, PIXELS_PATH), updates);
        
        setLastSyncTime(Date.now());
        return true;
      }
    } catch (error) {
      console.error("[Canvas] persistToFirestore: Error during Firestore operation:", error);
      firestoreDebugger.logError(error, 'persistToFirestore', 'batch');
      return false;
    }
  };

  // Debug mode logging - log grid and viewport info
  useEffect(() => {
    if (debugMode) {
      console.log("DEBUG MODE - Current grid and viewport state:");
      console.log("Grid size:", grid.size);
      console.log("Viewport offset:", viewportOffset);
      console.log("Viewport cell size:", effectiveCellSize);
      console.log("Zoom level:", zoomLevel);
      console.log("Last sync time:", lastSyncTime);
      console.log("Connected users:", wsConnected);
      console.log("All lands:", JSON.stringify(allLands, null, 2));
    }
  }, [debugMode, grid, viewportOffset, effectiveCellSize, zoomLevel, lastSyncTime, wsConnected, allLands]);

  // Effect to log warnings for potential issues
  useEffect(() => {
    if (initialDataLoaded && !wsConnected) {
      console.warn("Warning: WebSocket not connected but initial data is loaded. Real-time features will not work.");
    }
  }, [initialDataLoaded, wsConnected]);

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

  // Effect for saving viewport changes (now debounced)
  useEffect(() => {
    // No need to check initialDataLoaded/initialViewportSet here, debouncedSaveViewport does it
    debouncedSaveViewport(viewportOffset, zoomLevel);
  }, [viewportOffset, zoomLevel, debouncedSaveViewport]);


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

    // 3. Notify Other Clients - FIXED: use wsConnected instead of isConnected()
    if (wsConnected) {
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
}, [requestFullSync, clientIdRef, currentUser, setShowAuthWarning, wsConnected]); // Added wsConnected dependency
  // Removed quotaManager reference

  const getCoordsFromTouchEvent = (event: React.TouchEvent<HTMLDivElement>): { x: number, y: number } | null => {
    if (event.touches.length !== 1) return null;
    
    const touch = event.touches[0];
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    
    if (!rect) return null;
    
    const x = Math.floor((touch.clientX - rect.left) / effectiveCellSize) + viewportOffset.x;
    const y = Math.floor((touch.clientY - rect.top) / effectiveCellSize) + viewportOffset.y;
    
    return { x, y };

  };

  const memoizedCanPlacePixel = useCallback((): boolean => {
  if (COOLDOWN_SECONDS === 0) return true; // No cooldown
  
  const now = Date.now();
  const timeSinceLastPlacement = now - lastPlaced;
  return timeSinceLastPlacement > (COOLDOWN_SECONDS * 1000);
}, [lastPlaced]);

  const getEffectiveColor = useCallback((): string => {
  // If eraser is active, return white (or whatever your background color is)
  if (isEraserActive) {
    return "#ffffff"; // Default eraser color (white)
  }
  // Otherwise return the selected color
  return selectedColor;
}, [isEraserActive, selectedColor]);

  // Add missing helper function for eraser
  const getPixelsInEraserArea = useCallback((centerX: number, centerY: number, size: number, color: string): Pixel[] => {
    const pixels: Pixel[] = [];
    const radius = Math.floor(size / 2);
    
    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        pixels.push({ x, y, color });
      }
    }
    return pixels;
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
      
    // Add to batch for processing
    if (pixelsToBatch.length > 0) {
      // Filter for optimistic update before adding to batch
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
        // Immediate send updates:
        updateMultiplePixels(uniquePixelsArray);
        setLastPlaced(Date.now());
      }
    }
      
    // Always update lastPositionRef with the current position to ensure continuous drawing
    lastPositionRef.current = currentPosition;
  }, [
    isMouseDown,
    isPanning,
    getEffectiveColor,
    memoizedCanPlacePixel,
    isEraserActive,
    eraserSize,
    getPixelsInEraserArea,
    canDrawAtPoint,
    updateMultiplePixels,
    setLastPlaced
  ]);

  const handleWindowMouseMove = useCallback((event: MouseEvent) => {
    if (!canvasContainerRef.current) return;
    
    if (isPanning && panStartMousePositionRef.current && panStartViewportOffsetRef.current) {
      const dx = event.clientX - panStartMousePositionRef.current.x;
      const dy = event.clientY - panStartMousePositionRef.current.y;
      
      const newOffsetX = panStartViewportOffsetRef.current.x - dx / effectiveCellSize;
      const newOffsetY = panStartViewportOffsetRef.current.y - dy / effectiveCellSize;
      
      latestViewportOffsetTargetRef.current = { x: newOffsetX, y: newOffsetY };
      requestViewportUpdateRAF();
    } else if (isMouseDown) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const x = Math.floor((event.clientX - rect.left) / effectiveCellSize) + viewportOffset.x;
      const y = Math.floor((event.clientY - rect.top) / effectiveCellSize) + viewportOffset.y;
      
      const lastCell = lastPaintedCellRef.current;
      if (!lastCell || lastCell.x !== x || lastCell.y !== y) {
        paintCellOnMove(x, y);
        lastPaintedCellRef.current = { x, y };
      }
    }
  }, [effectiveCellSize, isMouseDown, isPanning, viewportOffset, paintCellOnMove, requestViewportUpdateRAF]);


  const handleCanvasMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button === 0) { // Left click only
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = Math.floor((event.clientX - rect.left) / effectiveCellSize) + viewportOffset.x;
      const y = Math.floor((event.clientY - rect.top) / effectiveCellSize) + viewportOffset.y;
      
      if (isSpacebarHeldRef.current || event.altKey) {
        setIsPanning(true);
        panStartMousePositionRef.current = { x: event.clientX, y: event.clientY };
        panStartViewportOffsetRef.current = { ...viewportOffset };
      } else {
        lastPositionRef.current = { x, y };
        paintCellOnMove(x, y);
        setIsMouseDown(true);
      }
    }
  }, [effectiveCellSize, viewportOffset, paintCellOnMove]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.cancelable) {

      event.preventDefault();
    }
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
    if (event.cancelable) {
      event.preventDefault();
    }
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
  }, [isPanning, isMouseDown, paintCellOnMove, requestViewportUpdateRAF, zoomLevel, viewportOffset]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.cancelable) {
      event.preventDefault();
    }
    if (isPanning) {
      setIsPanning(false);
      panStartMousePositionRef.current = null;
      panStartViewportOffsetRef.current = null;
    } else {
      setIsMouseDown(false);
      lastPositionRef.current = null; // Clear the last position
    }
  }, [setIsPanning, setIsMouseDown]);

  const handleWindowMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStartMousePositionRef.current = null;
      panStartViewportOffsetRef.current = null;
    }
    setIsMouseDown(false);
    lastPositionRef.current = null;
    lastPaintedCellRef.current = null;
  }, [isPanning]);

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
  

  // Add this effect around line 1290, after the keyboard spacebar effect

// Effect to handle WebSocket connection setup
useEffect(() => {
  // Initialize websocket connection 
  websocketService.connect();
  
  // Use onConnectionChange to update wsConnected state
  const handleConnectionChange = (isConnected: boolean) => {
    console.log(`WebSocket connection status changed: ${isConnected}`);
    setWsConnected(isConnected);
  };
  
  websocketService.onConnectionChange(handleConnectionChange);
  
  const handlePixelUpdate = (data: any) => {
    // Handle incoming pixel updates
    if (Array.isArray(data)) {
      data.forEach(pixel => {
        if (pixel && typeof pixel.x === 'number' && typeof pixel.y === 'number' && pixel.color) {
          const pixelKey = getPixelKey(pixel.x, pixel.y);
          
          // Check if this is a pixel we just placed (avoid flickering)
          const optimisticUpdate = optimisticUpdatesMapRef.current.get(pixelKey);
          if (optimisticUpdate && optimisticUpdate.timestamp > (pixel.timestamp || 0)) {
            // Skip this update as our local version is newer
            return;
          }
          
          // Update master data
          masterGridDataRef.current.set(pixelKey, pixel.color);
          
          // Update visible grid if the pixel is in view
          const chunkKey = getChunkKeyForPixel(pixel.x, pixel.y);
          if (activeChunkKeysRef.current.has(chunkKey)) {
            setGrid(prev => {
              const newGrid = new Map(prev);
              newGrid.set(pixelKey, pixel.color);
              return newGrid;
            });
          }
        }
      });
    }
  };
  
  // Register WebSocket event listeners
  // websocketService.on('connected', handleConnected); // REMOVE
  // websocketService.on('disconnected', handleDisconnected); // REMOVE
  websocketService.on('pixel_update', handlePixelUpdate);
  
  // Initial sync once connected
  const syncOnceConnected = () => {
    // FIX: Use wsConnected state variable instead of isConnected method
    if (wsConnected && !initialDataLoaded) {
      requestFullSync();
    }
  };
  
  // Try to sync immediately if already connected, otherwise wait for connection
  const syncInterval = setInterval(syncOnceConnected, 2000);
  
  return () => {
    // websocketService.off('connected', handleConnected); // REMOVE
    // websocketService.off('disconnected', handleDisconnected); // REMOVE
    websocketService.offConnectionChange(handleConnectionChange); // Add cleanup for onConnectionChange
    websocketService.off('pixel_update', handlePixelUpdate);
    clearInterval(syncInterval);
  };
}, [getPixelKey, getChunkKeyForPixel, requestFullSync, initialDataLoaded]);

useEffect(() => {
  // If data doesn't load within 10 seconds, show empty canvas anyway
  const loadingTimeout = setTimeout(() => {
    if (!initialDataLoaded) {
      console.log("Loading timeout reached - forcing canvas to display");
      setInitialDataLoaded(true);
      // Trigger a sync attempt as a backup
      requestFullSync();
    }
  }, 10000);
  
  return () => clearTimeout(loadingTimeout);
}, [initialDataLoaded, requestFullSync]);

  

  // Render logic
  // REMOVE the first/earlier declaration of cellLandMap and gridCells (including their useMemo blocks)
  // If you see:
  // const cellLandMap = useMemo(() => { ... }, [...]);
  // const gridCells = useMemo(() => { ... }, [...]);
  // ...delete these lines if they appear before the render logic...

  // KEEP ONLY the cellLandMap and gridCells useMemo blocks that are just before the render/return statement

  // Memoize cellLandMap
  const cellLandMap = useMemo(() => {
    // console.log("Recomputing cellLandMap");
    const newCellLandMap = new Map<string, {landInfo: LandInfo, isCurrentUserLand: boolean}>();
    
    // Add current user's land to map
    if (currentUser && userProfile && userProfile.landInfo) {
      const { centerX, centerY, ownedSize } = userProfile.landInfo;
      const halfOwnedSize = Math.floor(ownedSize / 2);
      
      for (let y = centerY - halfOwnedSize; y <= centerY + halfOwnedSize; y++) {
        for (let x = centerX - halfOwnedSize; x <= centerX + halfOwnedSize; x++) {
          newCellLandMap.set(`${x}:${y}`, { 
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
    
      if (!isCurrentUserLand) { // Only add if it's not the current user's land already processed
        const halfSize = Math.floor(land.ownedSize / 2);
        for (let y = land.centerY - halfSize; y <= land.centerY + halfSize; y++) {
          for (let x = land.centerX - halfSize; x <= land.centerX + halfSize; x++) {
            // Only add if no other land (including current user's) is already mapped to this cell
            if (!newCellLandMap.has(`${x}:${y}`)) { 
              newCellLandMap.set(`${x}:${y}`, { 
                landInfo: land, 
                isCurrentUserLand: false 
              });
            }
          }
        }
      }
    });
    return newCellLandMap;
  }, [currentUser, userProfile?.landInfo, allLands]);


  const gridCells = useMemo(() => {
    // console.log(`gridCells: Computing. initialDataLoaded = ${initialDataLoaded}, allLands.length = ${allLands.length}`);
    if (viewportCellWidth === 0 || viewportCellHeight === 0 || !initialDataLoaded) {
      return []; 
    }
    
    const cells = [];
    const roundedViewportX = Math.floor(viewportOffset.x);
    const roundedViewportY = Math.floor(viewportOffset.y);
    
    const showGridLines = SHOW_GRID_LINES && zoomLevel >= GRID_LINE_THRESHOLD;
    
    for (let screenY = 0; screenY < viewportCellHeight; screenY++) {
      for (let screenX = 0; screenX < viewportCellWidth; screenX++) {
        const worldX = screenX + roundedViewportX;
        const worldY = screenY + roundedViewportY;
        const pixelKey = getPixelKey(worldX, worldY);
        
        const color = grid.get(pixelKey) || "#ffffff";
        
        // isDrawableHere check depends on currentUser and userProfile
        const isDrawableHere = !!currentUser && !!userProfile && canDrawAtPoint(worldX, worldY);
        
        const cellStyle: React.CSSProperties = {
          width: `${effectiveCellSize}px`,
          height: `${effectiveCellSize}px`,
          boxSizing: 'border-box',
          backgroundColor: color,
          position: 'relative'
        };
        
        let landOwnerInfo = null;
        const landMapEntry = cellLandMap.get(pixelKey); // Use memoized cellLandMap
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
        
        const hasLandBorder = 
          cellStyle.borderLeft || cellStyle.borderRight || 
          cellStyle.borderTop || cellStyle.borderBottom;
          
        if (showGridLines && !hasLandBorder) {
          cellStyle.boxShadow = `inset 0 0 0 1px ${GRID_LINE_COLOR}`;
        }
        
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
            // onMouseDown={(e) => !isPanning && handleCellClick(worldX, worldY, e)} 
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
    grid,
    viewportOffset,
    viewportCellWidth,
    viewportCellHeight,
    effectiveCellSize,
    cellLandMap,
    currentUser,
    userProfile,
    canDrawAtPoint,
    debugMode,
    isPanning,
    zoomLevel,
    initialDataLoaded,
    getPixelKey // This should be stable, but double-check that it's not recreated on each render
  ]);

  // Modify the loading screen return statement around line 1509

if (!initialDataLoaded) {
  console.log("Canvas render: Displaying LOADING screen because initialDataLoaded is false.");
  
  return (
    <div ref={canvasContainerRef} className="flex justify-center items-center h-screen" onWheel={handleWheel}>
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <div className="text-lg mb-2">Loading Canvas...</div>
        <div className="text-sm text-gray-600 mb-4">
          {wsConnected ? 
            "Connected to server, loading data..." : 
            "Connecting to server..."}
        </div>
        <div className="flex space-x-4">
          <button 
            onClick={() => {
              setInitialDataLoaded(true);
              setGrid(new Map());
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Skip Loading
          </button>
          <button
            onClick={() => {
              requestFullSync();
            }}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Retry Sync
          </button>
        </div>
      </div>
    </div>
  );
}

  return (
    <div 
      ref={canvasContainerRef}
      className="relative w-screen h-screen overflow-hidden bg-gray-200 cursor-default"
      style={{ 
        touchAction: "none", // This is crucial for preventing default touch behaviors
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "none",
      }} 
      onWheel={handleWheel} 
      onMouseDown={handleCanvasMouseDown}
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