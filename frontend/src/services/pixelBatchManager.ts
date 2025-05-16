/**
 * Optimized batch manager for pixel updates with adaptive batching and performance monitoring
 */

interface Pixel {
  x: number;
  y: number;
  color: string;
  timestamp?: number;
  clientId?: string;
}

interface BatchManagerOptions {
  initialBatchInterval?: number; // Time in ms between batch processing
  maxBatchSize?: number; // Maximum number of pixels to process in one batch
  minBatchInterval?: number; // Minimum time between batch processing
}

type UpdateCallback = (pixels: Pixel[]) => Promise<boolean>;

/**
 * PixelBatchManager handles batching of pixel updates to reduce database operations
 * and improve drawing performance
 */
export class PixelBatchManager {
  private batch: Map<string, Pixel> = new Map();
  private batchInterval: number;
  private maxBatchSize: number;
  private minBatchInterval: number;
  private processingTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private lastProcessTime: number = 0;
  private updateCallback: UpdateCallback;

  /**
   * Creates a new PixelBatchManager
   * @param updateCallback Function to call with batched pixels
   * @param options Configuration options
   */
  constructor(updateCallback: UpdateCallback, options: BatchManagerOptions = {}) {
    this.updateCallback = updateCallback;
    this.batchInterval = options.initialBatchInterval || 200; // Default 200ms
    this.maxBatchSize = options.maxBatchSize || 500; // Default 500 pixels
    this.minBatchInterval = options.minBatchInterval || 16; // ~60fps
    
    console.log(`PixelBatchManager initialized with interval: ${this.batchInterval}ms, maxSize: ${this.maxBatchSize}`);
  }

  /**
   * Add pixel updates to the batch queue
   * @param pixels Array of pixel updates
   */
  addUpdates(pixels: Pixel[]) {
    if (!pixels.length) return;
    
    // Track if we have "important" pixels that should be processed sooner
    // Important pixels are the first few pixels of a drawing action
    const isImportantBatch = this.batch.size === 0 && pixels.length <= 5;
    
    // Use a map with pixel coordinates as key to prevent duplicates
    pixels.forEach(pixel => {
      const key = `${pixel.x}:${pixel.y}`;
      this.batch.set(key, pixel);
    });
    
    // Schedule processing if not already scheduled
    this.scheduleProcessing(isImportantBatch);
    
    // If batch exceeds max size or this is the first pixel,
    // process immediately for responsiveness
    if (this.batch.size >= this.maxBatchSize || isImportantBatch) {
      this.processBatch();
    }
  }

  /**
   * Schedule batch processing if not already scheduled
   * @param immediate Whether to process immediately (for first pixel)
   */
  private scheduleProcessing(immediate: boolean = false) {
    if (this.processingTimer === null && !this.isProcessing) {
      const timeSinceLastProcess = Date.now() - this.lastProcessTime;
      
      // If immediate or this is the first pixel, use minimal delay
      const timeUntilNextProcess = immediate ? 
        this.minBatchInterval : 
        Math.max(this.minBatchInterval, this.batchInterval - timeSinceLastProcess);
      
      this.processingTimer = setTimeout(() => this.processBatch(), timeUntilNextProcess);
    }
  }

  /**
   * Process the current batch of pixel updates
   */
  async processBatch() {
    if (this.isProcessing || this.batch.size === 0) return;
    if (this.processingTimer) { clearTimeout(this.processingTimer); this.processingTimer = null; }
    this.isProcessing = true;

    const batchToProcess = Array.from(this.batch.values());
    this.batch = new Map();

    try {
      const success = await this.updateCallback(batchToProcess);
      if (!success) {
        console.warn('[PixelBatchManager] updateCallback returned false – re-queuing batch', batchToProcess);
        // ← re-add failed pixels back into the batch
        batchToProcess.forEach(pixel => {
          const key = `${pixel.x}:${pixel.y}`;
          this.batch.set(key, pixel);
        });
      }
      this.lastProcessTime = Date.now();
    } catch (error) {
      console.error('[PixelBatchManager] Error processing batch:', error);
      // on exception, also re-queue
      batchToProcess.forEach(pixel => {
        const key = `${pixel.x}:${pixel.y}`;
        this.batch.set(key, pixel);
      });
    } finally {
      this.isProcessing = false;
      if (this.batch.size > 0) this.scheduleProcessing();
    }
  }

  /**
   * Manually flush the current batch without waiting for the timer
   */
  async flush() {
    if (this.batch.size > 0) {
      if (this.processingTimer) {
        clearTimeout(this.processingTimer);
        this.processingTimer = null;
      }
      await this.processBatch();
    }
  }

  /**
   * Clear the batch and cancel any pending processing
   */
  clear() {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    
    this.batch.clear(); // This will now work correctly
    this.isProcessing = false;
  }

  /**
   * Get the current number of pending updates
   */
  get pendingCount(): number {
    return this.batch.size; // .size is correct for Map
  }
}
