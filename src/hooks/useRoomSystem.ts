// src/hooks/useRoomSystem.ts

import { useState, useEffect, useCallback } from 'react';
import { Room, RoomPlayer, CreateRoomData, JoinRoomData, RoomEvent } from '../types/Room';
import { socketService } from '../services/SocketService';

interface RoomSystemState {
  currentRoom: Room | undefined;
  currentPlayerId: string | undefined;
  isHost: boolean;
  activeRooms: Omit<Room, 'password'>[];
  loading: boolean;
  error: string | null;
  isConnected: boolean;
}

export function useRoomSystem() {
  const [state, setState] = useState<RoomSystemState>({
    currentRoom: undefined,
    currentPlayerId: undefined,
    isHost: false,
    activeRooms: [],
    loading: false,
    error: null,
    isConnected: false
  });

  useEffect(() => {
    if (!socketService.socket) return;

    const onConnect = () => {
      console.log("[useRoomSystem] Socket connected.");
      setState(prev => ({ ...prev, isConnected: true }));
      loadActiveRooms();
    };

    const onDisconnect = (reason: string) => {
      console.log("[useRoomSystem] Socket disconnected:", reason);
      setState(prev => ({ 
        ...prev, 
        isConnected: false,
      }));
      if (reason === 'io server disconnect' || reason === 'transport close') {
          setState(prev => ({ ...prev, error: 'Mất kết nối đến server. Vui lòng thử lại.' }));
      }
    };

    socketService.socket.on('connect', onConnect);
    socketService.socket.on('disconnect', onDisconnect);

    setState(prev => ({ ...prev, isConnected: socketService.isSocketConnected() }));
    if (socketService.isSocketConnected()) {
        loadActiveRooms();
    }

    return () => {
      socketService.socket?.off('connect', onConnect);
      socketService.socket?.off('disconnect', onDisconnect);
    };
  }, [socketService.socket]);

  const loadActiveRooms = useCallback(async () => {
    if (!socketService.isSocketConnected()) {
      setState(prev => ({ ...prev, activeRooms: [], loading: false }));
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true, error: null })); 
      const rooms = await socketService.getActiveRooms();
      setState(prev => ({ ...prev, activeRooms: rooms, loading: false }));
    } catch (error) {
      console.error('Failed to load rooms:', error);
      setState(prev => ({ ...prev, error: 'Không thể tải danh sách phòng', loading: false }));
    }
  }, []);

  const createRoom = useCallback(async (data: CreateRoomData) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const result = await socketService.createRoom(data);
      
      if (result.success && result.room && result.playerId) {
        setState(prev => ({
          ...prev,
          currentRoom: result.room,
          currentPlayerId: result.playerId,
          isHost: true,
          loading: false
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: result.error || 'Không thể tạo phòng'
        }));
      }

      return result;
    } catch (error) {
      console.error("Error creating room:", error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Lỗi kết nối đến server'
      }));
      return { success: false, error: 'Lỗi kết nối đến server' };
    }
  }, []);

  const joinRoom = useCallback(async (data: JoinRoomData) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const result = await socketService.joinRoom(data);
      
      if (result.success && result.room && result.playerId) {
        setState(prev => ({
          ...prev,
          currentRoom: result.room,
          currentPlayerId: result.playerId,
          isHost: false,
          loading: false
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: result.error || 'Không thể tham gia phòng'
        }));
      }
      
      return result;
    } catch (error) {
      console.error("Error joining room:", error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Lỗi kết nối đến server'
      }));
      return { success: false, error: 'Lỗi kết nối đến server' };
    }
  }, []);

  const leaveRoom = useCallback(() => {
    socketService.leaveRoom();
    setState(prev => ({
      ...prev,
      currentRoom: undefined,
      currentPlayerId: undefined,
      isHost: false,
      error: null
    }));
  }, []);

  const kickPlayer = useCallback(async (targetPlayerId: string) => {
    if (state.isHost && state.currentRoom) { 
      const result = await socketService.kickPlayer(state.currentRoom.id, targetPlayerId); 
      if (!result.success) {
        setState(prev => ({ ...prev, error: result.error || 'Lỗi không xác định khi kick người chơi!' }));
      }
      return result.success;
    }
    return false;
  }, [state.isHost, state.currentRoom]);

  const startGame = useCallback(async () => {
    if (state.isHost && state.currentRoom) { 
      const result = await socketService.startGame(state.currentRoom.id); 
      if (!result.success) {
        setState(prev => ({ ...prev, error: result.error || 'Lỗi không xác định khi bắt đầu game!' }));
      }
      return result.success;
    }
    return false;
  }, [state.isHost, state.currentRoom]);

  const toggleReady = useCallback(async () => {
    if (state.currentRoom && state.currentPlayerId) {
      const result = await socketService.toggleReady(state.currentRoom.id); 
      if (!result.success) {
        setState(prev => ({ ...prev, error: result.error || 'Lỗi không xác định khi thay đổi trạng thái sẵn sàng!' }));
      }
      return result.success;
    }
    return false;
  }, [state.currentRoom, state.currentPlayerId]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  useEffect(() => {
    if (!socketService.socket) return;

    const unsubscribeRoom = socketService.addEventListener('current-room', (event: RoomEvent) => {
      setState(prev => {
        // Xử lý các sự kiện có thuộc tính 'room' và 'newHostId'
        // TypeScript bây giờ biết rằng nếu event.type là 'HOST_CHANGED', thì 'event.newHostId' sẽ tồn tại
        if ('room' in event && event.room) {
          switch (event.type) {
            case 'ROOM_UPDATED':
            case 'PLAYER_JOINED':
            case 'PLAYER_LEFT':
            case 'PLAYER_KICKED':
            case 'GAME_STARTED':
                console.log(`[useRoomSystem] Cập nhật currentRoom từ sự kiện ${event.type}. Players:`, event.room.players.map(p => p.name));
                return { ...prev, currentRoom: event.room };

            case 'HOST_CHANGED':
                // Khi event.type là 'HOST_CHANGED', TypeScript biết 'newHostId' tồn tại trên 'event'
                // và 'room' cũng tồn tại.
                console.log(`[useRoomSystem] Cập nhật currentRoom và isHost từ sự kiện HOST_CHANGED. New Host ID: ${event.newHostId}`);
                const newIsHostStatus = prev.currentPlayerId === event.newHostId;
                return { 
                    ...prev, 
                    currentRoom: event.room, // Cập nhật cả object room
                    isHost: newIsHostStatus // Cập nhật trạng thái isHost riêng biệt
                };

            default:
                break;
          }
        }
        
        // Xử lý các sự kiện không có thuộc tính 'room' (như KICKED_FROM_ROOM, ROOM_DELETED)
        switch (event.type) {
          case 'KICKED_FROM_ROOM':
            return {
              ...prev,
              currentRoom: undefined,
              currentPlayerId: undefined,
              isHost: false,
              error: 'Bạn đã bị kick khỏi phòng'
            };
            
          case 'ROOM_DELETED':
              if (prev.currentRoom?.id === event.roomId) {
                  return {
                      ...prev,
                      currentRoom: undefined,
                      currentPlayerId: undefined,
                      isHost: false,
                      error: event.message || 'Phòng bạn đang ở đã bị xóa'
                  };
              }
              break;
          
          default:
            break;
        }
        
        return prev;
      });
    });

    const unsubscribeGlobal = socketService.addEventListener('__global__', (event: any) => {
        switch (event.type) {
            case 'ROOMS_UPDATED':
                setState(prev => ({ ...prev, activeRooms: event.rooms }));
                break;
            case 'CONNECTION_FAILED':
                setState(prev => ({ 
                    ...prev, 
                    error: 'Mất kết nối đến server. Vui lòng thử lại.',
                    isConnected: false
                }));
                break;
            case 'CONNECTION_STATUS_CHANGED':
                setState(prev => ({ ...prev, isConnected: event.isConnected }));
                break;
            default:
                break;
        }
    });

    return () => {
      unsubscribeRoom();
      unsubscribeGlobal();
    };
  }, []);

  useEffect(() => {
    loadActiveRooms(); 
    const interval = setInterval(loadActiveRooms, 5000); 
    return () => clearInterval(interval);
  }, [loadActiveRooms]);

  return {
    ...state,
    createRoom,
    joinRoom,
    leaveRoom,
    kickPlayer,
    startGame,
    toggleReady,
    loadActiveRooms,
    clearError
  };
}