import { useEffect, useRef, useState } from 'react';
import { FallGame, GameResult } from '../game/FallGame.js';
import { SocketClient } from '../services/socketClient.js';
import type { Lobby, PlayerPosition } from '@solana-defender/shared';
import { useWallet } from '../contexts/WalletContext.js';
import './FallGameCanvas.css';

interface FallGameCanvasProps {
  lobby: Lobby;
  socketClient: SocketClient;
  onGameEnd: (results: GameResult[]) => void;
}

export function FallGameCanvas({ lobby, socketClient, onGameEnd }: FallGameCanvasProps) {
  const { address } = useWallet();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FallGame | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const positionUpdateIntervalRef = useRef<number | null>(null);
  const resultsRef = useRef<GameResult[]>([]);

  useEffect(() => {
    if (!canvasRef.current || !address || !gameStarted) return;

    // Get username from lobby players
    const localPlayer = lobby.players.find(p => p.walletAddress === address);
    const username = localPlayer?.username;

    // Create game instance
    const game = new FallGame(canvasRef.current, address, username);
    gameRef.current = game;

    // Set up game callbacks
    game.onPlayerFinish = (result) => {
      console.log('[FallGame] Player finished:', result);
      resultsRef.current.push(result);
      
      // Submit result to backend
      // TODO: Call API to submit result
    };

    game.onGameEnd = (results) => {
      console.log('[FallGame] Game ended:', results);
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
      if (gameRef.current && socketClient.isConnected()) {
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
  }, [canvasRef.current, address, lobby, socketClient, gameStarted]);

  // Start game when component mounts
  useEffect(() => {
    setGameStarted(true);
  }, []);

  return (
    <div className="fall-game-container">
      <div className="fall-game-header">
        <h2>🏁 Race to the Bottom! 🏁</h2>
        <p>First player to reach the finish line wins!</p>
      </div>
      <div className="fall-game-canvas-wrapper">
        <canvas 
          ref={canvasRef} 
          className="fall-game-canvas"
          tabIndex={0}
        />
      </div>
      <div className="fall-game-controls">
        <p><strong>Controls:</strong></p>
        <p>← → Arrow Keys or A/D to move</p>
        <p>Spacebar or W/↑ to jump</p>
        <p>Navigate platforms and race to the finish line!</p>
      </div>
    </div>
  );
}

