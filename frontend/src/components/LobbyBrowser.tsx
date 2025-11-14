import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext.js';
import { ApiClient } from '../services/api.js';
import { SocketClient } from '../services/socketClient.js';
import { LobbyWaitingRoom } from './LobbyWaitingRoom.js';
import { PlayerTooltip } from './PlayerTooltip.js';
import type { Lobby, LobbyStatus } from '@solana-defender/shared';
import { BetAmount } from '@solana-defender/shared';
import './LobbyBrowser.css';

interface LobbyBrowserProps {
  apiClient: ApiClient;
  onLobbyStart: (lobby: Lobby, socketClient: SocketClient) => void;
}

export function LobbyBrowser({ apiClient, onLobbyStart }: LobbyBrowserProps) {
  const { address } = useWallet();
  const navigate = useNavigate();
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

  // Connect socket when address is available (Solana wallet) or Google auth is present
  useEffect(() => {
    // Check for Google auth or Solana wallet
    const googleToken = localStorage.getItem('google_auth_token');
    const googleAddress = localStorage.getItem('google_auth_address');
    const isGoogleAuth = googleToken && googleAddress;
    
    if (address || isGoogleAuth) {
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
      console.log('[LobbyBrowser] Received lobby state update:', updatedLobby.id);
      console.log('[LobbyBrowser] Players in socket update:', updatedLobby.players?.length || 0, updatedLobby.players?.map(p => p.walletAddress) || []);
      
      setLobbies((prev) => {
        const existingLobbyIndex = prev.findIndex(l => l.id === updatedLobby.id);
        
        if (existingLobbyIndex >= 0) {
          // Update existing lobby - ALWAYS use players from socket update
          const mergedLobby = {
            ...updatedLobby,
            players: updatedLobby.players && Array.isArray(updatedLobby.players) 
              ? updatedLobby.players 
              : (prev[existingLobbyIndex].players || []),
          };
          console.log('[LobbyBrowser] Socket update for existing lobby:', mergedLobby.id, 'player count:', mergedLobby.players.length, 'players:', mergedLobby.players.map(p => p.walletAddress));
          
          const newLobbies = [...prev];
          newLobbies[existingLobbyIndex] = mergedLobby;
          return newLobbies;
        } else {
          // Lobby doesn't exist yet - add it (might be a new lobby)
          console.log('[LobbyBrowser] Socket update for new lobby:', updatedLobby.id, 'player count:', updatedLobby.players?.length || 0);
          return [...prev, updatedLobby];
        }
      });
      
      // Update joined lobby if it's the one we're in
      if (joinedLobbyId === updatedLobby.id) {
        const hasPlayersInUpdate = updatedLobby.players && Array.isArray(updatedLobby.players) && updatedLobby.players.length > 0;
        setJoinedLobby({
          ...updatedLobby,
          players: hasPlayersInUpdate
            ? updatedLobby.players
            : (joinedLobby?.players || []),
        });
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
      console.log('[LobbyBrowser] Loaded lobbies from API:', result.lobbies.map(l => ({ 
        id: l.id, 
        playerCount: l.players?.length || 0,
        players: l.players?.map(p => p.walletAddress) || []
      })));
      
      // Merge with existing lobbies to preserve socket updates
      setLobbies((prevLobbies) => {
        // Create a map of API lobbies by ID for quick lookup
        const apiLobbiesMap = new Map(result.lobbies.map(l => [l.id, l]));
        
        // Start with API lobbies, but merge socket-updated player data
        const mergedLobbies = result.lobbies.map((apiLobby) => {
          // Find existing lobby from previous state (might have socket updates)
          const existingLobby = prevLobbies.find(l => l.id === apiLobby.id);
          
          // ALWAYS prefer socket-updated players if they exist (they're real-time and more accurate)
          // Socket updates are the source of truth for player counts
          if (existingLobby && existingLobby.players && Array.isArray(existingLobby.players)) {
            const socketPlayerCount = existingLobby.players.length;
            const apiPlayerCount = apiLobby.players?.length || 0;
            
            // Only use API data if socket has 0 AND API has >0 (socket might be stale/empty)
            // Otherwise always trust socket updates (they're real-time)
            if (socketPlayerCount === 0 && apiPlayerCount > 0) {
              console.log('[LobbyBrowser] Socket has 0 but API has players - using API data for lobby:', apiLobby.id, 'API count:', apiPlayerCount);
              return apiLobby;
            }
            
            console.log('[LobbyBrowser] Using socket-updated players for lobby:', apiLobby.id, 'socket count:', socketPlayerCount, 'API count:', apiPlayerCount);
            
            // Use socket data (real-time updates)
            return {
              ...apiLobby,
              players: existingLobby.players, // Use players from socket updates (real-time)
            };
          }
          
          // Use API data (no socket updates available)
          console.log('[LobbyBrowser] Using API data for lobby:', apiLobby.id, 'player count:', apiLobby.players?.length || 0);
          return apiLobby;
        });
        
        // Add any lobbies from socket state that aren't in API response (shouldn't happen, but be safe)
        prevLobbies.forEach((socketLobby) => {
          if (!apiLobbiesMap.has(socketLobby.id) && socketLobby.players && socketLobby.players.length > 0) {
            console.log('[LobbyBrowser] Adding socket-only lobby:', socketLobby.id);
            mergedLobbies.push(socketLobby);
          }
        });
        
        return mergedLobbies;
      });
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
      // Navigate to the waiting room page
      navigate(`/lobby/${result.lobby.id}`);
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
      // Wait a bit for the database to be updated before joining socket
      await new Promise(resolve => setTimeout(resolve, 100));
      socketClient.joinLobby(lobbyId);
      // Request lobby state after socket join to ensure we have the latest data
      setTimeout(() => {
        socketClient.requestLobbyState(lobbyId);
      }, 200);
      await loadLobbies();
      // Navigate to the waiting room page
      navigate(`/lobby/${lobbyId}`);
    } catch (err: any) {
      console.error('Failed to join lobby:', err);
      setError(err.message || 'Failed to join lobby');
    } finally {
      setLoading(false);
    }
  };

  const spectateLobby = (lobbyId: string) => {
    // Navigate to spectate route - no need to join as player
    navigate(`/spectate/${lobbyId}`);
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

  // Don't show waiting room here - it's handled by the route

  return (
    <div className="lobby-browser">
      <div className="lobby-header">
        <h2>🎮 Join a Lobby</h2>
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
            const playerCount = lobby.players?.length || 0;
            const isFull = playerCount >= (lobby.maxPlayers ?? 50);

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
                      {lobby.players?.length || 0} / {lobby.maxPlayers ?? 50} players
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
                  {lobby.players.map((player) => {
                    const displayName = player.username || `${player.walletAddress.slice(0, 6)}...`;
                    const avatar = player.avatarUrl || (player.username ? player.username.slice(0, 2).toUpperCase() : player.walletAddress.slice(2, 4).toUpperCase());
                    const EMOJI_AVATARS = ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'];
                    
                    return (
                      <PlayerTooltip
                        key={player.walletAddress}
                        walletAddress={player.walletAddress}
                        apiClient={apiClient}
                      >
                        <div className="player-tag">
                          <div className="player-avatar-small">
                            {player.avatarUrl && EMOJI_AVATARS.includes(player.avatarUrl) ? (
                              <span className="avatar-emoji-tiny">{player.avatarUrl}</span>
                            ) : player.avatarUrl ? (
                              <img src={player.avatarUrl} alt={displayName} className="avatar-image-tiny" />
                            ) : (
                              <div className="avatar-initials-tiny">{avatar}</div>
                            )}
                          </div>
                          <span className="player-name-small">{displayName}</span>
                        </div>
                      </PlayerTooltip>
                    );
                  })}
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
                    <>
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
                      <button
                        className="spectate-btn"
                        onClick={() => spectateLobby(lobby.id)}
                        title="Watch this lobby without joining"
                      >
                        👁️ Spectate
                      </button>
                    </>
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

