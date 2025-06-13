import { io, Socket } from 'socket.io-client';
import { Room, RoomPlayer, CreateRoomData, JoinRoomData, RoomEvent } from '../types/Room';

interface ServerResponse<T = any> {
  success: boolean;
  error?: string;
  data?: T;
  room?: Room;
  playerId?: string;
}

class SocketService {
  public socket: Socket | null = null;
  private eventListeners: Map<string, ((event: RoomEvent | any) => void)[]> = new Map();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor() {
    this.connect();
  }

  private connect() {
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
    
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Connected to UNO server');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emitGlobalEvent({ type: 'CONNECTION_STATUS_CHANGED', isConnected: true });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server:', reason);
      this.isConnected = false;
      this.emitGlobalEvent({ type: 'CONNECTION_STATUS_CHANGED', isConnected: false });
      
      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'ping timeout') {
        this.handleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔴 Connection error:', error);
      this.isConnected = false;
      this.emitGlobalEvent({ type: 'CONNECTION_STATUS_CHANGED', isConnected: false });
      this.handleReconnect();
    });

    this.socket.on('rooms-updated', (rooms: Omit<Room, 'password'>[]) => {
      this.emitGlobalEvent({ type: 'ROOMS_UPDATED', rooms });
    });

    this.socket.on('current-room', (eventData: RoomEvent) => {
      console.log("[SocketService] Received 'current-room' event:", eventData);
      this.emitRoomEvent(eventData);
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
      
      console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
      
      setTimeout(() => {
        if (this.socket && !this.socket.connected) {
          this.socket.connect();
        }
      }, delay);
    } else {
      console.error('❌ Max reconnection attempts reached');
      this.emitGlobalEvent({ type: 'CONNECTION_FAILED' });
      if (this.socket) {
        this.socket.disconnect();
      }
    }
  }

  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  async createRoom(data: CreateRoomData): Promise<{ success: boolean; room?: Room; playerId?: string; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve({ success: false, error: 'Không có kết nối đến server' });
        return;
      }

      this.socket.emit('create-room', data, (response: ServerResponse) => {
        resolve(response);
      });
    });
  }

  async joinRoom(data: JoinRoomData): Promise<{ success: boolean; room?: Room; playerId?: string; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve({ success: false, error: 'Không có kết nối đến server' });
        return;
      }

      this.socket.emit('join-room', data, (response: ServerResponse) => {
        resolve(response);
      });
    });
  }

  leaveRoom(): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('leave-room');
    }
  }

  async toggleReady(roomId: string): Promise<{ success: boolean; isReady?: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve({ success: false, error: 'Không có kết nối đến server' });
        return;
      }

      this.socket.emit('toggle-ready', { roomId }, (response: { success: boolean; isReady?: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }

  async startGame(roomId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve({ success: false, error: 'Không có kết nối đến server' });
        return;
      }

      this.socket.emit('start-game', { roomId }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }

  async kickPlayer(roomId: string, targetPlayerId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve({ success: false, error: 'Không có kết nối đến server' });
        return;
      }

      this.socket.emit('kick-player', { roomId, targetPlayerId }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }

  async getActiveRooms(): Promise<Omit<Room, 'password'>[]> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve([]);
        return;
      }

      this.socket.emit('get-rooms', (rooms: Omit<Room, 'password'>[]) => {
        resolve(rooms);
      });
    });
  }

  addEventListener(eventName: string, callback: (event: RoomEvent | any) => void): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    
    const listeners = this.eventListeners.get(eventName)!;
    listeners.push(callback);

    return () => {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  private emitRoomEvent(event: RoomEvent | any): void {
    const listeners = this.eventListeners.get('current-room');
    if (listeners) {
        listeners.forEach(callback => callback(event));
    }
  }

  private emitGlobalEvent(event: any): void {
    const listeners = this.eventListeners.get('__global__');
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.eventListeners.clear();
  }
}

export const socketService = new SocketService();

window.addEventListener('beforeunload', () => {
  socketService.disconnect();
});