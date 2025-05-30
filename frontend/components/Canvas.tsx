import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { db } from "../src/firebaseClient";
import { ref, onValue, set, update, get } from "firebase/database";
import websocketService from "../src/services/websocketService";
import { useAuth } from "../src/context/AuthContext";
import { openDB } from 'idb';
import { getLocalCache, updateLocalCache } from "../src/services/localStorageCache";
import { doc, getDoc, collection, getDocs, query, writeBatch, setDoc } from "firebase/firestore";
import { fs } from "../src/firebaseClient";
import { firestoreDebugger, isMissingDocError, isNetworkError } from "../src/services/debugTools";
import { PixelBatchManager } from '../src/services/pixelBatchManager';
import { useAnalytics } from '../src/services/AnalyticsService';
import { useGesture } from '@use-gesture/react';
import { FaPlus, FaMinus, FaHandPaper, FaPaintBrush } from 'react-icons/fa';
import { toPng } from 'html-to-image';
import { getAllLandsWithAuctionStatus, getUserLands, type UserLandInfo } from '../src/services/landService';
import { useNavigate } from 'react-router-dom';
import LandExpansionModal from '../components/lands/LandExpansionModal';
import LandInfoPanel from '../components/lands/LandInfoPanel';
import { landMergingService, type MergeCandidate } from '../src/services/landMergingService';

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
  isAuctioned?: boolean;
  auctionId?: string;
}

interface DrawAction {
  id: string;
  type: 'draw' | 'erase' | 'fill' | 'clear';
  pixels: { x: number; y: number; oldColor: string; newColor: string }[];
  timestamp: number;
}

const MAX_UNDO_HISTORY = 50;

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

const Canvas = () => {
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
  const [eraserSize, setEraserSize] = useState<number>(1);   const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showAuthWarning, setShowAuthWarning] = useState<boolean>(false);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [isToolbarVisible, setIsToolbarVisible] = useState<boolean>(true);
  const [quotaStatus, setQuotaStatus] = useState<{used: number, total: number, percentUsed: number}>({
    used: 0, 
    total: 100,
    percentUsed: 0
  });
    const [allLands, setAllLands] = useState<UserLandInfo[]>([]);
  const [loadingLands, setLoadingLands] = useState<boolean>(true);
  const [initialDataLoaded, setInitialDataLoaded] = useState<boolean>(false);
  const [initialViewportSet, setInitialViewportSet] = useState<boolean>(false);
  const [canvasWidth, setCanvasWidth] = useState<number>(0);
  const [canvasHeight, setCanvasHeight] = useState<number>(0);
  const lastDrawnPositionRef = useRef<{ x: number, y: number } | null>(null);
  const pixelBatchManagerRef = useRef<PixelBatchManager | null>(null);
  const { trackPixel } = useAnalytics();
  const navigate = useNavigate();

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
  
  const { currentUser, userProfile, refreshProfile } = useAuth(); 
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
  const [mousePosition, setMousePosition] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [brushSize, setBrushSize] = useState<number>(1);
  const [isFillActive, setIsFillActive] = useState<boolean>(false);
  const [undoHistory, setUndoHistory] = useState<DrawAction[]>([]);
  const [redoHistory, setRedoHistory] = useState<DrawAction[]>([]);
  const [isUndoRedoOperation, setIsUndoRedoOperation] = useState<boolean>(false);
  const [currentDrawingAction, setCurrentDrawingAction] = useState<DrawAction | null>(null);
  const isDrawingSessionActiveRef = useRef<boolean>(false);
  const drawingSessionPixelsRef = useRef<{ x: number; y: number; oldColor: string; newColor: string }[]>([]);
  const [isPanMode, setIsPanMode] = useState<boolean>(false); 
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  const [userLands, setUserLands] = useState<UserLandInfo[]>([]);
  const [isLandsDropdownOpen, setIsLandsDropdownOpen] = useState<boolean>(false);
  const [loadingUserLands, setLoadingUserLands] = useState<boolean>(false);
  const [showExpansionModal, setShowExpansionModal] = useState<boolean>(false);
  const [selectedLandForExpansion, setSelectedLandForExpansion] = useState<UserLandInfo | null>(null);
  const [showLandsExpansionDropdown, setShowLandsExpansionDropdown] = useState<boolean>(false);
  const [selectedLandInfo, setSelectedLandInfo] = useState<UserLandInfo | null>(null);
  const [showLandInfoPanel, setShowLandInfoPanel] = useState(false);
  const [showCreateAuctionModal, setShowCreateAuctionModal] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    land: UserLandInfo | null;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    landId: string;
    landInfo: LandInfo;
    mergeCandidates: MergeCandidate[];
  } | null>(null);

  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedMergeCandidate, setSelectedMergeCandidate] = useState<MergeCandidate | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenu) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [contextMenu]);

  const toggleDebugMode = useCallback(() => {
    setDebugMode(prev => !prev);
    console.log("Debug mode toggled:", !debugMode);
  }, [debugMode]);

  const togglePanMode = useCallback(() => {
    setIsPanMode(prev => !prev);
    console.log('Pan mode toggled:', !isPanMode);
  }, [isPanMode]);

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

  useEffect(() => {
  const updateCanvasDimensions = () => {
      if (canvasContainerRef.current) {
        const containerWidth = canvasContainerRef.current.clientWidth;
        const containerHeight = canvasContainerRef.current.clientHeight;
        
        setCanvasWidth(containerWidth);
        setCanvasHeight(containerHeight);
        
        if (effectiveCellSize > 0) {
          const newWidth = Math.ceil(containerWidth / effectiveCellSize) + 2;
          const newHeight = Math.ceil(containerHeight / effectiveCellSize) + 2;
          
          setViewportCellWidth(newWidth);
          setViewportCellHeight(newHeight);
        }
      }
    };

    updateCanvasDimensions();
    
    const resizeObserver = new ResizeObserver(updateCanvasDimensions);
    if (canvasContainerRef.current) {
      resizeObserver.observe(canvasContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [effectiveCellSize]);

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

  const captureScreenshot = useCallback(async () => {
    if (!canvasContainerRef.current || isCapturing) return;

    setIsCapturing(true);
    try{
      const toolbar = document.querySelector('[data-toolbar]') as HTMLElement;
      const toggleButton = document.querySelector('[toggle-toolbar]') as HTMLElement;
      if (toolbar) {
        toolbar.style.display = 'none';
      }
      if (toggleButton) {
        toggleButton.style.display = 'none';
      }

      await new Promise(resolve => requestAnimationFrame(resolve));
      const dataUrl = await toPng(canvasContainerRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });

      if (toolbar) {
        toolbar.style.display = '';
      }
      if (toggleButton) {
        toggleButton.style.display = '';
      }
      const link = document.createElement('a');
      link.download = `dotverse_screenshot_${new Date().toISOString()}.png`;
      link.href = dataUrl;
      link.click();
      window.location.href = '/gallery';
    } catch (error) {
      console.error("Error capturing screenshot:", error);
      alert("Failed to capture screenshot. Please try again.");
    }
    finally {
      setIsCapturing(false);
    }
    }, [isCapturing]);
  const handleLandRightClick = async (event: React.MouseEvent, landInfo: LandInfo) => {
    event.preventDefault();
    
    if (!currentUser || landInfo.owner !== currentUser.uid) {
      return;
    }
    
    const landId = `${landInfo.centerX},${landInfo.centerY}`;
    
    const mergeCandidates = await landMergingService.findMergeCandidates(currentUser.uid, landId);
    
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      landId,
      landInfo,
      mergeCandidates
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenu) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [contextMenu]);

  
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
      
    } catch (error) {
      
      if (cachedPixels.length > 0) {
        setInitialDataLoaded(true);
        updateGridFromVisibleChunks();
      }
    } finally {
      syncInProgressRef.current = false;
    }
  }, [getPixelKey, updateGridFromVisibleChunks]);  const canDrawAtPoint = useCallback((worldX: number, worldY: number): boolean => {
    if (!currentUser) {
      return false;
    }
    
    for (const land of allLands) {
      if (land.owner === currentUser.uid) {
        const halfSize = Math.floor(land.ownedSize / 2);
        const isWithinLand = (
          worldX >= land.centerX - halfSize &&
          worldX <= land.centerX + halfSize &&
          worldY >= land.centerY - halfSize &&
          worldY <= land.centerY + halfSize
        );
        
        if (isWithinLand) {
          
          if (land.isAuctioned) {
            return false;
          }
          return true;
        }
      }
    }
    if (userProfile?.landInfo) {
      const { centerX, centerY, ownedSize } = userProfile.landInfo;
      const halfSize = Math.floor(ownedSize / 2);
      
      const isWithinProfileLand = (
        worldX >= centerX - halfSize &&
        worldX <= centerX + halfSize &&
        worldY >= centerY - halfSize &&
        worldY <= centerY + halfSize
      );
      
      if (isWithinProfileLand) {
        
        const landAtProfile = allLands.find(land => 
          land.centerX === centerX && land.centerY === centerY
        );
        
        
        if (landAtProfile && landAtProfile.owner === currentUser.uid && !landAtProfile.isAuctioned) {
          return true;
        } else if (landAtProfile?.isAuctioned) {
          return false;
        }
      }
    }
    
    // console.log('[Canvas] Drawing blocked - not on owned land at point:', worldX, worldY);
    return false;
  }, [currentUser, userProfile, allLands]);
  
  const getAllLands = useCallback(async () => {
    setLoadingLands(true);
    try {
      const lands = await getAllLandsWithAuctionStatus();
      setAllLands(lands);
      
    } catch (error) {
      console.error("Error fetching all lands:", error);
    } finally {
      setLoadingLands(false);
    }
  }, []);
  const handleLandClick = useCallback(async (land: UserLandInfo, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (land.isAuctioned && land.auctionId) {
      navigate(`/auction/`);
    } else {
      setSelectedLandInfo(land);
      setShowLandInfoPanel(true);
    }
  }, [navigate]);

  const loadUserLands = useCallback(async () => {
    if (!currentUser) return;
    
    setLoadingUserLands(true);
    try {
      const lands = await getUserLands(currentUser.uid);
      setUserLands(lands);
    } catch (error) {
      console.error("Error fetching user lands:", error);
      setUserLands([]);
    } finally {
      setLoadingUserLands(false);
    }
  }, [currentUser]);

  const toggleLandsDropdown = useCallback(() => {
    if (!isLandsDropdownOpen && currentUser) {
      loadUserLands();
    }
    setIsLandsDropdownOpen(!isLandsDropdownOpen);
  }, [isLandsDropdownOpen, currentUser, loadUserLands]);

  const navigateToLand = useCallback((land: UserLandInfo) => {
    if (canvasContainerRef.current) {
      const containerWidth = canvasContainerRef.current.clientWidth;
      const containerHeight = canvasContainerRef.current.clientHeight;
      
      const cellsWide = containerWidth / effectiveCellSize;
      const cellsHigh = containerHeight / effectiveCellSize;
      
      const newOffsetX = land.centerX - (cellsWide / 2);
      const newOffsetY = land.centerY - (cellsHigh / 2);
      
      setViewportOffset({ x: newOffsetX, y: newOffsetY });
    // setViewportOffset({ x: land.centerX, y: land.centerY });
      setIsLandsDropdownOpen(false);
    }
  }, [effectiveCellSize, canvasContainerRef]);
  const auctionOverlays = useMemo(() => {
    if (viewportCellWidth === 0 || viewportCellHeight === 0 || !initialDataLoaded) {
      return [];
    }

    const overlays: React.ReactElement[] = [];
    const startWorldX = Math.floor(viewportOffset.x);
    const startWorldY = Math.floor(viewportOffset.y);
    const offsetX = (viewportOffset.x - startWorldX) * effectiveCellSize;
    const offsetY = (viewportOffset.y - startWorldY) * effectiveCellSize;

    allLands.forEach(land => {
      if (land.isAuctioned) {
        console.log('[Canvas] Rendering auction overlay for land:', land.centerX, land.centerY, 'auctionId:', land.auctionId);
        
        const { centerX, centerY, ownedSize } = land;
        const halfSize = Math.floor(ownedSize / 2);
        const landStartX = centerX - halfSize;
        const landEndX = centerX + halfSize;
        const landStartY = centerY - halfSize;
        const landEndY = centerY + halfSize;
        
        const viewportStartX = startWorldX;
        const viewportEndX = startWorldX + viewportCellWidth;
        const viewportStartY = startWorldY;
        const viewportEndY = startWorldY + viewportCellHeight;
        
        if (landEndX >= viewportStartX && landStartX <= viewportEndX &&
            landEndY >= viewportStartY && landStartY <= viewportEndY) {
          const overlayStartX = Math.max(landStartX, viewportStartX);
          const overlayEndX = Math.min(landEndX, viewportEndX);
          const overlayStartY = Math.max(landStartY, viewportStartY);
          const overlayEndY = Math.min(landEndY, viewportEndY);
          
          const screenX = overlayStartX - startWorldX;
          const screenY = overlayStartY - startWorldY;
          const width = overlayEndX - overlayStartX + 1;
          const height = overlayEndY - overlayStartY + 1;
          const overlayStyle: React.CSSProperties = {
            position: 'absolute',
            left: `${(screenX * effectiveCellSize) - offsetX}px`,
            top: `${(screenY * effectiveCellSize) - offsetY}px`,
            width: `${width * effectiveCellSize}px`,
            height: `${height * effectiveCellSize}px`,
            backgroundColor: 'rgba(255, 165, 0, 0.6)',
            border: '4px solid rgba(255, 165, 0, 1)',
            borderRadius: '6px',
            pointerEvents: 'auto',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            boxShadow: '0 0 20px rgba(255, 165, 0, 0.9), inset 0 0 20px rgba(255, 165, 0, 0.4)',
            backdropFilter: 'blur(1px)'
          };
          
          overlays.push(
            <div
              key={`auction-${land.id || `${land.centerX}-${land.centerY}`}`}
              style={overlayStyle}
              onClick={(event) => handleLandClick(land, event)}
              title={`Land auction: ${land.displayName || 'Unnamed Land'} - Click to view auction`}
            >              <div
                style={{
                  backgroundColor: 'rgba(255, 165, 0, 0.98)',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                  border: '2px solid rgba(255, 255, 255, 0.8)',
                  boxShadow: '0 0 8px rgba(255, 165, 0, 0.6)'
                }}
              >
                🔨 AUCTION
              </div>
            </div>
          );
        }
      }
    });

    console.log('[Canvas] Total auction overlays rendered:', overlays.length);
    return overlays;
  }, [
    allLands,
    viewportOffset,
    viewportCellWidth,
    viewportCellHeight,
    effectiveCellSize,
    initialDataLoaded,
    handleLandClick
  ]);

  const addToHistory = useCallback((action: DrawAction) => {
    if (isUndoRedoOperation) return;
    
    setUndoHistory(prev => {
      const newHistory = [...prev, action];
      if (newHistory.length > MAX_UNDO_HISTORY) {
        return newHistory.slice(-MAX_UNDO_HISTORY);
      }
      return newHistory;
    });
    
    setRedoHistory([]);
  }, [isUndoRedoOperation]);

  const undo = useCallback(() => {
    if (undoHistory.length === 0) return;
    
    const actionToUndo = undoHistory[undoHistory.length - 1];
    setIsUndoRedoOperation(true);
    
    try {
      const pixelsToUpdate: Pixel[] = [];
      const gridUpdates = new Map<string, string>();
      
      actionToUndo.pixels.forEach(({ x, y, oldColor }) => {
        const pixelKey = getPixelKey(x, y);
        
        masterGridDataRef.current.set(pixelKey, oldColor);
        optimisticUpdatesMapRef.current.set(pixelKey, {
          timestamp: Date.now(),
          color: oldColor
        });
        
        gridUpdates.set(pixelKey, oldColor);
        
        pixelsToUpdate.push({
          x,
          y,
          color: oldColor,
          timestamp: Date.now(),
          clientId: clientIdRef.current
        });
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
        const batchSize = 500;
        for (let i = 0; i < pixelsToUpdate.length; i += batchSize) {
          const batch = pixelsToUpdate.slice(i, i + batchSize);
          websocketService.send('pixel_update', batch);
        }
      }
      
      setUndoHistory(prev => prev.slice(0, -1));
      setRedoHistory(prev => [...prev, actionToUndo]);
      
    } finally {
      setIsUndoRedoOperation(false);
    }
  }, [undoHistory, getPixelKey]);

  const redo = useCallback(() => {
    if (redoHistory.length === 0) return;
    
    const actionToRedo = redoHistory[redoHistory.length - 1];
    setIsUndoRedoOperation(true);
    
    try {
      const pixelsToUpdate: Pixel[] = [];
      const gridUpdates = new Map<string, string>();
      
      actionToRedo.pixels.forEach(({ x, y, newColor }) => {
        const pixelKey = getPixelKey(x, y);
        
        masterGridDataRef.current.set(pixelKey, newColor);
        optimisticUpdatesMapRef.current.set(pixelKey, {
          timestamp: Date.now(),
          color: newColor
        });
        
        gridUpdates.set(pixelKey, newColor);
        pixelsToUpdate.push({
          x,
          y,
          color: newColor,
          timestamp: Date.now(),
          clientId: clientIdRef.current
        });
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
        const batchSize = 500;
        for (let i = 0; i < pixelsToUpdate.length; i += batchSize) {
          const batch = pixelsToUpdate.slice(i, i + batchSize);
          websocketService.send('pixel_update', batch);
        }
      }
      
      setRedoHistory(prev => prev.slice(0, -1));
      setUndoHistory(prev => [...prev, actionToRedo]);
      
    } finally {
      setIsUndoRedoOperation(false);
    }
  }, [redoHistory, getPixelKey]);

  const clearHistory = useCallback(() => {
    setUndoHistory([]);
    setRedoHistory([]);
  }, []);

  const floodFill = useCallback((startX: number, startY: number, newColor: string) => {
    const targetColor = masterGridDataRef.current.get(getPixelKey(startX, startY)) || "#ffffff";
    
    if (targetColor === newColor) {
      console.log('Fill cancelled: target color same as new color');
      return;
    }

    const pixelsToUpdate: Pixel[] = [];
    const gridUpdates = new Map<string, string>();
    const actionPixels: { x: number; y: number; oldColor: string; newColor: string }[] = [];
    const visited = new Set<string>();
    const queue: { x: number, y: number }[] = [{ x: startX, y: startY }];
    
    const maxFillSize = 10000;
    let fillCount = 0;
    
    console.log(`Starting flood fill at (${startX}, ${startY}) from ${targetColor} to ${newColor}`);
    
    while (queue.length > 0 && fillCount < maxFillSize) {
      const { x, y } = queue.shift()!;
      const pixelKey = getPixelKey(x, y);
      
      if (visited.has(pixelKey)) continue;
      visited.add(pixelKey);
      
      if (!canDrawAtPoint(x, y)) continue;
      
      const currentColor = masterGridDataRef.current.get(pixelKey) || "#ffffff";
      
      if (currentColor !== targetColor) continue;
      
      const now = Date.now();
      masterGridDataRef.current.set(pixelKey, newColor);
      optimisticUpdatesMapRef.current.set(pixelKey, {
        timestamp: now,
        color: newColor
      });
      
      gridUpdates.set(pixelKey, newColor);
      actionPixels.push({ x, y, oldColor: currentColor, newColor });
      
      pixelsToUpdate.push({
        x,
        y,
        color: newColor,
        timestamp: now,
        clientId: clientIdRef.current
      });
      
      fillCount++;
      
      const neighbors = [
        { x: x + 1, y: y },     
        { x: x - 1, y: y },     
        { x: x, y: y + 1 },     
        { x: x, y: y - 1 }      
      ];
      
      neighbors.forEach(neighbor => {
        const neighborKey = getPixelKey(neighbor.x, neighbor.y);
        if (!visited.has(neighborKey)) {
          queue.push(neighbor);
        }
      });
    }
    
    if (fillCount >= maxFillSize) {
      console.warn(`Fill operation reached maximum size limit of ${maxFillSize} pixels`);
    }
    
    console.log(`Flood fill completed: ${fillCount} pixels filled`);
    
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
      const batchSize = 500;
      for (let i = 0; i < pixelsToUpdate.length; i += batchSize) {
        const batch = pixelsToUpdate.slice(i, i + batchSize);
        websocketService.send('pixel_update', batch);
      }
    }
    
    if (actionPixels.length > 0) {
      addToHistory({
        id: `fill_${Date.now()}_${Math.random()}`,
        type: 'fill',
        pixels: actionPixels,
        timestamp: Date.now()
      });
    }
    
    setLastPlaced(Date.now());
    
  }, [canDrawAtPoint, getPixelKey, selectedColor, addToHistory]);


  const handleColorChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedColor(event.target.value);
    setIsEraserActive(false);
    setIsFillActive(false);
  }, []);

  const toggleEraser = useCallback(() => {
    setIsEraserActive(prev => !prev);
    if (!isEraserActive) {
      setIsFillActive(false);
    }
  }, [isEraserActive]);
  const toggleFill = useCallback(() => {
    setIsFillActive(prev => !prev);
    if (!isFillActive) {
      setIsEraserActive(false);
    }
    console.log('Fill tool toggled:', !isFillActive);
  }, [isFillActive]);

  const zoomIn = useCallback(() => {
    const zoomFactor = 1.2;
    const newZoom = Math.min(MAX_ZOOM, zoomLevel * zoomFactor);
    
    if (newZoom !== zoomLevel && canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const worldXBeforeZoom = latestViewportOffsetTargetRef.current.x + centerX / (CELL_SIZE * latestZoomLevelTargetRef.current);
      const worldYBeforeZoom = latestViewportOffsetTargetRef.current.y + centerY / (CELL_SIZE * latestZoomLevelTargetRef.current);
      
      const newEffectiveCellSize = CELL_SIZE * newZoom;
      const newViewportX = worldXBeforeZoom - centerX / newEffectiveCellSize;
      const newViewportY = worldYBeforeZoom - centerY / newEffectiveCellSize;

      latestZoomLevelTargetRef.current = newZoom;
      latestViewportOffsetTargetRef.current = { x: newViewportX, y: newViewportY };
      requestViewportUpdateRAF();
    }
  }, [zoomLevel]);
  const zoomOut = useCallback(() => {
    const zoomFactor = 1.2;
    const newZoom = Math.max(MIN_ZOOM, zoomLevel / zoomFactor);
    
    if (newZoom !== zoomLevel && canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const worldXBeforeZoom = latestViewportOffsetTargetRef.current.x + centerX / (CELL_SIZE * latestZoomLevelTargetRef.current);
      const worldYBeforeZoom = latestViewportOffsetTargetRef.current.y + centerY / (CELL_SIZE * latestZoomLevelTargetRef.current);
      
      const newEffectiveCellSize = CELL_SIZE * newZoom;
      const newViewportX = worldXBeforeZoom - centerX / newEffectiveCellSize;
      const newViewportY = worldYBeforeZoom - centerY / newEffectiveCellSize;

      latestZoomLevelTargetRef.current = newZoom;
      latestViewportOffsetTargetRef.current = { x: newViewportX, y: newViewportY };
      requestViewportUpdateRAF();
    }
  }, [zoomLevel]);

  const toggleToolbar = useCallback(() => {
    setIsToolbarVisible(prev => !prev);
  }, []);

  const handleEraserSizeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = Math.max(1, Math.min(20, parseInt(event.target.value) || 1));
    setEraserSize(newSize);
    console.log(`Eraser size changed to: ${newSize}x${newSize}`);
  }, []);

  const handleBrushSizeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = Math.max(1, Math.min(20, parseInt(event.target.value) || 1));
    setBrushSize(newSize);
    console.log(`Brush size changed to: ${newSize}x${newSize}`);
  }, []);

  

  const handleDrawing = useCallback( (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
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
    
  const worldX = Math.floor(viewportOffset.x + (mouseXOnCanvas / effectiveCellSize));
  const worldY = Math.floor(viewportOffset.y + (mouseYOnCanvas / effectiveCellSize));

    console.log('Coordinate Debug:', {
      mouse: { clientX, clientY },
      rect: { left: rect.left, top: rect.top },
      canvas: { x: mouseXOnCanvas, y: mouseYOnCanvas },
      viewport: viewportOffset,
      effectiveCellSize,
      calculated: { worldX, worldY }
    });
    
    const now = Date.now();
    
    if (now - lastPlaced < COOLDOWN_SECONDS * 1000) {
      return;
    }

    if (!canDrawAtPoint(worldX, worldY)) {
      setShowAuthWarning(true);
      setTimeout(() => setShowAuthWarning(false), 3000);
      return;
    }

    if (!isDrawingSessionActiveRef.current) {
      isDrawingSessionActiveRef.current = true;
      drawingSessionPixelsRef.current = [];
      console.log('Started new drawing session');
    }

    if (isFillActive) {
      const fillColor = selectedColor;
      floodFill(worldX, worldY, fillColor);
      trackPixel(worldX, worldY, fillColor);
      return;
    }
    
    const color = isEraserActive ? "#ffffff" : selectedColor;

    if (isEraserActive && eraserSize > 0) {
      const halfSize = Math.floor(eraserSize / 2);
      const pixelsToUpdate: Pixel[] = [];
      const gridUpdates = new Map<string, string>();
      
      for (let dy = -halfSize; dy <= halfSize; dy++) {
        for (let dx = -halfSize; dx <= halfSize; dx++) {
          const targetX = worldX + dx;
          const targetY = worldY + dy;
          if (canDrawAtPoint(targetX, targetY)) {
            const pixelKey = getPixelKey(targetX, targetY);
            const oldColor = masterGridDataRef.current.get(pixelKey) || "#ffffff";
            
            if (oldColor !== color) {
              drawingSessionPixelsRef.current.push({ x: targetX, y: targetY, oldColor, newColor: color });
            }
            
            masterGridDataRef.current.set(pixelKey, color);
            optimisticUpdatesMapRef.current.set(pixelKey, {
              timestamp: now,
              color
            });
            gridUpdates.set(pixelKey, color);
            
            pixelsToUpdate.push({
              x: targetX,
              y: targetY,
              color,
              timestamp: now,
              clientId: clientIdRef.current
            });
          }
        }
      }
      
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
        trackPixel(worldX, worldY, color);
      }
      
      lastDrawnPositionRef.current = { x: worldX, y: worldY };
      setLastPlaced(now);
      return;
    } else if (!isEraserActive && brushSize > 1) {
      const halfSize = Math.floor(brushSize / 2);
      const pixelsToUpdate: Pixel[] = [];
      const gridUpdates = new Map<string, string>();
      
      for (let dy = -halfSize; dy <= halfSize; dy++) {
        for (let dx = -halfSize; dx <= halfSize; dx++) {
          const targetX = worldX + dx;
          const targetY = worldY + dy;
          if (canDrawAtPoint(targetX, targetY)) {
            const pixelKey = getPixelKey(targetX, targetY);
            const oldColor = masterGridDataRef.current.get(pixelKey) || "#ffffff";
            
            if (oldColor !== color) {
              drawingSessionPixelsRef.current.push({ x: targetX, y: targetY, oldColor, newColor: color });
            }
            
            masterGridDataRef.current.set(pixelKey, color);
            optimisticUpdatesMapRef.current.set(pixelKey, {
              timestamp: now,
              color
            });
            
            gridUpdates.set(pixelKey, color);
            
            pixelsToUpdate.push({
              x: targetX,
              y: targetY,
              color,
              timestamp: now,
              clientId: clientIdRef.current
            });
          }
        }
      }
      
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
        trackPixel(worldX, worldY, color);
      }
      
      lastDrawnPositionRef.current = { x: worldX, y: worldY };
      setLastPlaced(now);
      return;
    }
    
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
          const oldColor = masterGridDataRef.current.get(pixelKey) || "#ffffff";
          
          if (oldColor !== color) {
            drawingSessionPixelsRef.current.push({ x: pixel.x, y: pixel.y, oldColor, newColor: color });
          }
          
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
      
      
      lastDrawnPositionRef.current = { x: worldX, y: worldY };
      setLastPlaced(now);
      return;
    }
    
    const pixelKey = getPixelKey(worldX, worldY);
    const oldColor = masterGridDataRef.current.get(pixelKey) || "#ffffff";
    
    if (oldColor !== color) {
      drawingSessionPixelsRef.current.push({ x: worldX, y: worldY, oldColor, newColor: color });
      
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
      trackPixel(worldX, worldY, color);
    }
    
    lastDrawnPositionRef.current = { x: worldX, y: worldY };
    setLastPlaced(now);
  }, [canvasContainerRef, currentUser, userProfile, viewportOffset, effectiveCellSize, canDrawAtPoint, lastPlaced, isEraserActive, selectedColor, getPixelKey, isMouseDown, eraserSize, brushSize, isFillActive,trackPixel]);

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
      
      const actionPixels: { x: number; y: number; oldColor: string; newColor: string }[] = [];
      
      for (let y = centerY - halfSize; y <= centerY + halfSize; y++) {
        for (let x = centerX - halfSize; x <= centerX + halfSize; x++) {
          const pixelKey = getPixelKey(x, y);
          const oldColor = masterGridDataRef.current.get(pixelKey) || "#ffffff";
          
          if (oldColor !== "#ffffff") {
            actionPixels.push({ x, y, oldColor, newColor: "#ffffff" });
          }
        }
      }
      
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
      
      if (actionPixels.length > 0) {
        addToHistory({
          id: `clear_${Date.now()}_${Math.random()}`,
          type: 'clear',
          pixels: actionPixels,
          timestamp: Date.now()
        });
      }
      
      console.log(`[Canvas] Sent canvas reset for land area ${ownedSize}x${ownedSize} at (${centerX}, ${centerY})`);
      
    } catch (error) {
      console.error("Error clearing canvas:", error);
    } finally {
      setIsClearing(false);
    }
  }, [currentUser, userProfile, getPixelKey, grid, addToHistory]);  
  
  const bind = useGesture(
    {
      onDrag: ({ active, movement: [dx, dy], event, first, last, touches, memo }) => {
        if (isPanMode && (touches === 1 || touches === 2)) { 
          if (event?.target === canvasContainerRef.current || canvasContainerRef.current?.contains(event?.target as Node)) {
            if (event?.cancelable) event.preventDefault();
          }

          if (first) {
            memo = { x: latestViewportOffsetTargetRef.current.x, y: latestViewportOffsetTargetRef.current.y };
            setIsPanning(true);
          }

          if (active && memo) {
            const panSensitivity = touches === 1 ? 1.5 : 2; 
            latestViewportOffsetTargetRef.current = {
              x: memo.x - (dx / panSensitivity) / effectiveCellSize,
              y: memo.y - (dy / panSensitivity) / effectiveCellSize,
            };
            requestViewportUpdateRAF();
          }

          if (last) { 
            setIsPanning(false);
          }
          return memo;
        } else {
          if (isPanning && !active) setIsPanning(false);
        }
        return memo;
      },
    },
    {
      drag: {
        filterTaps: true,
        threshold: 10, 
      },
      eventOptions: { passive: false },
    }
  );


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
      
      const mousePanSensitivity = 2; 
      
      const deltaX = (currentMouseX - panStartMousePositionRef.current.x) / (effectiveCellSize * mousePanSensitivity);
      const deltaY = (currentMouseY - panStartMousePositionRef.current.y) / (effectiveCellSize * mousePanSensitivity);
      
      latestViewportOffsetTargetRef.current = {
        x: panStartViewportOffsetRef.current.x - deltaX,
        y: panStartViewportOffsetRef.current.y - deltaY
      };
      requestViewportUpdateRAF();
    }
  }, [isMouseDown, isPanning, handleDrawing, effectiveCellSize, requestViewportUpdateRAF]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if ((isEraserActive && eraserSize > 1) || (!isEraserActive && brushSize > 1)) {
      setMousePosition({
        x: event.clientX,
        y: event.clientY
      });
    }
    
    handleCanvasMouseMove(event);
  }, [isEraserActive, eraserSize, brushSize, handleCanvasMouseMove]);

  const handleCanvasMouseUp = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (isDrawingSessionActiveRef.current && drawingSessionPixelsRef.current.length > 0) {
      const sessionPixels = [...drawingSessionPixelsRef.current];
      
      addToHistory({
        id: `draw_session_${Date.now()}_${Math.random()}`,
        type: isEraserActive ? 'erase' : 'draw',
        pixels: sessionPixels,
        timestamp: Date.now()
      });
      
      console.log(`Finalized drawing session with ${sessionPixels.length} pixels`);
      
      isDrawingSessionActiveRef.current = false;
      drawingSessionPixelsRef.current = [];
    }
    
    setIsMouseDown(false);
    setIsPanning(false);
    panStartMousePositionRef.current = null;
    panStartViewportOffsetRef.current = null;
    lastDrawnPositionRef.current = null;
  }, [addToHistory, isEraserActive]);

  useEffect(() => {
    return () => {
      if (isDrawingSessionActiveRef.current && drawingSessionPixelsRef.current.length > 0) {
        const sessionPixels = [...drawingSessionPixelsRef.current];
        
        addToHistory({
          id: `draw_session_cleanup_${Date.now()}_${Math.random()}`,
          type: isEraserActive ? 'erase' : 'draw',
          pixels: sessionPixels,
          timestamp: Date.now()
        });
        
        console.log(`Cleanup: Finalized drawing session with ${sessionPixels.length} pixels`);
      }
      
      isDrawingSessionActiveRef.current = false;
      drawingSessionPixelsRef.current = [];
    };
  }, [currentUser, addToHistory, isEraserActive]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {

    if (isPanMode) {
      setIsMouseDown(true);
      return;
    }

    if (event.touches.length === 1) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      
      setIsMouseDown(true);
      setIsPanning(false);
      lastDrawnPositionRef.current = null;
      handleDrawing(event);
    }
  }, [handleDrawing, isPanMode, setIsMouseDown, setIsPanning]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {

    if (isPanMode) {
      return;
    }
    if (event.touches.length === 1 && isMouseDown && !isPanning) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      
      handleDrawing(event);
    }
  }, [handleDrawing, isMouseDown, isPanMode, isPanning]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (isDrawingSessionActiveRef.current && drawingSessionPixelsRef.current.length > 0) {
      const sessionPixels = [...drawingSessionPixelsRef.current];
      
      addToHistory({
        id: `draw_session_${Date.now()}_${Math.random()}`,
        type: isEraserActive ? 'erase' : 'draw',
        pixels: sessionPixels,
        timestamp: Date.now()
      });
      
      console.log(`Finalized touch drawing session with ${sessionPixels.length} pixels`);
      
      isDrawingSessionActiveRef.current = false;
      drawingSessionPixelsRef.current = [];
    }
    
    setIsMouseDown(false);
    setIsPanning(false);
    lastDrawnPositionRef.current = null;
  }, [addToHistory, isEraserActive]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
      );
      
      if (isInputFocused) return;
      
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      
      if (((event.ctrlKey || event.metaKey) && event.key === 'y') || 
          ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Z')) {
        event.preventDefault();
        redo();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo]);

  



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

  websocketService.on('canvas_reset', handleCanvasReset);  const handleLandOwnershipChange = useCallback(async (data: any) => {
    console.log('[Canvas] Land ownership changed, refreshing land data:', data);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    getAllLands();
    
    if (currentUser) {
      console.log('[Canvas] Refreshing user profile due to land ownership change');
      try {
        await refreshProfile();
        console.log('[Canvas] Profile refresh completed successfully');
        
        await new Promise(resolve => setTimeout(resolve, 50));
        console.log('[Canvas] Forced re-render completed');
      } catch (error) {
        console.error('[Canvas] Error refreshing profile:', error);
      }
    }
  }, [getAllLands, currentUser, refreshProfile]);
  websocketService.on('land_ownership_change', handleLandOwnershipChange);
  websocketService.on('auction_completed', handleLandOwnershipChange);
  websocketService.on('land_sold', handleLandOwnershipChange);
  websocketService.on('auction_created', handleLandOwnershipChange);

  useEffect(() => {
    if (initialDataLoaded) {
      updateGridFromVisibleChunks();
      clearHistory();
    }
  }, [viewportOffset, zoomLevel, viewportCellWidth, viewportCellHeight, initialDataLoaded, updateGridFromVisibleChunks,clearHistory]);  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      if (!initialDataLoaded) {
        console.log("Loading timeout reached - forcing canvas to display");
        setInitialDataLoaded(true);
      }
    }, 15000);
    
    return () => clearTimeout(loadingTimeout);
  }, []);  
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (currentUser && allLands.length > 0) {
        console.log('[Canvas] Periodic land data refresh');
        getAllLands();
      }
    }, 30000); 

    return () => clearInterval(refreshInterval);
  }, [currentUser, allLands.length, getAllLands]);
  useEffect(() => {
    const handleWindowFocus = () => {
      if (currentUser) {
        console.log('[Canvas] Window focused - refreshing land data');
        getAllLands();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [currentUser, getAllLands]);

  useEffect(() => {
    const handleClickOutside = () => {
      setIsLandsDropdownOpen(false);
    };

    if (isLandsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isLandsDropdownOpen]);  const cellLandMap = useMemo(() => {
    console.log('[Canvas] Recalculating cellLandMap - allLands count:', allLands.length, 'userProfile.landInfo:', userProfile?.landInfo);
    const newCellLandMap = new Map<string, {landInfo: LandInfo, isCurrentUserLand: boolean}>();
    allLands.forEach(land => {
      const isCurrentUserLand = !!(currentUser && currentUser.uid === land.owner);
      console.log('[Canvas] Processing land at', land.centerX, land.centerY, 'owner:', land.owner, 'isCurrentUserLand:', isCurrentUserLand);
      
      const halfSize = Math.floor(land.ownedSize / 2);
      for (let y = land.centerY - halfSize; y <= land.centerY + halfSize; y++) {
        for (let x = land.centerX - halfSize; x <= land.centerX + halfSize; x++) {
          newCellLandMap.set(`${x}:${y}`, { 
            landInfo: land, 
            isCurrentUserLand 
          });
        }
      }
    });    
    if (currentUser && userProfile && userProfile.landInfo) {
      const { centerX, centerY, ownedSize } = userProfile.landInfo;
      const halfOwnedSize = Math.floor(ownedSize / 2);
      console.log('[Canvas] Processing user profile land at', centerX, centerY, 'size:', ownedSize);
      const conflictingDbLand = allLands.find(land => 
        land.centerX === centerX && land.centerY === centerY
      );
      
      console.log('[Canvas] Conflicting DB land found:', !!conflictingDbLand, 'owner match:', conflictingDbLand?.owner === currentUser.uid);
      if (!conflictingDbLand || conflictingDbLand.owner === currentUser.uid) {
        for (let y = centerY - halfOwnedSize; y <= centerY + halfOwnedSize; y++) {
          for (let x = centerX - halfOwnedSize; x <= centerX + halfOwnedSize; x++) {
            const cellKey = `${x}:${y}`;
            if (!newCellLandMap.has(cellKey) || 
                (conflictingDbLand && conflictingDbLand.owner === currentUser.uid)) {
              newCellLandMap.set(cellKey, { 
                landInfo: {
                  centerX,
                  centerY,
                  ownedSize,
                  owner: currentUser.uid,
                  displayName: userProfile.displayName || "You"
                },                isCurrentUserLand: true
              });
            }
          }
        }
      }
    }
    
    console.log('[Canvas] cellLandMap built with', newCellLandMap.size, 'cells');
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
    
    const offsetX = (viewportOffset.x - startWorldX) * effectiveCellSize;
    const offsetY = (viewportOffset.y - startWorldY) * effectiveCellSize;
    
    for (let screenY = 0; screenY < viewportCellHeight; screenY++) {
      for (let screenX = 0; screenX < viewportCellWidth; screenX++) {
        const worldX = screenX + startWorldX;
        const worldY = screenY + startWorldY;
        const pixelKey = getPixelKey(worldX, worldY);
        
        const color = grid.get(pixelKey) || "#ffffff";
        
        const isDrawableHere = !!currentUser && !!userProfile && canDrawAtPoint(worldX, worldY);
        
        const cellStyle: React.CSSProperties = {
          position: 'absolute',
          left: `${(screenX * effectiveCellSize) - offsetX}px`,
          top: `${(screenY * effectiveCellSize) - offsetY}px`,
          width: `${effectiveCellSize}px`,
          height: `${effectiveCellSize}px`,
          backgroundColor: color,
          boxSizing: 'border-box',
        };
        
        let borderTop = '';
        let borderBottom = '';
        let borderLeft = '';
        let borderRight = '';
        
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
        if (debugMode) {
          cellStyle.border = '1px solid rgba(255, 0, 0, 0.3)';
        }
        
        const cellElement = (
          <div
            key={pixelKey}
            style={cellStyle}
            className={isPanning ? 'cursor-move' : (isDrawableHere ? 'cursor-crosshair' : 'cursor-not-allowed')}
            data-world-coords={`${worldX},${worldY}`}            onContextMenu={landMapEntry ? (e) => {
              const userLandInfo: UserLandInfo = {
                ...landMapEntry.landInfo,
                id: `${landMapEntry.landInfo.centerX},${landMapEntry.landInfo.centerY}`,
                createdAt: Date.now()
              };
              handleLandRightClick(e, userLandInfo);
            } : undefined}
          />
        );
        
        cells.push(cellElement);
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
      {...bind()}
      className="relative w-screen h-screen overflow-hidden bg-gray-200 cursor-default"
      style={{ 
        touchAction: "none",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "none",
        position: 'fixed',
        left: 0,
        top: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        border: 'none',
        zIndex: 0
      }} 
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onMouseLeave={handleCanvasMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          toggleToolbar();
        }}
        id = 'toggle-toolbar'
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        className="toggle-toolbar absolute top-4 right-4 z-40 bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-full shadow-lg transition-colors"
        title={isToolbarVisible ? "Hide Toolbar" : "Show Toolbar"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          {isToolbarVisible ? (
            <path d="M11.83,9L15,12.16C15,12.11 15,12.05 15,12A3,3 0 0,0 12,9C11.94,9 11.89,9 11.83,9M7.53,9.8L9.08,11.35C9.03,11.56 9,11.77 9,12A3,3 0 0,0 12,15C12.22,15 12.44,14.97 12.65,14.92L14.2,16.47C13.53,16.8 12.79,17 12,17A5,5 0 0,1 7,12C7,11.21 7.2,10.47 7.53,9.8M2,4.27L4.28,6.55L4.73,7C3.08,8.3 1.78,10 1,12C2.73,16.39 7,19.5 12,19.5C13.55,19.5 15.03,19.2 16.38,18.66L16.81,19.08L19.73,22L21,20.73L3.27,3M12,7A5,5 0 0,1 17,12C17,12.64 16.87,13.26 16.64,13.82L19.57,16.75C21.07,15.5 22.27,13.86 23,12C21.27,7.61 17,4.5 12,4.5C10.6,4.5 9.26,4.75 8,5.2L10.17,7.35C10.76,7.13 11.37,7 12,7Z"/>
          ) : (
            <path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/>
          )}
        </svg>
      </button>

      {isToolbarVisible && (
      <div data-toolbar className="absolute top-4 left-4 z-30 bg-white p-2 rounded shadow-lg flex items-center flex-wrap gap-2 data-toolbar"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      id = "data-toolbar"
      >
        <label htmlFor="colorPicker" className="mr-1">Color:</label>
        <input
          type="color"
          id="colorPicker"
          value={selectedColor}
          onChange={handleColorChange}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className="h-8 w-14 mr-4"
        />

        {!isEraserActive && (
          <div className="flex items-center ml-2 bg-blue-50 p-2 rounded-md border border-blue-200"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}>
            <label htmlFor="brushSize" className="mr-2 text-xs font-medium text-blue-700">
              Brush:
            </label>
            <input
              type="range"
              id="brushSize"
              name="brushSize"
              value={brushSize}
              onChange={(e) => {
                const newSize = parseInt(e.target.value, 10);
                console.log('Brush slider onChange triggered:', newSize);
                setBrushSize(newSize);
              }}
              onInput={(e) => {
                const newSize = parseInt((e.target as HTMLInputElement).value, 10);
                console.log('Brush slider onInput triggered:', newSize);
                setBrushSize(newSize);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              min="1"
              max="20"
              step="1"
              className="brush-range-slider"
              title={`Brush size: ${brushSize}x${brushSize} pixels`}
            />
            <span className="ml-2 text-xs w-8 text-center font-mono text-blue-700">
              {brushSize}
            </span>
          </div>
        )}

        <button 
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleFill();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className={`px-3 py-1 rounded text-white flex items-center gap-1 ${
            isFillActive ? 'bg-green-700' : 'bg-green-500 hover:bg-green-600'
          }`}
          title="Flood fill tool - click to fill connected areas of the same color"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19,11H22V13H19V16H17V13H14V11H17V8H19M9,11H15A1,1 0 0,1 16,12V21A1,1 0 0,1 15,22H3A1,1 0 0,1 2,21V12A1,1 0 0,1 3,11H5V7A5,5 0 0,1 10,2A5,5 0 0,1 15,7V8H13V7A3,3 0 0,0 10,4A3,3 0 0,0 7,7V11H9M4,13V20H14V13H4Z"/>
          </svg>
          {isFillActive ? "Fill ON" : "Fill"}
        </button>        <button 
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            togglePanMode();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className={`px-3 py-1 rounded text-white flex items-center gap-1 ${
            isPanMode ? 'bg-orange-700' : 'bg-orange-500 hover:bg-orange-600'
          }`}
          title="Toggle pan mode - drag to move around the canvas"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            {isPanMode ? (
              <path d="M13,6V8H9V6H13M15,4H7A2,2 0 0,0 5,6V8A2,2 0 0,0 7,10H8V13A2,2 0 0,0 10,15H14A2,2 0 0,0 16,13V10H17A2,2 0 0,0 19,8V6A2,2 0 0,0 17,4H15M14,13H10V10H14V13Z"/>
            ) : (
              <path d="M15.5,14H20.5L23,16.5L20.5,19H15.5L13,16.5L15.5,14M9.5,15.5A6.5,6.5 0 0,1 3,9A6.5,6.5 0 0,1 9.5,2.5A6.5,6.5 0 0,1 16,9A6.5,6.5 0 0,1 9.5,15.5M9.5,4A5,5 0 0,0 4.5,9A5,5 0 0,0 9.5,14A5,5 0 0,0 14.5,9A5,5 0 0,0 9.5,4Z"/>
            )}
          </svg>          {isPanMode ? "Pan" : "Zoom"}
        </button>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('[Canvas] Manual land data refresh triggered');
            getAllLands();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className="px-3 py-1 rounded text-white bg-green-500 hover:bg-green-600 flex items-center gap-1"
          title="Refresh land data to check for auction status changes"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/>
          </svg>
          Refresh
        </button>

        <div className="flex gap-1">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              zoomOut();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="px-3 py-1 rounded text-white bg-blue-500 hover:bg-blue-600 flex items-center justify-center"
            title="Zoom out"
            disabled={zoomLevel <= MIN_ZOOM}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19,13H5V11H19V13Z"/>
            </svg>
          </button>
          
          <span className="px-2 py-1 bg-gray-100 rounded text-xs font-mono text-gray-700 flex items-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              zoomIn();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="px-3 py-1 rounded text-white bg-blue-500 hover:bg-blue-600 flex items-center justify-center"
            title="Zoom in"
            disabled={zoomLevel >= MAX_ZOOM}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
            </svg>
          </button>
        </div>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleEraser();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className={`px-3 py-1 rounded text-white ${
            isEraserActive ? 'bg-gray-700' : 'bg-gray-400 hover:bg-gray-500'
          }`}
          title={`Toggle eraser tool${isEraserActive ? ` (Size: ${eraserSize}x${eraserSize})` : ''}`}

        >
          {isEraserActive ? `Eraser ${eraserSize}x${eraserSize}` : "Eraser"}
        </button>

        {isEraserActive && (
          <div 
            className="flex items-center ml-2 bg-gray-100 p-2 rounded-md border"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <label htmlFor="eraserSize" className="mr-2 text-xs font-medium text-gray-700">
              Size:
            </label>
            <input
              type="range"
              id="eraserSize"
              name="eraserSize"
              value={eraserSize}
              onChange={(e) => {
                const newSize = parseInt(e.target.value, 10);
                console.log('Slider onChange triggered:', newSize);
                setEraserSize(newSize);
              }}
              onInput={(e) => {
                const newSize = parseInt((e.target as HTMLInputElement).value, 10);
                console.log('Slider onInput triggered:', newSize);
                setEraserSize(newSize);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                console.log('Slider mouseDown');
              }}
              onMouseUp={(e) => {
                e.stopPropagation();
                console.log('Slider mouseUp');
              }}
              onClick={(e) => {
                e.stopPropagation();
                console.log('Slider clicked');
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                console.log('Slider touchStart');
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                console.log('Slider touchEnd');
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
                console.log('Slider touchMove');
              }}
              min="1"
              max="20"
              step="1"
              className="eraser-range-slider"
              title={`Eraser size: ${eraserSize}x${eraserSize} pixels`}
            />
            <span className="ml-2 text-xs w-8 text-center font-mono text-gray-700">
              {eraserSize}
            </span>
          </div>
        )}

        {isEraserActive && (
          <div className="ml-4 text-xs bg-yellow-100 p-2 rounded flex items-center gap-2">
            <span>Debug: Size = {eraserSize}</span>
            <button 
              onClick={() => {
                console.log('Setting eraser size to 5');
                setEraserSize(5);
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              className="px-2 py-1 bg-blue-500 text-white rounded text-xs"
            >
              Set to 5
            </button>
            <button 
              onClick={() => {
                console.log('Setting eraser size to 10');
                setEraserSize(10);
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              className="px-2 py-1 bg-green-500 text-white rounded text-xs"
            >
              Set to 10
            </button>
          </div>
        )}

        {isEraserActive && eraserSize > 0 && mousePosition.x > 0 && mousePosition.y > 0 && (
          <div
            className="fixed pointer-events-none z-50"
            style={{
              left: `${mousePosition.x - (eraserSize * effectiveCellSize) / 2}px`,
              top: `${mousePosition.y - (eraserSize * effectiveCellSize) / 2}px`,
              width: `${eraserSize * effectiveCellSize}px`,
              height: `${eraserSize * effectiveCellSize}px`,
              border: '2px solid rgba(255, 0, 0, 0.8)',
              backgroundColor: 'rgba(255, 0, 0, 0.2)', 
              borderRadius: '4px',
              display: mousePosition.x === 0 && mousePosition.y === 0 ? 'none' : 'block'
            }}
          >
            <div 
              className="absolute top-0 left-0 text-xs text-black font-bold px-1"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: '2px'
              }}
            >
              {eraserSize}×{eraserSize}
            </div>
          </div>
        )}

        {!isEraserActive && brushSize > 1 && mousePosition.x > 0 && mousePosition.y > 0 && (
          <div
            className="fixed pointer-events-none z-50"
            style={{
              left: `${mousePosition.x - (brushSize * effectiveCellSize) / 2}px`,
              top: `${mousePosition.y - (brushSize * effectiveCellSize) / 2}px`,
              width: `${brushSize * effectiveCellSize}px`,
              height: `${brushSize * effectiveCellSize}px`,
              border: `2px solid ${selectedColor}`,
              backgroundColor: `${selectedColor}33`,
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
          >
            <div 
              style={{
                position: 'absolute',
                top: '2px',
                left: '2px',
                fontSize: '11px',
                fontWeight: 'bold',
                color: selectedColor === '#000000' ? '#fff' : '#000',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                padding: '1px 3px',
                borderRadius: '2px',
                lineHeight: '1'
              }}
            >
              {brushSize}×{brushSize}
            </div>
          </div>
        )}

        <button 
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            clearCanvas();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          disabled={isClearing}
          className="bg-red-500 hover:bg-red-600 text-white font-medium py-1 px-3 rounded disabled:opacity-50"
        >
          {isClearing ? "Clearing..." : "Clear"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleBrowserFullScreen();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className="bg-purple-500 hover:bg-purple-600 text-white font-xs py-1 px-2 rounded text-xs"
          title={isBrowserFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
        >
          {isBrowserFullScreen ? "Exit FS" : "Full Screen"}
        </button>
        {showAuthWarning && !currentUser && ( 
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
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            requestFullSync();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className="bg-blue-500 hover:bg-blue-600 text-white font-xs py-1 px-2 rounded text-xs"
          title="Force synchronization with server"
        >
          Sync
        </button>        {currentUser && userProfile?.landInfo && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              navigateToUserLand();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="bg-green-500 hover:bg-green-600 text-white font-xs py-1 px-2 rounded text-xs"
            title="Go to your land"
          >
            My Land
          </button>
        )}

        {currentUser && (
          <div className="relative lands-dropdown-container">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                toggleLandsDropdown();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              className="bg-blue-500 hover:bg-blue-600 text-white font-xs py-1 px-2 rounded text-xs flex items-center gap-1"
              title="View all your lands"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z"/>
              </svg>
              Lands
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className={`transition-transform ${isLandsDropdownOpen ? 'rotate-180' : ''}`}>
                <path d="M7,10L12,15L17,10H7Z"/>
              </svg>
            </button>

            {isLandsDropdownOpen && (
              <div 
                className="absolute top-full left-0 mt-1 min-w-48 bg-white border border-gray-300 rounded-md shadow-lg z-50"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="py-1 max-h-64 overflow-y-auto">
                  {loadingUserLands ? (
                    <div className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-blue-500"></div>
                      Loading lands...
                    </div>
                  ) : userLands.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      No lands found
                    </div>
                  ) : (
                    userLands.map((land, index) => (
                      <button
                        key={`${land.centerX}-${land.centerY}-${index}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToLand(land);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between"
                        title={`Navigate to land at (${land.centerX}, ${land.centerY})`}
                      >
                        <div>
                          <div className="font-medium text-gray-900">
                            Land #{index + 1}
                          </div>
                          <div className="text-xs text-gray-500">
                            Center: ({land.centerX}, {land.centerY})
                          </div>
                          <div className="text-xs text-gray-500">
                            Size: {land.ownedSize}×{land.ownedSize}
                          </div>
                        </div>
                        {land.isAuctioned && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                            Auction
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {userLands.length > 0 && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowLandsExpansionDropdown(!showLandsExpansionDropdown);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="bg-green-500 hover:bg-green-600 text-white font-xs py-1 px-2 rounded text-xs flex items-center gap-1"
              title="Expand lands"
            >
              🏗️ Expand ({userLands.length})
              <span className="text-xs">▼</span>
            </button>

            {showLandsExpansionDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-48">
                {userLands.map((land, index) => (
                  <button
                    key={`${land.centerX}-${land.centerY}-${index}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSelectedLandForExpansion(land);
                      setShowExpansionModal(true);
                      setShowLandsExpansionDropdown(false);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-800 text-xs border-b last:border-b-0 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">
                        {land.displayName || `Land #${index + 1}`}
                      </div>
                      <div className="text-gray-500">
                        ({land.centerX}, {land.centerY}) - {land.ownedSize}×{land.ownedSize}
                      </div>
                    </div>
                    <span className="text-green-600 ml-2">🏗️</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showLandInfoPanel && selectedLandInfo && (
          <LandInfoPanel
            land={selectedLandInfo}
            isOwner={selectedLandInfo.owner === currentUser?.uid}
            onClose={() => {
              setShowLandInfoPanel(false);
              setSelectedLandInfo(null);
            }}
            onExpand={() => {
              setShowExpansionModal(true);
            }}
            onCreateAuction={() => {
              setShowCreateAuctionModal(true);
            }}
          />
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

        <div className="flex items-center gap-1 ml-2">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              undo();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            disabled={undoHistory.length === 0}
            className={`px-3 py-1 rounded text-white flex items-center gap-1 ${
              undoHistory.length === 0 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-purple-500 hover:bg-purple-600'
            }`}
            title="Undo (Ctrl+Z)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5,8C9.85,8 7.45,9 5.6,10.6L2,7V16H11L7.38,12.38C8.77,11.22 10.54,10.5 12.5,10.5C16.04,10.5 19.05,12.81 20.1,16L22.47,15.22C21.08,11.03 17.15,8 12.5,8Z"/>
            </svg>
            Undo
          </button>
          
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              redo();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            disabled={redoHistory.length === 0}
            className={`px-3 py-1 rounded text-white flex items-center gap-1 ${
              redoHistory.length === 0 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-purple-500 hover:bg-purple-600'
            }`}
            title="Redo (Ctrl+Y)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4,10.6C16.55,9 14.15,8 11.5,8C6.85,8 2.92,11.03 1.53,15.22L3.9,16C4.95,12.81 7.96,10.5 11.5,10.5C13.46,10.5 15.23,11.22 16.62,12.38L13,16H22V7L18.4,10.6Z"/>
            </svg>
            Redo
          </button>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleDebugMode();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className={`px-3 py-1 rounded text-white ${debugMode ? 'bg-yellow-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}
        >
          {debugMode ? "Debug: ON" : "Debug"}
        </button>

        <button
          onClick={captureScreenshot}
          disabled={isCapturing}
          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
            isCapturing
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-700 text-white'
          }`}
          title="Take Screenshot"
        >
          {isCapturing ? 'Capturing...' : '📸 Screenshot'}
        </button>
        
        {debugMode && currentUser && userProfile?.landInfo && (
          <div className="text-xs bg-gray-100 p-1 rounded">
            Center: ({userProfile.landInfo.centerX}, {userProfile.landInfo.centerY}), 
            Size: {userProfile.landInfo.ownedSize}x{userProfile.landInfo.ownedSize}
          </div>        )}
      </div>
      )}
        <div 
        className="absolute inset-0"
        style={{
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform',
          width: '100%',
          height: '100%'
        }}
      >
        {gridCells}
        {auctionOverlays}
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
        <br />
        Two-finger mode: {isPanMode ? 'Pan' : 'Zoom'}
      </div>

      {contextMenu && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={closeContextMenu}
          />
          <div
            className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50 py-2 min-w-48"
            style={{
              left: `${Math.min(contextMenu.x, window.innerWidth - 200)}px`,
              top: `${Math.min(contextMenu.y, window.innerHeight - 150)}px`,
            }}
          >
            <div className="px-4 py-2 text-gray-300 text-sm font-medium border-b border-gray-600">
              Land at ({contextMenu.landInfo.centerX}, {contextMenu.landInfo.centerY})
            </div>
            
            {contextMenu.mergeCandidates.length > 0 && (
              <>
                <div className="px-4 py-2 text-gray-400 text-xs">
                  Merge with adjacent lands:
                </div>
                {contextMenu.mergeCandidates.map((candidate, index) => (
                  <button
                    key={index}
                    className="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-700 text-sm flex items-center justify-between"
                    onClick={() => {
                      setSelectedMergeCandidate(candidate);
                      setShowMergeModal(true);
                      closeContextMenu();
                    }}
                  >
                    <span>
                      Merge {candidate.direction} → {candidate.resultingSize}×{candidate.resultingSize}
                    </span>
                    <span className="text-yellow-400 text-xs">
                      {candidate.cost} 🪙
                    </span>
                  </button>
                ))}
              </>
            )}
            {contextMenu.mergeCandidates.length === 0 && (
              <div className="px-4 py-2 text-gray-500 text-sm">
                No adjacent lands to merge
              </div>
            )}
            
            <div className="border-t border-gray-600 mt-2">
              <button
                className="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-700 text-sm"
                onClick={() => {
                  navigate(`/profile`);
                  closeContextMenu();
                }}
              >
                Manage Land
              </button>
            </div>
          </div>
        </>
      )}

      {showMergeModal && selectedMergeCandidate && contextMenu && (
        <LandMergeModal
          isOpen={showMergeModal}
          onClose={() => {
            setShowMergeModal(false);
            setSelectedMergeCandidate(null);
          }}
          primaryLandId={contextMenu.landId}
          mergeCandidate={selectedMergeCandidate}
          onSuccess={() => {
            setShowMergeModal(false);
            setSelectedMergeCandidate(null);
            window.location.reload();
          }}
        />
      )}

      {selectedLandForExpansion && (
        <LandExpansionModal
          isOpen={showExpansionModal}
          onClose={() => {
            setShowExpansionModal(false);
            setSelectedLandForExpansion(null);
          }}
          onSuccess={() => {
            setShowExpansionModal(false);
            setSelectedLandForExpansion(null);
            refreshProfile();
            getAllLands();
            setInitialDataLoaded(false);
            setTimeout(() => setInitialDataLoaded(true), 100);
          }}
          selectedLand={selectedLandForExpansion}
        />
      )}
      
    </div>
  );
};

export default Canvas;