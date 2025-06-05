interface MinigameMessage {
  type?: string;
  action?: string;
  data?: any;
  player_id?: string;
}

interface LobbyState {
  id: string;
  host_id: string;
  players: { [key: string]: any };
  game_status: string;
  max_players: number;
  phase_time_remaining: number;
  theme: string | null;
  theme_votes: { [key: string]: string };
  drawings: { [key: string]: any };
  drawing_votes: { [key: string]: string };
  results: Array<[string, number]> | null;
  created_at: number;
}

type MinigameEventHandler = (data: any) => void;

class MinigameWebSocketService {
  private ws: WebSocket | null = null;
  private playerId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isManualDisconnect = false;
  
  private eventHandlers: Map<string, Set<MinigameEventHandler>> = new Map();
  private readonly wsUrls = [
    'ws://localhost:8765',
    'wss://dotverse-minigame.krypkey.tech'
  ];
  private currentUrlIndex = 0;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private readonly CONNECTION_TIMEOUT_MS = 5000;

  constructor() {
    this.handleMessage = this.handleMessage.bind(this);
    this.handleOpen = this.handleOpen.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.isManualDisconnect = false;
      const currentWsUrl = this.wsUrls[this.currentUrlIndex];
      
      try {
        if (this.ws) {
          this.ws.onopen = null;
          this.ws.onmessage = null;
          this.ws.onclose = null;
          this.ws.onerror = null;
          this.ws.close();
          this.ws = null;
        }

        console.log(`[Minigame WS] Attempting to connect to ${currentWsUrl}`);
        this.ws = new WebSocket(currentWsUrl);
        
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
        }
        
        this.connectionTimeout = setTimeout(() => {
          console.log(`[Minigame WS] Connection timeout for ${currentWsUrl}`);
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            this.ws.close();
            this.tryNextServer(reject);
          }
        }, this.CONNECTION_TIMEOUT_MS);
        
        this.ws.onopen = () => {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          this.handleOpen();
          resolve();
        };
        this.ws.onmessage = this.handleMessage;
        this.ws.onclose = this.handleClose;
        this.ws.onerror = (error) => {
          this.handleError(error);
          this.tryNextServer(reject);
        };
      } catch (error) {
        this.tryNextServer(reject, error);
      }
    });
  }
  disconnect(): void {
    this.isManualDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.playerId = null;
  }
  
  private tryNextServer(rejectCallback: (reason?: any) => void, error?: any): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    this.currentUrlIndex = (this.currentUrlIndex + 1) % this.wsUrls.length;
    
    if (this.currentUrlIndex === 0) {
      rejectCallback(error || new Error("Failed to connect to any minigame server"));
    } else {
      console.log(`[Minigame WS] Trying next server: ${this.wsUrls[this.currentUrlIndex]}`);
      this.connect().catch(rejectCallback);
    }
  }
  private handleOpen(): void {
    console.log('[Minigame WS] Connected to minigame server');
    this.reconnectAttempts = 0;
    this.currentUrlIndex = 0;
    this.emit('connected', true);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: MinigameMessage = JSON.parse(event.data);
      console.log('[Minigame WS] Received:', message);
      
      if (message.type === 'connection_ack') {
        this.playerId = message.data?.player_id || message.player_id;
        console.log('[Minigame WS] Player ID assigned:', this.playerId);
        this.emit('player_id_assigned', this.playerId);
      }
      if (message.type) {
        this.emit(message.type, message);
      }
      
    } catch (error) {
      console.error('[Minigame WS] Error parsing message:', error);
    }
  }  private handleClose(event?: CloseEvent): void {
    console.log('[Minigame WS] Connection closed', event?.code, event?.reason);
    this.emit('connected', false);
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    const isNormalClosure = event && (event.code === 1000 || event.code === 1001);
    const shouldReconnect = !this.isManualDisconnect && 
                           this.reconnectAttempts < this.maxReconnectAttempts && 
                           !isNormalClosure;
    
    if (shouldReconnect) {
      const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts), 30000);
      
      setTimeout(() => {
        this.reconnectAttempts++;
        console.log(`[Minigame WS] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        if (this.reconnectAttempts > 2) {
          this.currentUrlIndex = (this.currentUrlIndex + 1) % this.wsUrls.length;
          console.log(`[Minigame WS] Switching to server: ${this.wsUrls[this.currentUrlIndex]}`);
        }
        
        this.connect().catch(error => {
          console.error('[Minigame WS] Reconnection failed:', error);
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit('error', { 
              message: 'Unable to connect to the minigame server after multiple attempts. Please try again later.'
            });
          }
        });
      }, delay);
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Minigame WS] Max reconnection attempts reached');
      this.emit('error', { 
        message: 'Connection to minigame server lost. Max reconnection attempts reached.'
      });
    }
  }
  private handleError(event?: Event): void {
    console.error('[Minigame WS] WebSocket error occurred', event);
    this.emit('error', { 
      message: 'Connection to minigame server failed. Please try again later.',
      original: event
    });
  }

  private send(message: MinigameMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[Minigame WS] Cannot send message - not connected');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[Minigame WS] Error sending message:', error);
      return false;
    }
  }

  on(event: string, handler: MinigameEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: MinigameEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[Minigame WS] Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  createLobby(playerName: string): boolean {
    return this.send({
      action: 'create_lobby',
      data: { player_name: playerName }
    });
  }

  joinLobby(lobbyId: string, playerName: string): boolean {
    return this.send({
      action: 'join_lobby',
      data: { lobby_id: lobbyId, player_name: playerName }
    });
  }

  leaveLobby(): boolean {
    return this.send({
      action: 'leave_lobby'
    });
  }

  getLobbyList(): boolean {
    return this.send({
      action: 'get_lobby_list'
    });
  }

  setPlayerReady(isReady: boolean): boolean {
    return this.send({
      action: 'player_ready',
      data: { is_ready: isReady }
    });
  }

  voteTheme(theme: string): boolean {
    return this.send({
      action: 'vote_theme',
      data: { theme }
    });
  }

  submitDrawing(drawingData: string): boolean {
    return this.send({
      action: 'submit_drawing',
      data: { drawing_data: drawingData }
    });
  }

  voteForDrawing(targetPlayerId: string): boolean {
    return this.send({
      action: 'vote_drawing',
      data: { target_player_id: targetPlayerId }
    });
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

const minigameWebSocketService = new MinigameWebSocketService();

export { minigameWebSocketService, type LobbyState, type MinigameMessage };
export default minigameWebSocketService;
