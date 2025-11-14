import { useEffect, useState } from 'react';
import { ApiClient } from '../services/api.js';
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
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (loading && rounds.length === 0) {
    return (
      <div className="recent-rounds">
        <div className="loading">Loading recent rounds...</div>
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
        <div className="rounds-list">
          {rounds.map((round) => (
            <div key={round.lobbyId} className="round-card">
              <div className="round-header">
                <span className="round-bet">
                  {round.betAmountSol === 0 ? 'Free' : `${round.betAmountSol} SOL`}
                </span>
                <span className="round-time">{formatDate(round.completedAt)}</span>
              </div>
              <div className="round-info">
                <div className="round-teams">
                  {round.teams.map((team) => (
                    <span key={team} className={`team-badge ${team}`}>
                      {team.toUpperCase()}
                    </span>
                  ))}
                </div>
                <div className="round-winners">
                  {round.winnerAvatars && round.winnerAvatars.length > 0 ? (
                    <div className="winner-avatars">
                      {round.winnerAvatars.slice(0, 3).map((avatar, index) => (
                        <img
                          key={index}
                          src={avatar}
                          alt={`Winner ${index + 1}`}
                          className="winner-avatar"
                          onError={(e) => {
                            // Hide broken images
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ))}
                      {round.winnersCount > 3 && (
                        <span className="winner-more">+{round.winnersCount - 3} more</span>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="round-stats">
                  <span>{round.playerCount} players</span>
                  <span>•</span>
                  <span>{round.winnersCount} winners</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

