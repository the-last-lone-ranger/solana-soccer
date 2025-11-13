import { useEffect, useRef, useState } from 'react';
import { SoccerGame, GameResult } from '../game/SoccerGame.js';
import { SocketClient } from '../services/socketClient.js';
import { VoiceChatService } from '../services/voiceChat.js';
import type { Lobby, PlayerPosition } from '@solana-defender/shared';
import { useWallet } from '../contexts/WalletContext.js';
import './SoccerGameCanvas.css';

interface SoccerGameCanvasProps {
  lobby: Lobby;
  socketClient: SocketClient;
  onGameEnd: (results: GameResult[]) => void;
}

export function SoccerGameCanvas({ lobby, socketClient, onGameEnd }: SoccerGameCanvasProps) {
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
  const keysPressedRef = useRef<Set<string>>(new Set());

  // Initialize voice chat service (create once)
  useEffect(() => {
    if (!voiceChatRef.current) {
      const voiceChat = new VoiceChatService();
      // Load settings from localStorage
      const saved = localStorage.getItem(`voice_settings_${address}`);
      if (saved) {
        const settings = JSON.parse(saved);
        voiceChat.setPushToTalkKey(settings.pushToTalkKey || 'v');
        voiceChat.setPushToTalk(true); // Always use push-to-talk mode
      }
      voiceChatRef.current = voiceChat;
    }
    return () => {
      if (voiceChatRef.current) {
        voiceChatRef.current.cleanup();
        voiceChatRef.current = null;
      }
    };
  }, [address]);

  // Update push-to-talk key when it changes
  useEffect(() => {
    const voiceChat = voiceChatRef.current;
    if (voiceChat) {
      voiceChat.setPushToTalkKey(pushToTalkKey);
    }
  }, [pushToTalkKey]);

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
        if (gameRef.current && socketClient.isConnected()) {
          gameRef.current.updateLocalPlayerSpeaking(false);
          socketClient.sendVoiceState(lobby.id, false);
        }
      }
    };
  }, [pushToTalkKey, lobby.id, socketClient, isVoiceEnabled]);

  useEffect(() => {
    if (!canvasRef.current || !address || !gameStarted) return;

    // Get username from lobby players
    const localPlayer = lobby.players.find(p => p.walletAddress === address);
    const username = localPlayer?.username;

    // Create game instance
    const game = new SoccerGame(canvasRef.current, address, username);
    gameRef.current = game;

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
      <div className="soccer-game-controls">
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
            <p className="voice-controls">
              <strong>Voice:</strong> Hold <kbd>{pushToTalkKey.toUpperCase()}</kbd> to talk
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

