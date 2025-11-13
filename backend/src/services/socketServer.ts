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

  lobbyManager.onGameStart = (lobbyId: string) => {
    io.to(`lobby:${lobbyId}`).emit('lobby:game_started', { lobbyId });
  };

  lobbyManager.onPlayerJoined = async (lobbyId: string, walletAddress: string) => {
    // Broadcast updated lobby state to all players in the lobby
    const lobby = await lobbyManager.getLobbyWithPlayers(lobbyId);
    if (lobby) {
      io.to(`lobby:${lobbyId}`).emit('lobby:state', { lobby });
      io.to(`lobby:${lobbyId}`).emit('lobby:player_joined', { 
        lobbyId, 
        walletAddress,
        lobby 
      });
    }
  };

  lobbyManager.onPlayerLeft = async (lobbyId: string, walletAddress: string) => {
    // Broadcast updated lobby state to all players in the lobby
    const lobby = await lobbyManager.getLobbyWithPlayers(lobbyId);
    if (lobby) {
      io.to(`lobby:${lobbyId}`).emit('lobby:state', { lobby });
      io.to(`lobby:${lobbyId}`).emit('lobby:player_left', { 
        lobbyId, 
        walletAddress,
        lobby 
      });
    }
  };

  io.on('connection', (socket: AuthenticatedSocket) => {
    const walletAddress = socket.walletAddress!;
    console.log(`[Socket] Client connected: ${walletAddress}`);
    
    // Track which lobbies this socket is in
    const joinedLobbies = new Set<string>();

    // Join lobby room
    socket.on('lobby:join', async (data: { lobbyId: string }) => {
      const { lobbyId } = data;
      socket.join(`lobby:${lobbyId}`);
      joinedLobbies.add(lobbyId);
      console.log(`[Socket] ${walletAddress} joined lobby ${lobbyId}`);

      // Send current lobby state
      const lobby = await lobbyManager.getLobbyWithPlayers(lobbyId);
      if (lobby) {
        socket.emit('lobby:state', { lobby });
      }
    });

    // Leave lobby room
    socket.on('lobby:leave', async (data: { lobbyId: string }) => {
      const { lobbyId } = data;
      socket.leave(`lobby:${lobbyId}`);
      joinedLobbies.delete(lobbyId);
      console.log(`[Socket] ${walletAddress} left lobby ${lobbyId}`);
      
      // Actually remove player from lobby in database
      try {
        await lobbyManager.leaveLobby(lobbyId, walletAddress);
      } catch (error) {
        console.error(`[Socket] Error removing ${walletAddress} from lobby ${lobbyId}:`, error);
      }
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

    // Disconnect - remove player from all lobbies they're in
    socket.on('disconnect', async () => {
      console.log(`[Socket] Client disconnected: ${walletAddress}`);
      
      // Remove player from all lobbies they were in
      for (const lobbyId of joinedLobbies) {
        try {
          await lobbyManager.leaveLobby(lobbyId, walletAddress);
          console.log(`[Socket] Removed ${walletAddress} from lobby ${lobbyId} on disconnect`);
        } catch (error) {
          console.error(`[Socket] Error removing ${walletAddress} from lobby ${lobbyId} on disconnect:`, error);
        }
      }
      joinedLobbies.clear();
    });
  });

  return io;
}

