import { io, Socket } from 'socket.io-client';
import type { Lobby, PlayerPosition, PlayerInput } from '@solana-defender/shared';

// Support separate socket URL for production (when Socket.IO is on different server)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';

export class SocketClient {
  private socket: Socket | null = null;
  private jwtToken: string | null = null;

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    this.jwtToken = token;
    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
    });

    this.socket.on('error', (error) => {
      console.error('[Socket] Error:', error);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinLobby(lobbyId: string): void {
    if (!this.socket || !this.socket.connected) {
      console.warn('[Socket] Cannot join lobby - socket not connected');
      return;
    }
    this.socket.emit('lobby:join', { lobbyId });
  }

  leaveLobby(lobbyId: string): void {
    if (!this.socket || !this.socket.connected) {
      // Silently fail during cleanup - socket might already be disconnected
      return;
    }
    this.socket.emit('lobby:leave', { lobbyId });
  }

  requestLobbyState(lobbyId: string): void {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('lobby:request_state', { lobbyId });
  }

  // Lobby event listeners
  onLobbyState(callback: (data: { lobby: Lobby }) => void): void {
    if (!this.socket) return;
    this.socket.on('lobby:state', callback);
  }

  onLobbyCountdown(callback: (data: { lobbyId: string; countdown: number }) => void): void {
    if (!this.socket) return;
    this.socket.on('lobby:countdown', callback);
  }

  onGameStarted(callback: (data: { lobbyId: string }) => void): void {
    if (!this.socket) return;
    this.socket.on('lobby:game_started', callback);
  }

  onPlayerJoined(callback: (data: { lobbyId: string; walletAddress: string; lobby: Lobby }) => void): void {
    if (!this.socket) return;
    this.socket.on('lobby:player_joined', callback);
  }

  onPlayerLeft(callback: (data: { lobbyId: string; walletAddress: string; lobby: Lobby }) => void): void {
    if (!this.socket) return;
    this.socket.on('lobby:player_left', callback);
  }

  // Game event listeners
  onPlayerInput(callback: (data: { walletAddress: string; keys: any; timestamp: number }) => void): void {
    if (!this.socket) return;
    this.socket.on('game:player_input', callback);
  }

  onPlayerPosition(callback: (data: { walletAddress: string; position: PlayerPosition; timestamp: number }) => void): void {
    if (!this.socket) return;
    this.socket.on('game:player_position', callback);
  }

  // Send game events
  sendPlayerInput(lobbyId: string, keys: { left: boolean; right: boolean; jump: boolean }): void {
    if (!this.socket) return;
    this.socket.emit('game:input', { lobbyId, keys, timestamp: Date.now() });
  }

  sendPlayerPosition(lobbyId: string, position: PlayerPosition): void {
    if (!this.socket) return;
    this.socket.emit('game:position', { lobbyId, position, timestamp: Date.now() });
  }

  // Voice chat events
  sendVoiceState(lobbyId: string, isSpeaking: boolean): void {
    if (!this.socket) return;
    this.socket.emit('game:voice_state', { lobbyId, isSpeaking, timestamp: Date.now() });
  }

  onVoiceState(callback: (data: { walletAddress: string; isSpeaking: boolean; timestamp: number }) => void): void {
    if (!this.socket) return;
    this.socket.on('game:voice_state', callback);
  }

  // WebRTC signaling for voice chat
  sendWebRTCOffer(lobbyId: string, targetAddress: string, offer: RTCSessionDescriptionInit): void {
    if (!this.socket) return;
    this.socket.emit('webrtc:offer', { lobbyId, targetAddress, offer });
  }

  sendWebRTCAnswer(lobbyId: string, targetAddress: string, answer: RTCSessionDescriptionInit): void {
    if (!this.socket) return;
    this.socket.emit('webrtc:answer', { lobbyId, targetAddress, answer });
  }

  sendWebRTCIceCandidate(lobbyId: string, targetAddress: string, candidate: RTCIceCandidateInit): void {
    if (!this.socket) return;
    this.socket.emit('webrtc:ice', { lobbyId, targetAddress, candidate });
  }

  onWebRTCOffer(callback: (data: { fromAddress: string; offer: RTCSessionDescriptionInit }) => void): void {
    if (!this.socket) return;
    this.socket.on('webrtc:offer', callback);
  }

  onWebRTCAnswer(callback: (data: { fromAddress: string; answer: RTCSessionDescriptionInit }) => void): void {
    if (!this.socket) return;
    this.socket.on('webrtc:answer', callback);
  }

  onWebRTCIceCandidate(callback: (data: { fromAddress: string; candidate: RTCIceCandidateInit }) => void): void {
    if (!this.socket) return;
    this.socket.on('webrtc:ice', callback);
  }

  // Remove listeners
  off(event: string, callback?: (...args: any[]) => void): void {
    if (!this.socket) return;
    this.socket.off(event, callback);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

