import { useEffect, useRef, useState } from 'react';
import { FallGuysGame, GameResult } from '../game/FallGuysGame.js';
import { SocketClient } from '../services/socketClient.js';
import { ApiClient } from '../services/api.js';
import type { Lobby, PlayerPosition } from '@solana-defender/shared';
import { useWallet } from '../contexts/WalletContext.js';
import './FallGuysGameCanvas.css';

interface FallGuysGameCanvasProps {
  lobby: Lobby;
  socketClient: SocketClient;
  onGameEnd: (results: GameResult[]) => void;
  apiClient: ApiClient;
}

export function FallGuysGameCanvas({ lobby, socketClient, onGameEnd, apiClient }: FallGuysGameCanvasProps) {
  const { address } = useWallet();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FallGuysGame | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const positionUpdateIntervalRef = useRef<number | null>(null);

  // Resize canvas to fit viewport
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const container = canvas.parentElement;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const maxWidth = containerRect.width;
      const maxHeight = containerRect.height;
      
      // Maintain aspect ratio (1200x800)
      const aspectRatio = 1200 / 800;
      let canvasWidth = maxWidth;
      let canvasHeight = maxWidth / aspectRatio;
      
      if (canvasHeight > maxHeight) {
        canvasHeight = maxHeight;
        canvasWidth = maxHeight * aspectRatio;
      }
      
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;
      
      // Update game size if it exists
      if (gameRef.current) {
        // FallGuysGame doesn't have resize, but we can update canvas dimensions
        canvas.width = 1200;
        canvas.height = 800;
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [gameStarted]);

  useEffect(() => {
    if (!canvasRef.current || !address || !gameStarted) return;

    // Ensure socket is joined to lobby room
    if (socketClient.isConnected()) {
      socketClient.joinLobby(lobby.id);
      console.log(`[FallGuysGameCanvas] Joined socket room for lobby ${lobby.id}`);
    }

    // Get username from lobby players
    const localPlayer = lobby.players.find(p => p.walletAddress === address);
    const username = localPlayer?.username;

    // Create game instance
    const game = new FallGuysGame(canvasRef.current, address, username);
    gameRef.current = game;
    
    // Set up game callbacks
    game.onPlayerEliminated = (walletAddress) => {
      console.log('[FallGuysGame] Player eliminated:', walletAddress);
    };

    game.onGameEnd = (results) => {
      console.log('[FallGuysGame] Game ended:', results);
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

    socketClient.onPlayerPosition(handlePlayerPosition);

    // Send local player position updates
    positionUpdateIntervalRef.current = window.setInterval(() => {
      if (gameRef.current && socketClient.isConnected() && !gameRef.current.localPlayer.eliminated) {
        const position = gameRef.current.getLocalPlayerPosition();
        socketClient.sendPlayerPosition(lobby.id, position);
      }
    }, 1000 / 30); // 30 FPS position updates

    return () => {
      if (positionUpdateIntervalRef.current) {
        clearInterval(positionUpdateIntervalRef.current);
      }
      socketClient.off('game:player_position');
      if (gameRef.current) {
        gameRef.current.stop();
      }
    };
  }, [canvasRef.current, address, lobby, socketClient, gameStarted, onGameEnd]);

  // Start game when component mounts
  useEffect(() => {
    setGameStarted(true);
  }, []);

  return (
    <div className="fall-guys-game-container">
      <div className="fall-guys-game-header">
        <h2>🏆 FALL GUYS - LAST MAN STANDING! 🏆</h2>
        <p>Survive the platforms! Last player alive wins ALL the prize!</p>
      </div>
      <div className="fall-guys-game-canvas-wrapper">
        <canvas 
          ref={canvasRef} 
          className="fall-guys-game-canvas"
          tabIndex={0}
        />
      </div>
      <div className="fall-guys-game-controls">
        <p><strong>🎮 Controls:</strong></p>
        <p>← → Arrow Keys or A/D to move</p>
        <p>Spacebar or W/↑ to jump</p>
        <p>⚠️ Watch out! Platforms disappear!</p>
        <p>💀 Fall off the bottom = ELIMINATED!</p>
        <p>🏆 Last player standing wins EVERYTHING!</p>
      </div>
    </div>
  );
}


