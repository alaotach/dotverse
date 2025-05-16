interface WebSocketMessage {
  type: string;
  payload: any;
}

type ConnectionChangeHandler = (connected: boolean) => void;
type MessageHandler = (data: any) => void;
import { io, Socket } from 'socket.io-client';

const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL || 'ws://192.168.111.248:8080';
const RECONNECT_DELAY_BASE = 1000; // 1 second
const RECONNECT_DELAY_MAX = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10; // Max attempts before giving up temporarily
const PING_INTERVAL = 25000; // Standard socket.io ping interval
const PING_TIMEOUT = 5000;  // Standard socket.io ping timeout

/**
 * Enhanced WebSocketService: Handles real-time communication with WebSocket server
 * - More reliable connection management using Socket.IO
 * - Better error handling and reconnection logic (via Socket.IO)
 * - Event-based message handling
 * - Support for client identification and session tracking
 */
class WebSocketService {
  private socket: Socket | null = null;
  private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private reconnectAttempts: number = 0;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;

  private eventListeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  private connectionChangeListeners: Set<(isConnected: boolean, state: 'disconnected' | 'connecting' | 'connected') => void> = new Set();

  constructor() {
    this.handleConnect = this.handleConnect.bind(this);
    this.handleDisconnect = this.handleDisconnect.bind(this);
    this.handleConnectError = this.handleConnectError.bind(this);
  }

  public connect(): void {
    if (this.socket && (this.connectionState === 'connected' || this.connectionState === 'connecting')) {
      console.log('[WS] Already connected or connecting.');
      this.notifyConnectionChange(); // Notify current state if called again
      return;
    }

    console.log('[WS] Attempting to connect to', WEBSOCKET_URL);
    this.setConnectionState('connecting');

    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
    }
    
    this.socket = io(WEBSOCKET_URL, {
      reconnection: false, // We handle reconnection manually for more control and logging
      transports: ['websocket'],
      pingInterval: PING_INTERVAL,
      pingTimeout: PING_TIMEOUT,
      // autoConnect: false, // We call connect explicitly
    });

    this.socket.on('connect', this.handleConnect);
    this.socket.on('disconnect', this.handleDisconnect);
    this.socket.on('connect_error', this.handleConnectError);
    // 'pong' is handled internally by socket.io-client for keep-alive

    // Re-register persistent listeners for custom events
    this.eventListeners.forEach((callbacks, event) => {
      callbacks.forEach(callback => {
        this.socket?.on(event, callback);
      });
    });
  }

  private handleConnect(): void {
    console.log('[WS] Connected successfully. Socket ID:', this.socket?.id);
    this.setConnectionState('connected');
    this.reconnectAttempts = 0;
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  private handleDisconnect(reason: Socket.DisconnectReason): void {
    const socketId = this.socket?.id; // Capture before socket might be nulled
    console.warn(`[WS] Disconnected. Reason: ${reason}. Socket ID was: ${socketId}`);
    this.setConnectionState('disconnected');

    if (reason === 'io server disconnect' || reason === 'io client disconnect') {
      console.log('[WS] Intentional disconnect, not attempting to reconnect automatically.');
    } else {
      this.attemptReconnect();
    }
  }

  private handleConnectError(error: Error): void {
    console.error('[WS] Connection error:', error.message);
    // This event is usually followed by a 'disconnect' event if the connection fails.
    // We ensure state is 'disconnected' and attempt reconnect from handleDisconnect.
    // If 'disconnect' isn't emitted, we might need to trigger reconnect here too.
    // For now, relying on 'disconnect' to trigger reconnection logic.
    if (this.connectionState !== 'disconnected') {
        this.setConnectionState('disconnected'); // Ensure state reflects reality
    }
    // Socket.IO client might attempt its own reconnections if options.reconnection is true.
    // Since we set it to false, we must handle it.
    this.attemptReconnect(); 
  }
  
  private attemptReconnect(): void {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
        // Already connecting or connected, no need to attempt another reconnect cycle.
        return;
    }
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WS] Max reconnect attempts reached. Will try again later or on manual connect.');
      // Optionally, reset attempts after a longer delay to allow periodic retries without spamming.
      // For now, it stops until a manual connect() or new attempt after MAX_RECONNECT_ATTEMPTS_DELAY
      this.setConnectionState('disconnected'); 
      return;
    }

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }

    const delay = Math.min(
      RECONNECT_DELAY_BASE * Math.pow(1.5, this.reconnectAttempts), // Slower backoff
      RECONNECT_DELAY_MAX
    );

    this.reconnectAttempts++;
    console.log(`[WS] Attempting reconnect ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s...`);
    
    this.setConnectionState('connecting'); // Show intent to connect
    this.reconnectTimeoutId = setTimeout(() => {
      if (this.connectionState !== 'connected') {
         this.connect(); 
      }
    }, delay);
  }

  private setConnectionState(newState: 'disconnected' | 'connecting' | 'connected'): void {
    if (this.connectionState !== newState) {
      this.connectionState = newState;
      this.notifyConnectionChange();
    }
  }

  public disconnect(): void {
    if (this.socket) {
      console.log('[WS] Disconnecting manually.');
      this.socket.disconnect(); // This will trigger the 'disconnect' event with reason 'io client disconnect'
    }
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    // The 'disconnect' event handler will call setConnectionState.
  }

  public send(event: string, data: any): boolean {
    if (this.socket && this.connectionState === 'connected') {
      this.socket.emit(event, data);
      return true;
    } else {
      console.warn(`[WS] Cannot send event '${event}'. State: ${this.connectionState}.`);
      return false;
    }
  }

  public on(event: string, callback: (...args: any[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
    this.socket?.on(event, callback); // Add to current socket if exists
  }

  public off(event: string, callback: (...args: any[]) => void): void {
    this.eventListeners.get(event)?.delete(callback);
    this.socket?.off(event, callback);
    if (this.eventListeners.get(event)?.size === 0) {
        this.eventListeners.delete(event);
    }
  }

  public onConnectionChange(callback: (isConnected: boolean, state: 'disconnected' | 'connecting' | 'connected') => void): void {
    this.connectionChangeListeners.add(callback);
    // Immediately notify with current state upon registration
    callback(this.connectionState === 'connected', this.connectionState);
  }

  public offConnectionChange(callback: (isConnected: boolean, state: 'disconnected' | 'connecting' | 'connected') => void): void {
    this.connectionChangeListeners.delete(callback);
  }

  private notifyConnectionChange(): void {
    const isConnected = this.connectionState === 'connected';
    this.connectionChangeListeners.forEach(cb => {
      try {
        cb(isConnected, this.connectionState);
      } catch (error) {
        console.error('[WS] Error in connectionChange listener:', error);
      }
    });
  }

  public getConnectionState(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionState;
  }
}

const websocketService = new WebSocketService();
export default websocketService;
