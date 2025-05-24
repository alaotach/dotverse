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
import { PixelBatchManager } from '../src/services/pixelBatchManager';

const CELL_SCROLL_STEP = 5;

const COOLDOWN_SECONDS = 0;
const PIXELS_PATH = "pixels";
const CELL_SIZE = 10;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_SENSITIVITY = 0.1;
const CHUNK_SIZE = 25; 
const BATCH_SIZE = 1000; 
const UPDATE_BATCH_INTERVAL = 100; 
const SYNC_THROTTLE_MS = 30000;
const PIXELS_PER_LINE = 20;


const debounce = (func: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
};
const LOCAL_CACHE_ENABLED = true;
const QUOTA_SAFETY_MARGIN = 0.8;
const USE_CHUNKED_STORAGE = true;
const CHUNK_COLLECTION = 'pixelChunks';


const LOCAL_STORAGE_VIEWPORT_X_KEY = 'dotverse_viewport_x';
const LOCAL_STORAGE_VIEWPORT_Y_KEY = 'dotverse_viewport_y';
const LOCAL_STORAGE_ZOOM_LEVEL_KEY = 'dotverse_zoom_level';

const GRID_LINE_COLOR = "rgba(200, 200, 200, 0.3)";
const SHOW_GRID_LINES = true;
const GRID_LINE_THRESHOLD = 0.6;

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

interface LandInfo {
  centerX: number;
  centerY: number;
  ownedSize: number;
  owner: string;
  displayName?: string;
  isEmpty?: boolean;
}

const CLIENT_ID = `client_${Math.random().toString(36).substring(2, 15)}`;

const plotLine = (x0: number, y0: number, x1: number, y1: number): {x: number, y: number}[] => {
  const points: {x: number, y: number}[] = [];
  
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  
  const addedPoints = new Set<string>();

  while (true) {
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

const NON_PASSIVE_EVENT_OPTIONS = { passive: false, capture: false };

const toggleBrowserFullScreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
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
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
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
  const [canvasWidth, setCanvasWidth] = useState<number>(0);
  const [canvasHeight, setCanvasHeight] = useState<number>(0);
  const lastDrawnPositionRef = useRef<{ x: number, y: number } | null>(null);
  const pixelBatchManagerRef = useRef<PixelBatchManager | null>(null);

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
    }, 1000),
    [initialDataLoaded, initialViewportSet]
  );
  
  const userLandBorderColor = "rgba(255, 0, 0, 0.7)"; 
  const otherLandBorderColor = "rgba(0, 128, 255, 0.5)";
  const emptyLandFillColor = "rgba(200, 200, 200, 0.2)";

  const [viewportCellWidth, setViewportCellWidth] = useState(100); 
  const [viewportCellHeight, setViewportCellHeight] = useState(100);
  
  const effectiveCellSize = useMemo(() => CELL_SIZE * zoomLevel, [zoomLevel]);
  
  const { currentUser, userProfile } = useAuth(); 
  const previousGridRef = useRef<Map<string, string>>(new Map());
  
  const masterGridDataRef = useRef<Map<string, string>>(new Map()); 
  const activeChunkKeysRef = useRef<Set<string>>(new Set()); 

  const lastPositionRef = useRef<{ x: number, y: number } | null>(null);
  const lastPaintedCellRef = useRef<{ x: number, y: number } | null>(null);
  const syncInProgressRef = useRef<boolean>(false);
  const lastSyncRequestTimeRef = useRef<number>(0);
  const MIN_SYNC_INTERVAL = 5000;
  const clientIdRef = useRef<string>(CLIENT_ID);
  const optimisticUpdatesMapRef = useRef<Map<string, {timestamp: number, color: string}>>(new Map());
  const canvasContainerRef = useRef<HTMLDivElement>(null); 
  const panStartMousePositionRef = useRef<{ x: number, y: number } | null>(null);
  const panStartViewportOffsetRef = useRef<{ x: number, y: number } | null>(null);
  const isSpacebarHeldRef = useRef<boolean>(false); 
  const lastDrawTimestampRef = useRef<number | null>(null); 
  const latestViewportOffsetTargetRef = useRef(viewportOffset);
  const latestZoomLevelTargetRef = useRef(zoomLevel);
  const animationFrameRequestRef = useRef<number | null>(null);

  const toggleDebugMode = useCallback(() => {
    setDebugMode(prev => !prev);
    console.log("Debug mode toggled:", !debugMode);
  }, [debugMode]);

  useEffect(() => {
    latestViewportOffsetTargetRef.current = viewportOffset;
  }, [viewportOffset]);

  useEffect(() => {
    latestZoomLevelTargetRef.current = zoomLevel;
  }, [zoomLevel]);

  const cellSize = CELL_SIZE || 10;

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement> | WheelEvent) => {
    if (!canvasContainerRef.current) return;
    
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const mouseXOnCanvas = event.clientX - rect.left;
      const mouseYOnCanvas = event.clientY - rect.top;

      const zoomFactor = event.deltaY < 0 ? (1 + ZOOM_SENSITIVITY) : (1 - ZOOM_SENSITIVITY);
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel * zoomFactor));
      
      const worldXBeforeZoom = viewportOffset.x + mouseXOnCanvas / effectiveCellSize;
      const worldYBeforeZoom = viewportOffset.y + mouseYOnCanvas / effectiveCellSize;
      
      const newEffectiveCellSize = CELL_SIZE * newZoom;
      
      const newViewportX = worldXBeforeZoom - mouseXOnCanvas / newEffectiveCellSize;
      const newViewportY = worldYBeforeZoom - mouseYOnCanvas / newEffectiveCellSize;
      
      setZoomLevel(newZoom);
      setViewportOffset({ x: newViewportX, y: newViewportY });
    } else {
      let scrollPixelX = event.deltaX;
      let scrollPixelY = event.deltaY;

      if (event.deltaMode === 1) { 
        scrollPixelX *= PIXELS_PER_LINE;
        scrollPixelY *= PIXELS_PER_LINE;
      }

      if (event.shiftKey && scrollPixelY !== 0 && scrollPixelX === 0) {
        scrollPixelX = scrollPixelY;
        scrollPixelY = 0;
      }
      
      const panXAmount = scrollPixelX / effectiveCellSize;
      const panYAmount = scrollPixelY / effectiveCellSize;

      setViewportOffset(prev => ({
        x: prev.x + panXAmount,
        y: prev.y + panYAmount,
      }));
    }
  }, [zoomLevel, viewportOffset, effectiveCellSize]);

  useEffect(() => {
    if (canvasContainerRef.current && effectiveCellSize > 0) {
      const containerWidth = canvasContainerRef.current.clientWidth;
      const containerHeight = canvasContainerRef.current.clientHeight;
      
      if (containerWidth > 0 && containerHeight > 0) {
        const newWidth = Math.ceil(containerWidth / effectiveCellSize) + 2;
        const newHeight = Math.ceil(containerHeight / effectiveCellSize) + 2;
        
        setViewportCellWidth(newWidth);
        setViewportCellHeight(newHeight);
      }
    }
  }, [effectiveCellSize, canvasWidth, canvasHeight]);

  const processViewportUpdatesRAF = useCallback(() => {
    setViewportOffset(latestViewportOffsetTargetRef.current);
    setZoomLevel(latestZoomLevelTargetRef.current);
    animationFrameRequestRef.current = null;
  }, [setViewportOffset, setZoomLevel]); 

  const requestViewportUpdateRAF = useCallback(() => {
    if (!animationFrameRequestRef.current) {
      animationFrameRequestRef.current = requestAnimationFrame(processViewportUpdatesRAF);
    }
  }, [processViewportUpdatesRAF]);

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
    const endWorldX = viewportOffset.x + viewportCellWidth;
    const startWorldY = viewportOffset.y;
    const endWorldY = viewportOffset.y + viewportCellHeight;

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
  }, [viewportOffset, viewportCellWidth, viewportCellHeight, effectiveCellSize]);

  const updateGridFromVisibleChunks = useCallback(() => {
    if (!initialDataLoaded) return;

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
  }, [getVisibleChunkKeys, initialDataLoaded]);

  const requestFullSync = useCallback(async () => {
    if (syncInProgressRef.current) {
      console.log("Sync already in progress, skipping request");
      return;
    }

    const now = Date.now();
    if (now - lastSyncRequestTimeRef.current < MIN_SYNC_INTERVAL) {
      console.log(`Sync request throttled. Last request was ${now - lastSyncRequestTimeRef.current}ms ago`);
      return;
    }

    console.log("[Canvas] requestFullSync: Starting WebSocket sync");
    syncInProgressRef.current = true;
    lastSyncRequestTimeRef.current = now;

    let cachedPixels: Array<{ key: string, value: string, timestamp: number }> = [];
    if (LOCAL_CACHE_ENABLED) {
      try {
        cachedPixels = await getLocalCache(true) || [];
        console.log(`[Canvas] requestFullSync: Loaded ${cachedPixels.length} pixels from local cache.`);
      } catch (error) {
        console.error("[Canvas] requestFullSync: Error loading from local cache:", error);
      }
    }
    if (pixelBatchManagerRef.current) {
      pixelBatchManagerRef.current.clear();
    }
    try {
      masterGridDataRef.current.clear();

      if (LOCAL_CACHE_ENABLED && cachedPixels.length > 0) {
        cachedPixels.forEach(cachedPixel => {
          const [x, y] = cachedPixel.key.split(':').map(Number);
          if (!isNaN(x) && !isNaN(y)) {
            masterGridDataRef.current.set(cachedPixel.key, cachedPixel.value);
            
            optimisticUpdatesMapRef.current.set(cachedPixel.key, {
              timestamp: cachedPixel.timestamp || Date.now(), 
              color: cachedPixel.value
            });
          }
        });
        console.log(`[Canvas] requestFullSync: Applied ${cachedPixels.length} cached pixels to master grid.`);
      }

      let receivedPixelCount = 0;
      let syncDataComplete = false;
      
      const syncDataHandler = (data: any[]) => {
        if (Array.isArray(data)) {
          data.forEach(pixel => {
            if (pixel && typeof pixel.x === 'number' && typeof pixel.y === 'number' && pixel.color) {
              const pixelKey = getPixelKey(pixel.x, pixel.y);
              
              const optimisticUpdate = optimisticUpdatesMapRef.current.get(pixelKey);
              if (!optimisticUpdate || optimisticUpdate.timestamp < (pixel.timestamp || 0)) {
                masterGridDataRef.current.set(pixelKey, pixel.color);
              }
              receivedPixelCount++;
            }
          });
          console.log(`[Canvas] Received ${data.length} pixels in sync batch`);
        }
      };

      const syncCompletionPromise = new Promise<void>(resolve => {
        const syncCompleteHandler = () => {
          syncDataComplete = true;
          websocketService.off('sync_complete', syncCompleteHandler);
          resolve();
        };
        websocketService.on('sync_complete', syncCompleteHandler);      
        setTimeout(() => {
          if (!syncDataComplete) {
            console.warn('[Canvas] Sync completion timeout reached');
            websocketService.off('sync_complete', syncCompleteHandler);
            resolve();
          }
        }, 10000);
      });

      websocketService.on('sync_data', syncDataHandler);
      
      websocketService.send('sync_request', {});
      console.log('[Canvas] Sync request sent to WebSocket server');
      
      await syncCompletionPromise;
      
      websocketService.off('sync_data', syncDataHandler);
      
      console.log(`[Canvas] Sync complete, received ${receivedPixelCount} pixels from server`);
      
      updateGridFromVisibleChunks();
      
      setLastSyncTime(Date.now());
      setInitialDataLoaded(true);
      console.log("requestFullSync: Called setInitialDataLoaded(true).");
      
    } catch (error) {
      console.error("[Canvas] requestFullSync: Error during sync:", error);
      
      if (cachedPixels.length > 0) {
        console.log("[Canvas] Using cached data due to sync error");
        setInitialDataLoaded(true);
        updateGridFromVisibleChunks();
      }
    } finally {
      syncInProgressRef.current = false;
    }
  }, [getPixelKey, updateGridFromVisibleChunks]);

  const canDrawAtPoint = useCallback((worldX: number, worldY: number): boolean => {
    if (!currentUser || !userProfile?.landInfo) {
      return false;
    }
    
    const { centerX, centerY, ownedSize } = userProfile.landInfo;
    const halfSize = Math.floor(ownedSize / 2);
    
    return (
      worldX >= centerX - halfSize &&
      worldX <= centerX + halfSize &&
      worldY >= centerY - halfSize &&
      worldY <= centerY + halfSize
    );
  }, [currentUser, userProfile]);

  const getAllLands = useCallback(async () => {
    setLoadingLands(true);
    try {
      const landsCollectionRef = collection(fs, 'users');
      const querySnapshot = await getDocs(landsCollectionRef);
      
      const lands: LandInfo[] = [];
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.landInfo) {
          lands.push({
            centerX: userData.landInfo.centerX,
            centerY: userData.landInfo.centerY,
            ownedSize: userData.landInfo.ownedSize,
            owner: doc.id,
            displayName: userData.displayName || 'Anonymous'
          });
        }
      });
      
      setAllLands(lands);
      console.log(`Loaded ${lands.length} land plots`);
    } catch (error) {
      console.error("Error fetching all lands:", error);
    } finally {
      setLoadingLands(false);
    }
  }, []);

  const handleColorChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedColor(event.target.value);
    setIsEraserActive(false);
  }, []);

  const toggleEraser = useCallback(() => {
    setIsEraserActive(prev => !prev);
  }, []);

  const handleEraserSizeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setEraserSize(Math.max(1, Math.min(25, parseInt(event.target.value) || 1)));
  }, []);

  const handleDrawing = useCallback((event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!canvasContainerRef.current || !currentUser || !userProfile) {
      setShowAuthWarning(true);
      setTimeout(() => setShowAuthWarning(false), 3000);
      return;
    }
    
    const rect = canvasContainerRef.current.getBoundingClientRect();
    let clientX: number, clientY: number;
    
    if ('touches' in event) {
      if (event.touches.length === 0) return;
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }
    
    const mouseXOnCanvas = clientX - rect.left;
    const mouseYOnCanvas = clientY - rect.top;
    
    const worldX = Math.floor(viewportOffset.x + mouseXOnCanvas / effectiveCellSize);
    const worldY = Math.floor(viewportOffset.y + mouseYOnCanvas / effectiveCellSize);
    
    const now = Date.now();
    
    if (now - lastPlaced < COOLDOWN_SECONDS * 1000) {
      return;
    }
    
    if (!canDrawAtPoint(worldX, worldY)) {
      setShowAuthWarning(true);
      setTimeout(() => setShowAuthWarning(false), 3000);
      return;
    }
    
    const color = isEraserActive ? "#ffffff" : selectedColor;
    
    if (lastDrawnPositionRef.current && isMouseDown && 
        (Math.abs(worldX - lastDrawnPositionRef.current.x) > 1 || 
        Math.abs(worldY - lastDrawnPositionRef.current.y) > 1)) {
      
      const linePixels = plotLine(
        lastDrawnPositionRef.current.x, 
        lastDrawnPositionRef.current.y, 
        worldX, 
        worldY
      );
      
      const pixelsToUpdate: Pixel[] = [];
      const gridUpdates = new Map<string, string>();
      
      linePixels.forEach(pixel => {
        if (canDrawAtPoint(pixel.x, pixel.y)) {
          const pixelKey = getPixelKey(pixel.x, pixel.y);
          
          masterGridDataRef.current.set(pixelKey, color);
          optimisticUpdatesMapRef.current.set(pixelKey, {
            timestamp: now,
            color
          });
          
          gridUpdates.set(pixelKey, color);
          
          pixelsToUpdate.push({
            x: pixel.x,
            y: pixel.y,
            color,
            timestamp: now,
            clientId: clientIdRef.current
          });
        }
      });
      
      if (gridUpdates.size > 0) {
        setGrid(prev => {
          const newGrid = new Map(prev);
          gridUpdates.forEach((color, key) => {
            newGrid.set(key, color);
          });
          return newGrid;
        });
      }
      
      if (pixelsToUpdate.length > 0) {
        websocketService.send('pixel_update', pixelsToUpdate);
      }
      
    } else {
      const pixelKey = getPixelKey(worldX, worldY);
      
      masterGridDataRef.current.set(pixelKey, color);
      optimisticUpdatesMapRef.current.set(pixelKey, {
        timestamp: now,
        color
      });
      
      setGrid(prev => {
        const newGrid = new Map(prev);
        newGrid.set(pixelKey, color);
        return newGrid;
      });
      
      const pixel: Pixel = {
        x: worldX,
        y: worldY,
        color,
        timestamp: now,
        clientId: clientIdRef.current
      };
      
      websocketService.send('pixel_update', [pixel]);
    }
    
    lastDrawnPositionRef.current = { x: worldX, y: worldY };
    setLastPlaced(now);
    
  }, [canvasContainerRef, currentUser, userProfile, viewportOffset, effectiveCellSize, canDrawAtPoint, lastPlaced, isEraserActive, selectedColor, getPixelKey, isMouseDown]);

  const clearCanvas = useCallback(async () => {
    if (!currentUser || !userProfile?.landInfo) {
      setShowAuthWarning(true);
      setTimeout(() => setShowAuthWarning(false), 3000);
      return;
    }
    
    setIsClearing(true);
    try {
      const { centerX, centerY, ownedSize } = userProfile.landInfo;
      const halfSize = Math.floor(ownedSize / 2);
      
      const resetData = {
        type: 'land_clear',
        userId: currentUser.uid,
        landArea: {
          centerX,
          centerY,
          size: ownedSize
        },
        timestamp: Date.now(),
        clientId: clientIdRef.current
      };
      
      websocketService.send('canvas_reset', resetData);
      
      const updatedGrid = new Map(grid);
      for (let y = centerY - halfSize; y <= centerY + halfSize; y++) {
        for (let x = centerX - halfSize; x <= centerX + halfSize; x++) {
          const pixelKey = getPixelKey(x, y);
          updatedGrid.set(pixelKey, "#ffffff");
          
          masterGridDataRef.current.set(pixelKey, "#ffffff");
          optimisticUpdatesMapRef.current.set(pixelKey, {
            timestamp: Date.now(),
            color: "#ffffff"
          });
        }
      }
      setGrid(updatedGrid);
      
      console.log(`[Canvas] Sent canvas reset for land area ${ownedSize}x${ownedSize} at (${centerX}, ${centerY})`);
      
    } catch (error) {
      console.error("Error clearing canvas:", error);
    } finally {
      setIsClearing(false);
    }
  }, [currentUser, userProfile, getPixelKey, grid]);

  const navigateToUserLand = useCallback(() => {
    if (!userProfile?.landInfo) return;
    
    const { centerX, centerY } = userProfile.landInfo;
    
    if (canvasContainerRef.current) {
      const containerWidth = canvasContainerRef.current.clientWidth;
      const containerHeight = canvasContainerRef.current.clientHeight;
      
      const cellsWide = containerWidth / effectiveCellSize;
      const cellsHigh = containerHeight / effectiveCellSize;
      
      const newOffsetX = centerX - (cellsWide / 2);
      const newOffsetY = centerY - (cellsHigh / 2);
      
      setViewportOffset({ x: newOffsetX, y: newOffsetY });
    }
  }, [userProfile, effectiveCellSize]);

  const handleCanvasMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasContainerRef.current) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    setIsMouseDown(true);
    
    if (event.button === 1 || event.ctrlKey || isSpacebarHeldRef.current) {
      setIsPanning(true);
      const rect = canvasContainerRef.current.getBoundingClientRect();
      panStartMousePositionRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      panStartViewportOffsetRef.current = { ...viewportOffset };
    } else if (event.button === 0) {
      setIsPanning(false);
      lastDrawnPositionRef.current = null;
      handleDrawing(event);
    }
  }, [viewportOffset, handleDrawing]);

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasContainerRef.current || !isMouseDown) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    if (!isPanning) {
      handleDrawing(event);
    } else if (panStartMousePositionRef.current && panStartViewportOffsetRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const currentMouseX = event.clientX - rect.left;
      const currentMouseY = event.clientY - rect.top;
      
      const deltaX = (currentMouseX - panStartMousePositionRef.current.x) / effectiveCellSize;
      const deltaY = (currentMouseY - panStartMousePositionRef.current.y) / effectiveCellSize;
      
      latestViewportOffsetTargetRef.current = {
        x: panStartViewportOffsetRef.current.x - deltaX,
        y: panStartViewportOffsetRef.current.y - deltaY
      };
      requestViewportUpdateRAF();
    }
  }, [isMouseDown, isPanning, handleDrawing, effectiveCellSize, requestViewportUpdateRAF]);

  const handleCanvasMouseUp = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    setIsMouseDown(false);
    setIsPanning(false);
    panStartMousePositionRef.current = null;
    panStartViewportOffsetRef.current = null;
    lastDrawnPositionRef.current = null;
  }, []);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (event.touches.length === 1) {
      setIsMouseDown(true);
      setIsPanning(false);
      lastDrawnPositionRef.current = null;
      handleDrawing(event);
    }
  }, [handleDrawing]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (event.touches.length === 1 && isMouseDown && !isPanning) {
      handleDrawing(event);
    }
  }, [handleDrawing, isMouseDown, isPanning]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    setIsMouseDown(false);
    setIsPanning(false);
    lastDrawnPositionRef.current = null;
  }, []);

  useEffect(() => {
    getAllLands();
  }, [getAllLands]);

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
        }
      } catch (e) {
        console.error("Error parsing viewport data from localStorage:", e);
      }
    }

    if (!loadedFromStorage) {
      const defaultZoom = 2;
      const centerX = currentUser && userProfile?.landInfo ? userProfile.landInfo.centerX : 0;
      const centerY = currentUser && userProfile?.landInfo ? userProfile.landInfo.centerY : 0;
      
      const containerWidth = canvasContainerRef.current.clientWidth;
      const containerHeight = canvasContainerRef.current.clientHeight;
      const effectiveCell = CELL_SIZE * defaultZoom;
      
      const cellsWide = containerWidth / effectiveCell;
      const cellsHigh = containerHeight / effectiveCell;
      const newOffsetX = centerX - (cellsWide / 2);
      const newOffsetY = centerY - (cellsHigh / 2);
      
      setViewportOffset({ x: newOffsetX, y: newOffsetY });
      setZoomLevel(defaultZoom);
      console.log("Set default viewport:", { x: newOffsetX, y: newOffsetY, zoom: defaultZoom });
    }
    setInitialViewportSet(true);
  }, [initialDataLoaded, currentUser, userProfile, initialViewportSet]);

  useEffect(() => {
    debouncedSaveViewport(viewportOffset, zoomLevel);
  }, [viewportOffset, zoomLevel, debouncedSaveViewport]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsBrowserFullScreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const hasRequiredMethods = websocketService && 
                              typeof websocketService.isConnected === 'function' &&
                              typeof websocketService.connect === 'function';
    
    if (!hasRequiredMethods) {
      console.error('WebSocket service is missing required methods');
      return;
    }

    if (!websocketService.isConnected()) {
      websocketService.connect();
    }
    
    const handleConnectionChange = (isConnected: boolean) => {
      console.log(`WebSocket connection status changed: ${isConnected}`);
      setWsConnected(isConnected);
    };
    
    websocketService.onConnectionChange(handleConnectionChange);
    
    const handlePixelUpdate = (data: any) => {
      if (Array.isArray(data)) {
        data.forEach(pixel => {
          if (pixel && typeof pixel.x === 'number' && typeof pixel.y === 'number' && pixel.color) {
            const pixelKey = getPixelKey(pixel.x, pixel.y);
            
            const optimisticUpdate = optimisticUpdatesMapRef.current.get(pixelKey);
            if (optimisticUpdate && optimisticUpdate.timestamp > (pixel.timestamp || 0)) {
              return;
            }
            
            masterGridDataRef.current.set(pixelKey, pixel.color);
            
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
    
    websocketService.on('pixel_update', handlePixelUpdate);
    
    let syncAttempted = false;
    const syncOnceConnected = () => {
      if (wsConnected && !initialDataLoaded && !syncAttempted && websocketService.isConnected()) {
        syncAttempted = true;
        requestFullSync();
      }
    };
    
    if (websocketService.isConnected() && !initialDataLoaded && !syncAttempted) {
      syncAttempted = true;
      requestFullSync();
    }
    
    const syncInterval = setInterval(() => {
      if (websocketService.isConnected() && !initialDataLoaded && !syncAttempted) {
        syncAttempted = true;
        requestFullSync();
      }
    }, 2000);
    
    return () => {
      if (hasRequiredMethods) {
        websocketService.offConnectionChange(handleConnectionChange);
        websocketService.off('pixel_update', handlePixelUpdate);
        websocketService.off('canvas_reset', handleCanvasReset);
      }
      clearInterval(syncInterval);
    };
  }, []);

  const handleCanvasReset = useCallback((data: any) => {
    console.log('[Canvas] Received canvas reset:', data);
    
    if (data.type === 'land_clear' && data.landArea) {
      const { centerX, centerY, size } = data.landArea;
      const halfSize = Math.floor(size / 2);
      
      setGrid(prev => {
        const newGrid = new Map(prev);
        for (let y = centerY - halfSize; y <= centerY + halfSize; y++) {
          for (let x = centerX - halfSize; x <= centerX + halfSize; x++) {
            const pixelKey = getPixelKey(x, y);
            newGrid.set(pixelKey, "#ffffff");
            
            masterGridDataRef.current.set(pixelKey, "#ffffff");
          }
        }
        return newGrid;
      });
      
      console.log(`[Canvas] Applied land clear for ${size}x${size} area at (${centerX}, ${centerY})`);
      
    } else if (data.type === 'full_clear') {
      console.log('[Canvas] Applying full canvas clear');
      setGrid(new Map());
      masterGridDataRef.current.clear();
      optimisticUpdatesMapRef.current.clear();
    }
  }, [getPixelKey]);

  websocketService.on('canvas_reset', handleCanvasReset);

  useEffect(() => {
    if (initialDataLoaded) {
      updateGridFromVisibleChunks();
    }
  }, [viewportOffset, zoomLevel, viewportCellWidth, viewportCellHeight, initialDataLoaded, updateGridFromVisibleChunks]);

  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      if (!initialDataLoaded) {
        console.log("Loading timeout reached - forcing canvas to display");
        setInitialDataLoaded(true);
      }
    }, 15000);
    
    return () => clearTimeout(loadingTimeout);
  }, []);
  const cellLandMap = useMemo(() => {
    const newCellLandMap = new Map<string, {landInfo: LandInfo, isCurrentUserLand: boolean}>();
    
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
    
    allLands.forEach(land => {
      const isCurrentUserLand = currentUser && userProfile && userProfile.landInfo && 
                            userProfile.landInfo.centerX === land.centerX && 
                            userProfile.landInfo.centerY === land.centerY;
    
      if (!isCurrentUserLand) {
        const halfSize = Math.floor(land.ownedSize / 2);
        for (let y = land.centerY - halfSize; y <= land.centerY + halfSize; y++) {
          for (let x = land.centerX - halfSize; x <= land.centerX + halfSize; x++) {
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

  const showGridLines = SHOW_GRID_LINES && zoomLevel >= GRID_LINE_THRESHOLD;

  const gridCells = useMemo(() => {
    if (viewportCellWidth === 0 || viewportCellHeight === 0 || !initialDataLoaded) {
      return []; 
    }
    
    const cells = [];
    const startWorldX = Math.floor(viewportOffset.x);
    const startWorldY = Math.floor(viewportOffset.y);
    
    for (let screenY = 0; screenY < viewportCellHeight; screenY++) {
      for (let screenX = 0; screenX < viewportCellWidth; screenX++) {
        const worldX = screenX + startWorldX;
        const worldY = screenY + startWorldY;
        const pixelKey = getPixelKey(worldX, worldY);
        
        const color = grid.get(pixelKey) || "#ffffff";
        
        const isDrawableHere = !!currentUser && !!userProfile && canDrawAtPoint(worldX, worldY);
        
        const cellStyle: React.CSSProperties = {
          position: 'absolute',
          left: `${screenX * effectiveCellSize}px`,
          top: `${screenY * effectiveCellSize}px`,
          width: `${effectiveCellSize}px`,
          height: `${effectiveCellSize}px`,
          backgroundColor: color,
          boxSizing: 'border-box',
        };
        
        let borderTop = '';
        let borderBottom = '';
        let borderLeft = '';
        let borderRight = '';
        
        // First, add grid lines if enabled
        if (showGridLines) {
          const gridBorder = `1px solid ${GRID_LINE_COLOR}`;
          borderTop = gridBorder;
          borderBottom = gridBorder;
          borderLeft = gridBorder;
          borderRight = gridBorder;
        }

        const landMapEntry = cellLandMap.get(pixelKey);
        if (landMapEntry) {
          const { landInfo: land, isCurrentUserLand } = landMapEntry;
          const { centerX, centerY, ownedSize } = land;
          const halfSize = Math.floor(ownedSize / 2);
          
          const borderColor = isCurrentUserLand ? userLandBorderColor : otherLandBorderColor;
          const borderWidth = "3px";
          
          // Only add land borders on the actual land boundary edges
          if (worldX === centerX - halfSize) {
            borderLeft = `${borderWidth} solid ${borderColor}`;
          }
          if (worldX === centerX + halfSize) {
            borderRight = `${borderWidth} solid ${borderColor}`;
          }
          if (worldY === centerY - halfSize) {
            borderTop = `${borderWidth} solid ${borderColor}`;
          }
          if (worldY === centerY + halfSize) {
            borderBottom = `${borderWidth} solid ${borderColor}`;
          }
        }
        
        // Apply all borders
        if (borderTop) cellStyle.borderTop = borderTop;
        if (borderBottom) cellStyle.borderBottom = borderBottom;
        if (borderLeft) cellStyle.borderLeft = borderLeft;
        if (borderRight) cellStyle.borderRight = borderRight;
        
        if (debugMode && !isDrawableHere && currentUser && userProfile) {
          cellStyle.backgroundColor = color === "#ffffff" ? 
            "rgba(255, 0, 0, 0.1)" : 
            color;
          cellStyle.opacity = 0.7;
        }

        cells.push(
          <div
            key={pixelKey}
            style={cellStyle}
            className={isPanning ? 'cursor-move' : (isDrawableHere ? 'cursor-crosshair' : 'cursor-not-allowed')}
          />
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
    getPixelKey,
    showGridLines
  ]);


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
          touchAction: "none",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "none",
        }} 
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
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
              max="25"
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
          onClick={toggleBrowserFullScreen}
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
        <button
          onClick={toggleDebugMode}
          className={`px-3 py-1 rounded text-white ${debugMode ? 'bg-yellow-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}
        >
          {debugMode ? "Debug: ON" : "Debug"}
        </button>
        
        <button
          onClick={() => {
            console.log("Grid lines visibility:", SHOW_GRID_LINES, "Zoom level:", zoomLevel, "Threshold:", GRID_LINE_THRESHOLD);
          }}
          className="px-3 py-1 rounded text-white bg-gray-500 hover:bg-gray-600 text-xs"
          title={`Grid lines: ${showGridLines ? 'ON' : 'OFF'} (zoom ${GRID_LINE_THRESHOLD}+ required)`}
        >
          Grid: {SHOW_GRID_LINES && zoomLevel >= GRID_LINE_THRESHOLD ? 'ON' : 'OFF'}
        </button>
        
        {debugMode && currentUser && userProfile?.landInfo && (
          <div className="text-xs bg-gray-100 p-1 rounded">
            Center: ({userProfile.landInfo.centerX}, {userProfile.landInfo.centerY}), 
            Size: {userProfile.landInfo.ownedSize}x{userProfile.landInfo.ownedSize}
          </div>
        )}
      </div>
      
      <div 
        className="absolute inset-0"
        style={{
          transform: `translate(${-(viewportOffset.x % 1) * effectiveCellSize}px, ${-(viewportOffset.y % 1) * effectiveCellSize}px)`,
          willChange: 'transform'
        }}
      >
        {gridCells}
      </div>
      
      <div className="absolute bottom-4 right-4 bg-white px-3 py-1 rounded shadow-md text-xs">
        Zoom: {Math.round(zoomLevel * 100)}%
        {zoomLevel < GRID_LINE_THRESHOLD && SHOW_GRID_LINES && 
          <span className="ml-2 text-gray-500">(Zoom in to see grid)</span>
        }
        <br />
        Grid Lines: {SHOW_GRID_LINES && zoomLevel >= GRID_LINE_THRESHOLD ? 'Visible' : 'Hidden'}
        <br />
        Lands Loaded: {allLands.length}
      </div>
      
    </div>
  );
}
