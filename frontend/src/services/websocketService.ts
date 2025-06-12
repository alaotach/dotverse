import { io, Socket } from 'socket.io-client';

interface WebSocketMessage {
  type: string;
  payload: any;
}

type ConnectionChangeHandler = (connected: boolean) => void;
type MessageHandler = (data: any) => void;

const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL || 'https://backenddot.krypkey.tech';
const RECONNECT_DELAY_BASE = 1000;
const RECONNECT_DELAY_MAX = 10000;
const MAX_RECONNECT_ATTEMPTS = 15;
const PING_INTERVAL = 25000;
const PING_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 30000;
const SERVER_TIMEOUT = 45000;
const CONNECTION_TIMEOUT = 10000; 

class WebSocketService {
  private socket: Socket | null = null;
  private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private reconnectAttempts: number = 0;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private heartbeatIntervalId: NodeJS.Timeout | null = null;
  private lastPingTime: number = 0;
  private lastPongTime: number = 0;
  private pingTimeoutId: NodeJS.Timeout | null = null;
  private connectionTimeoutId: NodeJS.Timeout | null = null;
  private isManualDisconnect: boolean = false;
  private authContextRef: any = null;

  private eventListeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  private connectionChangeListeners: Set<(isConnected: boolean, state: 'disconnected' | 'connecting' | 'connected') => void> = new Set();
  private onlineUsersListeners: Set<OnlineUsersHandler> = new Set();

  constructor() {
    this.handleConnect = this.handleConnect.bind(this);
    this.handleDisconnect = this.handleDisconnect.bind(this);
    this.handleConnectError = this.handleConnectError.bind(this);
    this.handlePong = this.handlePong.bind(this);
    this.sendHeartbeat = this.sendHeartbeat.bind(this);
  }

  public connect(): void {
    if (this.connectionState === 'connecting') {
      console.log('[WS] Already connecting, ignoring duplicate connect request');
      return;
    }
    
    if (this.connectionState === 'connected' && this.socket?.connected) {
      console.log('[WS] Already connected');
      return;
    }

    this.isManualDisconnect = false;
    console.log('[WS] Attempting to connect to', WEBSOCKET_URL);
    this.setConnectionState('connecting');

    this.cleanup();
    
    this.connectionTimeoutId = setTimeout(() => {
      console.log('[WS] Connection timeout');
      this.handleConnectError(new Error('Connection timeout'));
    }, CONNECTION_TIMEOUT);
    
    this.socket = io(WEBSOCKET_URL, {
      reconnection: false,
      transports: ['websocket', 'polling'],
      upgrade: true, 
      rememberUpgrade: false,
      timeout: CONNECTION_TIMEOUT,
      forceNew: true,
      pingInterval: PING_INTERVAL,
      pingTimeout: PING_TIMEOUT,
      autoConnect: true,
      closeOnBeforeunload: false,
    });

    this.socket.on('connect', this.handleConnect);
    this.socket.on('disconnect', this.handleDisconnect);
    this.socket.on('connect_error', this.handleConnectError);
    
    this.socket.on('ping', () => {
      console.log('[WS] Received ping from server');
    });
    
    this.socket.on('pong', this.handlePong);

    this.socket.on('heartbeat_ack', (data) => {
      console.log('[WS] Received heartbeat ack:', data);
      this.lastPongTime = Date.now();
    });

    this.eventListeners.forEach((callbacks, event) => {
      callbacks.forEach(callback => {
        this.socket?.on(event, callback);
      });
    });
  }

  private handleConnect(): void {
    console.log('[WS] Connected successfully. Socket ID:', this.socket?.id);
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    
    this.setConnectionState('connected');
    this.reconnectAttempts = 0;
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    this.startHeartbeat();

    this.socket?.on('online_users_update', (users: OnlineUser[]) => {
      console.log('[WS] Received online users update:', users);
      this.notifyOnlineUsersChange(users);
    });

    const userId = this.getCurrentUserId();
    const displayName = this.getCurrentUserDisplayName();
    
    if (userId && displayName) {
      console.log('[WS] Registering user for presence tracking:', { userId, displayName });
      this.socket?.emit('register_for_presence', {
        userId,
        displayName
      });
    } else {
      console.warn('[WS] Cannot register for presence tracking - missing user data');
    }
  }

  public onOnlineUsersChange(callback: OnlineUsersHandler): void {
    this.onlineUsersListeners.add(callback);
  }

  public offOnlineUsersChange(callback: OnlineUsersHandler): void {
    this.onlineUsersListeners.delete(callback);
  }

  private notifyOnlineUsersChange(users: OnlineUser[]): void {
    this.onlineUsersListeners.forEach(callback => {
      try {
        callback(users);
      } catch (error) {
        console.error('[WS] Error in online users callback:', error);
      }
    });
  }

  public setAuthContext(authContext: any): void {
    this.authContextRef = authContext;
  }

  private getCurrentUserId(): string | null {
    try {
      if (this.authContextRef?.currentUser?.uid) {
        return this.authContextRef.currentUser.uid;
      }

      const storedUserUID = localStorage.getItem('dotverse_user_uid');
      if (storedUserUID) {
        return storedUserUID;
      }

      return null;
    } catch (error) {
      console.error('[WS] Error getting current user ID:', error);
      return null;
    }
  }

  private getCurrentUserDisplayName(): string | null {
    try {
      if (this.authContextRef?.userProfile?.displayName) {
        return this.authContextRef.userProfile.displayName;
      }

      if (this.authContextRef?.userProfile?.email) {
        return this.authContextRef.userProfile.email;
      }

      if (this.authContextRef?.currentUser?.email) {
        return this.authContextRef.currentUser.email;
      }

      return 'Anonymous User';
    } catch (error) {
      console.error('[WS] Error getting current user display name:', error);
      return 'Anonymous User';
    }
  }

  public updateUserPresence(): void {
    if (this.socket && this.isConnected()) {
      const userId = this.getCurrentUserId();
      const displayName = this.getCurrentUserDisplayName();
      
      if (userId && displayName) {
        this.socket.emit('update_presence', {
          userId,
          displayName,
          timestamp: Date.now()
        });
        console.log('[WS] Updated user presence for:', displayName);
      }
    }
  }

  private handleDisconnect(reason: Socket.DisconnectReason): void {
    console.log('[WS] Disconnected. Reason:', reason);
    this.setConnectionState('disconnected');
    this.stopHeartbeat();
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    
    if (!this.isManualDisconnect && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(
        RECONNECT_DELAY_BASE * Math.pow(2, this.reconnectAttempts),
        RECONNECT_DELAY_MAX
      );
      
      console.log(`[WS] Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
      
      this.reconnectTimeoutId = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    } else if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WS] Max reconnection attempts reached. Giving up.');
    }
  }

  private handleConnectError(error: Error): void {
    console.error('[WS] Connection error:', error);
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    
    this.setConnectionState('disconnected');
    
    if (!this.isManualDisconnect && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(
        RECONNECT_DELAY_BASE * Math.pow(2, this.reconnectAttempts),
        RECONNECT_DELAY_MAX
      );
      
      console.log(`[WS] Retrying connection in ${delay}ms due to error (attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
      
      this.reconnectTimeoutId = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    }
  }

  private handlePong(): void {
    console.log('[WS] Received pong from server');
    this.lastPongTime = Date.now();
    
    if (this.pingTimeoutId) {
      clearTimeout(this.pingTimeoutId);
      this.pingTimeoutId = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatIntervalId = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL);
    
    console.log('[WS] Started heartbeat with interval:', HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
    
    if (this.pingTimeoutId) {
      clearTimeout(this.pingTimeoutId);
      this.pingTimeoutId = null;
    }
  }

  private sendHeartbeat(): void {
    if (!this.socket?.connected) {
      console.warn('[WS] Cannot send heartbeat - socket not connected');
      return;
    }

    this.lastPingTime = Date.now();
    
    this.socket.emit('heartbeat', { 
      timestamp: this.lastPingTime,
      clientId: this.socket.id 
    });
    
    console.log('[WS] Sent heartbeat to server');
    
    this.pingTimeoutId = setTimeout(() => {
      const timeSinceLastPong = Date.now() - this.lastPongTime;
      console.warn(`[WS] No response received for ${timeSinceLastPong}ms`);
      
      if (timeSinceLastPong > SERVER_TIMEOUT) {
        console.error('[WS] Server appears unresponsive - forcing disconnect');
        this.socket?.disconnect();
      }
    }, PING_TIMEOUT);
  }

  private cleanup(): void {
    this.stopHeartbeat();
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }
  
  private attemptReconnect(): void {
    if (this.connectionState === 'connecting') {
      console.log('[WS] Already attempting to connect, skipping reconnect');
      return;
    }
    
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WS] Max reconnect attempts reached. Will try again later.');
      this.setConnectionState('disconnected');
      
      setTimeout(() => {
        this.reconnectAttempts = 0;
        console.log('[WS] Reset reconnection attempts - ready for new connection attempts');
      }, 60000);
      return;
    }

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }

    const delay = Math.min(
      RECONNECT_DELAY_BASE * Math.pow(1.2, this.reconnectAttempts),
      RECONNECT_DELAY_MAX
    );

    this.reconnectAttempts++;
    console.log(`[WS] Attempting reconnect ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s...`);
    
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
    console.log('[WS] Disconnecting manually.');
    this.isManualDisconnect = true;
    this.stopHeartbeat();
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    
    if (this.socket) {
      this.socket.disconnect();
    }
    
    this.setConnectionState('disconnected');
  }

  public send(event: string, data: any): boolean {
    if (this.socket && this.connectionState === 'connected' && this.socket.connected) {
      this.socket.emit(event, data);
      return true;
    } else {
      console.warn(`[WS] Cannot send event '${event}'. State: ${this.connectionState}, Socket connected: ${this.socket?.connected}`);
      return false;
    }
  }

  public on(event: string, callback: (...args: any[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
    this.socket?.on(event, callback);
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

  public isConnected(): boolean {
    return this.connectionState === 'connected' && this.socket?.connected === true;
  }

  public getConnectionHealth(): {
    connected: boolean;
    lastPing: number;
    lastPong: number;
    timeSinceLastPong: number;
    socketId: string | undefined;
    transport: string | undefined;
  } {
    return {
      connected: this.isConnected(),
      lastPing: this.lastPingTime,
      lastPong: this.lastPongTime,
      timeSinceLastPong: Date.now() - this.lastPongTime,
      socketId: this.socket?.id,
      transport: (this.socket as any)?.io?.engine?.transport?.name
    };
  }
}

const websocketService = new WebSocketService();
export default websocketService;