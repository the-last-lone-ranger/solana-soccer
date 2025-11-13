import { useEffect, useState } from 'react';
import { ApiClient } from '../services/api.js';
import type { LeaderboardEntry } from '@solana-defender/shared';
import './Leaderboard.css';

const EMOJI_AVATARS = ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'];

interface LeaderboardProps {
  apiClient: ApiClient;
}

export function Leaderboard({ apiClient }: LeaderboardProps) {
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
      const data = await apiClient.getLeaderboard(10);
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
    <div className="leaderboard">
      <h2>🏆 Leaderboard</h2>
      {leaderboard.length === 0 ? (
        <p className="empty">No scores yet. Be the first!</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Score</th>
              <th>Level</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry, index) => {
              const displayName = entry.username || `${entry.walletAddress.slice(0, 4)}...${entry.walletAddress.slice(-4)}`;
              const avatar = entry.avatarUrl || (entry.username ? entry.username.slice(0, 2).toUpperCase() : entry.walletAddress.slice(2, 4).toUpperCase());
              
              return (
                <tr key={`${entry.walletAddress}-${entry.timestamp}`} className={index === 0 ? 'leader-row' : ''}>
                  <td>
                    {index === 0 ? '👑' : '#'}{entry.rank}
                  </td>
                  <td className="player-cell">
                    <div className="player-info">
                      <div className="player-avatar">
                        {entry.avatarUrl && EMOJI_AVATARS.includes(entry.avatarUrl) ? (
                          <span className="avatar-emoji-small">{entry.avatarUrl}</span>
                        ) : entry.avatarUrl ? (
                          <img src={entry.avatarUrl} alt={displayName} className="avatar-image-small" />
                        ) : (
                          <div className="avatar-initials-small">{avatar}</div>
                        )}
                      </div>
                      <span className="player-name">{displayName}</span>
                    </div>
                  </td>
                  <td>{entry.score.toLocaleString()}</td>
                  <td>{entry.levelReached}</td>
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

