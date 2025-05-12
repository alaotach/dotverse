interface WebSocketMessage {
  type: string;
  payload: any;
}

type ConnectionChangeHandler = (connected: boolean) => void;
type MessageHandler = (data: any) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, MessageHandler[]> = new Map();
  private connectionHandlers: ConnectionChangeHandler[] = [];
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_INTERVAL_MS = 3000;
  private isConnecting = false;

  connect() {
    if (this.socket || this.isConnecting) return;
    
    this.isConnecting = true;
    
    try {
      const wsServerUrl = import.meta.env.VITE_WEBSOCKET_URL || 'ws://192.168.230.248:8080';
      console.log("Connecting to WebSocket server at:", wsServerUrl);
      
      this.socket = new WebSocket(wsServerUrl);
      
      this.socket.onopen = () => {
        console.log("WebSocket connection established");
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyConnectionChange(true);
        this.send('client_register', { clientId: `client_${Math.random().toString(36).substring(2, 15)}` });
        
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
        
        this.isConnecting = false;
      };
      
      this.socket.onclose = () => {
        console.log("WebSocket connection closed");
        this.isConnected = false;
        this.socket = null;
        this.notifyConnectionChange(false);
        this.isConnecting = false;
        
        this.scheduleReconnect();
      };
      
      this.socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.isConnected = false;
        this.isConnecting = false;
        
        if (this.socket) {
          this.socket.close();
          this.socket = null;
        }
      };
      
      this.socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          if (message && message.type) {
            this.handleMessage(message.type, message.payload);
          } else {
            console.warn("Received invalid message format:", event.data);
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      };
    } catch (error) {
      console.error("Failed to connect to WebSocket server:", error);
      this.isConnecting = false;
      this.scheduleReconnect();
      
      setTimeout(() => this.notifyConnectionChange(false), 200);
    }
  }
  
  send(type: string, data: any) {
    if (!this.isConnected || !this.socket) {
      console.warn(`Cannot send ${type} message: WebSocket not connected`);
      return false;
    }
    
    try {
      this.socket.send(JSON.stringify({ type, payload: data }));
      return true;
    } catch (error) {
      console.error(`Error sending ${type} message:`, error);
      return false;
    }
  }
  
 
  on(eventType: string, handler: MessageHandler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    
    this.eventHandlers.get(eventType)?.push(handler);
  }
  
  off(eventType: string, handler: MessageHandler) {
    if (!this.eventHandlers.has(eventType)) return;
    
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  onConnectionChange(handler: ConnectionChangeHandler) {
    this.connectionHandlers.push(handler);
  }
  offConnectionChange(handler: ConnectionChangeHandler) {
    const index = this.connectionHandlers.indexOf(handler);
    if (index !== -1) {
      this.connectionHandlers.splice(index, 1);
    }
  }
  
  private handleMessage(type: string, payload: any) {
    if (this.eventHandlers.has(type)) {
      const handlers = this.eventHandlers.get(type);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(payload);
          } catch (error) {
            console.error(`Error in handler for ${type}:`, error);
          }
        });
      }
    } else {
      console.log(`Unknown message type: ${type}`);
    }
  }
  
  private notifyConnectionChange(connected: boolean) {
    this.connectionHandlers.forEach((handler) => {
      try {
        handler(connected);
      } catch (error) {
        console.error("Error in connection handler:", error);
      }
    });
  }
  
  private scheduleReconnect() {
    if (this.reconnectInterval) return;
    
    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      console.log(`Scheduling reconnect attempt ${this.reconnectAttempts + 1}/${this.MAX_RECONNECT_ATTEMPTS}`);
      this.reconnectInterval = setInterval(() => {
        this.reconnectAttempts++;
        
        console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`);
        this.connect();
        
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
          console.log("Maximum reconnection attempts reached");
          if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
          }
        }
      }, this.RECONNECT_INTERVAL_MS);
    }
  }
  
  isConnectedToServer() {
    return this.isConnected;
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    
    this.isConnected = false;
    this.notifyConnectionChange(false);
  }
}

const websocketService = new WebSocketService();
export default websocketService;
