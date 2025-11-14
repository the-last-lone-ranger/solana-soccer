import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { Podium } from './Podium.js';
import { ApiClient } from '../services/api.js';
import { ItemDropNotification } from './ItemDropNotification.js';
import type { GameItem } from '@solana-defender/shared';
import './PodiumResults.css';

interface PlayerResult {
  walletAddress: string;
  username?: string | null;
  avatarUrl?: string | null;
  team: 'red' | 'blue';
  score: number;
  payoutAmount: number;
  won?: boolean;
}

interface PodiumResultsProps {
  winners: PlayerResult[];
  losers: PlayerResult[];
  betAmountSol: number;
  totalPot: number;
  payoutPerPlayer: number;
  apiClient: ApiClient;
  onClose: () => void;
}

// Podium scene - using Wawa Guys style
function PodiumScene({ winners }: { winners: PlayerResult[] }) {
  // Get the winner (first place - last man standing)
  const winner = winners[0];
  
  if (!winner) return null;
  
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 15, 10]} intensity={1.2} castShadow />
      <pointLight position={[-10, 10, -10]} intensity={0.6} color="#FFB6C1" />
      <pointLight position={[10, 5, -10]} intensity={0.4} color="#87CEEB" />
      
      <Podium 
        winner={{
          walletAddress: winner.walletAddress,
          username: winner.username || undefined,
          color: '#FFD700' // Gold for winner
        }}
      />
      
      <Environment files="/hdrs/medieval_cafe_1k.hdr" />
      <OrbitControls 
        enablePan={false}
        enableZoom={true}
        minDistance={8}
        maxDistance={20}
        target={[0, 2, 0]}
        enableDamping={true}
        dampingFactor={0.05}
      />
    </>
  );
}

export function PodiumResults({
  winners,
  losers,
  betAmountSol,
  totalPot,
  payoutPerPlayer,
  apiClient,
  onClose,
}: PodiumResultsProps) {
  const [newItem, setNewItem] = useState<GameItem | null>(null);
  
  // Check for new items after game ends
  useEffect(() => {
    const checkForNewItems = async () => {
      try {
        // Wait a bit for backend to process item drops
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await apiClient.getRecentItems();
        if (result.items && result.items.length > 0) {
          // Show the most recent item
          const latestItem = result.items[0];
          setNewItem({
            id: latestItem.itemId,
            name: latestItem.name,
            type: latestItem.type,
            rarity: latestItem.rarity,
            description: `Found after the round!`,
            stats: latestItem.stats,
          });
        }
      } catch (error) {
        console.error('Failed to check for new items:', error);
      }
    };
    
    checkForNewItems();
  }, [apiClient]);
  
  // Auto-close after 15 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 15000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const isPaidMatch = betAmountSol > 0;

  return (
    <div className="podium-results-overlay" onClick={onClose}>
      <div className="podium-results-container" onClick={(e) => e.stopPropagation()}>
        <div className="podium-results-header">
          <h2>🏆 Game Over!</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="podium-results-content">
          {/* 3D Podium Scene */}
          <div className="podium-canvas-wrapper">
            <Canvas shadows camera={{ position: [5, 4, 12], fov: 60 }}>
              <PodiumScene winners={winners} losers={losers} />
            </Canvas>
          </div>

          {/* Winners list */}
          {winners.length > 0 && (
            <div className="podium-winners-list">
              <h3>{isPaidMatch ? '💰 Winners' : '🏆 Winners'}</h3>
              <div className="winners-grid">
                {winners.map((player, index) => (
                  <div key={player.walletAddress} className="winner-item">
                    <div className="winner-rank">#{index + 1}</div>
                    <div className="winner-name">
                      {player.username || `${player.walletAddress.slice(0, 6)}...${player.walletAddress.slice(-4)}`}
                    </div>
                    {isPaidMatch && player.payoutAmount > 0 && (
                      <div className="winner-payout">
                        +{player.payoutAmount.toFixed(4)} SOL
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payout Summary */}
          {isPaidMatch && winners.length > 0 && (
            <div className="podium-payout-summary">
              <div className="summary-row">
                <span className="summary-label">Total Pot:</span>
                <span className="summary-value">{totalPot.toFixed(4)} SOL</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Winners:</span>
                <span className="summary-value">{winners.length}</span>
              </div>
            </div>
          )}
        </div>

        <div className="podium-results-footer">
          <button className="continue-btn" onClick={onClose}>
            Continue
          </button>
        </div>
      </div>
      
      {/* Item drop notification */}
      {newItem && (
        <ItemDropNotification
          item={newItem}
          onClose={() => setNewItem(null)}
        />
      )}
    </div>
  );
}

