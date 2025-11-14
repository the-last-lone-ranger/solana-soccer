import { useEffect, useState } from 'react';
import { ApiClient } from '../services/api.js';
import { useTheme } from '../contexts/ThemeContext.js';
import './Users.css';

const EMOJI_AVATARS = ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'];

interface User {
  walletAddress: string;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string;
  gamesPlayed: number;
  totalScore: number;
  highScore: number;
  roundsPlayed: number;
  roundsWon: number;
  totalSolWon: number;
  isKickItTokenHolder?: boolean;
}

interface UsersProps {
  apiClient: ApiClient;
}

export function Users({ apiClient }: UsersProps) {
  const { theme } = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getUsers();
      setUsers(data.users);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="users loading">Loading users...</div>;
  }

  if (error) {
    return (
      <div className="users error">
        <p>{error}</p>
        <button onClick={loadUsers}>Retry</button>
      </div>
    );
  }

  return (
    <div className={`users users-${theme}`}>
      <h2>👥 Platform Users</h2>
      {users.length === 0 ? (
        <p className="empty">No users yet. Be the first!</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Games</th>
              <th>Rounds</th>
              <th>Wins</th>
              <th>High Score</th>
              <th>Total SOL Won</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const displayName = user.username || `${user.walletAddress.slice(0, 4)}...${user.walletAddress.slice(-4)}`;
              const avatar = user.avatarUrl || (user.username ? user.username.slice(0, 2).toUpperCase() : user.walletAddress.slice(2, 4).toUpperCase());
              const winRate = user.roundsPlayed > 0 ? ((user.roundsWon / user.roundsPlayed) * 100).toFixed(1) : '0.0';
              const joinedDate = new Date(user.createdAt).toLocaleDateString();
              
              return (
                <tr key={user.walletAddress}>
                  <td className="player-cell">
                    <div className="player-info">
                      <div className="player-avatar">
                        {user.avatarUrl && EMOJI_AVATARS.includes(user.avatarUrl) ? (
                          <span className="avatar-emoji-small">{user.avatarUrl}</span>
                        ) : user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={displayName} className="avatar-image-small" />
                        ) : (
                          <div className="avatar-initials-small">{avatar}</div>
                        )}
                      </div>
                      <div className="player-details">
                        <span className="player-name">
                          {displayName}
                          {user.isKickItTokenHolder && (
                            <span className="token-badge" title="Kicking It ($SOCCER) Token Holder">
                              ⚽
                            </span>
                          )}
                        </span>
                        {!user.username && (
                          <span className="wallet-address">{user.walletAddress.slice(0, 8)}...{user.walletAddress.slice(-6)}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{user.gamesPlayed}</td>
                  <td>{user.roundsPlayed}</td>
                  <td>
                    {user.roundsWon} <span className="win-rate">({winRate}%)</span>
                  </td>
                  <td>{user.highScore.toLocaleString()}</td>
                  <td className="sol-amount">{user.totalSolWon.toFixed(4)} SOL</td>
                  <td className="date-cell">{joinedDate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <button onClick={loadUsers} className="refresh-btn">Refresh</button>
    </div>
  );
}

