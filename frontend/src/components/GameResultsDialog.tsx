import { useEffect } from 'react';
import type { Lobby } from '@solana-defender/shared';
import './GameResultsDialog.css';

interface PlayerResult {
  walletAddress: string;
  username?: string | null;
  avatarUrl?: string | null;
  team: 'red' | 'blue';
  score: number;
  payoutAmount: number;
  won?: boolean;
}

interface GameResultsDialogProps {
  winningTeam: 'red' | 'blue' | null;
  redScore: number;
  blueScore: number;
  winners: PlayerResult[];
  losers: PlayerResult[];
  betAmountSol: number;
  totalPot: number;
  payoutPerPlayer: number;
  lobby: Lobby;
  onClose: () => void;
}

export function GameResultsDialog({
  winningTeam,
  redScore,
  blueScore,
  winners,
  losers,
  betAmountSol,
  totalPot,
  payoutPerPlayer,
  lobby,
  onClose,
}: GameResultsDialogProps) {
  // Auto-close after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 10000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const isPaidMatch = betAmountSol > 0;
  const isTie = !winningTeam;

  return (
    <div className="game-results-overlay" onClick={onClose}>
      <div className="game-results-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="results-header">
          <h2>{isTie ? '🤝 Game Tied!' : '🏆 Game Over!'}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="results-content">
          {/* Score Display */}
          <div className="score-display">
            <div className={`team-score ${winningTeam === 'red' ? 'winner' : ''}`}>
              <div className="team-label">🔴 Red Team</div>
              <div className="team-score-value">{redScore}</div>
            </div>
            <div className="score-separator">vs</div>
            <div className={`team-score ${winningTeam === 'blue' ? 'winner' : ''}`}>
              <div className="team-label">🔵 Blue Team</div>
              <div className="team-score-value">{blueScore}</div>
            </div>
          </div>

          {isTie ? (
            <div className="tie-message">
              <p>It's a tie! No winners this round.</p>
            </div>
          ) : (
            <>
              {/* Winners Section */}
              {winners.length > 0 && (
                <div className="winners-section">
                  <h3>
                    {isPaidMatch ? '💰 Winners' : '🏆 Winners'}
                  </h3>
                  <div className="players-list winners-list">
                    {winners.map((player) => (
                      <div key={player.walletAddress} className="player-result-card winner-card">
                        <div className="player-info">
                          {player.avatarUrl ? (
                            <img 
                              src={player.avatarUrl} 
                              alt={player.username || 'Player'} 
                              className="player-avatar"
                            />
                          ) : (
                            <div className="player-avatar player-avatar-placeholder">
                              {(player.username || player.walletAddress)[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                          <div className="player-details">
                            <div className="player-name">
                              {player.username || `${player.walletAddress.slice(0, 6)}...${player.walletAddress.slice(-4)}`}
                            </div>
                            <div className="player-stats">
                              <span className="stat-badge">Score: {player.score}</span>
                              <span className={`team-badge ${player.team}`}>
                                {player.team.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                        {isPaidMatch && player.payoutAmount > 0 && (
                          <div className="payout-info">
                            <div className="payout-label">Won</div>
                            <div className="payout-amount">
                              +{player.payoutAmount.toFixed(4)} SOL
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Losers Section */}
              {losers.length > 0 && (
                <div className="losers-section">
                  <h3>😔 Losers</h3>
                  <div className="players-list losers-list">
                    {losers.map((player) => (
                      <div key={player.walletAddress} className="player-result-card loser-card">
                        <div className="player-info">
                          {player.avatarUrl ? (
                            <img 
                              src={player.avatarUrl} 
                              alt={player.username || 'Player'} 
                              className="player-avatar"
                            />
                          ) : (
                            <div className="player-avatar player-avatar-placeholder">
                              {(player.username || player.walletAddress)[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                          <div className="player-details">
                            <div className="player-name">
                              {player.username || `${player.walletAddress.slice(0, 6)}...${player.walletAddress.slice(-4)}`}
                            </div>
                            <div className="player-stats">
                              <span className="stat-badge">Score: {player.score}</span>
                              <span className={`team-badge ${player.team}`}>
                                {player.team.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                        {isPaidMatch && (
                          <div className="payout-info loss">
                            <div className="payout-label">Lost</div>
                            <div className="payout-amount">
                              -{betAmountSol.toFixed(4)} SOL
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payout Summary */}
              {isPaidMatch && winners.length > 0 && (
                <div className="payout-summary">
                  <div className="summary-row">
                    <span className="summary-label">Total Pot:</span>
                    <span className="summary-value">{totalPot.toFixed(4)} SOL</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Payout per Winner:</span>
                    <span className="summary-value highlight">{payoutPerPlayer.toFixed(4)} SOL</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Winners:</span>
                    <span className="summary-value">{winners.length}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="results-footer">
          <button className="continue-btn" onClick={onClose}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

