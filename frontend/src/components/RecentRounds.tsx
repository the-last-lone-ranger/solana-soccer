import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ApiClient } from '../services/api.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import './RecentRounds.css';

interface Round {
  lobbyId: string;
  betAmountSol: number;
  completedAt: string;
  teams: string[];
  winnersCount: number;
  playerCount: number;
  winnerAvatars?: string[];
  winningTeam?: string | null;
  expGained?: number | null;
}

interface RecentRoundsProps {
  apiClient: ApiClient;
}

export function RecentRounds({ apiClient }: RecentRoundsProps) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRounds();
    // Refresh every 30 seconds
    const interval = setInterval(loadRounds, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadRounds = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getRecentRounds(5);
      setRounds(data.rounds || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load recent rounds');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    
    try {
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date string:', dateString);
        return 'Unknown';
      }
      
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      
      // Handle future dates (shouldn't happen, but just in case)
      if (diffMs < 0) {
        return 'Just now';
      }
      
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffSecs < 60) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      // For older dates, show actual date
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        ...(diffDays >= 365 ? { year: 'numeric' } : {})
      });
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return 'Unknown';
    }
  };

  if (loading && rounds.length === 0) {
    return (
      <div className="recent-rounds">
        <LoadingSpinner size="sm" text="Loading recent rounds..." />
      </div>
    );
  }

  return (
    <div className="recent-rounds">
      <h2>📊 Recent Rounds</h2>
      {error && <div className="error-message">{error}</div>}
      
      {rounds.length === 0 ? (
        <div className="empty-rounds">
          <p>No rounds played yet. Be the first!</p>
        </div>
      ) : (
        <motion.div
          className="rounds-list"
          initial="hidden"
          animate="visible"
          variants={{
            visible: {
              transition: {
                staggerChildren: 0.1,
              },
            },
          }}
        >
          {rounds.map((round, index) => {
            const winningTeam = round.winningTeam?.toLowerCase() || null;
            const hasWinners = round.winnersCount > 0;
            
            return (
              <motion.div
                key={round.lobbyId}
                className={`round-card ${winningTeam ? `winner-${winningTeam}` : ''}`}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1],
                    },
                  },
                }}
                whileHover={{ y: -4, scale: 1.01, transition: { duration: 0.2 } }}
              >
                <div className="round-header">
                  <div className="round-header-left">
                    <span className={`round-bet ${round.betAmountSol === 0 ? 'free' : 'paid'}`}>
                      {round.betAmountSol === 0 ? (
                        <>
                          <span className="bet-icon">🎮</span>
                          <span>Free</span>
                        </>
                      ) : (
                        <>
                          <span className="bet-icon">💰</span>
                          <span>{round.betAmountSol} SOL</span>
                        </>
                      )}
                    </span>
                    <span className="round-time">
                      <span className="time-icon">⏱️</span>
                      {formatDate(round.completedAt)}
                    </span>
                  </div>
                </div>
                
                <div className="round-teams-container">
                  {round.teams.map((team) => {
                    const isWinner = winningTeam === team.toLowerCase();
                    return (
                      <div
                        key={team}
                        className={`team-section ${team.toLowerCase()} ${isWinner ? 'winner' : ''}`}
                      >
                        <div className="team-header">
                          <span className={`team-badge ${team.toLowerCase()}`}>
                            {team.toUpperCase()}
                          </span>
                          {isWinner && (
                            <span className="winner-indicator">
                              <span className="winner-icon">👑</span>
                              <span className="winner-text">WINNER</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {hasWinners && (
                  <div className="round-winners-section">
                    <div className="winners-label">
                      <span className="winners-icon">🏆</span>
                      <span>Winners</span>
                      {round.expGained !== null && round.expGained !== undefined && (
                        <span className="exp-gained-badge">
                          <span className="exp-icon">⭐</span>
                          <span>+{round.expGained} EXP</span>
                        </span>
                      )}
                    </div>
                    {round.winnerAvatars && round.winnerAvatars.length > 0 ? (
                      <div className="winner-avatars">
                        {round.winnerAvatars.slice(0, 5).map((avatar, index) => (
                          <div key={index} className="winner-avatar-wrapper">
                            <img
                              src={avatar}
                              alt={`Winner ${index + 1}`}
                              className="winner-avatar"
                              onError={(e) => {
                                // Hide broken images
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <div className="winner-avatar-glow"></div>
                          </div>
                        ))}
                        {round.winnersCount > 5 && (
                          <div className="winner-more-badge">
                            <span className="winner-more-icon">+</span>
                            <span className="winner-more-count">{round.winnersCount - 5}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="winners-count-badge">
                        <span>{round.winnersCount} winner{round.winnersCount !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="round-stats">
                  <div className="stat-item">
                    <span className="stat-icon">👥</span>
                    <span>{round.playerCount} player{round.playerCount !== 1 ? 's' : ''}</span>
                  </div>
                  {hasWinners && (
                    <>
                      <span className="stat-divider">•</span>
                      <div className="stat-item winners-stat">
                        <span className="stat-icon">🏅</span>
                        <span>{round.winnersCount} winner{round.winnersCount !== 1 ? 's' : ''}</span>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

