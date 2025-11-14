import { useState } from 'react';
import { ApiClient } from '../services/api.js';
import type { GameStats } from '../game/Game.js';
import './GameOverModal.css';

interface GameOverModalProps {
  stats: GameStats;
  apiClient: ApiClient;
  onClose: () => void;
}

export function GameOverModal({ stats, apiClient, onClose }: GameOverModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rank, setRank] = useState<number | null>(null);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const result = await apiClient.submitScore(stats.score, stats.level);
      setSubmitted(true);
      setRank(result.rank || null);
    } catch (err: any) {
      setError(err.message || 'Failed to submit score');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Game Over!</h2>
        
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Final Score:</span>
            <span className="stat-value">{stats.score.toLocaleString()}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Level Reached:</span>
            <span className="stat-value">{stats.level}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Enemies Killed:</span>
            <span className="stat-value">{stats.enemiesKilled}</span>
          </div>
        </div>

        {!submitted ? (
          <>
            {error && <div className="error-message">{error}</div>}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="submit-btn"
            >
              {submitting ? 'Submitting...' : 'Submit Score'}
            </button>
          </>
        ) : (
          <div className="success">
            <p>✅ Score submitted successfully!</p>
            {rank && <p>Your rank: #{rank}</p>}
          </div>
        )}

        <button onClick={onClose} className="close-btn">
          Close
        </button>
      </div>
    </div>
  );
}


