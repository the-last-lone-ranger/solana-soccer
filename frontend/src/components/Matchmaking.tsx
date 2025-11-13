import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet.js';
import { ApiClient } from '../services/api.js';
import { VoiceChatService } from '../services/voiceChat.js';
import type { Match, MatchStatus } from '@solana-defender/shared';
import './Matchmaking.css';

interface MatchmakingProps {
  apiClient: ApiClient;
  onMatchStart: (match: Match, voiceChat: VoiceChatService | null) => void;
}

export function Matchmaking({ apiClient, onMatchStart }: MatchmakingProps) {
  const { address, client } = useWallet();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState<number>(0.1);
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [voiceChatEnabled, setVoiceChatEnabled] = useState(true);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  useEffect(() => {
    loadMatches();
    loadWalletInfo();
    const interval = setInterval(() => {
      loadMatches();
      loadWalletInfo();
    }, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [address]);

  const loadWalletInfo = async () => {
    if (!address) return;
    
    setLoadingBalance(true);
    try {
      // Load sequentially to avoid multiple simultaneous auth requests
      // This helps with token caching
      const depositResult = await apiClient.getDepositAddress();
      setDepositAddress(depositResult.depositAddress);
      
      // Small delay to ensure token is cached
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const balanceResult = await apiClient.getWalletBalance();
      setWalletBalance(balanceResult.balance);
    } catch (err: any) {
      console.error('Failed to load wallet info:', err);
      // Don't show error if it's just an auth issue - user will see it in the UI
      if (err.message?.includes('Authentication') || err.message?.includes('signature')) {
        console.warn('Authentication required for wallet info');
      }
    } finally {
      setLoadingBalance(false);
    }
  };

  const loadMatches = async () => {
    try {
      const result = await apiClient.getAvailableMatches(20);
      setMatches(result.matches);
    } catch (err) {
      console.error('Failed to load matches:', err);
    }
  };

  const createMatch = async () => {
    if (!address || betAmount <= 0) {
      setError('Invalid bet amount');
      return;
    }

    setCreatingMatch(true);
    setError(null);

    try {
      // Check wallet balance first
      if (walletBalance < betAmount) {
        setError(`Insufficient balance. You have ${walletBalance.toFixed(4)} SOL, need ${betAmount} SOL. Please deposit to your in-game wallet.`);
        return;
      }

      // Create match - no transaction needed, backend checks balance
      const result = await apiClient.createMatch(betAmount);
      
      // Initialize voice chat if enabled
      let voiceChat: VoiceChatService | null = null;
      if (voiceChatEnabled) {
        voiceChat = new VoiceChatService();
        await voiceChat.initialize();
      }

      // Start match
      onMatchStart(result.match, voiceChat!);
    } catch (err: any) {
      console.error('Failed to create match:', err);
      setError(err.message || 'Failed to create match');
    } finally {
      setCreatingMatch(false);
    }
  };

  const joinMatch = async (match: Match) => {
    if (!address) {
      setError('Wallet not connected');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Check wallet balance
      if (walletBalance < match.betAmountSol) {
        setError(`Insufficient balance. You have ${walletBalance.toFixed(4)} SOL, need ${match.betAmountSol} SOL. Please deposit to your in-game wallet.`);
        setLoading(false);
        return;
      }

      // Join match - no transaction needed, backend checks balance
      const result = await apiClient.joinMatch(match.id);

      // Initialize voice chat if enabled
      let voiceChat: VoiceChatService | null = null;
      if (voiceChatEnabled) {
        voiceChat = new VoiceChatService();
        await voiceChat.initialize();
        
        // In a real implementation, you'd exchange WebRTC offers/answers via WebSocket
        // For now, we'll just initialize both sides
      }

      // Start match
      onMatchStart(result.match, voiceChat!);
    } catch (err: any) {
      console.error('Failed to join match:', err);
      setError(err.message || 'Failed to join match');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="matchmaking">
      <div className="matchmaking-header">
        <h2>🎮 Competitive Matches</h2>
        <p>Bet SOL and compete head-to-head!</p>
      </div>

      {/* Wallet Balance Display */}
      <div className="wallet-info-section">
        <h3>💰 In-Game Wallet</h3>
        {depositAddress ? (
          <div className="wallet-details">
            <div className="balance-display">
              <strong>Balance:</strong> {loadingBalance ? 'Loading...' : `${walletBalance.toFixed(4)} SOL`}
            </div>
            <div className="deposit-address">
              <strong>Deposit Address:</strong>
              <div className="address-display">
                <code>{depositAddress}</code>
                <button 
                  onClick={() => navigator.clipboard.writeText(depositAddress)}
                  className="copy-btn"
                  title="Copy address"
                >
                  📋
                </button>
              </div>
              <p className="deposit-note">
                Send SOL to this address to fund your in-game wallet for betting
              </p>
            </div>
          </div>
        ) : (
          <p>Loading wallet information...</p>
        )}
      </div>

      <div className="create-match-section">
        <h3>Create New Match</h3>
        <div className="bet-input-group">
          <label>
            Bet Amount (SOL):
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={betAmount}
              onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0)}
              disabled={creatingMatch}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={voiceChatEnabled}
              onChange={(e) => setVoiceChatEnabled(e.target.checked)}
            />
            Enable Voice Chat
          </label>
          <button
            onClick={createMatch}
            disabled={creatingMatch || betAmount <= 0 || walletBalance < betAmount}
            className="create-match-btn"
          >
            {creatingMatch ? 'Creating...' : walletBalance < betAmount ? 'Insufficient Balance' : 'Create Match'}
          </button>
          {walletBalance < betAmount && (
            <p className="insufficient-balance-warning">
              ⚠️ You need {betAmount} SOL but only have {walletBalance.toFixed(4)} SOL. Deposit more to create a match.
            </p>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="available-matches-section">
        <h3>Available Matches</h3>
        {matches.length === 0 ? (
          <p className="no-matches">No matches available. Create one to get started!</p>
        ) : (
          <div className="matches-list">
            {matches.map((match) => (
              <div key={match.id} className="match-card">
                <div className="match-info">
                  <div className="match-creator">
                    {match.creatorAvatar ? (
                      <img src={match.creatorAvatar} alt="Creator" className="avatar" onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }} />
                    ) : (
                      <div className="avatar avatar-placeholder">
                        {match.creatorUsername?.[0]?.toUpperCase() || match.creatorAddress[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <span className="username">
                      {match.creatorUsername || match.creatorAddress.slice(0, 8) + '...'}
                    </span>
                  </div>
                  <div className="bet-amount">
                    💰 {match.betAmountSol} SOL
                  </div>
                </div>
                <button
                  onClick={() => joinMatch(match)}
                  disabled={loading || match.creatorAddress === address || walletBalance < match.betAmountSol}
                  className="join-match-btn"
                >
                  {loading ? 'Joining...' : walletBalance < match.betAmountSol ? 'Insufficient Balance' : 'Join Match'}
                </button>
                {walletBalance < match.betAmountSol && (
                  <p className="insufficient-balance-warning-small">
                    Need {match.betAmountSol} SOL
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

