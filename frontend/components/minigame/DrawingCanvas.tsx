import React, { useRef, useEffect, useState, useCallback } from 'react';

interface DrawingCanvasProps {
  onSubmit: (imageData: string) => void;
  theme?: string;
  timeRemaining?: number;
}

interface Point {
  x: number;
  y: number;
}

type Tool = 'brush' | 'eraser' | 'fill';

const PIXEL_SIZE = 10;
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;
const DRAWING_WIDTH = CANVAS_WIDTH * PIXEL_SIZE;
const DRAWING_HEIGHT = CANVAS_HEIGHT * PIXEL_SIZE;

const DEFAULT_COLORS = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
  '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#FFC0CB', '#A52A2A',
  '#808080', '#008000', '#000080', '#800000'
];

export default function DrawingCanvas({ onSubmit, theme, timeRemaining }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pixelData, setPixelData] = useState<string[][]>(() => 
    Array(CANVAS_HEIGHT).fill(null).map(() => Array(CANVAS_WIDTH).fill('transparent'))
  );
  
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(1);  const [isDrawing, setIsDrawing] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [isPanMode, setIsPanMode] = useState(false);
  
  const [viewTransform, setViewTransform] = useState({
    x: 0,
    y: 0,
    scale: 1
  });  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
    // Touch support state
  const [touchState, setTouchState] = useState({
    isTouch: false,
    lastTouchDistance: 0,
    touchCenter: { x: 0, y: 0 },
    initialTouchDistance: 0,
    initialTransform: { x: 0, y: 0, scale: 1 }
  });
  
  const [history, setHistory] = useState<string[][][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: 300 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      setCanvasSize({ width: rect.width, height: rect.height });
      
      const optimalScale = 0.25;
      
      const scaledWidth = DRAWING_WIDTH * optimalScale;
      const scaledHeight = DRAWING_HEIGHT * optimalScale;
      
      setViewTransform(prev => ({
        ...prev,
        x: (rect.width - scaledWidth) / 2,
        y: (rect.height - scaledHeight) / 2,
        scale: optimalScale
      }));
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    saveToHistory();

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    redrawCanvas();
  }, [pixelData, viewTransform, showGrid, canvasSize]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(viewTransform.x, viewTransform.y);
    ctx.scale(viewTransform.scale, viewTransform.scale);

    const padding = 20;
    const scaledWidth = DRAWING_WIDTH * viewTransform.scale;
    const scaledHeight = DRAWING_HEIGHT * viewTransform.scale;
    const minX = canvas.width - scaledWidth - padding;
    const minY = canvas.height - scaledHeight - padding;
    const maxX = padding;
    const maxY = padding;

    if (viewTransform.x < minX - 100 || viewTransform.x > maxX + 100 || 
        viewTransform.y < minY - 100 || viewTransform.y > maxY + 100) {
      const clampedX = Math.max(minX, Math.min(maxX, viewTransform.x));
      const clampedY = Math.max(minY, Math.min(maxY, viewTransform.y));
      setViewTransform(prev => ({ ...prev, x: clampedX, y: clampedY }));
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2 / viewTransform.scale;
    ctx.strokeRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);

    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        const pixelColor = pixelData[y][x];
        if (pixelColor && pixelColor !== 'transparent') {
          ctx.fillStyle = pixelColor;
          ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        }
      }
    }

    if (showGrid) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 0.5 / viewTransform.scale;
      
      for (let x = 0; x <= CANVAS_WIDTH; x++) {
        ctx.beginPath();
        ctx.moveTo(x * PIXEL_SIZE, 0);
        ctx.lineTo(x * PIXEL_SIZE, DRAWING_HEIGHT);
        ctx.stroke();
      }
      
      for (let y = 0; y <= CANVAS_HEIGHT; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * PIXEL_SIZE);
        ctx.lineTo(DRAWING_WIDTH, y * PIXEL_SIZE);
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [pixelData, viewTransform, showGrid, canvasSize]);

  const getPixelCoordinates = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: -1, y: -1 };

    const rect = canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    const drawingX = (canvasX - viewTransform.x) / viewTransform.scale;
    const drawingY = (canvasY - viewTransform.y) / viewTransform.scale;

    const pixelX = Math.floor(drawingX / PIXEL_SIZE);
    const pixelY = Math.floor(drawingY / PIXEL_SIZE);

    return { x: pixelX, y: pixelY };
  }, [viewTransform]);

  const drawPixel = useCallback((pixelX: number, pixelY: number, pixelColor: string) => {
    if (pixelX < 0 || pixelX >= CANVAS_WIDTH || pixelY < 0 || pixelY >= CANVAS_HEIGHT) return;

    setPixelData(prev => {
      const newData = prev.map(row => [...row]);
      
      const halfSize = Math.floor(brushSize / 2);
      for (let dy = -halfSize; dy <= halfSize; dy++) {
        for (let dx = -halfSize; dx <= halfSize; dx++) {
          const x = pixelX + dx;
          const y = pixelY + dy;
          if (x >= 0 && x < CANVAS_WIDTH && y >= 0 && y < CANVAS_HEIGHT) {
            newData[y][x] = pixelColor;
          }
        }
      }
      
      return newData;
    });
  }, [brushSize]);

  const floodFill = useCallback((startX: number, startY: number, newColor: string) => {
    if (startX < 0 || startX >= CANVAS_WIDTH || startY < 0 || startY >= CANVAS_HEIGHT) return;

    const targetColor = pixelData[startY][startX];
    if (targetColor === newColor) return;

    setPixelData(prev => {
      const newData = prev.map(row => [...row]);
      const stack: Point[] = [{ x: startX, y: startY }];

      while (stack.length > 0) {
        const { x, y } = stack.pop()!;
        
        if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) continue;
        if (newData[y][x] !== targetColor) continue;

        newData[y][x] = newColor;

        stack.push({ x: x + 1, y });
        stack.push({ x: x - 1, y });
        stack.push({ x, y: y + 1 });
        stack.push({ x, y: y - 1 });
      }

      return newData;
    });
  }, [pixelData]);

  const saveToHistory = useCallback(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(pixelData.map(row => [...row]));
    
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      setHistoryIndex(prev => prev + 1);
    }
    
    setHistory(newHistory);
  }, [history, historyIndex, pixelData]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setPixelData(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setPixelData(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  const clearCanvas = useCallback(() => {
    setPixelData(Array(CANVAS_HEIGHT).fill(null).map(() => Array(CANVAS_WIDTH).fill('transparent')));
    saveToHistory();
  }, [saveToHistory]);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && isPanMode)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - viewTransform.x, y: e.clientY - viewTransform.y });
      return;
    }

    if (e.button !== 0 || isPanMode) return;

    const pixel = getPixelCoordinates(e.clientX, e.clientY);
    
    if (tool === 'fill') {
      floodFill(pixel.x, pixel.y, color);
      saveToHistory();
    } else if (tool === 'brush') {
      setIsDrawing(true);
      drawPixel(pixel.x, pixel.y, color);
    } else if (tool === 'eraser') {
      setIsDrawing(true);
      drawPixel(pixel.x, pixel.y, 'transparent');
    }
  }, [tool, color, viewTransform, getPixelCoordinates, floodFill, drawPixel, saveToHistory, isPanMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setViewTransform(prev => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      }));
      return;
    }

    if (!isDrawing) return;

    const pixel = getPixelCoordinates(e.clientX, e.clientY);
    
    if (tool === 'brush') {
      drawPixel(pixel.x, pixel.y, color);
    } else if (tool === 'eraser') {
      drawPixel(pixel.x, pixel.y, 'transparent');
    }
  }, [isDrawing, isPanning, tool, color, panStart, getPixelCoordinates, drawPixel]);

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      saveToHistory();
    }
    setIsDrawing(false);
    setIsPanning(false);
  }, [isDrawing, saveToHistory]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.25, Math.min(8, viewTransform.scale * scaleFactor));
    
    const scaleChange = newScale / viewTransform.scale;
    setViewTransform(prev => ({
      ...prev,
      scale: newScale,
      x: mouseX - (mouseX - prev.x) * scaleChange,
      y: mouseY - (mouseY - prev.y) * scaleChange
    }));
  }, [viewTransform]);

  const handleSubmit = useCallback(() => {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = DRAWING_WIDTH;
    exportCanvas.height = DRAWING_HEIGHT;
    const exportCtx = exportCanvas.getContext('2d');
    
    if (!exportCtx) return;

    exportCtx.imageSmoothingEnabled = false;
    exportCtx.fillStyle = '#ffffff';
    exportCtx.fillRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);

    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        const pixelColor = pixelData[y][x];
        if (pixelColor && pixelColor !== 'transparent') {
          exportCtx.fillStyle = pixelColor;
          exportCtx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        }
      }
    }

    const dataURL = exportCanvas.toDataURL('image/png');
    onSubmit(dataURL);
  }, [pixelData, onSubmit]);
  const resetView = useCallback(() => {
    const padding = 40;
    const availableWidth = canvasSize.width - padding * 2;
    const availableHeight = canvasSize.height - padding * 2;
    const optimalScale = Math.min(availableWidth / DRAWING_WIDTH, availableHeight / DRAWING_HEIGHT, 2);
    
    const scaledWidth = DRAWING_WIDTH * optimalScale;
    const scaledHeight = DRAWING_HEIGHT * optimalScale;
    
    setViewTransform({
      x: (canvasSize.width - scaledWidth) / 2,
      y: (canvasSize.height - scaledHeight) / 2,
      scale: optimalScale
    });
  }, [canvasSize]);
  // Touch event helpers
  const getTouchDistance = useCallback((touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const getTouchCenter = useCallback((touch1: React.Touch, touch2: React.Touch): Point => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
  }, []);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      
      if (isPanMode) {
        setIsPanning(true);
        setPanStart({ x: touch.clientX - viewTransform.x, y: touch.clientY - viewTransform.y });
      } else {
        const pixel = getPixelCoordinates(touch.clientX, touch.clientY);
        
        if (tool === 'fill') {
          floodFill(pixel.x, pixel.y, color);
          saveToHistory();
        } else if (tool === 'brush') {
          setIsDrawing(true);
          drawPixel(pixel.x, pixel.y, color);
        } else if (tool === 'eraser') {
          setIsDrawing(true);
          drawPixel(pixel.x, pixel.y, 'transparent');
        }
      }
    } else if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = getTouchDistance(touch1, touch2);
      const center = getTouchCenter(touch1, touch2);
      
      setTouchState({
        isTouch: true,
        lastTouchDistance: distance,
        touchCenter: center,
        initialTouchDistance: distance,
        initialTransform: { ...viewTransform }
      });
      setIsDrawing(false);
      setIsPanning(false);
    }
  }, [tool, color, getPixelCoordinates, floodFill, drawPixel, saveToHistory, getTouchDistance, getTouchCenter, viewTransform, isPanMode]);  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      
      if (isPanning) {
        setViewTransform(prev => ({
          ...prev,
          x: touch.clientX - panStart.x,
          y: touch.clientY - panStart.y
        }));
      } else if (isDrawing) {
        const pixel = getPixelCoordinates(touch.clientX, touch.clientY);
        
        if (tool === 'brush') {
          drawPixel(pixel.x, pixel.y, color);
        } else if (tool === 'eraser') {
          drawPixel(pixel.x, pixel.y, 'transparent');
        }
      }
    } else if (e.touches.length === 2 && touchState.isTouch) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = getTouchDistance(touch1, touch2);
      const center = getTouchCenter(touch1, touch2);
      
      const totalDistanceChange = Math.abs(distance - touchState.initialTouchDistance);
      const distanceChangeThreshold = 30;
      const centerDx = center.x - touchState.touchCenter.x;
      const centerDy = center.y - touchState.touchCenter.y;
      
      let newScale = touchState.initialTransform.scale;
      if (totalDistanceChange > distanceChangeThreshold) {
        const scaleChange = distance / touchState.initialTouchDistance;
        newScale = Math.max(0.25, Math.min(8, touchState.initialTransform.scale * scaleChange));
      }
      
      setViewTransform({
        scale: newScale,
        x: touchState.initialTransform.x + centerDx,
        y: touchState.initialTransform.y + centerDy
      });
    }
  }, [isDrawing, isPanning, tool, color, panStart, getPixelCoordinates, drawPixel, touchState, getTouchDistance, getTouchCenter]);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    
    if (e.touches.length === 0) {
      if (isDrawing) {
        saveToHistory();
      }
      setIsDrawing(false);
      setIsPanning(false);
      setTouchState({
        isTouch: false,
        lastTouchDistance: 0,
        touchCenter: { x: 0, y: 0 },
        initialTouchDistance: 0,
        initialTransform: { x: 0, y: 0, scale: 1 }
      });
    } else if (e.touches.length === 1 && touchState.isTouch) {
      setTouchState({
        isTouch: false,
        lastTouchDistance: 0,
        touchCenter: { x: 0, y: 0 },
        initialTouchDistance: 0,
        initialTransform: { x: 0, y: 0, scale: 1 }
      });
    }
  }, [isDrawing, saveToHistory, touchState]);

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <div className="bg-white border-b p-4 flex-shrink-0">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Drawing Canvas</h2>
          <div className="flex items-center gap-4">
            {theme && (
              <div className="text-sm text-gray-600">
                Theme: <span className="font-semibold">{theme}</span>
              </div>
            )}
            {timeRemaining !== undefined && (
              <div className="text-sm text-gray-600">
                Time: <span className="font-semibold">{timeRemaining}s</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border-b p-4 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex gap-2">
            <button
              className={`px-3 py-2 rounded text-sm ${tool === 'brush' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
              onClick={() => setTool('brush')}
            >
              🖌️ Brush
            </button>
            <button
              className={`px-3 py-2 rounded text-sm ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
              onClick={() => setTool('eraser')}
            >
              🧽 Eraser
            </button>
            <button
              className={`px-3 py-2 rounded text-sm ${tool === 'fill' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
              onClick={() => setTool('fill')}
            >
              🪣 Fill
            </button>
          </div>

          <div className="flex gap-2">
            <button
              className={`px-3 py-2 rounded text-sm ${isPanMode ? 'bg-orange-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
              onClick={() => setIsPanMode(!isPanMode)}
              title={isPanMode ? 'Switch to drawing mode' : 'Switch to pan mode (for mobile)'}
            >
              {isPanMode ? '✋ Pan Mode' : '✏️ Draw Mode'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm">Size:</span>
            <input
              type="range"
              min="1"
              max="5"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-sm w-4">{brushSize}</span>
          </div>

          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={undo}
              disabled={historyIndex <= 0}
            >
              ↶ Undo
            </button>
            <button
              className="px-3 py-2 rounded text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
            >
              ↷ Redo
            </button>            <button
              className="px-3 py-2 rounded text-sm bg-gray-200 hover:bg-gray-300"
              onClick={clearCanvas}
            >
              🗑️ Clear
            </button>
            <button
              className="px-3 py-2 rounded text-sm bg-gray-200 hover:bg-gray-300"
              onClick={() => {
                setViewTransform(prev => ({
                  ...prev,
                  scale: Math.min(prev.scale * 1.2, 5)
                }));
              }}
              title="Zoom In"
            >
              🔍+
            </button>
            <button
              className="px-3 py-2 rounded text-sm bg-gray-200 hover:bg-gray-300"
              onClick={() => {
                setViewTransform(prev => ({
                  ...prev,
                  scale: Math.max(prev.scale / 1.2, 0.1)
                }));
              }}
              title="Zoom Out"
            >
              🔍-
            </button>
            <button
              className="px-3 py-2 rounded text-sm bg-gray-200 hover:bg-gray-300"
              onClick={resetView}
            >
              🎯 Reset View
            </button>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
            <span className="text-sm">Grid</span>
          </label>

          <button
            className="ml-auto px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
            onClick={handleSubmit}
          >
            📤 Submit Drawing
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {DEFAULT_COLORS.map((c) => (
            <button
              key={c}
              className={`w-8 h-8 rounded border-2 ${
                color === c ? 'border-gray-800' : 'border-gray-300'
              }`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
            title="Custom color"
          />
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-gray-50">
        <div 
          ref={containerRef}
          className="absolute inset-0"
        >          <canvas
            ref={canvasRef}
            className={`w-full h-full ${isPanMode ? 'cursor-grab' : 'cursor-crosshair'} ${isPanning ? 'cursor-grabbing' : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            style={{ touchAction: 'none' }}
          />
        </div>
        <div className="absolute bottom-4 left-4 bg-white bg-opacity-95 p-3 rounded-lg shadow-lg text-sm">
          <div className="font-semibold mb-1">Controls:</div>
          <div>• Left click / 1 finger: Draw/Erase {isPanMode ? '(Pan Mode: 1 finger pans)' : ''}</div>
          <div>• Middle click/Alt+click: Pan</div>
          <div>• 2 fingers: Pan & Pinch to zoom</div>
          <div>• Mouse wheel: Zoom</div>
          <div>• Toolbar: 🔍+ / 🔍- buttons for zoom</div>
          <div>• Mobile: Toggle ✋ Pan Mode for 1-finger panning</div>
          <div>• Canvas: {CANVAS_WIDTH}×{CANVAS_HEIGHT} pixels</div>
        </div>

        <div className="absolute top-4 right-4 bg-white bg-opacity-95 p-2 rounded shadow text-sm">
          Zoom: {Math.round(viewTransform.scale * 100)}%
        </div>
      </div>
    </div>
  );
}
