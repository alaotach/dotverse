
interface Pixel {
  x: number;
  y: number;
  color: string;
  timestamp?: number;
  clientId?: string;
}

interface BatchManagerOptions {
  initialBatchInterval?: number; 
  maxBatchSize?: number; 
  minBatchInterval?: number; 
}

type UpdateCallback = (pixels: Pixel[]) => Promise<boolean>;

export class PixelBatchManager {
  private batch: Map<string, Pixel> = new Map();
  private batchInterval: number;
  private maxBatchSize: number;
  private minBatchInterval: number;
  private processingTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private lastProcessTime: number = 0;
  private updateCallback: UpdateCallback;


  constructor(updateCallback: UpdateCallback, options: BatchManagerOptions = {}) {
    this.updateCallback = updateCallback;
    this.batchInterval = options.initialBatchInterval || 200;
    this.maxBatchSize = options.maxBatchSize || 500;
    this.minBatchInterval = options.minBatchInterval || 16;
    
    console.log(`PixelBatchManager initialized with interval: ${this.batchInterval}ms, maxSize: ${this.maxBatchSize}`);
  }


  addUpdates(pixels: Pixel[]) {
    if (!pixels.length) return;
    
    const isImportantBatch = this.batch.size === 0 && pixels.length <= 5;
    
    pixels.forEach(pixel => {
      const key = `${pixel.x}:${pixel.y}`;
      this.batch.set(key, pixel);
    });
    
    this.scheduleProcessing(isImportantBatch);

    if (this.batch.size >= this.maxBatchSize || isImportantBatch) {
      this.processBatch();
    }
  }


  private scheduleProcessing(immediate: boolean = false) {
    if (this.processingTimer === null && !this.isProcessing) {
      const timeSinceLastProcess = Date.now() - this.lastProcessTime;
      
      const timeUntilNextProcess = immediate ? 
        this.minBatchInterval : 
        Math.max(this.minBatchInterval, this.batchInterval - timeSinceLastProcess);
      
      this.processingTimer = setTimeout(() => this.processBatch(), timeUntilNextProcess);
    }
  }


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
        batchToProcess.forEach(pixel => {
          const key = `${pixel.x}:${pixel.y}`;
          this.batch.set(key, pixel);
        });
      }
      this.lastProcessTime = Date.now();
    } catch (error) {
      console.error('[PixelBatchManager] Error processing batch:', error);
      batchToProcess.forEach(pixel => {
        const key = `${pixel.x}:${pixel.y}`;
        this.batch.set(key, pixel);
      });
    } finally {
      this.isProcessing = false;
      if (this.batch.size > 0) this.scheduleProcessing();
    }
  }

  async flush() {
    if (this.batch.size > 0) {
      if (this.processingTimer) {
        clearTimeout(this.processingTimer);
        this.processingTimer = null;
      }
      await this.processBatch();
    }
  }


  clear() {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    
    this.batch.clear();
    this.isProcessing = false;
  }

  get pendingCount(): number {
    return this.batch.size; 
  }
}
