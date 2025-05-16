require('dotenv').config();
const express = require('express');
const http = require('http');
// const WebSocket = require('ws'); // Remove ws
const { Server } = require("socket.io"); // Add socket.io
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
// const wss = new WebSocket.Server({ server }); // Remove ws server initialization

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ["GET", "POST"]
  }
});

// Enable CORS for Express (if you have HTTP routes)
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));

// Client tracking
const clients = new Map(); // Store client data by socket.id
// const HEARTBEAT_INTERVAL = 30000; // Socket.IO handles heartbeats

// Set up WebSocket connection (now Socket.IO connection)
io.on('connection', (socket) => {
  const clientId = socket.id; // Use socket.id as the unique client identifier
  console.log(`Client connected: ${clientId}`);

  // Store client connection
  clients.set(clientId, {
    socket: socket, // Store the socket object itself
    registeredId: null, // For application-level client ID
    lastActivity: Date.now()
  });

  // Handle messages from client
  socket.on('message', async (data) => { // Generic message handler if needed, or specific events
    try {
      // Assuming data is { type: string, payload: any }
      // It's more common with Socket.IO to use named events instead of a single 'message' event
      console.log(`Message from client ${clientId}: type=${data.type}, payload=${JSON.stringify(data.payload)}`);
      const clientData = clients.get(clientId);
      if (!clientData) {
        console.warn(`Received message from unknown client: ${clientId}`);
        return;
      }
      clientData.lastActivity = Date.now();

      // Handle specific events if you migrate from the single 'message' type
      // For now, this switch remains, but ideally, these become direct socket.on('event_name', ...)
      switch (data.type) {
        case 'ping':
          socket.emit('pong', { timestamp: Date.now() });
          break;
        case 'client_register':
          if (data.payload && data.payload.clientId) {
            clientData.registeredId = data.payload.clientId;
            console.log(`Client ${clientId} (socket.id) registered as ${data.payload.clientId} (appId)`);
          }
          break;
        case 'pixel_update':
          if (data.payload) {
            // Broadcast to all other clients
            socket.broadcast.emit('pixel_update', data.payload);
          }
          break;
        case 'canvas_reset':
          // Broadcast canvas reset to all other clients
          socket.broadcast.emit('canvas_reset', data.payload);
          break;
        case 'sync_request':
          // Tell all clients to sync
          io.emit('sync_needed', { timestamp: Date.now() });
          break;
        default:
          console.log(`Unknown message type from client ${clientId}: ${data.type}`);
      }
    } catch (error) {
      console.error(`Error handling message from ${clientId}:`, error);
    }
  });

  // It's more idiomatic in Socket.IO to listen for specific events:
  // Example: socket.on('pixel_update', (payload) => { ... });
  // Example: socket.on('client_register', (payload) => { ... });

  // Handle client disconnect
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${clientId}, reason: ${reason}`);
    clients.delete(clientId);
  });

  // Handle errors (less common to have a generic error handler like this for a socket in Socket.IO)
  // Specific operational errors are usually handled within event handlers or via try-catch
  socket.on('error', (error) => {
    console.error(`Socket error for client ${clientId}:`, error);
    // Consider if client needs to be removed here, disconnect should handle it
  });

  // Send initial connection success message
  socket.emit('connection_established', {
    message: 'Connected to DotVerse server (Socket.IO)',
    timestamp: Date.now(),
    socketId: clientId // Send the socket.id to the client if useful
  });
});

// Heartbeat to check for dead connections - Socket.IO handles this with its own ping/pong.
// The custom interval for `isAlive` can be removed.
// The `lastActivity` check for application-level timeout can remain if needed.
// clearInterval(interval); // If you had an 'interval' variable for the old heartbeat

const APP_LEVEL_TIMEOUT = 5 * 60 * 1000; // 5 minutes for application-level inactivity
setInterval(() => {
  const now = Date.now();
  clients.forEach((clientData, clientId) => {
    if (now - clientData.lastActivity > APP_LEVEL_TIMEOUT) {
      console.log(`Client ${clientId} timed out due to inactivity. Disconnecting.`);
      clientData.socket.disconnect(true); // Force disconnect
      clients.delete(clientId);
    }
  });
}, 60000); // Check every minute


// Broadcast message to all connected clients (or specific groups)
// This function can be adapted or replaced by Socket.IO's built-in methods.
function broadcastToAll(messageType, payload, excludeSocketId = null) {
  if (excludeSocketId) {
    const sender = clients.get(excludeSocketId);
    if (sender) {
      sender.socket.broadcast.emit(messageType, payload);
      console.log(`Broadcasted ${messageType} to all except ${excludeSocketId}`);
    } else {
      io.emit(messageType, payload); // Fallback if sender not found
      console.log(`Broadcasted ${messageType} to all (sender ${excludeSocketId} not found)`);
    }
  } else {
    io.emit(messageType, payload);
    console.log(`Broadcasted ${messageType} to all clients`);
  }
}

app.get('/api/websocket-diagnostics', (req, res) => {
  res.json({
    status: 'running (Socket.IO)',
    activeClients: clients.size,
    // wsServerStatus and wsClientsCount are less relevant or need new metrics for Socket.IO
  });
});

// Test echo endpoint for WebSockets
app.get('/api/echo/:message', (req, res) => {
  const message = req.params.message || 'Test message';
  broadcastToAll('echo', { // Use the new broadcast function or direct io.emit
    message,
    timestamp: Date.now()
  });
  res.json({
    status: 'ok',
    message: `Echo sent: ${message}`,
    recipients: clients.size
  });
});

// Basic REST API endpoints
app.get('/api/status', (req, res) => {
// ...existing code...
  res.json({
    status: 'ok',
    clients: clients.size,
    uptime: process.uptime()
  });
});

app.get('/api/clients', (req, res) => {
  const clientInfo = [];
  clients.forEach((clientData, id) => {
    clientInfo.push({
      id: id.substring(0, 8) + '...', // socket.id
      registeredId: clientData.registeredId ? clientData.registeredId.substring(0, 8) + '...' : null,
      lastActivity: clientData.lastActivity
    });
  });
  res.json(clientInfo);
});

app.get('/api/sync', (req, res) => {
  broadcastToAll('sync_needed', { timestamp: Date.now() }); // Use new broadcast
  res.json({
    status: 'ok',
    message: 'Sync request broadcasted to all clients'
  });
});

// Handle server shutdown
process.on('SIGINT', () => {
  // clearInterval(interval); // Clear the new interval if you have one
  console.log('Shutting down server...');
  io.close(() => { // Close all Socket.IO connections
    console.log('All Socket.IO connections closed.');
    server.close(() => {
      console.log('HTTP server closed. Exiting process.');
      process.exit(0);
    });
  });
});

// Start server
const PORT = process.env.PORT || 8080;
// ...existing code...
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with Socket.IO`);
});