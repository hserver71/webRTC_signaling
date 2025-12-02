const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '../public')));

const peers = new Map();
const rooms = new Map();

function getRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
    }
    return rooms.get(roomId);
}

function broadcastToRoom(roomId, data, excludeWs) {
    const room = rooms.get(roomId);
    if (room) {
        room.forEach((peerData, ws) => {
            if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
            }
        });
    }
}

function getPeersList() {
    const list = [];
    peers.forEach((peer, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            list.push({
                peerId: peer.peerId,
                isSource: peer.isSource || false,
                roomId: peer.roomId || 'default',
                timestamp: peer.timestamp || Date.now(),
                connected: true
            });
        }
    });
    return list;
}

wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.action === 'register') {
                const peerId = data.peerId || `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const roomId = data.roomId || 'default';
                const isSource = data.isSource || false;
                
                const peerData = {
                    peerId: peerId,
                    roomId: roomId,
                    isSource: isSource,
                    timestamp: Date.now(),
                    offer: null,
                    answer: null,
                    iceCandidates: []
                };
                
                peers.set(ws, peerData);
                const room = getRoom(roomId);
                room.set(ws, peerData);
                
                ws.peerId = peerId;
                ws.roomId = roomId;
                
                ws.send(JSON.stringify({
                    action: 'registered',
                    peerId: peerId,
                    roomId: roomId,
                    isSource: isSource
                }));
                
                broadcastDashboardUpdate();
                console.log(`Peer registered: ${peerId} (${isSource ? 'Source' : 'Client'})`);
            }
            
            if (data.action === 'get-peer') {
                const roomId = data.roomId || ws.roomId || 'default';
                const room = getRoom(roomId);
                
                let sourcePeer = null;
                room.forEach((peerData, peerWs) => {
                    if (peerData.isSource && peerWs !== ws && peerWs.readyState === WebSocket.OPEN) {
                        sourcePeer = { ...peerData };
                        sourcePeer.ws = peerWs;
                    }
                });
                
                if (sourcePeer) {
                    ws.send(JSON.stringify({
                        action: 'peer-found',
                        peer: {
                            peerId: sourcePeer.peerId,
                            offer: sourcePeer.offer,
                            isSource: true
                        }
                    }));
                } else {
                    ws.send(JSON.stringify({
                        action: 'peer-not-found'
                    }));
                }
            }
            
            if (data.action === 'update-peer') {
                const peerData = peers.get(ws);
                if (peerData) {
                    if (data.offer) {
                        peerData.offer = data.offer;
                    }
                    if (data.answer) {
                        peerData.answer = data.answer;
                    }
                    if (data.iceCandidate) {
                        if (!peerData.iceCandidates) {
                            peerData.iceCandidates = [];
                        }
                        peerData.iceCandidates.push(data.iceCandidate);
                    }
                    
                    if (data.offer) {
                        broadcastToRoom(ws.roomId, {
                            action: 'offer',
                            offer: peerData.offer,
                            fromPeerId: peerData.peerId
                        }, ws);
                        
                        broadcastToRoom(ws.roomId, {
                            action: 'peer-updated',
                            peerId: peerData.peerId,
                            offer: peerData.offer,
                            answer: peerData.answer
                        }, ws);
                    }
                    
                    if (data.answer) {
                        broadcastToRoom(ws.roomId, {
                            action: 'answer',
                            answer: peerData.answer,
                            fromPeerId: peerData.peerId
                        }, ws);
                    }
                }
                broadcastDashboardUpdate();
            }
            
            if (data.action === 'get-peer-updates') {
                const targetPeerId = data.peerId;
                let targetPeer = null;
                
                peers.forEach((peerData, peerWs) => {
                    if (peerData.peerId === targetPeerId) {
                        targetPeer = peerData;
                    }
                });
                
                if (targetPeer) {
                    ws.send(JSON.stringify({
                        action: 'peer-updates',
                        offer: targetPeer.offer,
                        answer: targetPeer.answer,
                        iceCandidates: targetPeer.iceCandidates || []
                    }));
                }
            }
            
            if (data.action === 'offer' || data.action === 'answer' || data.action === 'ice-candidate') {
                const peerData = peers.get(ws);
                if (peerData) {
                    broadcastToRoom(ws.roomId, {
                        ...data,
                        fromPeerId: peerData.peerId
                    }, ws);
                }
            }
            
            if (data.action === 'dashboard-connect') {
                ws.isDashboard = true;
                ws.send(JSON.stringify({
                    action: 'dashboard-connected',
                    peers: getPeersList(),
                    stats: {
                        totalPeers: peers.size,
                        sourcePeers: Array.from(peers.values()).filter(p => p.isSource).length,
                        clientPeers: Array.from(peers.values()).filter(p => !p.isSource).length
                    }
                }));
            }
            
            if (data.action === 'remove-peer') {
                const peerId = data.peerId;
                let found = false;
                peers.forEach((peerData, peerWs) => {
                    if (peerData.peerId === peerId) {
                        peerWs.close();
                        peers.delete(peerWs);
                        if (peerWs.roomId) {
                            const room = getRoom(peerWs.roomId);
                            room.delete(peerWs);
                        }
                        found = true;
                    }
                });
                
                if (found) {
                    broadcastDashboardUpdate();
                    ws.send(JSON.stringify({
                        action: 'peer-removed',
                        peerId: peerId,
                        success: true
                    }));
                }
            }
            
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });
    
    ws.on('close', () => {
        const peerData = peers.get(ws);
        if (peerData) {
            console.log(`Peer disconnected: ${peerData.peerId}`);
            peers.delete(ws);
            
            if (ws.roomId) {
                const room = getRoom(ws.roomId);
                room.delete(ws);
                
                if (room.size === 0) {
                    rooms.delete(ws.roomId);
                } else {
                    broadcastToRoom(ws.roomId, {
                        action: 'peer-left',
                        peerId: peerData.peerId
                    }, ws);
                }
            }
        }
        broadcastDashboardUpdate();
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

function broadcastDashboardUpdate() {
    const peersList = getPeersList();
    const stats = {
        totalPeers: peersList.length,
        sourcePeers: peersList.filter(p => p.isSource).length,
        clientPeers: peersList.filter(p => !p.isSource).length
    };
    
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.isDashboard) {
            client.send(JSON.stringify({
                action: 'dashboard-update',
                peers: peersList,
                stats: stats
            }));
        }
    });
}

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
    console.log(`Signaling Server running on http://localhost:${PORT}`);
    console.log(`Dashboard available at http://localhost:${PORT}/dashboard.html`);
});

