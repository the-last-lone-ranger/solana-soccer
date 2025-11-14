import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet.js';
import { WalletConnect } from './WalletConnect.js';
import './GamesPage.css';

export function GamesPage() {
  const navigate = useNavigate();
  const { connected, address } = useWallet();
  const [showSignInModal, setShowSignInModal] = useState(false);

  const handleJoinLobby = (e: React.MouseEvent) => {
    e.preventDefault();
    // If not connected, show sign-in modal
    if (!connected || !address) {
      setShowSignInModal(true);
    } else {
      // If connected, go to lobbies
      navigate('/lobbies');
    }
  };

  // Close modal when wallet connects
  React.useEffect(() => {
    if (connected && address && showSignInModal) {
      setShowSignInModal(false);
      navigate('/lobbies');
    }
  }, [connected, address, showSignInModal, navigate]);

  return (
    <div className="games-page">
      <div className="games-container">
        {/* Hero Section */}
        <div className="games-hero">
          <h1 className="games-title">Game Modes & Power-Ups</h1>
          <p className="games-subtitle">
            Discover the exciting game modes and rare power-ups that make every match unique
          </p>
        </div>

        {/* Game Modes Section */}
        <section className="games-section">
          <h2 className="section-title">Game Modes</h2>
          
          <div className="game-mode-card">
            <div className="game-mode-preview fall-guys-preview">
              <div className="preview-overlay">
                <span className="preview-label">3D Battle Royale</span>
              </div>
            </div>
            <div className="game-mode-header">
              <span className="game-mode-icon">🏆</span>
              <h3 className="game-mode-name">Fall Guys</h3>
            </div>
            <div className="game-mode-content">
              <p className="game-mode-description">
                Battle royale elimination game where players compete to be the last one standing. 
                Navigate through multiple floors of hexagons that disappear when stepped on. 
                Fall off and you're eliminated!
              </p>
              <div className="game-mode-features">
                <div className="feature-item">
                  <span className="feature-icon">⚡</span>
                  <span>Multiple floors with disappearing hexagons</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">👥</span>
                  <span>Up to 10 players compete simultaneously</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">🏅</span>
                  <span>Top 3 players earn rewards</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">💎</span>
                  <span>Rare power-ups spawn on bottom floor</span>
                </div>
              </div>
            </div>
          </div>

          <div className="game-mode-card">
            <div className="game-mode-preview soccer-preview">
              <div className="preview-overlay">
                <span className="preview-label">Team-Based Action</span>
              </div>
            </div>
            <div className="game-mode-header">
              <span className="game-mode-icon">⚽</span>
              <h3 className="game-mode-name">Soccer</h3>
            </div>
            <div className="game-mode-content">
              <p className="game-mode-description">
                Team-based soccer matches where red and blue teams compete to score goals. 
                Fast-paced action with power-ups and strategic gameplay.
              </p>
              <div className="game-mode-features">
                <div className="feature-item">
                  <span className="feature-icon">🔴🔵</span>
                  <span>Red vs Blue team battles</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">⚡</span>
                  <span>Power-ups spawn during matches</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">💰</span>
                  <span>Winning team splits the pot</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Power-Ups Section */}
        <section className="games-section">
          <h2 className="section-title">Power-Ups</h2>
          <p className="section-intro">
            Rare power-ups spawn on the bottom floor of Fall Guys matches. 
            These game-changing items can turn the tide of battle!
          </p>

          <div className="powerup-grid">
            <div className="powerup-card teleport">
              <div className="powerup-header">
                <div className="powerup-visual teleport-visual">
                  <div className="powerup-glow teleport-glow"></div>
                  <div className="powerup-shape teleport-shape">🌀</div>
                </div>
                <div className="powerup-info">
                  <h3 className="powerup-name">Teleport Power-Up</h3>
                  <span className="powerup-rarity">Super Rare</span>
                </div>
              </div>
              <div className="powerup-content">
                <p className="powerup-description">
                  Instantly teleport to a random alive player's position, appearing slightly above them. 
                  Perfect for recovery when you've fallen to the bottom floor!
                </p>
                <div className="powerup-details">
                  <div className="detail-item">
                    <span className="detail-label">Spawn Location:</span>
                    <span className="detail-value">Bottom floor only</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Spawn Rate:</span>
                    <span className="detail-value">1-3 per game (super rare!)</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Effect:</span>
                    <span className="detail-value">Teleport to random player</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="powerup-card floor-reset">
              <div className="powerup-header">
                <div className="powerup-visual floor-reset-visual">
                  <div className="powerup-glow floor-reset-glow"></div>
                  <div className="powerup-shape floor-reset-shape">🌍</div>
                </div>
                <div className="powerup-info">
                  <h3 className="powerup-name">Floor Reset Power-Up</h3>
                  <span className="powerup-rarity">Ultra Rare</span>
                </div>
              </div>
              <div className="powerup-content">
                <p className="powerup-description">
                  The ultimate game-changer! Resets the entire arena with newly generated floors 
                  and respawns all alive players at the top. Completely reshuffles the match!
                </p>
                <div className="powerup-details">
                  <div className="detail-item">
                    <span className="detail-label">Spawn Location:</span>
                    <span className="detail-value">Bottom floor only</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Spawn Rate:</span>
                    <span className="detail-value">1 per game (ultra rare!)</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Effect:</span>
                    <span className="detail-value">Reset floors & respawn all players</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Item Drops Section */}
        <section className="games-section">
          <h2 className="section-title">Item Drops</h2>
          <p className="section-intro">
            After every match, players have a chance to receive rare items. 
            Token holders get significantly better drop rates!
          </p>

          <div className="item-drop-info">
            <div className="info-card">
              <h3 className="info-card-title">🎁 Random Item Drops</h3>
              <p className="info-card-text">
                Every player receives a chance for an item drop after completing a match. 
                Items range from common to legendary rarity.
              </p>
            </div>
            <div className="info-card highlight">
              <h3 className="info-card-title">⚽ Token Holder Benefits</h3>
              <p className="info-card-text">
                Players holding $KICK tokens get <strong>2.5x better item drop rates</strong>! 
                The more tokens you hold, the better your chances of finding rare items.
              </p>
            </div>
            <div className="info-card">
              <h3 className="info-card-title">🔔 Notifications</h3>
              <p className="info-card-text">
                When you receive a new item, you'll see a notification after the match ends. 
                Check your inventory to view all your collected items!
              </p>
            </div>
          </div>
        </section>

        {/* Strategy Tips */}
        <section className="games-section">
          <h2 className="section-title">Strategy Tips</h2>
          <div className="tips-grid">
            <div className="tip-card">
              <h3 className="tip-title">🏃 Movement</h3>
              <p>Use WASD or arrow keys to move. Jump with Spacebar. Master the controls to navigate hexagons safely!</p>
            </div>
            <div className="tip-card">
              <h3 className="tip-title">🎯 Power-Up Strategy</h3>
              <p>If you fall early, head to the bottom floor to find rare power-ups. They can completely turn the match around!</p>
            </div>
            <div className="tip-card">
              <h3 className="tip-title">⚡ Hexagon Timing</h3>
              <p>Hexagons disappear after being stepped on. Watch other players' movements to predict safe paths!</p>
            </div>
            <div className="tip-card">
              <h3 className="tip-title">💰 Token Benefits</h3>
              <p>Hold $KICK tokens for better item drop rates. The more you hold, the better your rewards!</p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="games-section cta-section">
          <div className="cta-content">
            <h2 className="cta-title">Ready to Play?</h2>
            <p className="cta-subtitle">
              Join a lobby and experience these exciting game modes and power-ups for yourself!
            </p>
            <button onClick={handleJoinLobby} className="cta-button">
              <span>Join a Lobby</span>
              <span className="cta-arrow">→</span>
            </button>
          </div>
        </section>
      </div>

      {/* Sign-In Modal */}
      {showSignInModal && (
        <div className="sign-in-modal-overlay" onClick={() => setShowSignInModal(false)}>
          <div className="sign-in-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sign-in-modal-header">
              <h2>Sign In to Join a Lobby</h2>
              <button 
                className="sign-in-modal-close"
                onClick={() => setShowSignInModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="sign-in-modal-content">
              <WalletConnect />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

