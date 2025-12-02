# WebRTC Signaling Server

JavaScript-based WebSocket signaling server for WebRTC P2P connections with built-in dashboard.

## Features

- **WebSocket Signaling**: Real-time peer discovery and signaling
- **Built-in Dashboard**: Monitor peers in real-time
- **Room-based**: Supports multiple rooms for peer grouping
- **Source Peer Management**: Automatic source peer detection

## Setup

1. **Install dependencies:**
   ```bash
   cd /home/ubuntu/signaling-server
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   Server runs on port 3002.

3. **Access the dashboard:**
   - Go to `http://localhost:3002/dashboard.html`
   - Monitor all active peer connections

## API

### WebSocket Messages

**Register as peer:**
```json
{
  "action": "register",
  "peerId": "peer_123",
  "roomId": "default",
  "isSource": true
}
```

**Get source peer:**
```json
{
  "action": "get-peer",
  "roomId": "default"
}
```

**Send offer/answer/ICE candidate:**
```json
{
  "action": "offer|answer|ice-candidate",
  "offer|answer|candidate": {...}
}
```

## Architecture

```
Signaling Server (Port 3002)
├── WebSocket Server (Peer connections)
├── Dashboard (Real-time monitoring)
└── Peer Management (Room-based)

Client App (Port 3001)
├── Connects to Signaling Server
├── Establishes P2P via WebRTC
└── Streams via DataChannel
```

## Configuration

- **Port**: Set `PORT` environment variable (default: 3002)
- **WebSocket URL**: Update `SIGNALING_WS` in client apps

