import { useEffect, useRef, useState } from 'react';
import { SoccerGame, GameResult } from '../game/SoccerGame.js';
import { SocketClient } from '../services/socketClient.js';
import { VoiceChatService } from '../services/voiceChat.js';
import { ApiClient } from '../services/api.js';
import type { Lobby, PlayerPosition } from '@solana-defender/shared';
import { useWallet } from '../contexts/WalletContext.js';
import './SoccerGameCanvas.css';

interface SoccerGameCanvasProps {
  lobby: Lobby;
  socketClient: SocketClient;
  onGameEnd: (results: GameResult[]) => void;
  apiClient: ApiClient;
}

export function SoccerGameCanvas({ lobby, socketClient, onGameEnd, apiClient }: SoccerGameCanvasProps) {
  const { address } = useWallet();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SoccerGame | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const positionUpdateIntervalRef = useRef<number | null>(null);
  const voiceChatRef = useRef<VoiceChatService | null>(null);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => {
    const saved = localStorage.getItem(`voice_settings_${address}`);
    return saved ? JSON.parse(saved).enabled : false;
  });
  const [pushToTalkKey, setPushToTalkKey] = useState(() => {
    const saved = localStorage.getItem(`voice_settings_${address}`);
    return saved ? JSON.parse(saved).pushToTalkKey || 'v' : 'v';
  });
  const [isControlsExpanded, setIsControlsExpanded] = useState(false); // Default collapsed
  const [isPushingToTalk, setIsPushingToTalk] = useState(false); // Visual feedback for push-to-talk
  const [audioLevel, setAudioLevel] = useState(0); // Audio level for visualization
  const [enableLocalMonitor, setEnableLocalMonitor] = useState(() => {
    const saved = localStorage.getItem(`voice_settings_${address}`);
    return saved ? JSON.parse(saved).localMonitor || false : false;
  }); // Enable local audio monitoring for testing
  const keysPressedRef = useRef<Set<string>>(new Set());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map()); // Map of walletAddress -> RTCPeerConnection
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map()); // Map of walletAddress -> audio element
  const audioLevelIntervalRef = useRef<number | null>(null); // For audio level updates

  // Initialize voice chat service (create once)
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
        console.error('[SoccerGameCanvas] Failed to initialize voice chat:', err);
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

  // Update push-to-talk key when it changes
  useEffect(() => {
    const voiceChat = voiceChatRef.current;
    if (voiceChat) {
      voiceChat.setPushToTalkKey(pushToTalkKey);
    }
  }, [pushToTalkKey]);

  // Update local audio monitor setting
  useEffect(() => {
    const voiceChat = voiceChatRef.current;
    if (voiceChat) {
      voiceChat.setLocalAudioMonitor(enableLocalMonitor);
      // Save setting
      const saved = localStorage.getItem(`voice_settings_${address}`);
      const settings = saved ? JSON.parse(saved) : {};
      settings.localMonitor = enableLocalMonitor;
      localStorage.setItem(`voice_settings_${address}`, JSON.stringify(settings));
    }
  }, [enableLocalMonitor, address]);

  // Monitor audio levels for visualization
  useEffect(() => {
    if (!isVoiceEnabled || !voiceChatRef.current) {
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
        audioLevelIntervalRef.current = null;
      }
      setAudioLevel(0);
      return;
    }

    // Update audio level every 100ms
    audioLevelIntervalRef.current = window.setInterval(() => {
      const voiceChat = voiceChatRef.current;
      if (voiceChat) {
        const level = voiceChat.getAudioLevel();
        setAudioLevel(level);
      }
    }, 100);

    return () => {
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
        audioLevelIntervalRef.current = null;
      }
    };
  }, [isVoiceEnabled]);

  // Initialize voice chat and push-to-talk handlers
  useEffect(() => {
    if (!isVoiceEnabled) return;

    const voiceChat = voiceChatRef.current;
    if (!voiceChat) return;
    
    // Ensure push-to-talk is enabled
    voiceChat.setPushToTalk(true);

    // Set up push-to-talk key handler
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default behavior for push-to-talk key
      if (e.key.toLowerCase() === pushToTalkKey.toLowerCase() && voiceChat.getPushToTalk()) {
        e.preventDefault();
        if (!keysPressedRef.current.has(e.key.toLowerCase())) {
          keysPressedRef.current.add(e.key.toLowerCase());
          voiceChat.startPushToTalk();
          setIsPushingToTalk(true);
          if (gameRef.current && socketClient.isConnected()) {
            gameRef.current.updateLocalPlayerSpeaking(true);
            socketClient.sendVoiceState(lobby.id, true);
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === pushToTalkKey.toLowerCase()) {
        keysPressedRef.current.delete(e.key.toLowerCase());
        voiceChat.stopPushToTalk();
        setIsPushingToTalk(false);
        if (gameRef.current && socketClient.isConnected()) {
          gameRef.current.updateLocalPlayerSpeaking(false);
          socketClient.sendVoiceState(lobby.id, false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      // Stop any active push-to-talk when unmounting
      if (keysPressedRef.current.has(pushToTalkKey.toLowerCase())) {
        voiceChat.stopPushToTalk();
        setIsPushingToTalk(false);
        if (gameRef.current && socketClient.isConnected()) {
          gameRef.current.updateLocalPlayerSpeaking(false);
          socketClient.sendVoiceState(lobby.id, false);
        }
      }
    };
  }, [pushToTalkKey, lobby.id, socketClient, isVoiceEnabled]);

  // Set up WebRTC peer connections for voice chat during game
  useEffect(() => {
    if (!isVoiceEnabled || !address || !gameStarted) return;
    
    const voiceChat = voiceChatRef.current;
    if (!voiceChat) {
      console.warn('[SoccerGameCanvas] Voice chat service not initialized');
      return;
    }

    // Helper to create a peer connection for a specific player
    const createPeerConnection = async (targetAddress: string) => {
      if (peerConnectionsRef.current.has(targetAddress)) {
        console.log(`[SoccerGameCanvas] Peer connection already exists for ${targetAddress}`);
        return;
      }

      console.log(`[SoccerGameCanvas] Creating peer connection to ${targetAddress}`);
      
      const configuration: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      };
      
      const peerConnection = new RTCPeerConnection(configuration);
      
      // Add local stream tracks to peer connection
      const currentLocalStream = voiceChat.getLocalStream();
      if (currentLocalStream) {
        const audioTracks = currentLocalStream.getAudioTracks();
        console.log(`[SoccerGameCanvas] 🎤 Adding ${audioTracks.length} local audio track(s) to peer connection for ${targetAddress}`);
        audioTracks.forEach(track => {
          console.log(`[SoccerGameCanvas] Track: ${track.label}, enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
          peerConnection.addTrack(track, currentLocalStream);
        });
      } else {
        console.error(`[SoccerGameCanvas] ❌ No local stream available! Voice chat may not be initialized.`);
      }
    
      // Handle incoming remote stream
      peerConnection.ontrack = (event) => {
        console.log(`[SoccerGameCanvas] ✅ Received remote stream from ${targetAddress}`, event);
        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];
          
          console.log(`[SoccerGameCanvas] Remote stream has ${remoteStream.getAudioTracks().length} audio tracks`);
          
          // Create or get audio element for this player
          let audioElement = remoteAudioRefs.current.get(targetAddress);
          if (!audioElement) {
            audioElement = new Audio();
            audioElement.autoplay = true;
            audioElement.volume = 1.0;
            remoteAudioRefs.current.set(targetAddress, audioElement);
            
            // Add event listeners for debugging
            audioElement.addEventListener('loadedmetadata', () => {
              console.log(`[SoccerGameCanvas] ✅ Audio element loaded metadata for ${targetAddress}`);
            });
            audioElement.addEventListener('canplay', () => {
              console.log(`[SoccerGameCanvas] ✅ Audio element can play for ${targetAddress}`);
            });
            audioElement.addEventListener('play', () => {
              console.log(`[SoccerGameCanvas] ✅ Audio element started playing for ${targetAddress}`);
            });
            audioElement.addEventListener('error', (e) => {
              console.error(`[SoccerGameCanvas] ❌ Audio element error for ${targetAddress}:`, e);
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
                console.log(`[SoccerGameCanvas] ✅ Successfully started playing audio for ${targetAddress}`);
              })
              .catch((err) => {
                console.error(`[SoccerGameCanvas] ❌ Failed to play audio for ${targetAddress}:`, err);
                // Try again after a short delay (user interaction might be needed)
                setTimeout(() => {
                  audioElement.play().catch((retryErr) => {
                    console.error(`[SoccerGameCanvas] ❌ Retry failed for ${targetAddress}:`, retryErr);
                  });
                }, 1000);
              });
          }
        }
      };
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`[SoccerGameCanvas] Sending ICE candidate to ${targetAddress}`);
          socketClient.sendWebRTCIceCandidate(lobby.id, targetAddress, event.candidate.toJSON());
        }
      };
      
      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log(`[SoccerGameCanvas] 🔄 Connection state with ${targetAddress}: ${state}`);
        
        if (state === 'connected') {
          console.log(`[SoccerGameCanvas] ✅ CONNECTED to ${targetAddress} - audio should work now!`);
        } else if (state === 'failed' || state === 'disconnected') {
          console.error(`[SoccerGameCanvas] ❌ Connection ${state} with ${targetAddress}`);
        }
      };
      
      peerConnectionsRef.current.set(targetAddress, peerConnection);
      
      // Create and send offer
      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log(`[SoccerGameCanvas] Sending offer to ${targetAddress}`);
        socketClient.sendWebRTCOffer(lobby.id, targetAddress, offer);
      } catch (error) {
        console.error(`[SoccerGameCanvas] Error creating offer for ${targetAddress}:`, error);
      }
    };

    // Handle WebRTC signaling events
    const handleWebRTCOffer = async (data: { fromAddress: string; offer: RTCSessionDescriptionInit }) => {
      const { fromAddress, offer } = data;
      console.log(`[SoccerGameCanvas] Received offer from ${fromAddress}`);
      
      if (!peerConnectionsRef.current.has(fromAddress)) {
        await createPeerConnection(fromAddress);
      }
      
      const peerConnection = peerConnectionsRef.current.get(fromAddress);
      if (!peerConnection) return;
      
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log(`[SoccerGameCanvas] Sending answer to ${fromAddress}`);
        socketClient.sendWebRTCAnswer(lobby.id, fromAddress, answer);
      } catch (error) {
        console.error(`[SoccerGameCanvas] Error handling offer from ${fromAddress}:`, error);
      }
    };
    
    const handleWebRTCAnswer = async (data: { fromAddress: string; answer: RTCSessionDescriptionInit }) => {
      const { fromAddress, answer } = data;
      console.log(`[SoccerGameCanvas] Received answer from ${fromAddress}`);
      
      const peerConnection = peerConnectionsRef.current.get(fromAddress);
      if (!peerConnection) {
        console.warn(`[SoccerGameCanvas] No peer connection found for ${fromAddress}`);
        return;
      }
      
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error(`[SoccerGameCanvas] Error handling answer from ${fromAddress}:`, error);
      }
    };
    
    const handleWebRTCIce = async (data: { fromAddress: string; candidate: RTCIceCandidateInit }) => {
      const { fromAddress, candidate } = data;
      console.log(`[SoccerGameCanvas] Received ICE candidate from ${fromAddress}`);
      
      const peerConnection = peerConnectionsRef.current.get(fromAddress);
      if (!peerConnection) {
        console.warn(`[SoccerGameCanvas] No peer connection found for ${fromAddress}`);
        return;
      }
      
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error(`[SoccerGameCanvas] Error adding ICE candidate from ${fromAddress}:`, error);
      }
    };
    
    // Ensure voice chat is initialized and has local stream before setting up connections
    const setupPeerConnections = async () => {
      // Check if local stream is available
      let localStream = voiceChat.getLocalStream();
      if (!localStream) {
        console.log('[SoccerGameCanvas] Local stream not available, initializing voice chat...');
        try {
          await voiceChat.initialize();
          localStream = voiceChat.getLocalStream();
          if (!localStream) {
            console.error('[SoccerGameCanvas] Failed to get local stream after initialization');
            return;
          }
        } catch (err) {
          console.error('[SoccerGameCanvas] Failed to initialize voice chat:', err);
          return;
        }
      }

      console.log('[SoccerGameCanvas] ✅ Local stream available, setting up peer connections');
      
      // Create peer connections for all other players in the lobby
      const otherPlayers = (lobby.players || []).filter(p => p.walletAddress !== address);
      otherPlayers.forEach(player => {
        createPeerConnection(player.walletAddress);
      });
    };
    
    // Set up socket listeners
    socketClient.onWebRTCOffer(handleWebRTCOffer);
    socketClient.onWebRTCAnswer(handleWebRTCAnswer);
    socketClient.onWebRTCIceCandidate(handleWebRTCIce);
    
    // Initialize peer connections
    setupPeerConnections().catch((err) => {
      console.error('[SoccerGameCanvas] Error setting up peer connections:', err);
    });
    
    // Return cleanup function
    return () => {
      console.log('[SoccerGameCanvas] Cleaning up peer connections');
      
      // Close all peer connections
      peerConnectionsRef.current.forEach((peerConnection, targetAddress) => {
        peerConnection.close();
        console.log(`[SoccerGameCanvas] Closed peer connection to ${targetAddress}`);
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
  }, [isVoiceEnabled, address, lobby.players, lobby.id, socketClient, gameStarted]);

  // Resize canvas to fit within viewport - USE ALL AVAILABLE SPACE
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const container = canvas.parentElement;
      if (!container) return;
      
      const gameContainer = container.closest('.soccer-game-container');
      if (!gameContainer) return;
      
      // Get Device Pixel Ratio for crisp rendering on high-DPI displays
      const dpr = window.devicePixelRatio || 1;
      
      // Get ACTUAL available space - wrapper fills flex container, canvas fills wrapper
      // Use getBoundingClientRect for accurate dimensions
      const wrapperRect = container.getBoundingClientRect();
      let wrapperWidth = wrapperRect.width;
      let wrapperHeight = wrapperRect.height;
      
      // If dimensions are 0, fall back to clientWidth/Height
      if (wrapperWidth === 0) wrapperWidth = container.clientWidth || 800;
      if (wrapperHeight === 0) wrapperHeight = container.clientHeight || 600;
      
      // Use EXACT wrapper dimensions - NO MINIMUM CONSTRAINTS, fill it completely
      const canvasWidth = wrapperWidth;
      const canvasHeight = wrapperHeight;
      
      // Set display size (CSS pixels)
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;
      
      // Set actual size in memory (scaled by DPR for crisp rendering)
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      
      // Scale the context to account for DPR (reset transform first to avoid cumulative scaling)
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        ctx.scale(dpr, dpr);
      }
      
      // Update game if it exists and has resize method (use display size, not internal size)
      if (gameRef.current && typeof gameRef.current.resize === 'function') {
        gameRef.current.resize(canvasWidth, canvasHeight);
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [gameStarted]); // Only run after game is started

  useEffect(() => {
    if (!canvasRef.current || !address || !gameStarted) return;

    // Ensure socket is joined to lobby room
    if (socketClient.isConnected()) {
      socketClient.joinLobby(lobby.id);
      console.log(`[SoccerGameCanvas] Joined socket room for lobby ${lobby.id}`);
    }

    // Get username and avatar from lobby players
    const localPlayer = lobby.players.find(p => p.walletAddress === address);
    const username = localPlayer?.username;
    const avatarUrl = localPlayer?.avatarUrl;

    // Create game instance
    const game = new SoccerGame(canvasRef.current, address, username);
    gameRef.current = game;
    
    // Set local player avatar
    if (avatarUrl) {
      game.setLocalPlayerAvatar(avatarUrl);
    }
    
    // Fetch and set local player equipped items
    apiClient.getPlayerEquippedItems(address).then(data => {
      if (data.equipped && data.equipped.length > 0) {
        game.setLocalPlayerEquippedItems(data.equipped.map(item => ({
          itemId: item.itemId,
          itemName: item.itemName,
          itemType: item.itemType,
          rarity: item.rarity,
        })));
      }
    }).catch(err => {
      console.error('[SoccerGameCanvas] Failed to fetch equipped items:', err);
    });
    
    // Resize game to match canvas display size (in case canvas was resized before game was created)
    if (typeof game.resize === 'function') {
      const displayWidth = canvasRef.current.clientWidth || parseInt(canvasRef.current.style.width) || 800;
      const displayHeight = canvasRef.current.clientHeight || parseInt(canvasRef.current.style.height) || 600;
      game.resize(displayWidth, displayHeight);
    }

    // Initialize remote players from lobby.players array
    // This ensures players are visible immediately when game starts
    const otherPlayers = lobby.players.filter(p => p.walletAddress !== address);
    console.log(`[SoccerGameCanvas] Initializing ${otherPlayers.length} remote players from lobby`);
    otherPlayers.forEach(player => {
      // Create initial position for remote player (will be updated when they send actual position)
      const team = game.getTeamForPlayer(player.walletAddress);
      // Calculate initial position based on team (same logic as local player initialization)
      const FIELD_WIDTH = 800; // Base field width from SoccerGame
      const SCOREBOARD_HEIGHT = 100; // Scoreboard height
      const initialX = team === 'red' ? 150 * (game.fieldWidth / FIELD_WIDTH) : game.fieldWidth - 150 * (game.fieldWidth / FIELD_WIDTH);
      const initialY = SCOREBOARD_HEIGHT + game.fieldHeight / 2; // Field starts below scoreboard
      
      // Fetch equipped items for remote player
      apiClient.getPlayerEquippedItems(player.walletAddress).then(data => {
        const equippedItems = data.equipped ? data.equipped.map(item => ({
          itemId: item.itemId,
          itemName: item.itemName,
          itemType: item.itemType,
          rarity: item.rarity,
        })) : [];
        
        game.updateRemotePlayer(player.walletAddress, {
          walletAddress: player.walletAddress,
          x: initialX,
          y: initialY,
          velocityX: 0,
          velocityY: 0,
          isGrounded: false,
          facing: 'right',
          username: player.username,
          isSpeaking: false,
        }, player.hasCrown, player.avatarUrl, equippedItems);
      }).catch(err => {
        console.error(`[SoccerGameCanvas] Failed to fetch equipped items for ${player.walletAddress}:`, err);
        // Still create player without equipped items
        game.updateRemotePlayer(player.walletAddress, {
          walletAddress: player.walletAddress,
          x: initialX,
          y: initialY,
          velocityX: 0,
          velocityY: 0,
          isGrounded: false,
          facing: 'right',
          username: player.username,
          isSpeaking: false,
        }, player.hasCrown, player.avatarUrl, []);
      });
    });

    // Set up game callbacks
    game.onGoal = (team, scorer) => {
      console.log(`[SoccerGame] Goal scored by ${scorer} for ${team} team!`);
      // Emit goal event via socket
      socketClient.sendPlayerPosition(lobby.id, {
        walletAddress: address,
        x: gameRef.current!.localPlayer.x,
        y: gameRef.current!.localPlayer.y,
        velocityX: 0,
        velocityY: 0,
        isGrounded: false,
        facing: gameRef.current!.localPlayer.facing,
      });
    };

    game.onGameEnd = (results) => {
      console.log('[SoccerGame] Game ended:', results);
      onGameEnd(results);
    };

    // Start the game
    game.start();

    // Set up socket listeners for remote player positions
    const handlePlayerPosition = (data: { walletAddress: string; position: PlayerPosition; timestamp: number }) => {
      if (data.walletAddress === address) return; // Ignore own position
      
      if (gameRef.current) {
        console.log(`[SoccerGameCanvas] Received position update from ${data.walletAddress}`);
        // Get existing player to preserve equipped items (equipped items don't change during game)
        // We'll preserve them from the initial load
        gameRef.current.updateRemotePlayer(data.walletAddress, data.position);
      }
    };

    // Set up socket listener for voice state
    const handleVoiceState = (data: { walletAddress: string; isSpeaking: boolean; timestamp: number }) => {
      if (data.walletAddress === address) return; // Ignore own voice state
      
      if (gameRef.current) {
        gameRef.current.updateRemotePlayerSpeaking(data.walletAddress, data.isSpeaking);
      }
    };

    socketClient.onPlayerPosition(handlePlayerPosition);
    socketClient.onVoiceState(handleVoiceState);

    // Send initial position immediately
    const sendInitialPosition = () => {
      if (gameRef.current && socketClient.isConnected()) {
        const position = gameRef.current.getLocalPlayerPosition();
        const localPlayer = lobby.players.find(p => p.walletAddress === address);
        if (localPlayer?.username) {
          position.username = localPlayer.username;
        }
        console.log(`[SoccerGameCanvas] Sending initial position:`, position);
        socketClient.sendPlayerPosition(lobby.id, position);
      }
    };

    // Send initial position immediately, then start regular updates
    sendInitialPosition();

    // Send local player position and ball position updates
    positionUpdateIntervalRef.current = window.setInterval(() => {
      if (gameRef.current && socketClient.isConnected()) {
        const position = gameRef.current.getLocalPlayerPosition();
        // Include username from lobby players
        const localPlayer = lobby.players.find(p => p.walletAddress === address);
        if (localPlayer?.username) {
          position.username = localPlayer.username;
        }
        socketClient.sendPlayerPosition(lobby.id, position);
        
        // Also send ball position (authoritative from local client)
        // In production, you'd want server-authoritative ball physics
        const ballPos = gameRef.current.getBallPosition();
        // TODO: Send ball position via socket
      }
    }, 1000 / 30); // 30 FPS position updates

    return () => {
      if (positionUpdateIntervalRef.current) {
        clearInterval(positionUpdateIntervalRef.current);
      }
      socketClient.off('game:player_position');
      socketClient.off('game:voice_state');
      if (gameRef.current) {
        gameRef.current.stop();
      }
    };
  }, [canvasRef.current, address, lobby, socketClient, gameStarted]);

  // Start game when component mounts
  useEffect(() => {
    setGameStarted(true);
  }, []);

  return (
    <div className="soccer-game-container">
      <div className="soccer-game-header">
        <h2>⚽ Soccer Match ⚽</h2>
        <p>First team to score 5 goals wins!</p>
      </div>
      <div className="soccer-game-canvas-wrapper">
        <canvas 
          ref={canvasRef} 
          className="soccer-game-canvas"
          tabIndex={0}
        />
      </div>
      <div className={`soccer-game-controls ${isControlsExpanded ? 'expanded' : 'collapsed'}`}>
        <button 
          className="controls-toggle-btn"
          onClick={() => setIsControlsExpanded(!isControlsExpanded)}
          aria-label={isControlsExpanded ? 'Collapse controls' : 'Expand controls'}
        >
          <span className="controls-toggle-icon">{isControlsExpanded ? '▼' : '▲'}</span>
          <span>Controls</span>
        </button>
        
        {isControlsExpanded && (
          <div className="controls-content">
            <p><strong>Controls:</strong></p>
            <p>Arrow Keys or WASD to move</p>
            <p>Run into the ball to kick it!</p>
            <p>Score goals to win!</p>
            <div className="voice-chat-controls">
              <button
                className="voice-toggle-btn"
                onClick={async () => {
                  if (!voiceChatRef.current) return;
                  if (!isVoiceEnabled) {
                    try {
                      await voiceChatRef.current.initialize();
                      setIsVoiceEnabled(true);
                      // Save setting
                      const settings = {
                        enabled: true,
                        pushToTalkKey: pushToTalkKey,
                      };
                      localStorage.setItem(`voice_settings_${address}`, JSON.stringify(settings));
                    } catch (error) {
                      console.error('Failed to initialize voice chat:', error);
                      alert('Failed to access microphone. Please check permissions.');
                    }
                  } else {
                    voiceChatRef.current.cleanup();
                    setIsVoiceEnabled(false);
                    // Save setting
                    const settings = {
                      enabled: false,
                      pushToTalkKey: pushToTalkKey,
                    };
                    localStorage.setItem(`voice_settings_${address}`, JSON.stringify(settings));
                  }
                }}
              >
                {isVoiceEnabled ? '🎤 Disable Voice' : '🎤 Enable Voice'}
              </button>
              {isVoiceEnabled && (
                <div className="voice-controls">
                  <p>
                    <strong>Voice:</strong> Hold <kbd>{pushToTalkKey.toUpperCase()}</kbd> to talk
                  </p>
                  <div className="voice-status">
                    <div className={`voice-indicator ${isPushingToTalk ? 'active' : ''}`}>
                      <span className="voice-icon">🎤</span>
                      <span>{isPushingToTalk ? 'Talking...' : 'Muted'}</span>
                    </div>
                    <div className="audio-level-bar">
                      <div 
                        className="audio-level-fill" 
                        style={{ width: `${audioLevel * 100}%` }}
                      />
                    </div>
                  </div>
                  <label className="voice-test-control">
                    <input
                      type="checkbox"
                      checked={enableLocalMonitor}
                      onChange={(e) => setEnableLocalMonitor(e.target.checked)}
                    />
                    <span>Enable local audio monitor (hear yourself)</span>
                  </label>
                  <div className="voice-debug-info">
                    <small>
                      Mic: {voiceChatRef.current?.getLocalStream() ? '✅' : '❌'} | 
                      Connections: {peerConnectionsRef.current.size} | 
                      State: {voiceChatRef.current?.getConnectionState() || 'N/A'}
                    </small>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

