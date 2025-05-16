# DotVerse WebSocket Architecture

This document explains the WebSocket architecture used for real-time multiplayer drawing in DotVerse.

## Overview

DotVerse uses a hybrid architecture:
- **WebSockets** for real-time drawing updates, user presence, and immediate sync
- **Firestore/Firebase** for persistent storage and data retrieval

This architecture allows for:
1. Fast real-time updates between users (low latency)
2. Reduced database load (fewer writes to Firebase)
3. Better scalability
4. More responsive drawing experience

## Components

### 1. WebSocket Server (Node.js)

Located in `server/websocket-server.js`, this server:
- Maintains persistent connections with clients
- Distributes pixel updates in real-time
- Handles user presence (who's online)
- Caches recent pixel updates to send to new connections
- Manages client reconnection

### 2. Frontend WebSocket Service

Located in `frontend/src/services/websocketService.ts`, this service:
- Connects to the WebSocket server
- Sends drawing events
- Receives real-time updates from other users
- Handles reconnection logic
- Provides an event-based API for components

### 3. Integration with Canvas Component

The Canvas component:
1. Uses WebSockets as the primary channel for real-time drawing
2. Sends pixel updates via WebSocket first for immediate distribution
3. Persists to Firebase in the background for permanent storage
4. Falls back to direct Firebase writes if WebSocket is disconnected

## Data Flow

1. **User draws a pixel:**
   - Update is shown immediately on user's screen (optimistic update)
   - Update is sent via WebSocket to the server
   - Update is stored in local cache

2. **WebSocket server receives pixel update:**
   - Validates the update
   - Broadcasts to all other connected clients
   - Adds to recent updates cache

3. **Other clients receive the update:**
   - Update is applied to their canvas immediately
   - No need to query the database

4. **Background persistence:**
   - The original client persists the update to Firebase after a short delay
   - This happens in the background without affecting drawing responsiveness

## Benefits of This Architecture

- **Latency**: Updates appear almost instantly for all users
- **Responsiveness**: Drawing feels immediate with no delays
- **Efficiency**: Reduces Firebase operations (and costs)
- **Scalability**: WebSockets handle high-frequency events better than databases
- **Reliability**: Falls back to direct database if WebSockets fail

## Deployment Notes

For production, consider:

1. Deploying the WebSocket server on a separate instance
2. Using a WebSocket service like Socket.io, Pusher, or AWS WebSockets
3. Setting up load balancing for WebSocket connections
4. Implementing authentication for WebSocket connections
