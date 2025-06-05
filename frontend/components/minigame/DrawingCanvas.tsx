import React, { useRef, useEffect, useState, useCallback } from 'react';
import { LobbyState } from '../../src/services/minigameWebSocketService';

interface DrawingCanvasProps {
  lobbyState: LobbyState;
  timeRemaining: number;
  onSubmitDrawing: (imageData: string) => void;
}

interface DrawingTool {
  type: 'brush' | 'eraser' | 'fill';
  size: number;
  color: string;
  opacity: number;
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ 
  lobbyState, 
  timeRemaining, 
  onSubmitDrawing 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<DrawingTool>({
    type: 'brush',
    size: 5,
    color: '#000000',
    opacity: 1
  });
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState('#000000');
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);

  const presetColors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
    '#FFC0CB', '#A52A2A', '#808080', '#90EE90', '#FFB6C1',
    '#8B4513', '#2F4F4F', '#DC143C', '#00CED1', '#32CD32'
  ];

  const brushSizes = [1, 3, 5, 8, 12, 16, 20, 25];
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 600;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    saveCanvasState();
  }, []);

  const saveCanvasState = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setUndoStack(prev => [...prev.slice(-9), imageData]); 
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    if (undoStack.length < 2) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const currentState = undoStack[undoStack.length - 1];
    const previousState = undoStack[undoStack.length - 2];
    
    setRedoStack(prev => [...prev, currentState]);
    setUndoStack(prev => prev.slice(0, -1));
    
    ctx.putImageData(previousState, 0, 0);
  }, [undoStack]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const stateToRestore = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, stateToRestore]);
    setRedoStack(prev => prev.slice(0, -1));
    
    ctx.putImageData(stateToRestore, 0, 0);
  }, [redoStack]);

  const getCanvasCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hasSubmitted) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    setIsDrawing(true);
    const { x, y } = getCanvasCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getCanvasCoordinates, hasSubmitted]);
  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || hasSubmitted) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { x, y } = getCanvasCoordinates(e);

    ctx.globalAlpha = tool.opacity;

    if (tool.type === 'brush') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = tool.color;
    } else {
      ctx.globalCompositeOperation = 'destination-out';
    }

    ctx.lineWidth = tool.size;
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, getCanvasCoordinates, tool, hasSubmitted]);

  const stopDrawing = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      saveCanvasState();
    }
  }, [isDrawing, saveCanvasState]);

  const clearCanvas = () => {
    if (hasSubmitted) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    saveCanvasState();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const submitDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const imageData = canvas.toDataURL('image/png');
    onSubmitDrawing(imageData);
    setHasSubmitted(true);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-2xl font-bold text-white mb-2">🎨 Drawing Phase</h3>
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-3 mb-2">
          <p className="text-lg text-yellow-300 font-semibold">Theme: "{lobbyState.theme}"</p>
        </div>
        <div className={`text-lg font-mono ${timeRemaining <= 30 ? 'text-red-400 animate-pulse' : 'text-gray-300'}`}>
          ⏱️ {formatTime(timeRemaining)}
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-800 to-gray-700 p-4 rounded-xl shadow-lg border border-gray-600">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-white font-medium">Tools:</span>
          <div className="flex bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setTool(prev => ({ ...prev, type: 'brush' }))}
              className={`px-4 py-2 rounded-md transition-all ${
                tool.type === 'brush' 
                  ? 'bg-blue-600 text-white shadow-lg transform scale-105' 
                  : 'text-gray-300 hover:bg-gray-600'
              }`}
            >
              🖌️ Brush
            </button>
            <button
              onClick={() => setTool(prev => ({ ...prev, type: 'eraser' }))}
              className={`px-4 py-2 rounded-md transition-all ${
                tool.type === 'eraser' 
                  ? 'bg-blue-600 text-white shadow-lg transform scale-105' 
                  : 'text-gray-300 hover:bg-gray-600'
              }`}
            >
              🗑️ Eraser
            </button>
          </div>
        </div>

        {tool.type === 'brush' && (
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white font-medium">Colors:</span>
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded-md text-sm transition-colors"
              >
                Custom
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {presetColors.map((color: string) => (
                <button
                  key={color}
                  onClick={() => setTool(prev => ({ ...prev, color }))}
                  className={`w-10 h-10 rounded-lg border-3 transition-all hover:scale-110 ${
                    tool.color === color ? 'border-white shadow-lg' : 'border-gray-500'
                  }`}
                  style={{ backgroundColor: color }}
                  title={`Color: ${color}`}
                />
              ))}
            </div>
            {showColorPicker && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => {
                    setCustomColor(e.target.value);
                    setTool(prev => ({ ...prev, color: e.target.value }));
                  }}
                  className="w-12 h-8 rounded border-none cursor-pointer"
                />
                <span className="text-gray-300 text-sm">Custom color: {customColor}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-6 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">Size:</span>
            <div className="flex gap-1">
              {brushSizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setTool(prev => ({ ...prev, size }))}
                  className={`px-3 py-1 rounded-md transition-all ${
                    tool.size === size 
                      ? 'bg-blue-600 text-white shadow-lg' 
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          
          {tool.type === 'brush' && (
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">Opacity:</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={tool.opacity}
                onChange={(e) => setTool(prev => ({ ...prev, opacity: parseFloat(e.target.value) }))}
                className="w-20"
              />
              <span className="text-gray-300 text-sm">{Math.round(tool.opacity * 100)}%</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={undo}
            disabled={hasSubmitted || undoStack.length < 2}
            className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors flex items-center gap-2"
          >
            ↶ Undo
          </button>
          <button
            onClick={redo}
            disabled={hasSubmitted || redoStack.length === 0}
            className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors flex items-center gap-2"
          >
            ↷ Redo
          </button>
          <button
            onClick={clearCanvas}
            disabled={hasSubmitted}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors flex items-center gap-2"
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-lg">
        <canvas
          ref={canvasRef}
          className="border-2 border-gray-300 cursor-crosshair w-full max-w-full rounded-lg shadow-inner"
          style={{ aspectRatio: '4/3' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />
      </div>

      <div className="text-center">
        {hasSubmitted ? (
          <div className="bg-gradient-to-r from-green-700 to-green-600 text-white p-4 rounded-xl shadow-lg">
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold">Drawing submitted!</p>
                <p className="text-green-200 text-sm">Waiting for other players...</p>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={submitDrawing}
            className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg transition-all transform hover:scale-105"
          >
            🎯 Submit Drawing
          </button>
        )}
      </div>
    </div>
  );
};

export default DrawingCanvas;
