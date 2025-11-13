import { useEffect, useRef, useState } from 'react';
import { SocketClient } from '../services/socketClient.js';
import type { Lobby, PlayerPosition } from '@solana-defender/shared';
import { useWallet } from '../contexts/WalletContext.js';
import './LobbyWaitingRoom.css';

interface LobbyWaitingRoomProps {
  lobby: Lobby;
  socketClient: SocketClient;
  onGameStart: () => void;
}

interface RemotePlayer {
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
  position: PlayerPosition;
  lastUpdate: number;
}

export function LobbyWaitingRoom({ lobby: initialLobby, socketClient, onGameStart }: LobbyWaitingRoomProps) {
  const { address } = useWallet();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lobby, setLobby] = useState<Lobby>(initialLobby);
  const [countdown, setCountdown] = useState<number | null>(initialLobby.countdownSeconds ?? null);
  
  // Ensure socket is connected and joined to lobby room
  useEffect(() => {
    if (socketClient.isConnected()) {
      socketClient.joinLobby(lobby.id);
      console.log(`[WaitingRoom] Joined socket room for lobby ${lobby.id}`);
    } else {
      console.warn('[WaitingRoom] Socket not connected!');
    }
  }, [socketClient, lobby.id]);
  const [keys, setKeys] = useState({ left: false, right: false, jump: false });
  const keysRef = useRef({ left: false, right: false, jump: false });
  const playerPositionRef = useRef<PlayerPosition>({
    walletAddress: address || '',
    x: 100,
    y: 400,
    velocityX: 0,
    velocityY: 0,
    isGrounded: false,
    facing: 'right',
  });
  const remotePlayersRef = useRef<Map<string, RemotePlayer>>(new Map());
  const animationFrameRef = useRef<number>();
  const lastUpdateRef = useRef<number>(Date.now());
  const avatarImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const avatarLoadPromisesRef = useRef<Map<string, Promise<HTMLImageElement | null>>>(new Map());
  const lobbyRef = useRef<Lobby>(lobby);

  // Physics constants
  const GRAVITY = 0.8;
  const JUMP_STRENGTH = -15;
  const MOVE_SPEED = 5;
  const FRICTION = 0.85;
  const GROUND_Y = 400;
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  // Helper function to load avatar images
  const loadAvatarImage = (avatarUrl: string): Promise<HTMLImageElement | null> => {
    // Return existing promise if already loading
    if (avatarLoadPromisesRef.current.has(avatarUrl)) {
      return avatarLoadPromisesRef.current.get(avatarUrl)!;
    }

    // Return cached image if available
    if (avatarImageCacheRef.current.has(avatarUrl)) {
      return Promise.resolve(avatarImageCacheRef.current.get(avatarUrl)!);
    }

    // Create new image load promise
    const loadPromise = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        avatarImageCacheRef.current.set(avatarUrl, img);
        resolve(img);
      };
      
      img.onerror = () => {
        console.warn(`[WaitingRoom] Failed to load avatar: ${avatarUrl}`);
        resolve(null);
      };
      
      img.src = avatarUrl;
    });

    avatarLoadPromisesRef.current.set(avatarUrl, loadPromise);
    return loadPromise;
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // Set up keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysRef.current.left = true;
        setKeys((prev) => ({ ...prev, left: true }));
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysRef.current.right = true;
        setKeys((prev) => ({ ...prev, right: true }));
      }
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        keysRef.current.jump = true;
        setKeys((prev) => ({ ...prev, jump: true }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysRef.current.left = false;
        setKeys((prev) => ({ ...prev, left: false }));
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysRef.current.right = false;
        setKeys((prev) => ({ ...prev, right: false }));
      }
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        keysRef.current.jump = false;
        setKeys((prev) => ({ ...prev, jump: false }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Socket event listeners for lobby updates
    socketClient.onLobbyState((data) => {
      console.log('[WaitingRoom] Lobby state updated:', data.lobby);
      setLobby(data.lobby);
      lobbyRef.current = data.lobby;
      
      // Preload avatars for all players in lobby
      data.lobby.players.forEach(player => {
        if (player.avatarUrl && !avatarImageCacheRef.current.has(player.avatarUrl)) {
          loadAvatarImage(player.avatarUrl);
        }
        // Update remote player info with avatar if they exist
        const existingPlayer = remotePlayersRef.current.get(player.walletAddress);
        if (existingPlayer) {
          existingPlayer.username = player.username;
          existingPlayer.avatarUrl = player.avatarUrl;
        }
      });
      
      // Only update countdown from state if it's actually starting and we don't have a live countdown
      if (data.lobby.status === 'starting' && data.lobby.countdownSeconds !== null && data.lobby.countdownSeconds !== undefined) {
        // Only set if we don't already have a countdown or if the state countdown is higher (initial state)
        if (countdown === null || data.lobby.countdownSeconds > countdown) {
          console.log(`[WaitingRoom] Setting countdown from state: ${data.lobby.countdownSeconds}`);
          setCountdown(data.lobby.countdownSeconds);
        }
      }
    });

    socketClient.onPlayerJoined((data) => {
      console.log('[WaitingRoom] Player joined:', data.walletAddress);
      if (data.lobby) {
        setLobby(data.lobby);
        lobbyRef.current = data.lobby;
        // Preload avatars for new players
        data.lobby.players.forEach(player => {
          if (player.avatarUrl && !avatarImageCacheRef.current.has(player.avatarUrl)) {
            loadAvatarImage(player.avatarUrl);
          }
        });
      }
    });

    socketClient.onPlayerLeft((data) => {
      console.log('[WaitingRoom] Player left:', data.walletAddress);
      if (data.lobby) {
        setLobby(data.lobby);
        lobbyRef.current = data.lobby;
      }
      // Remove from remote players
      remotePlayersRef.current.delete(data.walletAddress);
    });

    // Socket event listeners for player positions
    socketClient.onPlayerPosition((data) => {
      if (data.walletAddress === address) return; // Ignore own position

      // Find player info from lobby to get avatar
      const playerInfo = lobbyRef.current.players.find(p => p.walletAddress === data.walletAddress);
      const existingPlayer = remotePlayersRef.current.get(data.walletAddress);

      const remotePlayer: RemotePlayer = {
        walletAddress: data.walletAddress,
        username: playerInfo?.username || existingPlayer?.username,
        avatarUrl: playerInfo?.avatarUrl || existingPlayer?.avatarUrl,
        position: data.position,
        lastUpdate: data.timestamp,
      };

      remotePlayersRef.current.set(data.walletAddress, remotePlayer);
      
      // Preload avatar if not already cached
      if (remotePlayer.avatarUrl && !avatarImageCacheRef.current.has(remotePlayer.avatarUrl)) {
        loadAvatarImage(remotePlayer.avatarUrl);
      }
    });

    // Game loop
    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = Math.min((now - lastUpdateRef.current) / 16, 2); // Cap at 2x speed
      lastUpdateRef.current = now;

      // Update local player physics
      const pos = playerPositionRef.current;
      const currentKeys = keysRef.current;

      // Apply gravity
      if (!pos.isGrounded) {
        pos.velocityY += GRAVITY;
      }

      // Handle movement
      if (currentKeys.left) {
        pos.velocityX = -MOVE_SPEED;
        pos.facing = 'left';
      } else if (currentKeys.right) {
        pos.velocityX = MOVE_SPEED;
        pos.facing = 'right';
      } else {
        pos.velocityX *= FRICTION;
      }

      // Handle jump
      if (currentKeys.jump && pos.isGrounded) {
        pos.velocityY = JUMP_STRENGTH;
        pos.isGrounded = false;
        keysRef.current.jump = false; // Prevent holding jump
        setKeys((prev) => ({ ...prev, jump: false }));
      }

      // Update position
      pos.x += pos.velocityX;
      pos.y += pos.velocityY;

      // Ground collision
      if (pos.y >= GROUND_Y) {
        pos.y = GROUND_Y;
        pos.velocityY = 0;
        pos.isGrounded = true;
      }

      // Boundary collision
      if (pos.x < 20) {
        pos.x = 20;
        pos.velocityX = 0;
      }
      if (pos.x > CANVAS_WIDTH - 40) {
        pos.x = CANVAS_WIDTH - 40;
        pos.velocityX = 0;
      }

      // Send position update every 50ms
      if (now % 50 < 16) {
        socketClient.sendPlayerPosition(lobbyRef.current.id, pos);
      }

      // Render
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw background (cartoonish sky gradient)
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, '#87CEEB');
      gradient.addColorStop(1, '#E0F6FF');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw ground (cartoonish grass)
      ctx.fillStyle = '#7CB342';
      ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
      
      // Draw grass details
      ctx.fillStyle = '#558B2F';
      for (let i = 0; i < CANVAS_WIDTH; i += 30) {
        ctx.fillRect(i, GROUND_Y, 2, 10);
      }

      // Draw clouds (cartoonish)
      drawCloud(ctx, 150, 100, 60);
      drawCloud(ctx, 400, 80, 80);
      drawCloud(ctx, 650, 120, 50);

      // Draw remote players
      const currentLobby = lobbyRef.current;
      remotePlayersRef.current.forEach((remotePlayer) => {
        const avatarUrl = remotePlayer.avatarUrl || currentLobby.players.find(p => p.walletAddress === remotePlayer.walletAddress)?.avatarUrl;
        const avatarImage = avatarUrl ? avatarImageCacheRef.current.get(avatarUrl) : undefined;
        drawPlayer(ctx, remotePlayer.position, remotePlayer.walletAddress.slice(0, 6), false, avatarImage);
      });

      // Draw local player
      const localPlayer = currentLobby.players.find(p => p.walletAddress === address);
      const localAvatarUrl = localPlayer?.avatarUrl;
      const localAvatarImage = localAvatarUrl ? avatarImageCacheRef.current.get(localAvatarUrl) : undefined;
      drawPlayer(ctx, pos, 'You', true, localAvatarImage);

      // Draw player names/labels
      ctx.fillStyle = '#333';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      
      remotePlayersRef.current.forEach((remotePlayer) => {
        const name = remotePlayer.username || remotePlayer.walletAddress.slice(0, 6);
        ctx.fillText(name, remotePlayer.position.x + 20, remotePlayer.position.y - 35);
      });
      ctx.fillText('You', pos.x + 20, pos.y - 35);

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      socketClient.off('lobby:state');
      socketClient.off('lobby:player_joined');
      socketClient.off('lobby:player_left');
      socketClient.off('game:player_position');
    };
  }, [lobby.id, socketClient, address, keys]);

  // Listen for countdown updates
  useEffect(() => {
    const handleCountdown = (data: { lobbyId: string; countdown: number }) => {
      console.log('[WaitingRoom] Received countdown update:', data);
      if (data.lobbyId === lobby.id) {
        console.log(`[WaitingRoom] Setting countdown to ${data.countdown}`);
        setCountdown(data.countdown);
      }
    };

    const handleGameStarted = (data: { lobbyId: string }) => {
      console.log('[WaitingRoom] Game started:', data);
      if (data.lobbyId === lobby.id) {
        onGameStart();
      }
    };

    socketClient.onLobbyCountdown(handleCountdown);
    socketClient.onGameStarted(handleGameStarted);

    // Fallback: Poll lobby state if countdown is stuck
    const pollInterval = setInterval(async () => {
      if (countdown !== null && countdown > 0) {
        // If countdown hasn't changed in 2 seconds, something might be wrong
        // But we'll let the socket events handle it for now
      }
    }, 2000);

    return () => {
      clearInterval(pollInterval);
      socketClient.off('lobby:countdown', handleCountdown);
      socketClient.off('lobby:game_started', handleGameStarted);
    };
  }, [lobby.id, socketClient, onGameStart, countdown]);

  // Preload avatars on initial mount and when lobby changes
  useEffect(() => {
    lobby.players.forEach(player => {
      if (player.avatarUrl && !avatarImageCacheRef.current.has(player.avatarUrl)) {
        loadAvatarImage(player.avatarUrl);
      }
    });
  }, [lobby.players]);

  const drawPlayer = (ctx: CanvasRenderingContext2D, pos: PlayerPosition, label: string, isLocal: boolean, avatarImage?: HTMLImageElement) => {
    const x = pos.x;
    const y = pos.y;
    const scale = isLocal ? 1.1 : 1; // Local player slightly bigger

    ctx.save();
    ctx.translate(x + 20, y);

    // Flip if facing left
    if (pos.facing === 'left') {
      ctx.scale(-1, 1);
      ctx.translate(-40, 0);
    }

    // Body (cartoonish circle) - draw as background or fallback
    const bodyRadius = 15 * scale;
    ctx.fillStyle = isLocal ? '#4A90E2' : '#FF6B6B';
    ctx.beginPath();
    ctx.arc(20, 0, bodyRadius, 0, Math.PI * 2);
    
    // Draw avatar if available, otherwise use colored circle with face
    const hasAvatar = avatarImage && avatarImage.complete && avatarImage.naturalWidth > 0;
    
    if (hasAvatar) {
      // Draw avatar as circular clip
      ctx.save();
      ctx.clip();
      ctx.drawImage(
        avatarImage,
        20 - bodyRadius,
        -bodyRadius,
        bodyRadius * 2,
        bodyRadius * 2
      );
      ctx.restore();
      
      // Draw border around avatar
      ctx.strokeStyle = isLocal ? '#357ABD' : '#E55555';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(20, 0, bodyRadius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Fallback to colored circle
      ctx.fill();
      
      // Only draw face features when no avatar is present
      // Eyes
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(15 * scale, -5 * scale, 4 * scale, 0, Math.PI * 2);
      ctx.arc(25 * scale, -5 * scale, 4 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(15 * scale, -5 * scale, 2 * scale, 0, Math.PI * 2);
      ctx.arc(25 * scale, -5 * scale, 2 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Smile
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.arc(20 * scale, 2 * scale, 6 * scale, 0, Math.PI);
      ctx.stroke();
    }

    // Legs (simple rectangles)
    ctx.fillStyle = isLocal ? '#357ABD' : '#E55555';
    ctx.fillRect(12 * scale, 15 * scale, 6 * scale, 8 * scale);
    ctx.fillRect(22 * scale, 15 * scale, 6 * scale, 8 * scale);

    // Arms (animated based on movement)
    const armAngle = pos.velocityX !== 0 ? Math.sin(Date.now() / 100) * 0.3 : 0;
    ctx.save();
    ctx.translate(10 * scale, 5 * scale);
    ctx.rotate(armAngle);
    ctx.fillRect(0, 0, 4 * scale, 10 * scale);
    ctx.restore();

    ctx.save();
    ctx.translate(30 * scale, 5 * scale);
    ctx.rotate(-armAngle);
    ctx.fillRect(0, 0, 4 * scale, 10 * scale);
    ctx.restore();

    ctx.restore();
  };

  const drawCloud = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y, size * 0.6, 0, Math.PI * 2);
    ctx.arc(x + size * 1.2, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.3, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.9, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
  };

  return (
    <div className="lobby-waiting-room">
      <div className="waiting-room-header">
        <h2>🎮 Waiting Room</h2>
        {countdown !== null && countdown > 0 ? (
          <div className="countdown-display">
            <span className="countdown-number">{countdown}</span>
            <span className="countdown-label">Game starting in...</span>
          </div>
        ) : (
          <div className="waiting-message">
            Waiting for players... ({lobby.players.length}/{lobby.maxPlayers ?? 50})
          </div>
        )}
      </div>
      <div className="waiting-room-canvas-container">
        <canvas ref={canvasRef} className="waiting-room-canvas" tabIndex={0} />
        <div className="controls-hint">
          <p>🎮 Use Arrow Keys or WASD to move around!</p>
          <p>Spacebar or Up Arrow to jump</p>
        </div>
      </div>
      <div className="waiting-room-players">
        <h3>Players in Lobby ({lobby.players.length})</h3>
        <div className="players-list">
          {lobby.players.map((player) => {
            const avatarUrl = player.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${player.username || player.walletAddress}`;
            return (
              <div key={player.walletAddress} className="player-badge">
                <img 
                  src={avatarUrl} 
                  alt={player.username || player.walletAddress} 
                  className="player-avatar"
                  onError={(e) => {
                    // Fallback to emoji if image fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallback = document.createElement('span');
                    fallback.className = 'player-avatar-fallback';
                    fallback.textContent = '👤';
                    target.parentNode?.insertBefore(fallback, target);
                  }}
                />
                <span className="player-name">
                  {player.username || `${player.walletAddress.slice(0, 6)}...`}
                </span>
                {player.walletAddress === address && (
                  <span className="you-badge">You</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

