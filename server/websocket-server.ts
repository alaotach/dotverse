// Remove: interface WebSocketMessage { type: string; payload: any; }
import { io, Socket } from 'socket.io-client'; // Import Socket.IO client

type ConnectionChangeHandler = (connected: boolean) => void;
type MessageHandler = (data: any) => void;

class WebSocketService {
  private socket: Socket | null = null; // Use Socket.IO's Socket type
  private isConnected = false;
  // private reconnectInterval: NodeJS.Timeout | null = null; // Socket.IO handles reconnection
  private eventHandlers: Map<string, MessageHandler[]> = new Map();
  private connectionHandlers: ConnectionChangeHandler[] = [];
  // private reconnectAttempts = 0; // Handled by Socket.IO
  // private readonly MAX_RECONNECT_ATTEMPTS = 10;
  // private readonly RECONNECT_INTERVAL_MS = 3000;
  private isConnecting = false; // Can still be useful to prevent multiple connect calls
  private clientId: string; // Application-specific client ID
  // private pingPongInterval: NodeJS.Timeout | null = null; // Socket.IO handles ping/pong

  constructor() {
    const savedClientId = localStorage.getItem('dotverse_client_id');
    if (savedClientId) {
      this.clientId = savedClientId;
    } else {
      this.clientId = `client_${Math.random().toString(36).substring(2, 15)}`;
      localStorage.setItem('dotverse_client_id', this.clientId);
    }
  }

  connect() {
    if (this.socket || this.isConnecting) return;

    this.isConnecting = true;
    const wsServerUrl = import.meta.env.VITE_WEBSOCKET_URL || 'ws://192.168.111.248:8080'; // Ensure this URL is correct for Socket.IO
    console.log("Connecting to Socket.IO server at:", wsServerUrl);

    try {
      this.socket = io(wsServerUrl, {
        reconnectionAttempts: 5, // Example: configure reconnection
        // transports: ['websocket'], // Optionally force websockets
      });

      this.socket.on('connect', () => {
        console.log("Socket.IO connection established. Socket ID:", this.socket?.id);
        this.isConnected = true;
        this.isConnecting = false;
        this.notifyConnectionChange(true);
        // Send client registration with application-specific ID
        this.send('client_register', { clientId: this.clientId });

        // Re-register all existing event handlers on new socket instance after connection/reconnection
        this.eventHandlers.forEach((handlers, eventType) => {
            handlers.forEach(handler => {
                this.socket?.off(eventType, handler); // Remove old listener if any from previous socket instance
                this.socket?.on(eventType, handler); // Add listener to new socket instance
            });
        });

      });

      this.socket.on('disconnect', (reason) => {
        console.log(`Socket.IO connection closed: ${reason}`);
        this.isConnected = false;
        this.isConnecting = false; // Allow attempting to reconnect
        this.notifyConnectionChange(false);
        // Socket.IO will attempt to reconnect automatically based on its config
      });

      this.socket.on('connect_error', (error) => {
        console.error("Socket.IO connection error:", error);
        this.isConnected = false;
        this.isConnecting = false;
        this.notifyConnectionChange(false);
        // Socket.IO handles reconnection attempts
      });

      // Generic message handler for events not specifically set up with .on(eventType, ...)
      // This replaces the old ws.onmessage and parsing JSON
      // However, it's more idiomatic to listen for specific named events.
      // If the server emits specific events, listen to them directly.
      // For example, if server emits `pixel_update`, then `this.socket.on('pixel_update', handler)`
      // The `handleMessage` method below will be called by specific event listeners.

      // Example of listening to a specific event expected from the server
      // This should align with events emitted by the server
      this.socket.on('pixel_update', (payload) => this.handleMessage('pixel_update', payload));
      this.socket.on('canvas_reset', (payload) => this.handleMessage('canvas_reset', payload));
      this.socket.on('sync_needed', (payload) => this.handleMessage('sync_needed', payload));
      this.socket.on('connection_established', (payload) => this.handleMessage('connection_established', payload));
      this.socket.on('pong', (payload) => this.handleMessage('pong', payload));
      this.socket.on('echo', (payload) => this.handleMessage('echo', payload));
      // Add other specific events your server might emit


    } catch (error) {
      console.error("Failed to initialize Socket.IO connection:", error);
      this.isConnecting = false;
      // notifyConnectionChange(false) might be called by connect_error too
    }
  }

  send(type: string, data: any): boolean { // Type is now the event name
    if (!this.isConnected || !this.socket) {
      console.warn(`Cannot send ${type} event: Socket.IO not connected`);
      return false;
    }

    try {
      this.socket.emit(type, data); // Emit event with payload
      return true;
    } catch (error) {
      console.error(`Error sending ${type} event:`, error);
      return false;
    }
  }

  on(eventType: string, handler: MessageHandler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)?.push(handler);

    // If socket is already connected, attach the listener directly
    // Also, re-register listeners upon reconnection (handled in 'connect' event)
    this.socket?.on(eventType, handler);
  }

  off(eventType: string, handler: MessageHandler) {
    this.socket?.off(eventType, handler); // Remove listener from socket

    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
        if (handlers.length === 0) {
          this.eventHandlers.delete(eventType);
        }
      }
    }
  }

  onConnectionChange(handler: ConnectionChangeHandler) {
    this.connectionHandlers.push(handler);
    // Immediately notify with current status
    if (handler) {
      setTimeout(() => handler(this.isConnected), 0);
    }
  }

  offConnectionChange(handler: ConnectionChangeHandler) {
    const index = this.connectionHandlers.indexOf(handler);
    if (index !== -1) {
      this.connectionHandlers.splice(index, 1);
    }
  }

  private handleMessage(type: string, payload: any) {
    // This method is called by the specific event listeners on the socket
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in handler for ${type}:`, error);
        }
      });
    } else {
      console.log(`Received event type with no app-level handlers: ${type}`);
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

  // scheduleReconnect, setupPingPong can be removed as Socket.IO handles these.

  isConnectedToServer(): boolean {
    return this.isConnected;
  }

  getClientId(): string { // Application-specific client ID
    return this.clientId;
  }

  getSocketId(): string | undefined { // Socket.IO's connection ID
    return this.socket?.id;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      // No need to nullify this.socket immediately, 'disconnect' event will handle state.
      console.log("Socket.IO disconnect called by client.");
    }
    // Clear intervals if any were missed (though they should be removed)
  }
}

const websocketService = new WebSocketService();
export default websocketService;