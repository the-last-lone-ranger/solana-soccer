import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SocketClient } from '../services/socketClient.js';
import { VoiceChatService } from '../services/voiceChat.js';
import type { Lobby, PlayerPosition } from '@solana-defender/shared';
import { useWallet } from '../contexts/WalletContext.js';
import { ApiClient } from '../services/api.js';
import { PlayerTooltip } from './PlayerTooltip.js';
import './LobbyWaitingRoom.css';

interface LobbyWaitingRoomProps {
  lobby: Lobby;
  socketClient: SocketClient;
  onGameStart: () => void;
  onLeaveLobby?: () => void;
  apiClient: ApiClient;
}

interface RemotePlayer {
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
  position: PlayerPosition;
  lastUpdate: number;
  isSpeaking?: boolean;
}

export function LobbyWaitingRoom({ lobby: initialLobby, socketClient, onGameStart, onLeaveLobby, apiClient, isSpectator = false }: LobbyWaitingRoomProps) {
  const { address } = useWallet();
  const navigate = useNavigate();
  const { lobbyId: routeLobbyId } = useParams<{ lobbyId: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lobby, setLobby] = useState<Lobby>(initialLobby);
  const [countdown, setCountdown] = useState<number | null>(initialLobby.countdownSeconds ?? null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voiceChatRef = useRef<VoiceChatService | null>(null);
  const keysPressedRef = useRef<Set<string>>(new Set());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map()); // Map of walletAddress -> RTCPeerConnection
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map()); // Map of walletAddress -> audio element
  const processedPlayersRef = useRef<Set<string>>(new Set()); // Track which players we've already created connections for
  const webrtcInitializedRef = useRef<string | null>(null); // Track which lobby ID WebRTC handlers were initialized for
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => {
    if (!address) return false;
    const saved = localStorage.getItem(`voice_settings_${address}`);
    return saved ? JSON.parse(saved).enabled : false;
  });
  const [pushToTalkKey, setPushToTalkKey] = useState(() => {
    if (!address) return 'v';
    const saved = localStorage.getItem(`voice_settings_${address}`);
    return saved ? JSON.parse(saved).pushToTalkKey || 'v' : 'v';
  });
  
  // Load local player profile for avatar
  useEffect(() => {
    if (address && apiClient) {
      apiClient.getProfile().then(profile => {
        const profileData = {
          username: profile.username,
          avatarUrl: profile.avatarUrl,
        };
        setLocalPlayerProfile(profileData);
        
        // Update lobby state with profile info
        setLobby(prevLobby => {
          if (!prevLobby) return prevLobby;
          
          const updatedLobby = { ...prevLobby };
          if (!updatedLobby.players) {
            updatedLobby.players = [];
          }
          
          // Find and update the local player's entry
          const playerIndex = updatedLobby.players.findIndex(p => p.walletAddress === address);
          if (playerIndex >= 0) {
            updatedLobby.players[playerIndex] = {
              ...updatedLobby.players[playerIndex],
              username: profileData.username || updatedLobby.players[playerIndex].username,
              avatarUrl: profileData.avatarUrl || updatedLobby.players[playerIndex].avatarUrl,
            };
          } else {
            // Add local player if not in list
            updatedLobby.players = [...updatedLobby.players, {
              walletAddress: address,
              username: profileData.username,
              avatarUrl: profileData.avatarUrl,
              joinedAt: new Date().toISOString(),
              hasCrown: false,
            }];
          }
          
          lobbyRef.current = updatedLobby;
          return updatedLobby;
        });
        
        // Preload avatar if available
        if (profile.avatarUrl) {
          loadAvatarImage(profile.avatarUrl);
        }
      }).catch(err => {
        console.error('[WaitingRoom] Failed to load profile:', err);
      });
    }
  }, [address, apiClient]);

  // Ensure socket is connected and joined to lobby room
  useEffect(() => {
    if (socketClient.isConnected()) {
      socketClient.joinLobby(lobby.id);
      console.log(`[WaitingRoom] Joined socket room for lobby ${lobby.id}`);
      console.log(`[WaitingRoom] Initial lobby players:`, lobby.players?.map(p => p.walletAddress) || []);
      // Request lobby state after joining to ensure we have the latest data
      setTimeout(() => {
        socketClient.requestLobbyState(lobby.id);
      }, 100);
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
  const [localPlayerProfile, setLocalPlayerProfile] = useState<{ username?: string; avatarUrl?: string } | null>(null);

  // Physics constants
  const GRAVITY = 0.8;
  const JUMP_STRENGTH = -15;
  const MOVE_SPEED = 5;
  const FRICTION = 0.85;
  const GROUND_Y = 400;
  // Canvas dimensions - will be set dynamically based on container
  const CANVAS_WIDTH = 1200; // Increased for desktop
  const CANVAS_HEIGHT = 600;
  
  // Building structures for city layout
  interface Building {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    roofColor: string;
    windowColor: string;
    type: 'house' | 'shop' | 'tower';
  }
  
  // Platform for parkour
  interface Platform {
    x: number;
    y: number;
    width: number;
    height: number;
    isMoving?: boolean;
    moveSpeed?: number;
    moveRange?: number;
    startX?: number;
  }
  
  // Collectible coin
  interface Collectible {
    x: number;
    y: number;
    id: string;
    collected: boolean;
    rotation: number;
  }
  
  // Prop decoration
  interface Prop {
    x: number;
    y: number;
    type: 'tree' | 'bench' | 'streetlight' | 'sign' | 'fence';
    width: number;
    height: number;
  }
  
  const buildings: Building[] = [
    // Left side buildings - varied heights for parkour
    { x: 50, y: 320, width: 100, height: 80, color: '#FF6B6B', roofColor: '#C92A2A', windowColor: '#FFE66D', type: 'house' },
    { x: 180, y: 280, width: 90, height: 120, color: '#4ECDC4', roofColor: '#2D9CDB', windowColor: '#FFE66D', type: 'house' },
    { x: 300, y: 340, width: 80, height: 60, color: '#95E1D3', roofColor: '#F38181', windowColor: '#FFE66D', type: 'shop' },
    // Center buildings - tallest for challenge
    { x: 420, y: 200, width: 120, height: 200, color: '#FFA07A', roofColor: '#FF6347', windowColor: '#FFE66D', type: 'tower' },
    { x: 570, y: 260, width: 100, height: 140, color: '#98D8C8', roofColor: '#6C5CE7', windowColor: '#FFE66D', type: 'house' },
    // Right side buildings
    { x: 700, y: 300, width: 90, height: 100, color: '#F7DC6F', roofColor: '#F39C12', windowColor: '#FFE66D', type: 'shop' },
    { x: 820, y: 250, width: 110, height: 150, color: '#BB8FCE', roofColor: '#8E44AD', windowColor: '#FFE66D', type: 'house' },
    { x: 960, y: 310, width: 100, height: 90, color: '#85C1E2', roofColor: '#3498DB', windowColor: '#FFE66D', type: 'house' },
    { x: 1090, y: 280, width: 90, height: 120, color: '#FF9FF3', roofColor: '#E056FD', windowColor: '#FFE66D', type: 'house' },
  ];
  
  // Parkour platforms - create skill-based navigation
  const platforms: Platform[] = [
    // Moving platforms
    { x: 150, y: 250, width: 60, height: 10, isMoving: true, moveSpeed: 1.5, moveRange: 80, startX: 150 },
    { x: 350, y: 220, width: 50, height: 10, isMoving: true, moveSpeed: 2, moveRange: 100, startX: 350 },
    { x: 680, y: 180, width: 70, height: 10, isMoving: true, moveSpeed: 1.2, moveRange: 120, startX: 680 },
    // Static platforms for parkour routes
    { x: 250, y: 200, width: 40, height: 10 },
    { x: 480, y: 150, width: 50, height: 10 },
    { x: 750, y: 220, width: 45, height: 10 },
    { x: 1000, y: 240, width: 55, height: 10 },
  ];
  
  // Collectibles - coins to collect
  const collectiblesRef = useRef<Map<string, Collectible>>(new Map());
  const collectedCoinsRef = useRef<Set<string>>(new Set());
  const [coinCount, setCoinCount] = useState(0);
  
  // Initialize collectibles
  useEffect(() => {
    const coins: Collectible[] = [
      { x: 150, y: 230, id: 'coin1', collected: false, rotation: 0 },
      { x: 350, y: 200, id: 'coin2', collected: false, rotation: 0 },
      { x: 480, y: 130, id: 'coin3', collected: false, rotation: 0 },
      { x: 680, y: 160, id: 'coin4', collected: false, rotation: 0 },
      { x: 750, y: 200, id: 'coin5', collected: false, rotation: 0 },
      { x: 1000, y: 220, id: 'coin6', collected: false, rotation: 0 },
      { x: 250, y: 180, id: 'coin7', collected: false, rotation: 0 },
      { x: 570, y: 240, id: 'coin8', collected: false, rotation: 0 },
      { x: 820, y: 230, id: 'coin9', collected: false, rotation: 0 },
      { x: 1090, y: 260, id: 'coin10', collected: false, rotation: 0 },
    ];
    coins.forEach(coin => {
      collectiblesRef.current.set(coin.id, coin);
    });
  }, []);
  
  // Props for decoration
  const props: Prop[] = [
    { x: 30, y: 380, type: 'tree', width: 30, height: 40 },
    { x: 130, y: 380, type: 'bench', width: 40, height: 20 },
    { x: 280, y: 380, type: 'streetlight', width: 15, height: 30 },
    { x: 380, y: 380, type: 'tree', width: 30, height: 40 },
    { x: 540, y: 380, type: 'sign', width: 25, height: 30 },
    { x: 640, y: 380, type: 'bench', width: 40, height: 20 },
    { x: 780, y: 380, type: 'streetlight', width: 15, height: 30 },
    { x: 920, y: 380, type: 'tree', width: 30, height: 40 },
    { x: 1050, y: 380, type: 'fence', width: 60, height: 25 },
    { x: 1150, y: 380, type: 'tree', width: 30, height: 40 },
  ];

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

    // Set canvas size based on container width, but maintain aspect ratio
    // Use device pixel ratio for crisp rendering
    const updateCanvasSize = () => {
      const container = canvas.parentElement;
      if (container) {
        const containerWidth = container.clientWidth - 20; // Account for padding
        const aspectRatio = CANVAS_HEIGHT / CANVAS_WIDTH;
        const displayWidth = Math.min(containerWidth, CANVAS_WIDTH);
        const displayHeight = displayWidth * aspectRatio;
        
        // Get device pixel ratio for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        
        // Set the actual canvas size (internal resolution)
        canvas.width = CANVAS_WIDTH * dpr;
        canvas.height = CANVAS_HEIGHT * dpr;
        
        // Set the display size (CSS size)
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        
        // Scale the context to account for device pixel ratio
        ctx.scale(dpr, dpr);
      } else {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = CANVAS_WIDTH * dpr;
        canvas.height = CANVAS_HEIGHT * dpr;
        canvas.style.width = `${CANVAS_WIDTH}px`;
        canvas.style.height = `${CANVAS_HEIGHT}px`;
        ctx.scale(dpr, dpr);
      }
    };

    updateCanvasSize();
    
    // Update on window resize
    const handleResize = () => {
      updateCanvasSize();
    };
    window.addEventListener('resize', handleResize);

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
    const handleLobbyState = (data: { lobby: Lobby }) => {
      // Only process updates for the current lobby
      if (data.lobby.id !== lobby.id) {
        console.log('[WaitingRoom] Ignoring lobby state update for different lobby:', data.lobby.id, 'current:', lobby.id);
        return;
      }
      
      console.log('[WaitingRoom] Lobby state updated:', data.lobby.id);
      console.log('[WaitingRoom] Players in socket update:', data.lobby.players?.length || 0, data.lobby.players?.map(p => ({ wallet: p.walletAddress, username: p.username, avatar: p.avatarUrl })) || []);
      console.log('[WaitingRoom] Current address:', address);
      console.log('[WaitingRoom] Current lobby state before update:', lobby.players?.length || 0, lobby.players?.map(p => p.walletAddress) || []);
      
      // Create a new lobby object to avoid mutating the original
      const updatedLobby = { ...data.lobby };
      
      // ALWAYS use players from socket update - it's the source of truth
      // The socket update comes directly from the server with the latest player list
      if (!updatedLobby.players || !Array.isArray(updatedLobby.players)) {
        console.warn('[WaitingRoom] Socket update has no players array, preserving existing players');
        // Don't overwrite with empty array - preserve existing players if socket update is malformed
        updatedLobby.players = lobby.players || [];
        return; // Don't update state if the socket update is malformed
      }
      
      // Merge local player profile data if available (for username/avatar)
      // But don't add local player if they're not in the server's list
      if (address && localPlayerProfile) {
        const existingPlayerIndex = updatedLobby.players.findIndex(p => p.walletAddress === address);
        if (existingPlayerIndex >= 0) {
          // Update existing player entry with latest profile data
          updatedLobby.players[existingPlayerIndex] = {
            ...updatedLobby.players[existingPlayerIndex],
            username: localPlayerProfile.username || updatedLobby.players[existingPlayerIndex].username,
            avatarUrl: localPlayerProfile.avatarUrl || updatedLobby.players[existingPlayerIndex].avatarUrl,
          };
        }
      }
      
      console.log('[WaitingRoom] Final players list after merge:', updatedLobby.players.length, updatedLobby.players.map(p => ({ wallet: p.walletAddress, username: p.username, avatar: p.avatarUrl })));
      console.log('[WaitingRoom] Updating lobby state with', updatedLobby.players.length, 'players');
      
      // Force state update - create new object AND array references to ensure React detects the change
      const newLobbyState = {
        ...updatedLobby,
        players: [...updatedLobby.players], // Create new array reference
      };
      setLobby(newLobbyState);
      lobbyRef.current = newLobbyState;
      
      // Preload avatars for all players in lobby
      updatedLobby.players.forEach(player => {
        if (player.avatarUrl && !avatarImageCacheRef.current.has(player.avatarUrl)) {
          console.log('[WaitingRoom] Preloading avatar for player:', player.walletAddress, player.avatarUrl);
          loadAvatarImage(player.avatarUrl);
        }
        // Update remote player info with avatar/username if they exist
        const existingPlayer = remotePlayersRef.current.get(player.walletAddress);
        if (existingPlayer) {
          existingPlayer.username = player.username || existingPlayer.username;
          existingPlayer.avatarUrl = player.avatarUrl || existingPlayer.avatarUrl;
          // Preload avatar for remote player if not cached
          if (existingPlayer.avatarUrl && !avatarImageCacheRef.current.has(existingPlayer.avatarUrl)) {
            loadAvatarImage(existingPlayer.avatarUrl);
          }
        } else if (player.walletAddress !== address) {
          // Create remote player entry if they don't exist yet (they'll get position from socket)
          remotePlayersRef.current.set(player.walletAddress, {
            walletAddress: player.walletAddress,
            username: player.username,
            avatarUrl: player.avatarUrl,
            position: { x: 100, y: 400, velocityX: 0, velocityY: 0, isGrounded: true, facing: 'right' },
            lastUpdate: Date.now(),
          });
          // Preload avatar
          if (player.avatarUrl) {
            loadAvatarImage(player.avatarUrl);
          }
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
    };
    
    socketClient.onLobbyState(handleLobbyState);

    socketClient.onPlayerJoined((data) => {
      console.log('[WaitingRoom] Player joined:', data.walletAddress);
      console.log('[WaitingRoom] Lobby from player_joined event:', data.lobby);
      if (data.lobby) {
        // Use the lobby state handler to ensure consistent processing
        handleLobbyState({ lobby: data.lobby });
      }
    });

    socketClient.onPlayerLeft((data) => {
      console.log('[WaitingRoom] Player left:', data.walletAddress);
      console.log('[WaitingRoom] Current address:', address);
      
      // Don't process "player left" events for the current player - they might be false positives
      // from race conditions or reconnection issues
      if (data.walletAddress === address) {
        console.log('[WaitingRoom] Ignoring player left event for current player - likely a race condition');
        return;
      }
      
      if (data.lobby) {
        // Create a new lobby object to avoid mutating the original
        const updatedLobby = { ...data.lobby };
        
        // Ensure players array exists
        if (!updatedLobby.players) {
          updatedLobby.players = [];
        }
        
        // Remove the player who left (but keep current player if they're still there)
        updatedLobby.players = updatedLobby.players.filter(p => p.walletAddress !== data.walletAddress);
        
        // Ensure current player is still in the list
        if (address && !updatedLobby.players.find(p => p.walletAddress === address)) {
          updatedLobby.players = [...updatedLobby.players, {
            walletAddress: address,
            username: localPlayerProfile?.username,
            avatarUrl: localPlayerProfile?.avatarUrl,
            joinedAt: new Date().toISOString(),
            hasCrown: false,
          }];
        } else if (address) {
          // Update existing player entry with latest profile data
          const existingPlayerIndex = updatedLobby.players.findIndex(p => p.walletAddress === address);
          if (existingPlayerIndex >= 0 && localPlayerProfile) {
            updatedLobby.players[existingPlayerIndex] = {
              ...updatedLobby.players[existingPlayerIndex],
              username: localPlayerProfile.username || updatedLobby.players[existingPlayerIndex].username,
              avatarUrl: localPlayerProfile.avatarUrl || updatedLobby.players[existingPlayerIndex].avatarUrl,
            };
          }
        }
        
        setLobby(updatedLobby);
        lobbyRef.current = updatedLobby;
      }
      // Remove from remote players
      remotePlayersRef.current.delete(data.walletAddress);
    });

    // Socket event listeners for player positions
    socketClient.onPlayerPosition((data) => {
      if (data.walletAddress === address) return; // Ignore own position

      // Find player info from lobby to get avatar
      const playerInfo = lobbyRef.current.players?.find(p => p.walletAddress === data.walletAddress);
      const existingPlayer = remotePlayersRef.current.get(data.walletAddress);

      const remotePlayer: RemotePlayer = {
        walletAddress: data.walletAddress,
        username: playerInfo?.username || existingPlayer?.username,
        avatarUrl: playerInfo?.avatarUrl || existingPlayer?.avatarUrl,
        position: data.position,
        lastUpdate: data.timestamp,
        isSpeaking: data.position.isSpeaking ?? existingPlayer?.isSpeaking ?? false,
      };

      remotePlayersRef.current.set(data.walletAddress, remotePlayer);
      
      // Preload avatar if not already cached - ensure it loads
      if (remotePlayer.avatarUrl && !avatarImageCacheRef.current.has(remotePlayer.avatarUrl)) {
        console.log('[WaitingRoom] Preloading avatar for remote player position update:', data.walletAddress, remotePlayer.avatarUrl);
        loadAvatarImage(remotePlayer.avatarUrl).then(img => {
          if (img) {
            console.log('[WaitingRoom] Avatar loaded for remote player:', data.walletAddress);
          }
        });
      }
    });

    // Listen for voice state updates
    const handleVoiceState = (data: { walletAddress: string; isSpeaking: boolean; timestamp: number }) => {
      if (data.walletAddress === address) {
        setIsSpeaking(data.isSpeaking);
      } else {
        const remotePlayer = remotePlayersRef.current.get(data.walletAddress);
        if (remotePlayer) {
          remotePlayer.isSpeaking = data.isSpeaking;
        }
      }
    };
    socketClient.onVoiceState(handleVoiceState);

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

      // Update position FIRST
      pos.x += pos.velocityX;
      pos.y += pos.velocityY;

      // Handle jump AFTER position update but BEFORE collision
      if (currentKeys.jump && pos.isGrounded) {
        pos.velocityY = JUMP_STRENGTH;
        pos.isGrounded = false;
        keysRef.current.jump = false; // Prevent holding jump
        setKeys((prev) => ({ ...prev, jump: false }));
      }

      // Use logical canvas dimensions (not device pixel ratio scaled)
      const canvasWidth = CANVAS_WIDTH;
      const canvasHeight = CANVAS_HEIGHT;
      
      // Update moving platforms
      platforms.forEach(platform => {
        if (platform.isMoving && platform.startX !== undefined && platform.moveRange !== undefined && platform.moveSpeed !== undefined) {
          const time = now / 1000;
          platform.x = platform.startX + Math.sin(time * platform.moveSpeed) * platform.moveRange;
        }
      });
      
      // Building collision detection
      const playerWidth = 40;
      const playerHeight = 30;
      let collided = false;
      let onPlatform = false;
      
      // Platform collision (check first, platforms are easier to land on)
      for (const platform of platforms) {
        if (
          pos.x + playerWidth > platform.x &&
          pos.x < platform.x + platform.width &&
          pos.y + playerHeight <= platform.y + 8 &&
          pos.y + playerHeight >= platform.y - 2 &&
          pos.velocityY >= 0
        ) {
          pos.y = platform.y - playerHeight;
          pos.velocityY = 0;
          pos.isGrounded = true;
          onPlatform = true;
          collided = true;
          break;
        }
      }
      
      // Building collision detection
      for (const building of buildings) {
        // Check if player is colliding with building
        if (
          pos.x + playerWidth > building.x &&
          pos.x < building.x + building.width &&
          pos.y + playerHeight > building.y &&
          pos.y < building.y + building.height
        ) {
          collided = true;
          
          // Determine collision side and push player out
          const overlapLeft = (pos.x + playerWidth) - building.x;
          const overlapRight = (building.x + building.width) - pos.x;
          const overlapTop = (pos.y + playerHeight) - building.y;
          const overlapBottom = (building.y + building.height) - pos.y;
          
          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
          
          if (minOverlap === overlapLeft) {
            // Collision from left
            pos.x = building.x - playerWidth;
            pos.velocityX = 0;
          } else if (minOverlap === overlapRight) {
            // Collision from right
            pos.x = building.x + building.width;
            pos.velocityX = 0;
          } else if (minOverlap === overlapTop && pos.velocityY >= 0) {
            // Collision from top (landing on building)
            pos.y = building.y - playerHeight;
            pos.velocityY = 0;
            pos.isGrounded = true;
            onPlatform = true;
          } else {
            // Collision from bottom (hitting ceiling)
            pos.y = building.y + building.height;
            pos.velocityY = 0;
          }
          break;
        }
      }
      
      // Reset grounded state - will be set by collision checks
      if (!onPlatform) {
        pos.isGrounded = false;
      }
      
      // Ground collision (only if not on a building or platform)
      const scaledGroundY = GROUND_Y;
      if (!collided && pos.y >= scaledGroundY) {
        pos.y = scaledGroundY;
        pos.velocityY = 0;
        pos.isGrounded = true;
      }
      
      // Check if player is on top of any building (for falling detection)
      if (!pos.isGrounded && !onPlatform) {
        for (const building of buildings) {
          if (
            pos.x + playerWidth > building.x &&
            pos.x < building.x + building.width &&
            pos.y + playerHeight <= building.y + 5 &&
            pos.y + playerHeight >= building.y - 5 &&
            pos.velocityY >= 0
          ) {
            pos.y = building.y - playerHeight;
            pos.velocityY = 0;
            pos.isGrounded = true;
            onPlatform = true;
            break;
          }
        }
      }
      
      // Collectible collision detection
      collectiblesRef.current.forEach((coin, id) => {
        if (!coin.collected && !collectedCoinsRef.current.has(id)) {
          const coinCenterX = coin.x + 10;
          const coinCenterY = coin.y + 10;
          const playerCenterX = pos.x + playerWidth / 2;
          const playerCenterY = pos.y + playerHeight / 2;
          const distance = Math.sqrt(
            Math.pow(coinCenterX - playerCenterX, 2) + 
            Math.pow(coinCenterY - playerCenterY, 2)
          );
          
          if (distance < 25) {
            coin.collected = true;
            collectedCoinsRef.current.add(id);
            setCoinCount(collectedCoinsRef.current.size);
            // Could send to server for leaderboard, but for now just local
          }
        }
      });
      
      // Boundary collision
      if (pos.x < 20) {
        pos.x = 20;
        pos.velocityX = 0;
      }
      if (pos.x > canvasWidth - 40) {
        pos.x = canvasWidth - 40;
        pos.velocityX = 0;
      }

      // Send position update every 50ms (only if not spectating)
      if (!isSpectator && now % 50 < 16) {
        socketClient.sendPlayerPosition(lobbyRef.current.id, pos);
      }

      // Render - use actual canvas dimensions
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Draw background (vibrant sky gradient - Fortnite style)
      const skyGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight * 0.6);
      skyGradient.addColorStop(0, '#87CEEB'); // Sky blue
      skyGradient.addColorStop(0.5, '#FFB6C1'); // Light pink
      skyGradient.addColorStop(1, '#FFD700'); // Gold
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight * 0.6);
      
      // Draw lower sky
      const lowerSkyGradient = ctx.createLinearGradient(0, canvasHeight * 0.6, 0, scaledGroundY);
      lowerSkyGradient.addColorStop(0, '#FFD700');
      lowerSkyGradient.addColorStop(1, '#E0F6FF');
      ctx.fillStyle = lowerSkyGradient;
      ctx.fillRect(0, canvasHeight * 0.6, canvasWidth, scaledGroundY - canvasHeight * 0.6);

      // Draw props first (background elements)
      props.forEach(prop => {
        drawProp(ctx, prop, scaledGroundY);
      });

      // Draw platforms
      platforms.forEach(platform => {
        drawPlatform(ctx, platform, scaledGroundY);
      });

      // Draw buildings (before ground so they appear on top)
      buildings.forEach(building => {
        drawBuilding(ctx, building, scaledGroundY);
      });

      // Draw collectibles
      collectiblesRef.current.forEach(coin => {
        if (!coin.collected) {
          drawCollectible(ctx, coin, now);
        }
      });

      // Draw ground (cartoonish grass/pavement) - reuse scaledGroundY from above
      // Draw pavement base
      ctx.fillStyle = '#95A5A6';
      ctx.fillRect(0, scaledGroundY, canvasWidth, canvasHeight - scaledGroundY);
      
      // Draw grass patches between buildings
      ctx.fillStyle = '#7CB342';
      for (let i = 0; i < canvasWidth; i += 150) {
        ctx.fillRect(i, scaledGroundY, 50, canvasHeight - scaledGroundY);
      }
      
      // Draw road markings
      ctx.strokeStyle = '#F39C12';
      ctx.lineWidth = 3;
      ctx.setLineDash([20, 15]);
      ctx.beginPath();
      ctx.moveTo(canvasWidth / 2, scaledGroundY);
      ctx.lineTo(canvasWidth / 2, canvasHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw grass details
      ctx.fillStyle = '#558B2F';
      for (let i = 0; i < canvasWidth; i += 30) {
        if (i % 150 < 50) { // Only draw in grass patches
          ctx.fillRect(i, scaledGroundY, 2, 10);
        }
      }

      // Draw clouds (more vibrant, Fortnite style)
      drawCloud(ctx, 150, 100, 60);
      drawCloud(ctx, 400, 80, 80);
      drawCloud(ctx, 650, 120, 50);
      drawCloud(ctx, 900, 90, 70);

      // Draw remote players
      const currentLobby = lobbyRef.current;
      remotePlayersRef.current.forEach((remotePlayer) => {
        // Get avatar URL from remote player, lobby players, or fallback
        const avatarUrl = remotePlayer.avatarUrl || 
                         currentLobby.players?.find(p => p.walletAddress === remotePlayer.walletAddress)?.avatarUrl;
        
        // Get avatar image from cache
        let avatarImage: HTMLImageElement | undefined;
        if (avatarUrl) {
          avatarImage = avatarImageCacheRef.current.get(avatarUrl);
          // If not cached but URL exists, try to load it
          if (!avatarImage && avatarUrl) {
            loadAvatarImage(avatarUrl);
          }
        }
        
        const displayName = remotePlayer.username || remotePlayer.walletAddress.slice(0, 6);
        drawPlayer(ctx, remotePlayer.position, displayName, false, avatarImage);
      });

      // Draw local player
      const localPlayer = currentLobby.players?.find(p => p.walletAddress === address);
      const localAvatarUrl = localPlayer?.avatarUrl || localPlayerProfile?.avatarUrl;
      const localAvatarImage = localAvatarUrl ? avatarImageCacheRef.current.get(localAvatarUrl) : undefined;
      drawPlayer(ctx, pos, 'You', true, localAvatarImage);

      // Draw player names/labels
      ctx.fillStyle = '#333';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      
      remotePlayersRef.current.forEach((remotePlayer) => {
        const name = remotePlayer.username || remotePlayer.walletAddress.slice(0, 6);
        ctx.fillText(name, remotePlayer.position.x + 20, remotePlayer.position.y - 22);
        
        // Draw microphone icon if speaking
        if (remotePlayer.isSpeaking) {
          const micY = remotePlayer.position.y - 37;
          const pulseSize = 8 + Math.sin(Date.now() / 100) * 2;
          
          // Outer glow ring
          ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(remotePlayer.position.x + 20, micY, pulseSize + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          
          // Microphone icon background
          const micGradient = ctx.createRadialGradient(
            remotePlayer.position.x + 20, micY - 2, 0,
            remotePlayer.position.x + 20, micY, 8
          );
          micGradient.addColorStop(0, '#34d399');
          micGradient.addColorStop(1, '#10b981');
          ctx.fillStyle = micGradient;
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(remotePlayer.position.x + 20, micY, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          
          // Microphone icon border
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(remotePlayer.position.x + 20, micY, 8, 0, Math.PI * 2);
          ctx.stroke();
          
          // Microphone lines
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(remotePlayer.position.x + 20, micY - 5);
          ctx.lineTo(remotePlayer.position.x + 20, micY + 5);
          ctx.moveTo(remotePlayer.position.x + 17, micY + 5);
          ctx.lineTo(remotePlayer.position.x + 23, micY + 5);
          ctx.stroke();
        }
      });
      
      ctx.fillText('You', pos.x + 20, pos.y - 22);
      
      // Draw microphone icon for local player if speaking
      if (isSpeaking) {
        const micY = pos.y - 37;
        const pulseSize = 8 + Math.sin(Date.now() / 100) * 2;
        
        // Outer glow ring
        ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(pos.x + 20, micY, pulseSize + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Microphone icon background
        const micGradient = ctx.createRadialGradient(pos.x + 20, micY - 2, 0, pos.x + 20, micY, 8);
        micGradient.addColorStop(0, '#34d399');
        micGradient.addColorStop(1, '#10b981');
        ctx.fillStyle = micGradient;
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(pos.x + 20, micY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Microphone icon border
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x + 20, micY, 8, 0, Math.PI * 2);
        ctx.stroke();
        
        // Microphone lines
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(pos.x + 20, micY - 5);
        ctx.lineTo(pos.x + 20, micY + 5);
        ctx.moveTo(pos.x + 17, micY + 5);
        ctx.lineTo(pos.x + 23, micY + 5);
        ctx.stroke();
      }

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
      socketClient.off('game:voice_state', handleVoiceState);
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

  // Initialize voice chat service
  useEffect(() => {
    if (!voiceChatRef.current && isVoiceEnabled) {
      const voiceChat = new VoiceChatService();
      // Load settings from localStorage
      const saved = localStorage.getItem(`voice_settings_${address}`);
      if (saved) {
        const settings = JSON.parse(saved);
        voiceChat.setPushToTalkKey(settings.pushToTalkKey || 'v');
        voiceChat.setPushToTalk(true); // Always use push-to-talk mode
      }
      voiceChatRef.current = voiceChat;
      
      // Initialize voice chat (request microphone access)
      voiceChat.initialize().catch(err => {
        console.error('[WaitingRoom] Failed to initialize voice chat:', err);
        setIsVoiceEnabled(false);
      });
    }
    return () => {
      if (voiceChatRef.current) {
        voiceChatRef.current.cleanup();
        voiceChatRef.current = null;
      }
    };
  }, [address, isVoiceEnabled]);

  // Initialize voice chat and push-to-talk handlers
  useEffect(() => {
    if (!isVoiceEnabled) return;

    const voiceChat = voiceChatRef.current;
    if (!voiceChat) return;
    
    // Ensure push-to-talk is enabled
    voiceChat.setPushToTalk(true);

    // Set up push-to-talk key handler
    const handlePushToTalkKeyDown = (e: KeyboardEvent) => {
      // Prevent default behavior for push-to-talk key
      if (e.key.toLowerCase() === pushToTalkKey.toLowerCase() && voiceChat.getPushToTalk()) {
        e.preventDefault();
        if (!keysPressedRef.current.has(e.key.toLowerCase())) {
          keysPressedRef.current.add(e.key.toLowerCase());
          voiceChat.startPushToTalk();
          setIsSpeaking(true);
          if (socketClient.isConnected()) {
            socketClient.sendVoiceState(lobby.id, true);
          }
        }
      }
    };

    const handlePushToTalkKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === pushToTalkKey.toLowerCase()) {
        keysPressedRef.current.delete(e.key.toLowerCase());
        voiceChat.stopPushToTalk();
        setIsSpeaking(false);
        if (socketClient.isConnected()) {
          socketClient.sendVoiceState(lobby.id, false);
        }
      }
    };

    window.addEventListener('keydown', handlePushToTalkKeyDown);
    window.addEventListener('keyup', handlePushToTalkKeyUp);

    return () => {
      window.removeEventListener('keydown', handlePushToTalkKeyDown);
      window.removeEventListener('keyup', handlePushToTalkKeyUp);
      // Stop any active push-to-talk when unmounting
      if (keysPressedRef.current.has(pushToTalkKey.toLowerCase())) {
        voiceChat.stopPushToTalk();
        setIsSpeaking(false);
        if (socketClient.isConnected()) {
          socketClient.sendVoiceState(lobby.id, false);
        }
      }
    };
  }, [pushToTalkKey, lobby.id, socketClient, isVoiceEnabled]);

  // Set up WebRTC peer connections for voice chat
  useEffect(() => {
    if (!isVoiceEnabled || !address || isSpectator) {
      webrtcInitializedRef.current = null;
      return;
    }
    
    const voiceChat = voiceChatRef.current;
    if (!voiceChat) {
      webrtcInitializedRef.current = null;
      return;
    }
    
    // Skip if already initialized for this lobby
    if (webrtcInitializedRef.current === lobby.id) {
      return;
    }
    
    // Reset if lobby changed
    if (webrtcInitializedRef.current !== null && webrtcInitializedRef.current !== lobby.id) {
      console.log(`[VoiceChat] Lobby changed from ${webrtcInitializedRef.current} to ${lobby.id}, resetting WebRTC`);
      // Clean up old connections
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      remoteAudioRefs.current.forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
      });
      remoteAudioRefs.current.clear();
      processedPlayersRef.current.clear();
    }
    
    webrtcInitializedRef.current = lobby.id;

    // Helper to create a peer connection for a specific player
    const createPeerConnection = async (targetAddress: string, isInitiator: boolean = true) => {
      if (peerConnectionsRef.current.has(targetAddress)) {
        const existingConnection = peerConnectionsRef.current.get(targetAddress)!;
        // Check if existing connection is still valid
        if (existingConnection.signalingState === 'closed' || existingConnection.connectionState === 'closed') {
          console.log(`[VoiceChat] Existing connection for ${targetAddress} is closed, creating new one`);
          existingConnection.close();
          peerConnectionsRef.current.delete(targetAddress);
        } else {
          console.log(`[VoiceChat] Peer connection already exists for ${targetAddress}`);
          return existingConnection;
        }
      }

      console.log(`[VoiceChat] Creating peer connection to ${targetAddress} (initiator: ${isInitiator})`);
      
      const configuration: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      };
      
      const peerConnection = new RTCPeerConnection(configuration);
      
      // Add local stream tracks to peer connection
      const localStream = voiceChat.getLocalStream();
      if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        console.log(`[VoiceChat] 🎤 Adding ${audioTracks.length} local audio track(s) to peer connection for ${targetAddress}`);
        audioTracks.forEach(track => {
          console.log(`[VoiceChat] Track: ${track.label}, enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
          peerConnection.addTrack(track, localStream);
        });
      } else {
        console.error(`[VoiceChat] ❌ No local stream available! Voice chat may not be initialized.`);
      }
      
      // Handle incoming remote stream
      peerConnection.ontrack = (event) => {
        console.log(`[VoiceChat] ✅ Received remote stream from ${targetAddress}`, event);
        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];
          
          console.log(`[VoiceChat] Remote stream has ${remoteStream.getAudioTracks().length} audio tracks`);
          
          // Create or get audio element for this player
          let audioElement = remoteAudioRefs.current.get(targetAddress);
          if (!audioElement) {
            audioElement = new Audio();
            audioElement.autoplay = true;
            audioElement.volume = 1.0;
            remoteAudioRefs.current.set(targetAddress, audioElement);
            
            // Add event listeners for debugging
            audioElement.addEventListener('loadedmetadata', () => {
              console.log(`[VoiceChat] ✅ Audio element loaded metadata for ${targetAddress}`);
            });
            audioElement.addEventListener('canplay', () => {
              console.log(`[VoiceChat] ✅ Audio element can play for ${targetAddress}`);
            });
            audioElement.addEventListener('play', () => {
              console.log(`[VoiceChat] ✅ Audio element started playing for ${targetAddress}`);
            });
            audioElement.addEventListener('error', (e) => {
              console.error(`[VoiceChat] ❌ Audio element error for ${targetAddress}:`, e);
            });
          }
          
          // Set the remote stream as the audio source
          audioElement.srcObject = remoteStream;
          
          // Ensure audio is unmuted and volume is set
          audioElement.muted = false;
          audioElement.volume = 1.0;
          
          // Try to play it explicitly - handle autoplay restrictions
          const playPromise = audioElement.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log(`[VoiceChat] ✅ Successfully started playing audio for ${targetAddress}`);
              })
              .catch((err) => {
                console.error(`[VoiceChat] ❌ Failed to play audio for ${targetAddress}:`, err);
                // Try again after a short delay (user interaction might be needed)
                setTimeout(() => {
                  audioElement.play().catch((retryErr) => {
                    console.error(`[VoiceChat] ❌ Retry failed for ${targetAddress}:`, retryErr);
                  });
                }, 1000);
              });
          }
        }
      };
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`[VoiceChat] Sending ICE candidate to ${targetAddress}`);
          socketClient.sendWebRTCIceCandidate(lobby.id, targetAddress, event.candidate.toJSON());
        }
      };
      
      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        const signalingState = peerConnection.signalingState;
        console.log(`[VoiceChat] 🔄 Connection state with ${targetAddress}: ${state}, signaling: ${signalingState}`);
        
        if (state === 'connected') {
          console.log(`[VoiceChat] ✅ CONNECTED to ${targetAddress} - audio should work now!`);
        } else if (state === 'closed' || signalingState === 'closed') {
          console.warn(`[VoiceChat] ⚠️ Connection closed for ${targetAddress}, cleaning up`);
          // Clean up closed connection
          peerConnectionsRef.current.delete(targetAddress);
          const audioElement = remoteAudioRefs.current.get(targetAddress);
          if (audioElement) {
            audioElement.pause();
            audioElement.srcObject = null;
            remoteAudioRefs.current.delete(targetAddress);
          }
        } else if (state === 'failed' || state === 'disconnected') {
          console.error(`[VoiceChat] ❌ Connection ${state} with ${targetAddress}`);
          // Try to reconnect after a delay
          setTimeout(() => {
            const stillExists = peerConnectionsRef.current.get(targetAddress);
            if (stillExists && stillExists === peerConnection && stillExists.connectionState !== 'closed') {
              console.log(`[VoiceChat] 🔄 Attempting to reconnect to ${targetAddress}`);
            }
          }, 2000);
        } else if (state === 'connecting') {
          console.log(`[VoiceChat] 🔄 Connecting to ${targetAddress}...`);
        }
      };
      
      peerConnectionsRef.current.set(targetAddress, peerConnection);
      
      // Only create and send offer if we're the initiator (not handling an incoming offer)
      if (isInitiator) {
        // Add a small delay to ensure both players are in the socket room
        setTimeout(async () => {
          // Check if connection still exists and is not closed
          const currentConnection = peerConnectionsRef.current.get(targetAddress);
          if (!currentConnection || currentConnection !== peerConnection) {
            console.warn(`[VoiceChat] ⚠️ Peer connection for ${targetAddress} no longer exists or was replaced`);
            return;
          }
          
          // Check connection state before creating offer
          if (peerConnection.signalingState === 'closed' || peerConnection.connectionState === 'closed') {
            console.warn(`[VoiceChat] ⚠️ Peer connection for ${targetAddress} is closed, cannot create offer`);
            return;
          }
          
          try {
            const offer = await peerConnection.createOffer();
            // Double-check connection is still valid before setting description
            if (peerConnection.signalingState === 'closed') {
              console.warn(`[VoiceChat] ⚠️ Connection closed while creating offer for ${targetAddress}`);
              return;
            }
            await peerConnection.setLocalDescription(offer);
            console.log(`[VoiceChat] 📤 Sending offer to ${targetAddress}`);
            socketClient.sendWebRTCOffer(lobby.id, targetAddress, offer);
          } catch (error) {
            console.error(`[VoiceChat] ❌ Error creating offer for ${targetAddress}:`, error);
            // If connection is closed, remove it from the map
            if (error instanceof Error && error.message.includes('closed')) {
              console.log(`[VoiceChat] Removing closed connection for ${targetAddress}`);
              peerConnectionsRef.current.delete(targetAddress);
            }
          }
        }, 500); // 500ms delay to ensure socket room is joined
      }
      
      return peerConnection;
    };
    
    // Create peer connections for all other players in the lobby (only if they don't exist)
    const otherPlayers = (lobby.players || []).filter(p => p.walletAddress !== address);
    otherPlayers.forEach(player => {
      if (!peerConnectionsRef.current.has(player.walletAddress)) {
        console.log(`[VoiceChat] Creating initial peer connection for ${player.walletAddress}`);
        createPeerConnection(player.walletAddress);
      } else {
        console.log(`[VoiceChat] Peer connection already exists for ${player.walletAddress}, skipping`);
      }
    });
    
    // Handle WebRTC signaling events
    const handleWebRTCOffer = async (data: { fromAddress: string; offer: RTCSessionDescriptionInit }) => {
      const { fromAddress, offer } = data;
      console.log(`[VoiceChat] ✅ Received offer from ${fromAddress}`);
      
      // Create peer connection if it doesn't exist (as responder, not initiator)
      let peerConnection = peerConnectionsRef.current.get(fromAddress);
      if (!peerConnection) {
        console.log(`[VoiceChat] Creating peer connection for incoming offer from ${fromAddress}`);
        peerConnection = await createPeerConnection(fromAddress, false); // false = not initiator
      }
      
      if (!peerConnection) {
        console.error(`[VoiceChat] ❌ Failed to create peer connection for ${fromAddress}`);
        return;
      }
      
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log(`[VoiceChat] ✅ Sending answer to ${fromAddress}`);
        socketClient.sendWebRTCAnswer(lobby.id, fromAddress, answer);
      } catch (error) {
        console.error(`[VoiceChat] ❌ Error handling offer from ${fromAddress}:`, error);
      }
    };
    
    const handleWebRTCAnswer = async (data: { fromAddress: string; answer: RTCSessionDescriptionInit }) => {
      const { fromAddress, answer } = data;
      console.log(`[VoiceChat] ✅ Received answer from ${fromAddress}`, answer);
      
      const peerConnection = peerConnectionsRef.current.get(fromAddress);
      if (!peerConnection) {
        console.warn(`[VoiceChat] ⚠️ No peer connection found for ${fromAddress} - creating one now`);
        // Create peer connection if it doesn't exist (shouldn't happen, but handle gracefully)
        await createPeerConnection(fromAddress, false);
        const newPeerConnection = peerConnectionsRef.current.get(fromAddress);
        if (!newPeerConnection) {
          console.error(`[VoiceChat] ❌ Failed to create peer connection for ${fromAddress}`);
          return;
        }
        try {
          await newPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          console.log(`[VoiceChat] ✅ Set remote description from answer for ${fromAddress}`);
        } catch (error) {
          console.error(`[VoiceChat] ❌ Error handling answer from ${fromAddress}:`, error);
        }
        return;
      }
      
      try {
        const currentRemoteDesc = peerConnection.remoteDescription;
        if (currentRemoteDesc) {
          console.log(`[VoiceChat] ⚠️ Peer connection already has remote description, replacing it`);
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`[VoiceChat] ✅ Successfully set remote description from answer for ${fromAddress}`);
        console.log(`[VoiceChat] Connection state: ${peerConnection.connectionState}, ICE connection state: ${peerConnection.iceConnectionState}`);
      } catch (error) {
        console.error(`[VoiceChat] ❌ Error handling answer from ${fromAddress}:`, error);
      }
    };
    
    const handleWebRTCIce = async (data: { fromAddress: string; candidate: RTCIceCandidateInit }) => {
      const { fromAddress, candidate } = data;
      console.log(`[VoiceChat] ✅ Received ICE candidate from ${fromAddress}`, candidate);
      
      const peerConnection = peerConnectionsRef.current.get(fromAddress);
      if (!peerConnection) {
        console.warn(`[VoiceChat] ⚠️ No peer connection found for ${fromAddress} when adding ICE candidate`);
        return;
      }
      
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log(`[VoiceChat] ✅ Successfully added ICE candidate from ${fromAddress}`);
      } catch (error) {
        console.error(`[VoiceChat] ❌ Error adding ICE candidate from ${fromAddress}:`, error);
      }
    };
    
    // Set up socket listeners
    socketClient.onWebRTCOffer(handleWebRTCOffer);
    socketClient.onWebRTCAnswer(handleWebRTCAnswer);
    socketClient.onWebRTCIceCandidate(handleWebRTCIce);
    
    // Cleanup function
    return () => {
      console.log('[VoiceChat] Cleaning up peer connections');
      if (webrtcInitializedRef.current === lobby.id) {
        webrtcInitializedRef.current = null;
      }
      
      // Close all peer connections
      peerConnectionsRef.current.forEach((peerConnection, targetAddress) => {
        peerConnection.close();
        console.log(`[VoiceChat] Closed peer connection to ${targetAddress}`);
      });
      peerConnectionsRef.current.clear();
      
      // Stop all remote audio elements
      remoteAudioRefs.current.forEach((audioElement) => {
        audioElement.pause();
        audioElement.srcObject = null;
      });
      remoteAudioRefs.current.clear();
      
      // Remove socket listeners
      socketClient.off('webrtc:offer', handleWebRTCOffer);
      socketClient.off('webrtc:answer', handleWebRTCAnswer);
      socketClient.off('webrtc:ice', handleWebRTCIce);
    };
  }, [isVoiceEnabled, address, lobby.id, socketClient, isSpectator]); // Removed lobby.players to prevent recreation on every player update

  // Handle new players joining - create peer connections
  useEffect(() => {
    if (!isVoiceEnabled || !address || isSpectator) return;
    
    const voiceChat = voiceChatRef.current;
    if (!voiceChat) return;
    
    const otherPlayers = (lobby.players || []).filter(p => p.walletAddress !== address);
    
    // Create peer connections for new players (only if we haven't already)
    otherPlayers.forEach(player => {
      const playerAddress = player.walletAddress;
      
      // Skip if we already have a connection or have processed this player
      if (peerConnectionsRef.current.has(playerAddress) || processedPlayersRef.current.has(playerAddress)) {
        return;
      }
      
      console.log(`[VoiceChat] 🆕 New player detected: ${playerAddress}, creating peer connection...`);
      processedPlayersRef.current.add(playerAddress);
      
      // Use the same createPeerConnection function from the main WebRTC effect
      // We'll create it here inline to avoid dependency issues
      const createPeerForNewPlayer = async () => {
        const configuration: RTCConfiguration = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        };
        
        const peerConnection = new RTCPeerConnection(configuration);
        
        const localStream = voiceChat.getLocalStream();
        if (localStream) {
          localStream.getAudioTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
          });
        }
        
        peerConnection.ontrack = (event) => {
          console.log(`[VoiceChat] ✅ Received remote stream from ${playerAddress}`, event);
          if (event.streams && event.streams[0]) {
            let audioElement = remoteAudioRefs.current.get(playerAddress);
            if (!audioElement) {
              audioElement = new Audio();
              audioElement.autoplay = true;
              audioElement.volume = 1.0;
              remoteAudioRefs.current.set(playerAddress, audioElement);
              
              audioElement.addEventListener('loadedmetadata', () => {
                console.log(`[VoiceChat] ✅ Audio element loaded metadata for ${playerAddress}`);
              });
              audioElement.addEventListener('canplay', () => {
                console.log(`[VoiceChat] ✅ Audio element can play for ${playerAddress}`);
              });
              audioElement.addEventListener('play', () => {
                console.log(`[VoiceChat] ✅ Audio element started playing for ${playerAddress}`);
              });
              audioElement.addEventListener('error', (e) => {
                console.error(`[VoiceChat] ❌ Audio element error for ${playerAddress}:`, e);
              });
            }
            audioElement.srcObject = event.streams[0];
            audioElement.muted = false;
            audioElement.volume = 1.0;
            
            const playPromise = audioElement.play();
            if (playPromise !== undefined) {
              playPromise.catch((err) => {
                console.error(`[VoiceChat] ❌ Failed to play audio for ${playerAddress}:`, err);
              });
            }
          }
        };
        
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            socketClient.sendWebRTCIceCandidate(lobby.id, playerAddress, event.candidate.toJSON());
          }
        };
        
        peerConnection.onconnectionstatechange = () => {
          const state = peerConnection.connectionState;
          console.log(`[VoiceChat] 🔄 Connection state with ${playerAddress}: ${state}`);
          if (state === 'connected') {
            console.log(`[VoiceChat] ✅ CONNECTED to ${playerAddress} - audio should work now!`);
          }
        };
        
        peerConnectionsRef.current.set(playerAddress, peerConnection);
        
        // Add a small delay to ensure both players are in the socket room before sending offer
        setTimeout(async () => {
          // Check if connection still exists and is not closed
          const currentConnection = peerConnectionsRef.current.get(playerAddress);
          if (!currentConnection || currentConnection !== peerConnection) {
            console.warn(`[VoiceChat] ⚠️ Peer connection for ${playerAddress} no longer exists or was replaced`);
            return;
          }
          
          // Check connection state before creating offer
          if (peerConnection.signalingState === 'closed' || peerConnection.connectionState === 'closed') {
            console.warn(`[VoiceChat] ⚠️ Peer connection for ${playerAddress} is closed, cannot create offer`);
            return;
          }
          
          try {
            const offer = await peerConnection.createOffer();
            // Double-check connection is still valid before setting description
            if (peerConnection.signalingState === 'closed') {
              console.warn(`[VoiceChat] ⚠️ Connection closed while creating offer for ${playerAddress}`);
              return;
            }
            await peerConnection.setLocalDescription(offer);
            console.log(`[VoiceChat] 📤 Sending offer to new player ${playerAddress}`);
            socketClient.sendWebRTCOffer(lobby.id, playerAddress, offer);
          } catch (error) {
            console.error(`[VoiceChat] ❌ Error creating offer for new player ${playerAddress}:`, error);
            // If connection is closed, remove it from the map
            if (error instanceof Error && error.message.includes('closed')) {
              console.log(`[VoiceChat] Removing closed connection for ${playerAddress}`);
              peerConnectionsRef.current.delete(playerAddress);
              processedPlayersRef.current.delete(playerAddress);
            }
          }
        }, 500); // 500ms delay to ensure socket room is joined
      };
      
      createPeerForNewPlayer();
    });
    
    // Clean up peer connections for players who left
    const currentPlayerAddresses = new Set(otherPlayers.map(p => p.walletAddress));
    peerConnectionsRef.current.forEach((peerConnection, targetAddress) => {
      if (!currentPlayerAddresses.has(targetAddress) && targetAddress !== address) {
        console.log(`[VoiceChat] 🗑️ Player ${targetAddress} left, closing peer connection`);
        peerConnection.close();
        peerConnectionsRef.current.delete(targetAddress);
        processedPlayersRef.current.delete(targetAddress);
        
        const audioElement = remoteAudioRefs.current.get(targetAddress);
        if (audioElement) {
          audioElement.pause();
          audioElement.srcObject = null;
          remoteAudioRefs.current.delete(targetAddress);
        }
      }
    });
  }, [lobby.players?.length, isVoiceEnabled, address, socketClient, lobby.id, isSpectator]); // Use length instead of full array to reduce re-renders

  // Preload avatars on initial mount and when lobby changes
  useEffect(() => {
    (lobby.players || []).forEach(player => {
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
    // Check if image is loaded and valid
    const hasAvatar = avatarImage && avatarImage.complete && avatarImage.naturalWidth > 0 && avatarImage.naturalHeight > 0;
    
    if (hasAvatar) {
      // Draw avatar as circular clip
      ctx.save();
      ctx.beginPath();
      ctx.arc(20, 0, bodyRadius, 0, Math.PI * 2);
      ctx.clip();
      
      // Draw avatar image centered - fill the circle
      const avatarSize = bodyRadius * 2;
      ctx.drawImage(
        avatarImage,
        20 - bodyRadius,
        -bodyRadius,
        avatarSize,
        avatarSize
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
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y, size * 0.6, 0, Math.PI * 2);
    ctx.arc(x + size * 1.2, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.3, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.9, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  };
  
  const drawBuilding = (ctx: CanvasRenderingContext2D, building: Building, groundY: number) => {
    const { x, y, width, height, color, roofColor, windowColor, type } = building;
    
    // Building shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(x + 5, groundY, width, 8);
    
    // Building body
    const bodyGradient = ctx.createLinearGradient(x, y, x, y + height);
    bodyGradient.addColorStop(0, color);
    bodyGradient.addColorStop(1, adjustColor(color, -20));
    ctx.fillStyle = bodyGradient;
    ctx.fillRect(x, y, width, height);
    
    // Building outline
    ctx.strokeStyle = adjustColor(color, -30);
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    
    // Windows
    const windowRows = type === 'tower' ? 4 : 3;
    const windowCols = type === 'tower' ? 3 : 2;
    const windowWidth = 15;
    const windowHeight = 20;
    const windowSpacing = 8;
    const startX = x + (width - (windowCols * windowWidth + (windowCols - 1) * windowSpacing)) / 2;
    const startY = y + 20;
    
    for (let row = 0; row < windowRows; row++) {
      for (let col = 0; col < windowCols; col++) {
        const wx = startX + col * (windowWidth + windowSpacing);
        const wy = startY + row * (windowHeight + windowSpacing);
        
        if (wy + windowHeight < y + height - 10) {
          // Window frame
          ctx.fillStyle = '#2C3E50';
          ctx.fillRect(wx, wy, windowWidth, windowHeight);
          
          // Window glass (with glow effect) - deterministic based on position
          const isLit = ((wx + wy) % 3) !== 0; // Deterministic lighting pattern
          if (isLit) {
            ctx.fillStyle = windowColor;
            ctx.shadowColor = windowColor;
            ctx.shadowBlur = 5;
          } else {
            ctx.fillStyle = '#1A252F';
          }
          ctx.fillRect(wx + 2, wy + 2, windowWidth - 4, windowHeight - 4);
          ctx.shadowBlur = 0;
          
          // Window cross
          ctx.strokeStyle = '#34495E';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(wx + windowWidth / 2, wy);
          ctx.lineTo(wx + windowWidth / 2, wy + windowHeight);
          ctx.moveTo(wx, wy + windowHeight / 2);
          ctx.lineTo(wx + windowWidth, wy + windowHeight / 2);
          ctx.stroke();
        }
      }
    }
    
    // Door
    const doorWidth = 25;
    const doorHeight = 35;
    const doorX = x + (width - doorWidth) / 2;
    const doorY = y + height - doorHeight;
    
    ctx.fillStyle = '#2C3E50';
    ctx.fillRect(doorX, doorY, doorWidth, doorHeight);
    ctx.strokeStyle = '#1A252F';
    ctx.lineWidth = 2;
    ctx.strokeRect(doorX, doorY, doorWidth, doorHeight);
    
    // Door handle
    ctx.fillStyle = '#F39C12';
    ctx.beginPath();
    ctx.arc(doorX + doorWidth - 6, doorY + doorHeight / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Roof
    if (type === 'house') {
      // Triangular roof
      ctx.fillStyle = roofColor;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x + width / 2, y - 30);
      ctx.lineTo(x + width + 10, y);
      ctx.closePath();
      ctx.fill();
      
      // Roof outline
      ctx.strokeStyle = adjustColor(roofColor, -30);
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (type === 'tower') {
      // Flat roof with railing
      ctx.fillStyle = roofColor;
      ctx.fillRect(x - 5, y - 15, width + 10, 15);
      
      // Railing
      ctx.strokeStyle = adjustColor(roofColor, -40);
      ctx.lineWidth = 2;
      for (let i = 0; i < width + 10; i += 8) {
        ctx.beginPath();
        ctx.moveTo(x - 5 + i, y - 15);
        ctx.lineTo(x - 5 + i, y - 5);
        ctx.stroke();
      }
    } else {
      // Shop - flat roof
      ctx.fillStyle = roofColor;
      ctx.fillRect(x - 5, y - 10, width + 10, 10);
    }
    
    // Building sign (for shops)
    if (type === 'shop') {
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('SHOP', x + width / 2, y - 15);
    }
  };
  
  const adjustColor = (color: string, amount: number): string => {
    // Simple color darkening/lightening
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };
  
  const drawPlatform = (ctx: CanvasRenderingContext2D, platform: Platform, groundY: number) => {
    const { x, y, width, height, isMoving } = platform;
    
    // Platform shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(x + 2, groundY, width, 5);
    
    // Platform body with gradient
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, '#8B7355');
    gradient.addColorStop(0.5, '#A0826D');
    gradient.addColorStop(1, '#6B5B47');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    
    // Platform top highlight
    ctx.fillStyle = '#CD853F';
    ctx.fillRect(x, y, width, 2);
    
    // Moving platform indicator
    if (isMoving) {
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x + width / 2, y - 8, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    
    // Platform outline
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
  };
  
  const drawCollectible = (ctx: CanvasRenderingContext2D, coin: Collectible, time: number) => {
    const { x, y } = coin;
    const rotation = (time / 10) % (Math.PI * 2);
    const bobOffset = Math.sin(time / 200) * 3;
    
    ctx.save();
    ctx.translate(x + 10, y + 10 + bobOffset);
    ctx.rotate(rotation);
    
    // Coin glow
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    
    // Coin body
    const coinGradient = ctx.createRadialGradient(0, -5, 0, 0, 0, 10);
    coinGradient.addColorStop(0, '#FFD700');
    coinGradient.addColorStop(0.7, '#FFA500');
    coinGradient.addColorStop(1, '#FF8C00');
    ctx.fillStyle = coinGradient;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Coin shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(-3, -3, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Coin symbol ($)
    ctx.fillStyle = '#654321';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 0);
    
    ctx.shadowBlur = 0;
    ctx.restore();
  };
  
  const drawProp = (ctx: CanvasRenderingContext2D, prop: Prop, groundY: number) => {
    const { x, y, type, width, height } = prop;
    const propY = groundY - height;
    
    switch (type) {
      case 'tree':
        // Tree trunk
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(x + width / 2 - 4, propY + height - 15, 8, 15);
        // Tree leaves
        ctx.fillStyle = '#228B22';
        ctx.beginPath();
        ctx.arc(x + width / 2, propY + height - 15, width / 2, 0, Math.PI * 2);
        ctx.fill();
        // Tree highlight
        ctx.fillStyle = '#32CD32';
        ctx.beginPath();
        ctx.arc(x + width / 2 - 3, propY + height - 18, width / 3, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'bench':
        // Bench seat
        ctx.fillStyle = '#654321';
        ctx.fillRect(x, propY + height - 8, width, 8);
        // Bench back
        ctx.fillRect(x, propY + height - 15, width, 7);
        // Bench legs
        ctx.fillRect(x + 3, propY + height - 8, 4, 8);
        ctx.fillRect(x + width - 7, propY + height - 8, 4, 8);
        break;
        
      case 'streetlight':
        // Pole
        ctx.fillStyle = '#2C3E50';
        ctx.fillRect(x + width / 2 - 2, propY + height - 20, 4, 20);
        // Light
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x + width / 2, propY + height - 20, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Light glow on ground
        ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
        ctx.beginPath();
        ctx.ellipse(x + width / 2, groundY, 15, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'sign':
        // Sign post
        ctx.fillStyle = '#34495E';
        ctx.fillRect(x + width / 2 - 1, propY + height - 10, 2, 10);
        // Sign board
        ctx.fillStyle = '#ECF0F1';
        ctx.fillRect(x, propY + height - 20, width, 10);
        ctx.strokeStyle = '#2C3E50';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, propY + height - 20, width, 10);
        // Sign text
        ctx.fillStyle = '#2C3E50';
        ctx.font = '8px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('!', x + width / 2, propY + height - 13);
        break;
        
      case 'fence':
        // Fence posts
        for (let i = 0; i < width; i += 15) {
          ctx.fillStyle = '#8B7355';
          ctx.fillRect(x + i, propY + height - 15, 3, 15);
        }
        // Fence rails
        ctx.fillStyle = '#654321';
        ctx.fillRect(x, propY + height - 12, width, 2);
        ctx.fillRect(x, propY + height - 6, width, 2);
        break;
    }
  };

  // Cleanup: leave lobby when component unmounts
  useEffect(() => {
    let hasLeft = false; // Prevent duplicate leave calls
    return () => {
      if (lobby.id && !hasLeft) {
        hasLeft = true;
        console.log('[WaitingRoom] Component unmounting, leaving lobby...');
        // Only leave socket room - the page-level cleanup handles API leave
        if (socketClient.isConnected()) {
          socketClient.leaveLobby(lobby.id);
        }
        // Don't call API leave here - LobbyWaitingRoomPage cleanup handles it
        // This prevents duplicate leave calls
      }
    };
  }, [lobby.id, socketClient]);

  const handleLeaveLobby = async () => {
    try {
      if (apiClient) {
        await apiClient.leaveLobby(lobby.id);
      }
      socketClient.leaveLobby(lobby.id);
      if (onLeaveLobby) {
        onLeaveLobby();
      }
      // Navigate back to lobby browser
      navigate('/lobbies');
    } catch (err: any) {
      console.error('Failed to leave lobby:', err);
      // Still navigate back even if API call fails
      navigate('/lobbies');
    }
  };

  return (
    <div className={`lobby-waiting-room ${isSpectator ? 'spectator-mode' : ''}`}>
      <button 
        className="leave-lobby-btn"
        onClick={handleLeaveLobby}
        title={isSpectator ? "Stop Spectating" : "Leave Lobby"}
      >
        {isSpectator ? '← Stop Spectating' : '← Leave Lobby'}
      </button>
      <div className="waiting-room-header">
        <h2>🎮 Waiting Room</h2>
        {countdown !== null && countdown > 0 ? (
          <div className="countdown-display">
            <span className="countdown-number">{countdown}</span>
            <span className="countdown-label">Game starting in...</span>
          </div>
        ) : (
          <div className="waiting-message">
            {isSpectator ? (
              <>👁️ Spectating • {lobby.players?.length || 0}/{lobby.maxPlayers ?? 50} players</>
            ) : (
              <>Waiting for players... ({lobby.players?.length || 0}/{lobby.maxPlayers ?? 50})</>
            )}
          </div>
        )}
      </div>
      <div className="waiting-room-canvas-container">
        <canvas ref={canvasRef} className="waiting-room-canvas" tabIndex={0} />
        {!isSpectator && (
          <div className="controls-hint">
            <p>🎮 Use Arrow Keys or WASD to move around!</p>
            <p>Spacebar or Up Arrow to jump</p>
            <p>💰 Collect coins on platforms and rooftops!</p>
            <p>🏃 Parkour across buildings and moving platforms!</p>
            <p className="coin-counter">💰 Collected: {coinCount}/10</p>
            {isVoiceEnabled && (
              <div className="voice-hint">
                <p>
                  🎤 Hold <kbd>{pushToTalkKey.toUpperCase()}</kbd> to talk
                  {isSpeaking && <span className="speaking-indicator"> 🔊 Speaking...</span>}
                </p>
                <div className="voice-status">
                  <p className="voice-status-title">🔊 Voice Chat Status:</p>
                  <p className="voice-status-info">
                    Local mic: {voiceChatRef.current?.getLocalStream() ? '✅ Active' : '❌ Not initialized'}
                  </p>
                  <p className="voice-status-info">
                    Peer connections: {peerConnectionsRef.current.size} / {(lobby.players || []).filter(p => p.walletAddress !== address).length}
                  </p>
                  {Array.from(peerConnectionsRef.current.entries()).map(([addr, pc]) => {
                    const player = lobby.players?.find(p => p.walletAddress === addr);
                    const state = pc.connectionState;
                    const iceState = pc.iceConnectionState;
                    const stateEmoji = state === 'connected' ? '✅' : state === 'connecting' || state === 'checking' ? '🔄' : '❌';
                    const audioElement = remoteAudioRefs.current.get(addr);
                    const hasAudio = audioElement && audioElement.srcObject;
                    const audioStatus = hasAudio ? '🎵' : '🔇';
                    return (
                      <p key={addr} className="voice-status-info">
                        {stateEmoji} {audioStatus} {player?.username || addr.slice(0, 8)}: {state} (ICE: {iceState})
                      </p>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {isSpectator && (
          <div className="controls-hint spectator-hint">
            <p>👁️ You are spectating this lobby</p>
            <p>Watch players move around and interact</p>
          </div>
        )}
        {isSpeaking && (
          <div className="speaking-overlay">
            <div className="speaking-pulse"></div>
            <span className="speaking-text">🎤 SPEAKING</span>
          </div>
        )}
      </div>
      <div className="waiting-room-players">
        <h3>Players in Lobby ({lobby.players?.length || 0})</h3>
        <div className="players-list">
          {(lobby.players || []).map((player) => {
            const avatarUrl = player.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${player.username || player.walletAddress}`;
            return (
              <PlayerTooltip
                key={player.walletAddress}
                walletAddress={player.walletAddress}
                apiClient={apiClient}
              >
                <div className="player-badge">
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
              </PlayerTooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

