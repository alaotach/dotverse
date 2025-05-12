const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Keep track of all connected clients
const clients = new Map();
let nextClientId = 1;

// Handle new WebSocket connections
wss.on('connection', (ws) => {
  const clientId = `client_${nextClientId++}`;
  clients.set(ws, { id: clientId });
  console.log(`New client connected: ${clientId}. Total clients: ${clients.size}`);
  
  // Send initial welcome message
  ws.send(JSON.stringify({
    type: 'connection_established',
    payload: { clientId, message: 'Connection established with server' }
  }));

  // Handle messages from client
  ws.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      console.log(`Received ${parsedMessage.type} from ${clients.get(ws).id}`);
      
      // Handle different message types
      switch (parsedMessage.type) {
        case 'client_register':
          // Update client info with client-provided ID if available
          if (parsedMessage.payload && parsedMessage.payload.clientId) {
            clients.get(ws).id = parsedMessage.payload.clientId;
            console.log(`Client ID updated to: ${parsedMessage.payload.clientId}`);
          }
          break;
          
        case 'pixel_update':
          // Broadcast pixel updates to all other clients
          broadcastToOthers(ws, {
            type: 'pixel_update',
            payload: parsedMessage.payload
          });
          break;
          
        case 'canvas_reset':
          // Broadcast canvas reset to all clients
          broadcast({
            type: 'canvas_reset',
            payload: parsedMessage.payload
          });
          break;
          
        default:
          console.log(`Unknown message type: ${parsedMessage.type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    const clientInfo = clients.get(ws);
    console.log(`Client disconnected: ${clientInfo ? clientInfo.id : 'unknown'}`);
    clients.delete(ws);
  });
});

// Broadcast message to all clients except sender
function broadcastToOthers(sender, message) {
  const messageString = JSON.stringify(message);
  clients.forEach((clientInfo, client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  });
}

// Broadcast message to all connected clients
function broadcast(message) {
  const messageString = JSON.stringify(message);
  clients.forEach((clientInfo, client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  });
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    connections: clients.size,
    uptime: process.uptime()
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
