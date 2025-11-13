import { useEffect, useState } from 'react';
import { ApiClient } from '../services/api.js';
import { useTheme } from '../contexts/ThemeContext.js';
import type { LeaderboardEntry } from '@solana-defender/shared';
import './Leaderboard.css';

const EMOJI_AVATARS = ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'];

interface LeaderboardProps {
  apiClient: ApiClient;
}

export function Leaderboard({ apiClient }: LeaderboardProps) {
  const { theme } = useTheme();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getLeaderboard(100);
      setLeaderboard(data.leaderboard);
    } catch (err: any) {
      setError(err.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="leaderboard loading">Loading leaderboard...</div>;
  }

  if (error) {
    return (
      <div className="leaderboard error">
        <p>{error}</p>
        <button onClick={loadLeaderboard}>Retry</button>
      </div>
    );
  }

  return (
    <div className={`leaderboard leaderboard-${theme}`}>
      <h2>🏆 Leaderboard</h2>
      {leaderboard.length === 0 ? (
        <p className="empty">No scores yet. Be the first!</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>High Score</th>
              <th>Rounds</th>
              <th>Wins</th>
              <th>SOL Won</th>
              <th>Games</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry, index) => {
              const displayName = entry.username || `${entry.walletAddress.slice(0, 4)}...${entry.walletAddress.slice(-4)}`;
              const avatar = entry.avatarUrl || (entry.username ? entry.username.slice(0, 2).toUpperCase() : entry.walletAddress.slice(2, 4).toUpperCase());
              const winRate = entry.roundsPlayed && entry.roundsPlayed > 0 
                ? ((entry.roundsWon || 0) / entry.roundsPlayed * 100).toFixed(1) 
                : '0.0';
              
              return (
                <tr 
                  key={`${entry.walletAddress}-${entry.rank}`} 
                  className={index === 0 ? 'leader-row' : index < 3 ? 'top-three' : ''}
                >
                  <td className="rank-cell">
                    {index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : '#'}{entry.rank}
                  </td>
                  <td className="player-cell">
                    <div className="player-info">
                      <div className="player-avatar">
                        {entry.avatarUrl && EMOJI_AVATARS.includes(entry.avatarUrl) ? (
                          <span className="avatar-emoji">{entry.avatarUrl}</span>
                        ) : entry.avatarUrl ? (
                          <img src={entry.avatarUrl} alt={displayName} className="avatar-image" />
                        ) : (
                          <div className="avatar-initials">{avatar}</div>
                        )}
                      </div>
                      <div className="player-details">
                        <span className="player-name">{displayName}</span>
                        {!entry.username && (
                          <span className="wallet-address">{entry.walletAddress.slice(0, 8)}...{entry.walletAddress.slice(-6)}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="score-cell">{entry.highScore?.toLocaleString() || entry.score.toLocaleString()}</td>
                  <td>{entry.roundsPlayed || 0}</td>
                  <td>
                    {entry.roundsWon || 0} <span className="win-rate">({winRate}%)</span>
                  </td>
                  <td className="sol-amount">{(entry.totalSolWon || 0).toFixed(4)} SOL</td>
                  <td>{entry.gamesPlayed || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <button onClick={loadLeaderboard} className="refresh-btn">Refresh</button>
    </div>
  );
}
