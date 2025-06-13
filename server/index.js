import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (in production, use Redis or database)
const rooms = new Map();
const players = new Map(); // socketId -> playerInfo

// Room management functions
function createRoom(data) {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const playerId = uuidv4();
  
  const hostPlayer = {
    id: playerId,
    name: data.hostName,
    socketId: data.socketId,
    isHost: true,
    isReady: true,
    joinedAt: new Date()
  };

  const room = {
    id: roomId,
    name: data.name,
    hostId: playerId,
    hostName: data.hostName,
    maxPlayers: data.maxPlayers,
    currentPlayers: 1,
    hasPassword: !!data.password,
    password: data.password,
    players: [hostPlayer],
    status: 'waiting',
    createdAt: new Date(),
    gameInProgress: false,
    gameState: null
  };

  rooms.set(roomId, room);
  players.set(data.socketId, { playerId, roomId });

  return { room, playerId };
}

function joinRoom(data) {
  const room = rooms.get(data.roomId);
  
  if (!room) {
    return { success: false, error: 'Phòng không tồn tại' };
  }

  if (room.currentPlayers >= room.maxPlayers) {
    return { success: false, error: 'Phòng đã đầy' };
  }

  if (room.hasPassword && room.password !== data.password) {
    return { success: false, error: 'Mật khẩu không đúng' };
  }

  if (room.gameInProgress) {
    return { success: false, error: 'Game đang diễn ra' };
  }

  const playerId = uuidv4();
  const newPlayer = {
    id: playerId,
    name: data.playerName,
    socketId: data.socketId,
    isHost: false,
    isReady: false,
    joinedAt: new Date()
  };

  room.players.push(newPlayer);
  room.currentPlayers++;
  players.set(data.socketId, { playerId, roomId: data.roomId });

  return { success: true, room, playerId };
}

function leaveRoom(socketId) {
  const playerInfo = players.get(socketId);
  if (!playerInfo) return false;

  const room = rooms.get(playerInfo.roomId);
  if (!room) return false;

  // Remove player from room
  // const playerWhoLeft = room.players.find(p => p.socketId === socketId); // Not used
  room.players = room.players.filter(p => p.socketId !== socketId);
  room.currentPlayers--;
  players.delete(socketId);

  // If room is empty, delete it
  if (room.players.length === 0) {
    rooms.delete(playerInfo.roomId);
    return { roomDeleted: true, roomId: playerInfo.roomId };
  }

  let newHostId = null;
  // If host left, assign new host
  if (room.hostId === playerInfo.playerId) {
    const newHost = room.players[0]; // Gán người đầu tiên làm host mới
    room.hostId = newHost.id;
    room.hostName = newHost.name;
    newHost.isHost = true;
    newHostId = newHost.id; // Lưu ID của host mới
  }

  return { room, newHostId, playerId: playerInfo.playerId };
}

function getActiveRooms() {
  return Array.from(rooms.values())
    .filter(room => room.status === 'waiting' && !room.gameInProgress)
    .map(room => {
      // Loại bỏ password trước khi gửi ra ngoài
      const { password, ...publicRoom } = room; 
      return {
        ...publicRoom,
        players: publicRoom.players.map(p => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isReady: p.isReady,
          joinedAt: p.joinedAt // Đảm bảo joinedAt là Date hoặc chuỗi ISO format
        }))
      };
    });
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create room
  socket.on('create-room', (data, callback) => {
    try {
      const { room, playerId } = createRoom({ ...data, socketId: socket.id });
      
      // Join socket room
      socket.join(room.id);
      
      // Send response to the creator
      callback({ success: true, room, playerId });
      
      // Broadcast updated room list to all clients (not just those in a room)
      io.emit('rooms-updated', getActiveRooms());
      
      console.log(`Room created: ${room.id} by ${data.hostName}`);
    } catch (error) {
      console.error("Error creating room:", error);
      callback({ success: false, error: 'Không thể tạo phòng' });
    }
  });

  // Join room
  socket.on('join-room', (data, callback) => {
    try {
      const result = joinRoom({ ...data, socketId: socket.id });
      
      if (result.success) {
        // Join socket room
        socket.join(data.roomId);
        
        // Send response to the joining player
        callback(result); 
        
        // CẬP NHẬT: Phát sự kiện 'current-room' với toàn bộ đối tượng phòng đã cập nhật
        io.to(result.room.id).emit('current-room', {
          type: 'ROOM_UPDATED', 
          room: result.room
        });
        
        // Broadcast updated room list to all clients (những người đang ở RoomBrowser)
        io.emit('rooms-updated', getActiveRooms());
        
        console.log(`${data.playerName} joined room: ${data.roomId}`);
      } else {
        callback(result);
      }
    } catch (error) {
      console.error("Error joining room:", error);
      callback({ success: false, error: 'Không thể tham gia phòng' });
    }
  });

  // Leave room
  socket.on('leave-room', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const room = rooms.get(playerInfo.roomId);
    if (!room) {
        players.delete(socket.id);
        return;
    }

    const roomId = playerInfo.roomId;
    
    const result = leaveRoom(socket.id);
    
    if (result && result.roomDeleted) {
      console.log(`Room ${roomId} deleted as all players left.`);
      socket.leave(roomId);
    } else if (result && result.room) {
      console.log(`Player ${result.playerId} left room ${roomId}. New host: ${result.newHostId}`);
      io.to(roomId).emit('current-room', {
        type: 'PLAYER_LEFT',
        room: result.room,
        leavingPlayerId: result.playerId,
        newHostId: result.newHostId
      });
      socket.leave(roomId);
    } else {
        console.warn(`Leave room operation for socket ${socket.id} returned unexpected result:`, result);
    }
    
    io.emit('rooms-updated', getActiveRooms());
  });

  // Toggle ready status
  socket.on('toggle-ready', (data, callback) => { // 'data' now contains roomId from client
    const playerInfo = players.get(socket.id);
    if (!playerInfo || playerInfo.roomId !== data.roomId) { // Validate roomId
      callback({ success: false, error: 'Thông tin người chơi hoặc phòng không khớp' });
      return;
    }

    const room = rooms.get(playerInfo.roomId);
    if (!room) {
      callback({ success: false, error: 'Phòng không tồn tại' });
      return;
    }

    const player = room.players.find(p => p.id === playerInfo.playerId);
    if (!player || player.isHost) {
      callback({ success: false, error: 'Chủ phòng không cần sẵn sàng' });
      return;
    }

    player.isReady = !player.isReady;
    
    console.log(`Player ${player.name} in room ${room.id} toggled ready to ${player.isReady}`);
    io.to(playerInfo.roomId).emit('current-room', { type: 'ROOM_UPDATED', room: room });
    
    callback({ success: true, isReady: player.isReady });
  });

  // Start game
  socket.on('start-game', (data, callback) => { // 'data' now contains roomId from client
    const playerInfo = players.get(socket.id);
    if (!playerInfo || playerInfo.roomId !== data.roomId) { // Validate roomId
      callback({ success: false, error: 'Thông tin người chơi hoặc phòng không khớp' });
      return;
    }

    const room = rooms.get(playerInfo.roomId);
    if (!room || room.hostId !== playerInfo.playerId) {
      callback({ success: false, error: 'Bạn không phải chủ phòng hoặc phòng không tồn tại' });
      return;
    }

    if (room.players.length < 2) {
      callback({ success: false, error: 'Cần ít nhất 2 người chơi để bắt đầu game' });
      return;
    }

    const allReady = room.players.filter(p => !p.isHost).every(p => p.isReady);
    if (!allReady) {
      callback({ success: false, error: 'Chưa tất cả người chơi sẵn sàng' });
      return;
    }

    room.status = 'playing';
    room.gameInProgress = true;

    room.gameState = {
      currentPlayerIndex: 0,
      direction: 'clockwise',
      phase: 'playing'
    };

    console.log(`Game started in room: ${room.id}`);
    io.to(playerInfo.roomId).emit('current-room', { 
      type: 'GAME_STARTED', 
      room: room
    }); 
    
    io.emit('rooms-updated', getActiveRooms());
    
    callback({ success: true });
  });

  // Get active rooms
  socket.on('get-rooms', (callback) => {
    callback(getActiveRooms());
  });

  // Kick player (host only)
  socket.on('kick-player', (data, callback) => { // 'data' now contains roomId and targetPlayerId
    const playerInfo = players.get(socket.id);
    if (!playerInfo || playerInfo.roomId !== data.roomId) { // Validate roomId
      callback({ success: false, error: 'Thông tin người chơi hoặc phòng không khớp.' });
      return;
    }

    const room = rooms.get(playerInfo.roomId);
    if (!room || room.hostId !== playerInfo.playerId) {
      callback({ success: false, error: 'Bạn không phải chủ phòng hoặc phòng không tồn tại.' });
      return;
    }

    const targetPlayer = room.players.find(p => p.id === data.targetPlayerId);
    if (!targetPlayer || targetPlayer.isHost) {
      callback({ success: false, error: 'Không thể kick chủ phòng hoặc người chơi không tồn tại.' });
      return;
    }

    // Remove player
    room.players = room.players.filter(p => p.id !== data.targetPlayerId);
    room.currentPlayers--;
    
    // Remove from players map
    const targetSocketId = targetPlayer.socketId;
    players.delete(targetSocketId);

    // Disconnect the kicked player
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit('current-room', { type: 'KICKED_FROM_ROOM' });
      targetSocket.leave(playerInfo.roomId);
    }

    // Notify remaining players
    socket.to(playerInfo.roomId).emit('current-room', {
      type: 'PLAYER_KICKED',
      room: room,
      kickedPlayerId: data.targetPlayerId
    });

    // Update room list
    io.emit('rooms-updated', getActiveRooms());

    callback({ success: true });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    const playerInfo = players.get(socket.id);
    if (!playerInfo) {
        console.log(`No player info found for disconnected socket: ${socket.id}`);
        return;
    }
    
    const roomId = playerInfo.roomId;
    const result = leaveRoom(socket.id);

    if (result && result.roomDeleted) {
        console.log(`Room ${result.roomId} deleted due to disconnect.`);
    } else if (result && result.room) {
        console.log(`Player ${result.playerId} disconnected from room ${roomId}. New host: ${result.newHostId}`);
        io.to(roomId).emit('current-room', {
            type: 'PLAYER_LEFT',
            room: result.room,
            leavingPlayerId: result.playerId,
            newHostId: result.newHostId
        });
    } else {
        console.warn(`Disconnect handler for socket ${socket.id} returned unexpected result from leaveRoom:`, result);
    }
    
    io.emit('rooms-updated', getActiveRooms());
  });
});

// REST API endpoints
app.get('/api/rooms', (req, res) => {
  res.json(getActiveRooms());
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeRooms: rooms.size,
    connectedPlayers: players.size
  });
});

// Cleanup old rooms every 5 minutes
setInterval(() => {
  const now = new Date();
  const maxInactiveTime = 30 * 60 * 1000; // 30 minutes

  for (const [roomId, room] of rooms.entries()) {
    const createdAtDate = room.createdAt instanceof Date ? room.createdAt : new Date(room.createdAt);

    if (isNaN(createdAtDate.getTime())) {
        console.warn(`Room ${roomId} has invalid createdAt date. Skipping cleanup for this room.`);
        continue; 
    }

    const inactiveTime = now.getTime() - createdAtDate.getTime();
    
    if (inactiveTime > maxInactiveTime && room.status === 'waiting' && !room.gameInProgress) {
      if (room.players.length > 0) {
        io.to(roomId).emit('current-room', { type: 'ROOM_DELETED', roomId: roomId, message: 'Phòng đã bị xóa do không hoạt động.' });
      }

      room.players.forEach(player => {
        players.delete(player.socketId);
      });
      
      rooms.delete(roomId);
      console.log(`Cleaned up inactive room: ${roomId}`);
      io.emit('rooms-updated', getActiveRooms());
    }
  }
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 UNO Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`🌐 CORS enabled for localhost:5173 and localhost:3000`);
});