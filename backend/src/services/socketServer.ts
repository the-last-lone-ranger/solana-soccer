import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { lobbyManager } from './lobbyManager.js';
import { dbQueries } from '../db/database.js';
import { verifyJWT } from './jwt.js';

interface AuthenticatedSocket extends Socket {
  walletAddress?: string;
}

export function setupSocketServer(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    // Verify JWT token
    const jwtResult = verifyJWT(token);
    if (!jwtResult) {
      return next(new Error('Invalid token'));
    }

    socket.walletAddress = jwtResult.address;
    next();
  });

  // Set up lobby manager callbacks
  lobbyManager.onCountdownUpdate = (lobbyId: string, countdown: number) => {
    console.log(`[Socket] Emitting countdown update for ${lobbyId}: ${countdown}`);
    io.to(`lobby:${lobbyId}`).emit('lobby:countdown', { lobbyId, countdown });
  };

  lobbyManager.onGameStart = async (lobbyId: string) => {
    // Get all players in the lobby from database
    const players = await dbQueries.getLobbyPlayers(lobbyId);
    const playerAddresses = players.map(p => p.walletAddress);
    
    console.log(`[Socket] Game starting for lobby ${lobbyId}, notifying ${playerAddresses.length} players:`, playerAddresses);
    
    // Emit to socket room (for players in waiting room)
    io.to(`lobby:${lobbyId}`).emit('lobby:game_started', { lobbyId });
    
    // Also emit directly to all sockets for players in the lobby (in case they're not in the room)
    playerAddresses.forEach(address => {
      const playerSocket = Array.from(io.sockets.sockets.values()).find(
        (s: AuthenticatedSocket) => s.walletAddress === address
      );
      if (playerSocket) {
        console.log(`[Socket] ✅ Sending game start event directly to ${address}`);
        playerSocket.emit('lobby:game_started', { lobbyId });
      } else {
        console.warn(`[Socket] ⚠️ Player ${address} not connected, cannot send game start event`);
      }
    });
  };

  lobbyManager.onPlayerJoined = async (lobbyId: string, walletAddress: string) => {
    // Small delay to ensure database transaction is fully committed
    // This prevents race conditions where the read happens before the write commits
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Broadcast updated lobby state to all players in the lobby AND to all clients (for lobby browser)
    const lobby = await lobbyManager.getLobbyWithPlayers(lobbyId);
    if (lobby) {
      const playerCount = lobby.players?.length || 0;
      const playerAddresses = lobby.players?.map((p: any) => p.walletAddress) || [];
      
      console.log(`[Socket] onPlayerJoined - lobby ${lobbyId} has ${playerCount} players:`, playerAddresses);
      
      // Verify the joining player is actually in the list
      if (!playerAddresses.includes(walletAddress)) {
        console.error(`[Socket] WARNING: Player ${walletAddress} joined but not found in lobby ${lobbyId} players list!`);
        // Still broadcast, but log the issue
      }
      
      // Ensure players array is properly formatted
      const lobbyState = {
        ...lobby,
        players: lobby.players || [],
      };
      
      // Send to clients in the lobby room (for waiting room)
      io.to(`lobby:${lobbyId}`).emit('lobby:state', { lobby: lobbyState });
      io.to(`lobby:${lobbyId}`).emit('lobby:player_joined', { 
        lobbyId, 
        walletAddress,
        lobby: lobbyState
      });
      
      // Also broadcast to ALL clients so lobby browser can update (for real-time player counts)
      io.emit('lobby:state', { lobby: lobbyState });
      console.log(`[Socket] Broadcasted lobby state to all clients for lobby ${lobbyId}, ${lobbyState.players.length} players:`, lobbyState.players.map((p: any) => p.walletAddress));
    } else {
      console.error(`[Socket] Failed to get lobby ${lobbyId} with players`);
    }
  };

  lobbyManager.onPlayerLeft = async (lobbyId: string, walletAddress: string) => {
    // Small delay to ensure database transaction is fully committed
    // This prevents race conditions where the read happens before the write commits
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Broadcast updated lobby state to all players in the lobby AND to all clients (for lobby browser)
    const lobby = await lobbyManager.getLobbyWithPlayers(lobbyId);
    if (lobby) {
      const playerCount = lobby.players?.length || 0;
      const playerAddresses = lobby.players?.map((p: any) => p.walletAddress) || [];
      console.log(`[Socket] onPlayerLeft - lobby ${lobbyId} has ${playerCount} players:`, playerAddresses);
      
      // Ensure players array is properly formatted
      const lobbyState = {
        ...lobby,
        players: lobby.players || [],
      };
      
      // Send to clients in the lobby room (for waiting room)
      io.to(`lobby:${lobbyId}`).emit('lobby:state', { lobby: lobbyState });
      io.to(`lobby:${lobbyId}`).emit('lobby:player_left', { 
        lobbyId, 
        walletAddress,
        lobby: lobbyState
      });
      
      // Also broadcast to ALL clients so lobby browser can update (for real-time player counts)
      io.emit('lobby:state', { lobby: lobbyState });
      console.log(`[Socket] Broadcasted lobby state to all clients for lobby ${lobbyId}, ${lobbyState.players.length} players:`, lobbyState.players.map((p: any) => p.walletAddress));
    } else {
      console.error(`[Socket] Failed to get lobby ${lobbyId} with players`);
    }
  };

  // Helper function to get list of connected users with profile info
  const getConnectedUsers = async (): Promise<Array<{ walletAddress: string; username?: string; avatarUrl?: string }>> => {
    const usersMap = new Map<string, { walletAddress: string; username?: string; avatarUrl?: string }>();
    
    // Iterate through all sockets and deduplicate by walletAddress
    for (const [socketId, socket] of io.sockets.sockets.entries()) {
      const authSocket = socket as AuthenticatedSocket;
      if (authSocket.walletAddress && !usersMap.has(authSocket.walletAddress)) {
        try {
          const player = await dbQueries.getOrCreatePlayer(authSocket.walletAddress);
          usersMap.set(authSocket.walletAddress, {
            walletAddress: authSocket.walletAddress,
            username: player.username || undefined,
            avatarUrl: player.avatar_url || undefined,
          });
        } catch (error) {
          console.error(`[Socket] Error getting profile for ${authSocket.walletAddress}:`, error);
          // Still add user without profile info
          usersMap.set(authSocket.walletAddress, {
            walletAddress: authSocket.walletAddress,
          });
        }
      }
    }
    
    return Array.from(usersMap.values());
  };

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const walletAddress = socket.walletAddress!;
    console.log(`[Socket] Client connected: ${walletAddress}`);
    
    // Track which lobbies this socket is in
    const joinedLobbies = new Set<string>();

    // Get user profile for chat notifications
    let userProfile: { username?: string; avatarUrl?: string } = {};
    try {
      const player = await dbQueries.getOrCreatePlayer(walletAddress);
      userProfile = {
        username: player.username || undefined,
        avatarUrl: player.avatar_url || undefined,
      };
    } catch (error) {
      console.error(`[Socket] Error getting profile for ${walletAddress}:`, error);
    }

    // Notify all other users that this user joined
    socket.broadcast.emit('chat:userJoined', {
      walletAddress,
      username: userProfile.username,
      avatarUrl: userProfile.avatarUrl,
    });

    // Join lobby room
    socket.on('lobby:join', async (data: { lobbyId: string }) => {
      const { lobbyId } = data;
      socket.join(`lobby:${lobbyId}`);
      joinedLobbies.add(lobbyId);
      console.log(`[Socket] ${walletAddress} joined lobby ${lobbyId}`);

      // Small delay to ensure any pending database writes (like player joins) are committed
      // This prevents race conditions where we query before the player is saved
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send current lobby state
      const lobby = await lobbyManager.getLobbyWithPlayers(lobbyId);
      if (lobby) {
        const playerCount = lobby.players?.length || 0;
        const playerAddresses = lobby.players?.map((p: any) => p.walletAddress) || [];
        console.log(`[Socket] Sending lobby state to ${walletAddress} for lobby ${lobbyId}, ${playerCount} players:`, playerAddresses);
        socket.emit('lobby:state', { lobby });
      } else {
        console.log(`[Socket] No lobby found for ${lobbyId}`);
      }
    });

    // Request lobby state
    socket.on('lobby:request_state', async (data: { lobbyId: string }) => {
      const { lobbyId } = data;
      console.log(`[Socket] ${walletAddress} requested lobby state for ${lobbyId}`);
      
      // Small delay to ensure any pending database writes are committed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const lobby = await lobbyManager.getLobbyWithPlayers(lobbyId);
      if (lobby) {
        const playerCount = lobby.players?.length || 0;
        const playerAddresses = lobby.players?.map((p: any) => p.walletAddress) || [];
        console.log(`[Socket] Sending lobby state to ${walletAddress} for lobby ${lobbyId}, ${playerCount} players:`, playerAddresses);
        socket.emit('lobby:state', { lobby });
      } else {
        console.log(`[Socket] No lobby found for ${lobbyId}`);
      }
    });

    // Leave lobby room
    socket.on('lobby:leave', async (data: { lobbyId: string }) => {
      const { lobbyId } = data;
      socket.leave(`lobby:${lobbyId}`);
      joinedLobbies.delete(lobbyId);
      console.log(`[Socket] ${walletAddress} left socket room for lobby ${lobbyId}`);
      
      // NOTE: We DON'T call lobbyManager.leaveLobby() here because:
      // 1. The frontend API call already handles the database removal
      // 2. Calling it here would cause duplicate leave operations
      // 3. The socket leave is just for real-time updates, not database state
      // The database leave happens via the API endpoint, which triggers onPlayerLeft callback
    });

    // Player input (movement, jumping, etc.)
    socket.on('game:input', async (data: { lobbyId: string; keys: any }) => {
      const { lobbyId, keys } = data;
      // Broadcast to other players in the lobby
      socket.to(`lobby:${lobbyId}`).emit('game:player_input', {
        walletAddress,
        keys,
        timestamp: Date.now(),
      });
    });

    // Player position update
    socket.on('game:position', async (data: { lobbyId: string; position: any }) => {
      const { lobbyId, position } = data;
      // Broadcast to other players in the lobby
      socket.to(`lobby:${lobbyId}`).emit('game:player_position', {
        walletAddress,
        position,
        timestamp: Date.now(),
      });
    });

    // Voice state updates (push-to-talk)
    socket.on('game:voice_state', async (data: { lobbyId: string; isSpeaking: boolean }) => {
      const { lobbyId, isSpeaking } = data;
      // Broadcast to other players in the lobby
      socket.to(`lobby:${lobbyId}`).emit('game:voice_state', {
        walletAddress,
        isSpeaking,
        timestamp: Date.now(),
      });
    });

    // Hexagon hit events (Fall Guys)
    socket.on('hexagonHit', (data: { hexagonKey: string; lobbyId: string }) => {
      socket.to(`lobby:${data.lobbyId}`).emit('hexagonHit', { hexagonKey: data.hexagonKey });
    });

    // Teleport power-up collection events (Fall Guys)
    socket.on('teleportCollect', (data: { hexagonKey: string; lobbyId: string }) => {
      socket.to(`lobby:${data.lobbyId}`).emit('teleportCollect', { hexagonKey: data.hexagonKey });
    });

    // Floor reset power-up collection events (Fall Guys)
    socket.on('floorResetCollect', (data: { hexagonKey: string; lobbyId: string }) => {
      socket.to(`lobby:${data.lobbyId}`).emit('floorResetCollect', { hexagonKey: data.hexagonKey });
    });

    // Floor reset event (when floors are regenerated)
    socket.on('floorReset', (data: { lobbyId: string; newFloors: string[] }) => {
      socket.to(`lobby:${data.lobbyId}`).emit('floorReset', { newFloors: data.newFloors });
    });

    // WebRTC signaling for voice chat
    socket.on('webrtc:offer', (data: { lobbyId: string; targetAddress: string; offer: any }) => {
      const { lobbyId, targetAddress, offer } = data;
      console.log(`[Socket] WebRTC offer from ${walletAddress} to ${targetAddress} in lobby ${lobbyId}`);
      
      // Find target socket by wallet address
      const targetSocket = Array.from(io.sockets.sockets.values()).find(
        (s: AuthenticatedSocket) => s.walletAddress === targetAddress
      );
      
      if (targetSocket) {
        // Check if target is in the lobby room
        const roomName = `lobby:${lobbyId}`;
        const room = io.sockets.adapter.rooms.get(roomName);
        if (room && room.has(targetSocket.id)) {
          console.log(`[Socket] ✅ Forwarding WebRTC offer to ${targetAddress} (in room)`);
          targetSocket.emit('webrtc:offer', { fromAddress: walletAddress, offer });
        } else {
          console.warn(`[Socket] ⚠️ Target player ${targetAddress} not in lobby room ${lobbyId}, but sending anyway (they might join soon)`);
          // Send anyway - they might join the room soon
          targetSocket.emit('webrtc:offer', { fromAddress: walletAddress, offer });
        }
      } else {
        console.warn(`[Socket] ❌ Target player ${targetAddress} not found (not connected)`);
      }
    });

    socket.on('webrtc:answer', (data: { lobbyId: string; targetAddress: string; answer: any }) => {
      const { lobbyId, targetAddress, answer } = data;
      console.log(`[Socket] WebRTC answer from ${walletAddress} to ${targetAddress} in lobby ${lobbyId}`);
      
      // Find target socket by wallet address
      const targetSocket = Array.from(io.sockets.sockets.values()).find(
        (s: AuthenticatedSocket) => s.walletAddress === targetAddress
      );
      
      if (targetSocket) {
        console.log(`[Socket] ✅ Forwarding WebRTC answer to ${targetAddress}`);
        targetSocket.emit('webrtc:answer', { fromAddress: walletAddress, answer });
      } else {
        console.warn(`[Socket] ❌ Target player ${targetAddress} not found (not connected)`);
      }
    });

    socket.on('webrtc:ice', (data: { lobbyId: string; targetAddress: string; candidate: any }) => {
      const { lobbyId, targetAddress, candidate } = data;
      console.log(`[Socket] WebRTC ICE candidate from ${walletAddress} to ${targetAddress} in lobby ${lobbyId}`);
      
      // Find target socket by wallet address
      const targetSocket = Array.from(io.sockets.sockets.values()).find(
        (s: AuthenticatedSocket) => s.walletAddress === targetAddress
      );
      
      if (targetSocket) {
        console.log(`[Socket] ✅ Forwarding WebRTC ICE candidate to ${targetAddress}`);
        targetSocket.emit('webrtc:ice', { fromAddress: walletAddress, candidate });
      } else {
        console.warn(`[Socket] ❌ Target player ${targetAddress} not found (not connected)`);
      }
    });

    // Global chat: Send message
    socket.on('chat:message', async (data: { message: string; username?: string; avatarUrl?: string }) => {
      const { message, username, avatarUrl } = data;
      
      // Validate message
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return;
      }
      
      // Limit message length
      const trimmedMessage = message.trim().slice(0, 500);
      
      const finalUsername = username || userProfile.username;
      const finalAvatarUrl = avatarUrl || userProfile.avatarUrl;
      const timestamp = new Date().toISOString();
      
      // Save message to database
      try {
        await dbQueries.saveChatMessage(walletAddress, trimmedMessage, finalUsername, finalAvatarUrl);
      } catch (error) {
        console.error(`[Socket] Error saving chat message:`, error);
        // Continue to broadcast even if save fails
      }
      
      // Broadcast message to all connected users
      io.emit('chat:message', {
        walletAddress,
        username: finalUsername,
        avatarUrl: finalAvatarUrl,
        message: trimmedMessage,
        timestamp,
      });
      
      console.log(`[Socket] Chat message from ${walletAddress}: ${trimmedMessage.slice(0, 50)}...`);
    });

    // Global chat: Get user list
    socket.on('chat:getUserList', async () => {
      try {
        const users = await getConnectedUsers();
        socket.emit('chat:userList', { users });
        console.log(`[Socket] Sent user list to ${walletAddress}: ${users.length} users`);
      } catch (error) {
        console.error(`[Socket] Error getting user list:`, error);
        socket.emit('chat:userList', { users: [] });
      }
    });

    // Disconnect - remove player from all lobbies they're in
    socket.on('disconnect', async () => {
      console.log(`[Socket] Client disconnected: ${walletAddress}`);
      
      // Notify all other users that this user left
      socket.broadcast.emit('chat:userLeft', {
        walletAddress,
      });
      
      // Remove player from all lobbies they were in (only if they're actually still in the lobby)
      for (const lobbyId of joinedLobbies) {
        try {
          // Check if player is actually in the lobby before trying to leave
          const players = await dbQueries.getLobbyPlayers(lobbyId);
          const isInLobby = players.some(p => p.walletAddress === walletAddress);
          
          if (isInLobby) {
            await lobbyManager.leaveLobby(lobbyId, walletAddress);
            console.log(`[Socket] Removed ${walletAddress} from lobby ${lobbyId} on disconnect`);
          } else {
            console.log(`[Socket] Player ${walletAddress} was not in lobby ${lobbyId} on disconnect (already left via API)`);
          }
        } catch (error) {
          console.error(`[Socket] Error removing ${walletAddress} from lobby ${lobbyId} on disconnect:`, error);
        }
      }
      joinedLobbies.clear();
    });
  });

  return io;
}

