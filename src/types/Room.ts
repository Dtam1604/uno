// src/types/Room.ts

export interface RoomPlayer {
    id: string;
    name: string;
    socketId: string;
    isHost: boolean;
    isReady: boolean;
    joinedAt: Date;
}

export interface Room {
    id: string;
    name: string;
    hostId: string;
    hostName: string;
    maxPlayers: number;
    currentPlayers: number;
    hasPassword: boolean;
    password?: string;
    players: RoomPlayer[];
    status: 'waiting' | 'playing' | 'finished';
    createdAt: Date;
    gameInProgress: boolean;
    gameState: any | null; // Define a more specific type later for game state
}

export interface CreateRoomData {
    name: string;
    hostName: string;
    maxPlayers: number;
    password?: string;
}

export interface JoinRoomData {
    roomId: string;
    playerName: string;
    password?: string;
}

// CẬP NHẬT: Đảm bảo mọi RoomEvent từ 'current-room' đều có 'room: Room'
export type RoomEvent = 
  | { type: 'ROOM_UPDATED'; room: Room }
  | { type: 'PLAYER_JOINED'; player: RoomPlayer; room: Room } // Thêm room: Room
  | { type: 'PLAYER_LEFT'; leavingPlayerId: string; newHostId?: string; room: Room } // Thêm room: Room
  | { type: 'PLAYER_KICKED'; kickedPlayerId: string; room: Room } // Thêm room: Room
  | { type: 'HOST_CHANGED'; newHostId: string; room: Room } // Thêm room: Room
  | { type: 'GAME_STARTED'; room: Room } // Game started event should always have the updated room
  | { type: 'KICKED_FROM_ROOM' } // Sự kiện này cho người bị kick, không cần room
  | { type: 'ROOM_DELETED'; roomId: string; message?: string }; // Sự kiện này cũng không cần room

// Global events (SocketService will emit these via '__global__' eventListeners)
export type GlobalEvent = 
  | { type: 'ROOMS_UPDATED'; rooms: Omit<Room, 'password'>[] }
  | { type: 'CONNECTION_STATUS_CHANGED'; isConnected: boolean }
  | { type: 'CONNECTION_FAILED' };