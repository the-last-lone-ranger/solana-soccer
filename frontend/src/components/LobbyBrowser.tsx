import { useEffect, useState } from 'react';
import { useWallet } from '../contexts/WalletContext.js';
import { ApiClient } from '../services/api.js';
import { SocketClient } from '../services/socketClient.js';
import { LobbyWaitingRoom } from './LobbyWaitingRoom.js';
import type { Lobby, LobbyStatus } from '@solana-defender/shared';
import { BetAmount } from '@solana-defender/shared';
import './LobbyBrowser.css';

interface LobbyBrowserProps {
  apiClient: ApiClient;
  onLobbyStart: (lobby: Lobby, socketClient: SocketClient) => void;
}

export function LobbyBrowser({ apiClient, onLobbyStart }: LobbyBrowserProps) {
  const { address } = useWallet();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [selectedBetAmount, setSelectedBetAmount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [socketClient] = useState(() => new SocketClient());
  const [joinedLobbyId, setJoinedLobbyId] = useState<string | null>(null);
  const [joinedLobby, setJoinedLobby] = useState<Lobby | null>(null);
  const [countdowns, setCountdowns] = useState<Map<string, number>>(new Map());

  // Load wallet balance
  useEffect(() => {
    if (address) {
      loadWalletBalance();
    }
  }, [address]);

  // Load lobbies
  useEffect(() => {
    loadLobbies();
    const interval = setInterval(loadLobbies, 2000); // Refresh every 2 seconds
    return () => clearInterval(interval);
  }, [selectedBetAmount]);

  // Connect socket when address is available
  useEffect(() => {
    if (address) {
      const token = apiClient.getJwtToken();
      if (token) {
        socketClient.connect(token);
      } else {
        // If no token yet, try to get one by making an authenticated request
        // This will trigger authentication and cache the token
        apiClient.getProfile().catch(() => {
          // Ignore errors - this is just to trigger auth
        }).then(() => {
          const newToken = apiClient.getJwtToken();
          if (newToken) {
            socketClient.connect(newToken);
          }
        });
      }
    }
  }, [address, apiClient]);

  // Socket event listeners
  useEffect(() => {
    socketClient.onLobbyState((data) => {
      const updatedLobby = data.lobby;
      setLobbies((prev) =>
        prev.map((l) => (l.id === updatedLobby.id ? updatedLobby : l))
      );
      
      // Update joined lobby if it's the one we're in
      if (joinedLobbyId === updatedLobby.id) {
        setJoinedLobby(updatedLobby);
      }
    });

    socketClient.onLobbyCountdown((data) => {
      setCountdowns((prev) => {
        const newMap = new Map(prev);
        newMap.set(data.lobbyId, data.countdown);
        return newMap;
      });

      // Update lobby status
      setLobbies((prev) =>
        prev.map((l) =>
          l.id === data.lobbyId
            ? { ...l, status: 'starting' as LobbyStatus, countdownSeconds: data.countdown }
            : l
        )
      );
    });

    socketClient.onGameStarted((data) => {
      const lobby = lobbies.find((l) => l.id === data.lobbyId);
      if (lobby && joinedLobbyId === data.lobbyId) {
        onLobbyStart(lobby, socketClient);
      }
    });

    return () => {
      socketClient.off('lobby:state');
      socketClient.off('lobby:countdown');
      socketClient.off('lobby:game_started');
    };
  }, [lobbies, joinedLobbyId, onLobbyStart, socketClient]);

  const loadWalletBalance = async () => {
    try {
      const result = await apiClient.getWalletBalance();
      setWalletBalance(result.balance);
    } catch (err) {
      console.error('Failed to load wallet balance:', err);
    }
  };

  const loadLobbies = async () => {
    try {
      const result = await apiClient.getLobbies(selectedBetAmount ?? undefined);
      setLobbies(result.lobbies);
    } catch (err: any) {
      console.error('Failed to load lobbies:', err);
      setError(err.message || 'Failed to load lobbies');
    }
  };

  const createLobby = async (betAmountSol: number) => {
    if (!address) {
      setError('Please connect your wallet first');
      return;
    }

    if (betAmountSol > 0 && walletBalance < betAmountSol) {
      setError(`Insufficient balance. You need ${betAmountSol} SOL`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.createLobby(betAmountSol);
      setJoinedLobbyId(result.lobby.id);
      setJoinedLobby(result.lobby);
      socketClient.joinLobby(result.lobby.id);
      await loadLobbies();
    } catch (err: any) {
      console.error('Failed to create lobby:', err);
      setError(err.message || 'Failed to create lobby');
    } finally {
      setLoading(false);
    }
  };

  const joinLobby = async (lobbyId: string, betAmountSol: number) => {
    if (!address) {
      setError('Please connect your wallet first');
      return;
    }

    if (betAmountSol > 0 && walletBalance < betAmountSol) {
      setError(`Insufficient balance. You need ${betAmountSol} SOL`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.joinLobby(lobbyId);
      setJoinedLobbyId(lobbyId);
      setJoinedLobby(result.lobby);
      socketClient.joinLobby(lobbyId);
      await loadLobbies();
    } catch (err: any) {
      console.error('Failed to join lobby:', err);
      setError(err.message || 'Failed to join lobby');
    } finally {
      setLoading(false);
    }
  };

  const leaveLobby = async (lobbyId: string) => {
    setLoading(true);
    try {
      await apiClient.leaveLobby(lobbyId);
      socketClient.leaveLobby(lobbyId);
      setJoinedLobbyId(null);
      setJoinedLobby(null);
      await loadLobbies();
    } catch (err: any) {
      console.error('Failed to leave lobby:', err);
      setError(err.message || 'Failed to leave lobby');
    } finally {
      setLoading(false);
    }
  };

  const formatBetAmount = (amount: number): string => {
    if (amount === 0) return 'Free';
    return `${amount} SOL`;
  };

  const getBetAmountLabel = (amount: number): string => {
    if (amount === BetAmount.Free) return 'Free Play';
    if (amount === BetAmount.Low) return 'Low Stakes';
    if (amount === BetAmount.Medium) return 'Medium Stakes';
    return `${amount} SOL`;
  };

  // Show waiting room if joined a lobby
  if (joinedLobby) {
    return (
      <LobbyWaitingRoom
        lobby={joinedLobby}
        socketClient={socketClient}
        onGameStart={() => {
          onLobbyStart(joinedLobby, socketClient);
        }}
      />
    );
  }

  return (
    <div className="lobby-browser">
      <div className="lobby-header">
        <h2>🎮 Join a Lobby</h2>
        <div className="wallet-info">
          <span>Balance: {walletBalance.toFixed(4)} SOL</span>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="bet-amount-filters">
        <button
          className={selectedBetAmount === null ? 'active' : ''}
          onClick={() => setSelectedBetAmount(null)}
        >
          All
        </button>
        <button
          className={selectedBetAmount === BetAmount.Free ? 'active' : ''}
          onClick={() => setSelectedBetAmount(BetAmount.Free)}
        >
          {getBetAmountLabel(BetAmount.Free)}
        </button>
        <button
          className={selectedBetAmount === BetAmount.Low ? 'active' : ''}
          onClick={() => setSelectedBetAmount(BetAmount.Low)}
        >
          {getBetAmountLabel(BetAmount.Low)}
        </button>
        <button
          className={selectedBetAmount === BetAmount.Medium ? 'active' : ''}
          onClick={() => setSelectedBetAmount(BetAmount.Medium)}
        >
          {getBetAmountLabel(BetAmount.Medium)}
        </button>
      </div>

      <div className="create-lobby-section">
        <h3>Create New Lobby</h3>
        <div className="create-buttons">
          <button
            onClick={() => createLobby(BetAmount.Free)}
            disabled={loading || !address}
            className="create-btn free"
          >
            Create Free Lobby
          </button>
          <button
            onClick={() => createLobby(BetAmount.Low)}
            disabled={loading || !address || walletBalance < BetAmount.Low}
            className="create-btn low"
          >
            Create {formatBetAmount(BetAmount.Low)} Lobby
          </button>
          <button
            onClick={() => createLobby(BetAmount.Medium)}
            disabled={loading || !address || walletBalance < BetAmount.Medium}
            className="create-btn medium"
          >
            Create {formatBetAmount(BetAmount.Medium)} Lobby
          </button>
        </div>
      </div>

      <div className="lobbies-list">
        <h3>Available Lobbies</h3>
        {lobbies.length === 0 ? (
          <div className="no-lobbies">No lobbies available. Create one to get started!</div>
        ) : (
          lobbies.map((lobby) => {
            const countdown = countdowns.get(lobby.id) ?? lobby.countdownSeconds;
            const isJoined = joinedLobbyId === lobby.id;
            const canJoin = lobby.status === 'waiting' || lobby.status === 'starting';
            const isFull = lobby.players.length >= (lobby.maxPlayers ?? 50);

            return (
              <div
                key={lobby.id}
                className={`lobby-card ${isJoined ? 'joined' : ''} ${lobby.status}`}
              >
                <div className="lobby-info">
                  <div className="lobby-bet">
                    <span className="bet-badge">{formatBetAmount(lobby.betAmountSol)}</span>
                    <span className="lobby-status">{lobby.status}</span>
                  </div>
                  <div className="lobby-players">
                    <span>
                      {lobby.players.length} / {lobby.maxPlayers ?? 50} players
                    </span>
                  </div>
                  {countdown !== undefined && countdown !== null && (
                    <div className="countdown">
                      ⏱️ Game starting in {countdown}s
                    </div>
                  )}
                  {lobby.status === 'active' && (
                    <div className="game-active">🎮 Game in progress</div>
                  )}
                </div>
                <div className="lobby-players-list">
                  {lobby.players.map((player) => (
                    <div key={player.walletAddress} className="player-tag">
                      {player.username || `${player.walletAddress.slice(0, 6)}...`}
                    </div>
                  ))}
                </div>
                <div className="lobby-actions">
                  {isJoined ? (
                    <button
                      onClick={() => leaveLobby(lobby.id)}
                      disabled={loading || lobby.status === 'active'}
                      className="leave-btn"
                    >
                      Leave
                    </button>
                  ) : (
                    <button
                      onClick={() => joinLobby(lobby.id, lobby.betAmountSol)}
                      disabled={
                        loading ||
                        !canJoin ||
                        isFull ||
                        !address ||
                        (lobby.betAmountSol > 0 && walletBalance < lobby.betAmountSol)
                      }
                      className="join-btn"
                    >
                      {isFull ? 'Full' : canJoin ? 'Join' : 'Closed'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

