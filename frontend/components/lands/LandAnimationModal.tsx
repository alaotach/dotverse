import React, { useState, useEffect, useCallback } from 'react';
import { FiX, FiPlay, FiPause, FiPlus, FiTrash2, FiEdit3, FiSave, FiRefreshCw, FiEye, FiShoppingCart } from 'react-icons/fi';
import { useAuth } from '../../src/context/AuthContext';
import ModalWrapper from '../common/ModalWrapper';
import { 
  getLandFrames, 
  addLandFrame, 
  updateLandFrame, 
  updateLandFramePixelData, 
  deleteLandFrame, 
  updateLandAnimationSettings,
  getUserLands,
  type LandFrame,
  type LandFramePixelData,
  type UserLandInfo
} from '../../src/services/landService';
import { userPermissionsService } from '../../src/services/userPermissionsService';
import type { AnimationPermissions } from '../../src/services/userPermissionsService';

interface LandAnimationModalProps {
  isOpen: boolean;
  onClose: () => void;
  land: UserLandInfo;
  onCaptureCurrentPixels: (landId: string) => LandFramePixelData;
  onSuccess?: () => void;
  onPreviewAnimation?: (landId: string) => void;
  onStopAnimation?: (landId: string) => void;
}

const LandAnimationModal: React.FC<LandAnimationModalProps> = ({
  isOpen,
  onClose,
  land,
  onCaptureCurrentPixels = () => ({}),
  onSuccess,
  onPreviewAnimation,
  onStopAnimation
}) => {  const { currentUser } = useAuth();
  const [frames, setFrames] = useState<LandFrame[]>([]);
  const [fps, setFps] = useState<number>(land.animationSettings?.fps || 5);
  const [loop, setLoop] = useState<boolean>(land.animationSettings?.loop !== false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentPreviewFrame, setCurrentPreviewFrame] = useState<number>(0);
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [editingDuration, setEditingDuration] = useState<number>(1000);
  const [animationPermissions, setAnimationPermissions] = useState<AnimationPermissions | null>(null);
  const [showMarketplace, setShowMarketplace] = useState<boolean>(false);

  useEffect(() => {
    const loadPermissions = async () => {
      if (!currentUser) return;
      try {
        const permissions = await userPermissionsService.getUserPermissions(currentUser.uid);
        setAnimationPermissions(permissions.animation);
      } catch (error) {
        console.error('Error loading animation permissions:', error);
      }
    };
    
    loadPermissions();
  }, [currentUser]);

  const renderAnimationPreview = () => {
    if (frames.length === 0) {
      return (
        <div className="bg-gray-700 rounded-lg p-8 text-center text-gray-400">
          No frames to preview. Add frames to see animation.
        </div>
      );
    }

    const currentFrame = frames[currentPreviewFrame];
    if (!currentFrame) return null;

    const pixelData = currentFrame.pixelData || {};
    const gridSize = 20;
    
    return (
      <div className="bg-gray-700 rounded-lg p-4">
        <div className="text-white text-sm mb-2 text-center">
          Frame {currentPreviewFrame + 1} of {frames.length}
          {isPlaying && " (Playing)"}
        </div>
        
        <div 
          className="grid mx-auto border border-gray-600" 
          style={{
            gridTemplateColumns: `repeat(${gridSize}, 8px)`,
            gridTemplateRows: `repeat(${gridSize}, 8px)`,
            width: `${gridSize * 8}px`,
            height: `${gridSize * 8}px`
          }}
        >
          {Array.from({ length: gridSize * gridSize }).map((_, index) => {
            const x = index % gridSize;
            const y = Math.floor(index / gridSize);
            const key = `${x}:${y}`;
            const color = pixelData[key] || '#2e2e2e';
            
            return (
              <div
                key={index}
                className="border-gray-600"
                style={{
                  backgroundColor: color,
                  borderWidth: '0.5px'
                }}
              />
            );
          })}
        </div>
        
        <div className="flex justify-center items-center gap-2 mt-3">          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsPlaying(!isPlaying);
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsPlaying(!isPlaying);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm ui-element"
            style={{ 
              minHeight: '44px',
              minWidth: '44px',
              touchAction: 'manipulation'
            }}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentPreviewFrame(0);
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentPreviewFrame(0);
            }}
            className="bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-sm ui-element"
            disabled={isPlaying}
            style={{ 
              minHeight: '44px',
              minWidth: '44px',
              touchAction: 'manipulation'
            }}
          >
            Reset
          </button>          {onPreviewAnimation && frames.length > 0 && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPreviewAnimation(land.id);
                onClose();
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPreviewAnimation(land.id);
                onClose();
              }}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm flex items-center gap-1 ui-element"
              title="Preview animation on canvas"
              style={{ 
                minHeight: '44px',
                touchAction: 'manipulation'
              }}
            >
              <FiEye size={14} />
              Preview on Canvas
            </button>
          )}
          
          {onStopAnimation && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStopAnimation(land.id);
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStopAnimation(land.id);
              }}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm flex items-center gap-1 ui-element"
              title="Stop animation and restore latest canvas"
              style={{ 
                minHeight: '44px',
                touchAction: 'manipulation'
              }}
            >
              <FiPause size={14} />
              Stop Animation
            </button>
          )}
          
          <span className="text-gray-300 text-xs">
            {fps} FPS
          </span>
        </div>
      </div>
    );
  };
  const loadAnimationData = useCallback(async () => {
    if (!land.id || !currentUser) return;
    setIsLoading(true);
    setError(null);
    try {
      const userLands = await getUserLands(currentUser.uid);
      const latestLandData = userLands.find(l => l.id === land.id);
      
      const effectiveAnimationSettings = latestLandData?.animationSettings || land.animationSettings;
      
      console.log(`🎬 [Modal] loadAnimationData for ${land.id}. Effective animationSettings:`, JSON.stringify(effectiveAnimationSettings));

      const fetchedFrames = await getLandFrames(land.id);
      const sortedFrames = fetchedFrames.sort((a, b) => a.frameIndex - b.frameIndex);
      setFrames(sortedFrames);
      
      if (effectiveAnimationSettings) {
        setFps(effectiveAnimationSettings.fps || 5);
        setLoop(effectiveAnimationSettings.loop !== false);
      } else {
        console.log(`🎬 [Modal] No animation settings found for ${land.id} during load, using defaults (5 FPS, loop true)`);
        setFps(5);
        setLoop(true);
      }
    } catch (err) {
      console.error('Error loading animation data:', err);
      setError('Failed to load animation data.');
    } finally {
      setIsLoading(false);
    }
  }, [land.id, currentUser, land.animationSettings]);

  useEffect(() => {
    if (isOpen && land.id) {
      loadAnimationData();
    }
  }, [isOpen, land.id, loadAnimationData]);
  
  useEffect(() => {
    if (land.animationSettings?.fps) {
      console.log(`🎬 [Modal] Land prop updated. land.animationSettings.fps: ${land.animationSettings.fps}. Updating local FPS state.`);
      setFps(land.animationSettings.fps);
    }
     if (land.animationSettings?.loop !== undefined) {
      console.log(`🎬 [Modal] Land prop updated. land.animationSettings.loop: ${land.animationSettings.loop}. Updating local loop state.`);
      setLoop(land.animationSettings.loop);
    }
  }, [land.animationSettings]);

  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;

    const frameTime = 1000 / fps;
    const interval = setInterval(() => {
      setCurrentPreviewFrame(prev => {
        const next = prev + 1;
        if (next >= frames.length) {
          return loop ? 0 : prev;
        }
        return next;
      });
    }, frameTime);

    return () => clearInterval(interval);
  }, [isPlaying, frames.length, fps, loop]);
  const handleSaveSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const settingsToSave = { fps: Math.max(1, Math.min(30, fps)), loop };
      console.log(`🎬 [Modal] Saving animation settings for ${land.id}:`, settingsToSave);
      
      await updateLandAnimationSettings(
        land.id, 
        settingsToSave, 
        frames.length > 0
      );
      
      console.log(`🎬 [Modal] Successfully saved animation settings for ${land.id}`);
      onSuccess?.();
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save animation settings.');
    } finally {
      setIsLoading(false);
    }
  };
  const handleAddFrame = async () => {
    if (!animationPermissions?.canAnimate) {
      setError('Animation feature not available. Please purchase animation packages.');
      return;
    }
    
    if (frames.length >= (animationPermissions?.maxFrames || 3)) {
      setError(`Frame limit reached. Your current package allows up to ${animationPermissions?.maxFrames || 3} frames.`);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    try {
      console.log('🎬 [Modal] Adding frame for land:', land.id);
      const currentPixels = onCaptureCurrentPixels(land.id);
      console.log('🎬 [Modal] Captured pixels for frame:', currentPixels);
      console.log('🎬 [Modal] Pixel count:', Object.keys(currentPixels).length);
      
      const frameIndex = frames.length;
      
      const frameData = {
        frameIndex,
        duration: 1000,
        pixelData: currentPixels
      };
      
      console.log('🎬 [Modal] Adding frame data:', frameData);
      await addLandFrame(land.id, frameData);
      console.log('🎬 [Modal] Frame added successfully');
      
      await loadAnimationData();
      console.log('🎬 [Modal] Animation data reloaded');
    } catch (err) {
      console.error('Error adding frame:', err);
      setError('Failed to add frame.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateFramePixels = async (frameId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const currentPixels = onCaptureCurrentPixels(land.id);
      await updateLandFramePixelData(land.id, frameId, currentPixels);
      await loadAnimationData();
    } catch (err) {
      console.error('Error updating frame pixels:', err);
      setError('Failed to update frame pixels.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateFrameDuration = async (frameId: string, newDuration: number) => {
    const clampedDuration = Math.max(100, Math.min(10000, newDuration));
    
    try {
      await updateLandFrame(land.id, frameId, { duration: clampedDuration });
      setFrames(prev => prev.map(f => 
        f.id === frameId ? { ...f, duration: clampedDuration } : f
      ));
      setEditingFrameId(null);
    } catch (err) {
      console.error('Error updating frame duration:', err);
      setError('Failed to update frame duration.');
    }
  };

  const handleDeleteFrame = async (frameId: string) => {
    if (!window.confirm("Are you sure you want to delete this frame?")) return;
    
    setIsLoading(true);
    setError(null);
    try {
      await deleteLandFrame(land.id, frameId);
      await loadAnimationData();
      if (currentPreviewFrame >= frames.length - 1) {
        setCurrentPreviewFrame(Math.max(0, frames.length - 2));
      }
    } catch (err) {
      console.error('Error deleting frame:', err);
      setError('Failed to delete frame.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderFramePreview = (frame: LandFrame, index: number) => {
    const isCurrentFrame = index === currentPreviewFrame;
    const pixelCount = frame.pixelData ? Object.keys(frame.pixelData).length : 0;
    
    return (
      <div 
        key={frame.id}
        className={`
          border rounded-lg p-3 transition-all cursor-pointer
          ${isCurrentFrame ? 'border-blue-500 bg-blue-900/20' : 'border-gray-600 hover:border-gray-500'}
        `}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setCurrentPreviewFrame(index);
        }}
      >
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="text-white font-medium">Frame {index + 1}</div>
            <div className="text-gray-400 text-sm">{pixelCount} pixels</div>
          </div>          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateFramePixels(frame.id);
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleUpdateFramePixels(frame.id);
              }}
              className="text-yellow-400 hover:text-yellow-300 p-1 ui-element"
              title="Update with current pixels"
              disabled={isLoading}
              style={{ 
                minHeight: '44px',
                minWidth: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'manipulation'
              }}
            >
              <FiRefreshCw size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFrame(frame.id);
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteFrame(frame.id);
              }}
              className="text-red-400 hover:text-red-300 p-1 ui-element"
              title="Delete frame"
              disabled={isLoading}
              style={{ 
                minHeight: '44px',
                minWidth: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'manipulation'
              }}
            >
              <FiTrash2 size={14} />
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {editingFrameId === frame.id ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={editingDuration}
                onChange={(e) => setEditingDuration(Math.max(100, parseInt(e.target.value) || 100))}
                className="w-20 bg-gray-700 text-white text-xs px-2 py-1 rounded"
                min="100"
                max="10000"
                step="100"
              />              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleUpdateFrameDuration(frame.id, editingDuration);
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleUpdateFrameDuration(frame.id, editingDuration);
                }}
                className="text-green-400 hover:text-green-300 ui-element"
                style={{ 
                  minHeight: '44px',
                  minWidth: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  touchAction: 'manipulation'
                }}
              >
                <FiSave size={12} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-gray-300 text-sm">{frame.duration}ms</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingFrameId(frame.id);
                  setEditingDuration(frame.duration);
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditingFrameId(frame.id);
                  setEditingDuration(frame.duration);
                }}
                className="text-gray-400 hover:text-gray-300 ui-element"
                style={{ 
                  minHeight: '44px',
                  minWidth: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  touchAction: 'manipulation'
                }}
              >
                <FiEdit3 size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };
  if (!isOpen) return null;

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">
            Land Animation - {land.displayName || `Land ${land.id}`}
          </h2>
          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }} 
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="text-gray-400 hover:text-white modal-close-button ui-element"
            style={{
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation'
            }}
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Preview</h3>
            {renderAnimationPreview()}
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Settings</h3>
              <div className="space-y-4">                <div>
                  <label className="block text-gray-300 text-sm mb-2">
                    FPS: {fps} {animationPermissions && `(Max: ${animationPermissions.maxFps})`}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max={animationPermissions?.maxFps || 5}
                    value={fps}
                    onChange={(e) => {
                      const newFps = parseInt(e.target.value);
                      const maxFps = animationPermissions?.maxFps || 5;
                      const clampedFps = Math.min(newFps, maxFps);
                      console.log('FPS slider changed to:', clampedFps);
                      setFps(clampedFps);
                    }}
                    onInput={(e) => {
                      const newFps = parseInt((e.target as HTMLInputElement).value);
                      const maxFps = animationPermissions?.maxFps || 5;
                      const clampedFps = Math.min(newFps, maxFps);
                      console.log('FPS slider onInput:', clampedFps);
                      setFps(clampedFps);
                    }}
                    disabled={!animationPermissions?.canAnimate}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className={`w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider-track ${
                      !animationPermissions?.canAnimate ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    style={{
                      background: !animationPermissions?.canAnimate 
                        ? '#6b7280' 
                        : `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((fps - 1) / ((animationPermissions?.maxFps || 5) - 1)) * 100}%, #4b5563 ${((fps - 1) / ((animationPermissions?.maxFps || 5) - 1)) * 100}%, #4b5563 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>1 FPS</span>
                    <span>{animationPermissions?.maxFps || 5} FPS</span>
                  </div>
                  {!animationPermissions?.canAnimate && (
                    <div className="mt-2 p-3 bg-red-900/20 border border-red-500 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-red-400 text-sm font-medium">Animation Not Available</p>
                          <p className="text-red-300 text-xs mt-1">Purchase animation packages from the marketplace to unlock this feature.</p>
                        </div>
                        <button
                          onClick={() => setShowMarketplace(true)}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm flex items-center gap-1"
                        >
                          <FiShoppingCart size={14} />
                          Shop
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                  <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="loop"
                    checked={loop}
                    onChange={(e) => setLoop(e.target.checked)}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className="mr-2 ui-element"
                    style={{
                      minHeight: '20px',
                      minWidth: '20px',
                      touchAction: 'manipulation'
                    }}
                  />
                  <label 
                    htmlFor="loop" 
                    className="text-gray-300 ui-element cursor-pointer"
                    onTouchStart={(e) => e.stopPropagation()}
                    style={{
                      minHeight: '44px',
                      display: 'flex',
                      alignItems: 'center',
                      touchAction: 'manipulation'
                    }}
                  >
                    Loop animation
                  </label>
                </div>
                  <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSaveSettings();
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSaveSettings();
                  }}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded ui-element"
                  style={{ 
                    minHeight: '48px',
                    touchAction: 'manipulation'
                  }}
                >
                  {isLoading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
            <div>              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Frames ({frames.length}{animationPermissions ? `/${animationPermissions.maxFrames}` : ''})
                </h3>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAddFrame();
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAddFrame();
                  }}
                  disabled={
                    isLoading || 
                    !animationPermissions?.canAnimate || 
                    frames.length >= (animationPermissions?.maxFrames || 3)
                  }
                  className={`px-3 py-2 rounded text-sm ui-element ${
                    !animationPermissions?.canAnimate || frames.length >= (animationPermissions?.maxFrames || 3)
                      ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                      : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white'
                  }`}
                  style={{ 
                    minHeight: '48px',
                    touchAction: 'manipulation'
                  }}
                  title={
                    !animationPermissions?.canAnimate 
                      ? 'Animation not available - purchase animation package'
                      : frames.length >= (animationPermissions?.maxFrames || 3)
                      ? `Frame limit reached (${animationPermissions?.maxFrames || 3})`
                      : 'Add current canvas as new frame'
                  }
                >
                  Add Current Canvas
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {frames.map((frame, index) => renderFramePreview(frame, index))}
              </div>
            </div>
          </div>
        </div>        {error && (
          <div className="mx-6 mb-6 p-3 bg-red-900/50 border border-red-700 rounded text-red-200">
            {error}
          </div>
        )}
      </div>
    </ModalWrapper>
  );
};

export default LandAnimationModal;