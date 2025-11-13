import { useEffect, useRef, useState } from 'react';
import { Game, GameState, GameStats, CompetitiveMatchInfo } from '../game/Game.js';
import { VoiceChatService } from '../services/voiceChat.js';
import './GameCanvas.css';

interface GameCanvasProps {
  onGameOver: (stats: GameStats) => void;
  onScoreUpdate?: (score: number) => void;
  onItemFound?: (item: any) => void;
  tokenBalance?: number;
  nftCount?: number;
  competitiveMatch?: CompetitiveMatchInfo;
  voiceChat?: VoiceChatService | null;
}

export function GameCanvas({ 
  onGameOver, 
  onScoreUpdate, 
  onItemFound, 
  tokenBalance = 0, 
  nftCount = 0,
  competitiveMatch,
  voiceChat,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.Menu);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    const game = new Game(canvasRef.current);
    gameRef.current = game;

    game.onGameOver = (stats) => {
      setGameState(GameState.GameOver);
      onGameOver(stats);
    };

    game.onScoreUpdate = (score) => {
      onScoreUpdate?.(score);
    };

    game.onItemFound = async (holdings) => {
      if (onItemFound) {
        onItemFound(holdings);
      }
    };

    // Set token holdings for drop rate calculation
    game.setTokenHoldings(tokenBalance, nftCount);

    // Start game in competitive mode if match info provided
    if (competitiveMatch) {
      game.startCompetitive(competitiveMatch);
    } else {
      game.start();
    }

    return () => {
      // Cleanup if needed
    };
  }, [onGameOver, onScoreUpdate, competitiveMatch, tokenBalance, nftCount]);

  const toggleMute = () => {
    if (voiceChat) {
      const muted = voiceChat.toggleMute();
      setIsMuted(muted);
    }
  };

  const handleStart = () => {
    if (gameRef.current && canvasRef.current) {
      gameRef.current.start();
      setGameState(GameState.Playing);
      // Ensure canvas has focus for keyboard input
      setTimeout(() => {
        canvasRef.current?.focus();
      }, 100);
    }
  };

  const handlePause = () => {
    if (gameRef.current) {
      gameRef.current.pause();
      setGameState(gameRef.current.state);
    }
  };

  // Auto-focus canvas when game starts
  useEffect(() => {
    if (gameState === GameState.Playing && canvasRef.current) {
      canvasRef.current.focus();
    }
  }, [gameState]);

  return (
    <div className="game-container">
      <div className="game-controls">
        {!competitiveMatch && (
          <>
            <button onClick={handleStart} disabled={gameState === GameState.Playing}>
              Start Game
            </button>
            <button onClick={handlePause} disabled={gameState === GameState.Menu || gameState === GameState.GameOver}>
              {gameState === GameState.Paused ? 'Resume' : 'Pause'}
            </button>
          </>
        )}
        {voiceChat && (
          <button 
            onClick={toggleMute} 
            className={`voice-chat-btn ${isMuted ? 'muted' : ''}`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? '🔇 Muted' : '🎤 Voice Chat'}
          </button>
        )}
      </div>
      <canvas 
        ref={canvasRef} 
        className="game-canvas"
        tabIndex={0}
        onFocus={(e) => e.target.focus()}
      />
      <div className="game-instructions">
        <p><strong>Controls:</strong></p>
        <p>← → Arrow Keys or A/D to move</p>
        <p>Spacebar to shoot</p>
        {competitiveMatch && (
          <p className="competitive-info">
            <strong>⚔️ Competitive Match:</strong> Highest score wins! Match ends in 5 minutes.
          </p>
        )}
      </div>
    </div>
  );
}

