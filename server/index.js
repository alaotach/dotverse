require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 45000,   
  pingInterval: 20000,   
  upgradeTimeout: 30000,
  connectTimeout: 20000, 
  

  transports: ['polling', 'websocket'],
  allowUpgrades: true,
  

  serveClient: false,
  allowEIO3: true,
  cookie: false,

  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    console.log(`[Server] Connection request from origin: ${origin}`);
    callback(null, true);
  }
});

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));

const pixelData = new Map();
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const SNAPSHOT_FILE_PATH = path.join(__dirname, 'data', 'pixel_snapshot.json');

const clients = new Map();

io.on('connection', (socket) => {
  const clientId = socket.id;
  console.log(`Client connected: ${clientId}`);

  clients.set(clientId, {
    socket: socket,
    registeredId: null,
    lastActivity: Date.now()
  });

  socket.emit('initial_state', Array.from(pixelData.entries()).map(
    ([key, data]) => {
      const [x, y] = key.split(':').map(Number);
      return { x, y, ...data };
    }
  ));

  socket.on('client_register', (data) => {
    const clientData = clients.get(clientId);
    if (clientData) {
      clientData.registeredId = data.clientId;
      clientData.lastActivity = Date.now();
      console.log(`Client ${clientId} registered as ${data.clientId}`);
    }
  });

  socket.on('pixel_update', (pixels) => {
    const clientData = clients.get(clientId);
    if (!clientData) {
      console.warn(`Received pixel update from unknown client: ${clientId}`);
      return;
    }
    
    clientData.lastActivity = Date.now();

    if (Array.isArray(pixels)) {
      pixels.forEach(pixel => {        if (pixel && typeof pixel.x === 'number' && typeof pixel.y === 'number' && pixel.color) {
          const key = `${pixel.x}:${pixel.y}`;
          
          const pixelDataToStore = {
            color: pixel.color,
            timestamp: pixel.timestamp || Date.now(),
            clientId: pixel.clientId || clientData.registeredId || clientId
          };
          
          if (pixel.stickerId) {
            pixelDataToStore.stickerId = pixel.stickerId;
          }
          
          pixelData.set(key, pixelDataToStore);          console.log(`Stored pixel at ${key}: ${pixel.color}${pixel.stickerId ? ` (sticker: ${pixel.stickerId})` : ''}`);
          
          socket.broadcast.emit('pixel_update', [pixel]);
        }
      });
    }
  });

  socket.on('canvas_reset', (data) => {
    const clientData = clients.get(clientId);
    if (!clientData) {
      console.warn(`Canvas reset from unregistered client: ${clientId}`);
      return;
    }
    
    clientData.lastActivity = Date.now();
    
    console.log(`Canvas reset by ${clientId}:`, data);
    
    if (data.type === 'land_clear' && data.landArea) {
      const { centerX, centerY, size } = data.landArea;
      const halfSize = Math.floor(size / 2);
      
      let clearedCount = 0;
      for (let y = centerY - halfSize; y <= centerY + halfSize; y++) {
        for (let x = centerX - halfSize; x <= centerX + halfSize; x++) {
          const pixelKey = `${x}:${y}`;
          if (pixelData.has(pixelKey)) {
            pixelData.set(pixelKey, {
              color: "#ffffff",
              timestamp: data.timestamp || Date.now(),
              clientId: data.clientId || clientId
            });
            clearedCount++;
          }
        }
      }
      
      console.log(`Cleared ${clearedCount} pixels from server data for land at (${centerX}, ${centerY})`);
      
      socket.broadcast.emit('canvas_reset', {
        ...data,
        serverProcessed: true,
        clearedPixels: clearedCount
      });

    } else {
      console.log('Full canvas reset - clearing all pixel data');
      pixelData.clear();
      socket.broadcast.emit('canvas_reset', {
        type: 'full_clear',
        timestamp: Date.now(),
        serverProcessed: true
      });
    }
  });
  socket.on('sync_request', () => {
    const allPixels = Array.from(pixelData.entries()).map(([key, data]) => {
      const [x, y] = key.split(':').map(Number);
      return { x, y, ...data };
    });
    const BATCH_SIZE = 1000;
    for (let i = 0; i < allPixels.length; i += BATCH_SIZE) {
      const batch = allPixels.slice(i, i + BATCH_SIZE);
      socket.emit('sync_data', batch);
    }
    
    socket.emit('sync_complete', { 
      totalPixels: allPixels.length,
      timestamp: Date.now()
    });
    
    console.log(`Sent sync data to ${clientId}: ${allPixels.length} pixels`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${clientId}, reason: ${reason}`);
    clients.delete(clientId);
  });

  socket.emit('connection_established', {
    message: 'Connected to DotVerse server',
    timestamp: Date.now(),
    socketId: clientId
  });
  socket.on('error', (error) => {
    console.error(`Socket error for client ${clientId}:`, error);
  });

  socket.on('heartbeat', (data) => {
    const clientData = clients.get(clientId);
    if (clientData) {
      clientData.lastActivity = Date.now();
      
      socket.emit('heartbeat_ack', { 
        timestamp: Date.now(),
        clientTimestamp: data.timestamp,
        serverTime: new Date().toISOString()
      });
      
      console.log(`[Server] Received heartbeat from ${clientId}, sent ack`);
    }
  });

  socket.on('ping', (callback) => {
    const clientData = clients.get(clientId);
    if (clientData) {
      clientData.lastActivity = Date.now();
    }
    
    
    socket.emit('pong');
    console.log(`[Server] Received ping from ${clientId}, sent pong`);
    
    if (typeof callback === 'function') {
      callback();
    }
  });

  socket.on('pong', () => {
    console.log(`[Server] Received pong from ${clientId}`);
    const clientData = clients.get(clientId);
    if (clientData) {
      clientData.lastActivity = Date.now();
    }
  });


});

async function saveSnapshot() {
  try {
    await fs.mkdir(path.dirname(SNAPSHOT_FILE_PATH), { recursive: true });
    
    const serializedData = Array.from(pixelData.entries()).map(([key, data]) => ({
      key,
      data
    }));
    
    await fs.writeFile(
      SNAPSHOT_FILE_PATH,
      JSON.stringify(serializedData),
      'utf8'
    );
    
    console.log(`Snapshot saved with ${pixelData.size} pixels`);
  } catch (error) {
    console.error('Error saving snapshot:', error);
  }
}

async function loadSnapshot() {
  try {
    const data = await fs.readFile(SNAPSHOT_FILE_PATH, 'utf8');
    const parsedData = JSON.parse(data);
    
    pixelData.clear();
    parsedData.forEach(item => {
      pixelData.set(item.key, item.data);
    });
    
    console.log(`Snapshot loaded with ${pixelData.size} pixels`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No snapshot file found, starting with empty canvas');
    } else {
      console.error('Error loading snapshot:', error);
    }
  }
}

setInterval(saveSnapshot, SNAPSHOT_INTERVAL_MS);


const APP_LEVEL_TIMEOUT = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  clients.forEach((clientData, clientId) => {
    if (now - clientData.lastActivity > APP_LEVEL_TIMEOUT) {
      console.log(`Client ${clientId} timed out due to inactivity. Disconnecting.`);
      clientData.socket.disconnect(true);
      clients.delete(clientId);
    }
  });
}, 60000);

process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  await saveSnapshot();
  
  io.close(() => {
    console.log('All Socket.IO connections closed.');
    server.close(() => {
      console.log('HTTP server closed. Exiting process.');
      process.exit(0);
    });
  });
});


loadSnapshot().then(() => {
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} with Socket.IO`);
  });
});