require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (process.env.FIREBASE_ADMIN_CREDENTIALS) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.log("Firebase Admin initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
  }
}

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Enable CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));

// Client tracking
const clients = new Map();
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// Set up WebSocket connection
wss.on('connection', (ws, req) => {
  const clientId = req.headers['sec-websocket-key'] || Math.random().toString(36).substring(2, 15);
  console.log(`Client connected: ${clientId}`);
  
  // Store client connection
  clients.set(clientId, {
    ws,
    isAlive: true,
    registeredId: null,
    lastActivity: Date.now()
  });
  
  // Setup ping to keep connection alive
  ws.on('pong', () => {
    if (clients.has(clientId)) {
      clients.get(clientId).isAlive = true;
    }
  });
  
  // Handle messages from client
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      const client = clients.get(clientId);
      
      if (!client) {
        console.warn(`Received message from unknown client: ${clientId}`);
        return;
      }
      
      // Update last activity time
      client.lastActivity = Date.now();
      
      switch (data.type) {
        case 'client_register':
          // Record the client's application-level ID for potential authentication later
          if (data.payload && data.payload.clientId) {
            client.registeredId = data.payload.clientId;
            console.log(`Client ${clientId} registered as ${data.payload.clientId}`);
          }
          break;
          
        case 'pixel_update':
          // Broadcast pixel updates to all other clients
          if (data.payload) {
            broadcastToAll({
              type: 'pixel_update',
              payload: data.payload
            }, clientId);
            
            // Optionally, for larger deployments, implement rate limiting here
          }
          break;
          
        case 'canvas_reset':
          // Broadcast canvas reset to all clients
          broadcastToAll({
            type: 'canvas_reset',
            payload: data.payload
          }, clientId);
          break;
          
        case 'sync_request':
          // Tell clients to sync with Firebase (useful after server restart)
          broadcastToAll({
            type: 'sync_needed',
            payload: { timestamp: Date.now() }
          });
          break;
          
        default:
          console.log(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });
  
  // Handle client disconnect
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    clients.delete(clientId);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    clients.delete(clientId);
  });
  
  // Send initial connection success message
  ws.send(JSON.stringify({
    type: 'connection_established',
    payload: { 
      message: 'Connected to DotVerse server',
      timestamp: Date.now()
    }
  }));
});

// Heartbeat to check for dead connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    let clientId = null;
    
    // Find the client ID for this WebSocket
    for (const [id, client] of clients.entries()) {
      if (client.ws === ws) {
        clientId = id;
        break;
      }
    }
    
    if (!clientId) return;
    
    const client = clients.get(clientId);
    
    if (client.isAlive === false) {
      console.log(`Terminating inactive client: ${clientId}`);
      clients.delete(clientId);
      return ws.terminate();
    }
    
    client.isAlive = false;
    ws.ping();
    
    // Also check for timeout (no activity for 5 minutes)
    const TIMEOUT = 5 * 60 * 1000; // 5 minutes
    if (Date.now() - client.lastActivity > TIMEOUT) {
      console.log(`Client timed out: ${clientId}`);
      clients.delete(clientId);
      ws.terminate();
    }
  });
}, HEARTBEAT_INTERVAL);

// Broadcast message to all connected clients
function broadcastToAll(message, excludeClientId = null) {
  const messageString = JSON.stringify(message);
  let count = 0;
  
  clients.forEach((client, id) => {
    if (id !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(messageString);
      count++;
    }
  });
  
  console.log(`Broadcasted ${message.type} to ${count} clients`);
}

// Basic REST API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    clients: clients.size,
    uptime: process.uptime()
  });
});

app.get('/api/clients', (req, res) => {
  const clientInfo = [];
  
  clients.forEach((client, id) => {
    clientInfo.push({
      id: id.substring(0, 8) + '...',  // Don't expose full IDs
      registeredId: client.registeredId ? client.registeredId.substring(0, 8) + '...' : null,
      lastActivity: client.lastActivity
    });
  });
  
  res.json(clientInfo);
});

app.get('/api/sync', (req, res) => {
  broadcastToAll({
    type: 'sync_needed',
    payload: { timestamp: Date.now() }
  });
  
  res.json({
    status: 'ok',
    message: 'Sync request broadcasted to all clients'
  });
});

// Handle server shutdown
process.on('SIGINT', () => {
  clearInterval(interval);
  
  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    ws.close();
  });
  
  // Close HTTP server
  server.close(() => {
    console.log('Server closed. Exiting process.');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
