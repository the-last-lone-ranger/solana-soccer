import { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useWallet } from './hooks/useWallet.js';
import { useTheme } from './contexts/ThemeContext.js';
import { ApiClient } from './services/api.js';
import { WalletConnect } from './components/WalletConnect.js';
import { GameCanvas } from './components/GameCanvas.js';
import { Leaderboard } from './components/Leaderboard.js';
import { Users } from './components/Users.js';
import { PlayerProfile } from './components/PlayerProfile.js';
import { TokenGate } from './components/TokenGate.js';
import { GameOverModal } from './components/GameOverModal.js';
import { ItemDropNotification } from './components/ItemDropNotification.js';
import { LandingPage } from './components/LandingPage.js';
import { FirstTimeSetup } from './components/FirstTimeSetup.js';
import { Matchmaking } from './components/Matchmaking.js';
import { LobbyBrowser } from './components/LobbyBrowser.js';
import { SoccerGameCanvas } from './components/SoccerGameCanvas.js';
import { LobbyWaitingRoomPage } from './pages/LobbyWaitingRoomPage.js';
import { SpectateLobbyPage } from './pages/SpectateLobbyPage.js';
import { WalletManager } from './components/WalletManager.js';
import { Inventory } from './components/Inventory.js';
import { RecentRounds } from './components/RecentRounds.js';
import { UserDropdown } from './components/UserDropdown.js';
import { GameResultsDialog } from './components/GameResultsDialog.js';
import { LoadingSpinner } from './components/LoadingSpinner.js';
import { VoiceChatService } from './services/voiceChat.js';
import type { GameStats } from './game/Game.js';
import type { GameItem, Match, Lobby } from '@solana-defender/shared';
import type { GameResult } from './game/SoccerGame.js';
import { SocketClient } from './services/socketClient.js';
import './App.css';

// Component wrapper for viewing other users' profiles
function UserProfilePage({ apiClient }: { apiClient: ApiClient }) {
  const { walletAddress } = useParams<{ walletAddress: string }>();
  const navigate = useNavigate();
  
  if (!walletAddress) {
    return <div>Invalid wallet address</div>;
  }
  
  return (
    <div className="profile-page">
      <div style={{ padding: '1.5rem 2rem 0' }}>
        <button
          className="back-btn"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
      </div>
      <PlayerProfile apiClient={apiClient} walletAddress={walletAddress} />
    </div>
  );
}

function App() {
  const { theme, toggleTheme } = useTheme();
  const { connected, address, authenticated, authenticate, authenticating, client } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const [apiClient] = useState(() => new ApiClient(client));
  const [showGame, setShowGame] = useState(false);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [foundItem, setFoundItem] = useState<GameItem | null>(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [nftCount] = useState(0);
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showMatchmaking, setShowMatchmaking] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [currentLobby, setCurrentLobby] = useState<Lobby | null>(null);
  const [lobbySocketClient, setLobbySocketClient] = useState<SocketClient | null>(null);
  const [voiceChat, setVoiceChat] = useState<VoiceChatService | null>(null);
  const [isCompetitive, setIsCompetitive] = useState(false);
  const [isLobbyGame, setIsLobbyGame] = useState(false);
  const matchPollIntervalRef = useRef<number | null>(null);
  const [totalSolBet, setTotalSolBet] = useState<number>(0);
  const hasRedirectedToProfileRef = useRef<boolean>(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  
  // Get lobbyId from route params for game route
  const { lobbyId: routeLobbyId } = useParams<{ lobbyId: string }>();
  
  // Load lobby when route changes to /game/:lobbyId
  useEffect(() => {
    if (routeLobbyId && location.pathname.startsWith('/game/')) {
      // Load lobby data if needed
      const loadLobby = async () => {
        try {
          const result = await apiClient.getLobbies();
          const lobby = result.lobbies.find(l => l.id === routeLobbyId);
          if (lobby && !currentLobby) {
            setCurrentLobby(lobby);
            const socketClient = new SocketClient();
            const token = localStorage.getItem('google_auth_token') || 
                          (apiClient as any).authCache?.get(`wallet_${address}`)?.token;
            if (token) {
              socketClient.connect(token);
            }
            setLobbySocketClient(socketClient);
            setIsLobbyGame(true);
            setIsCompetitive(true);
            setShowGame(true);
          }
        } catch (err) {
          console.error('Failed to load lobby:', err);
        }
      };
      loadLobby();
    }
  }, [routeLobbyId, location.pathname, currentLobby, apiClient, address]);

  // OpenKit403Client handles reconnection and token caching internally
  // No need to manually reset flags or clear caches

  const handleStartGame = async () => {
    if (!connected || !address) {
      return;
    }

    // Authenticate before starting game
    try {
      await authenticate('http://localhost:3000/api/profile', 'GET');
      
      // Get token holdings for drop rate calculation
      try {
        const tokenCheck = await apiClient.checkToken();
        setTokenBalance(tokenCheck.balance || 0);
        // NFT count would come from a separate call in production
      } catch (error) {
        console.error('Failed to get token holdings:', error);
      }
      
      setShowGame(true);
    } catch (error) {
      console.error('Authentication failed:', error);
      // Still allow game to start, but score submission might fail
      setShowGame(true);
    }
  };

  const handleItemFound = async (holdings: { tokenBalance: number; nftCount: number }) => {
    try {
      const result = await apiClient.generateItemDrop(holdings.tokenBalance, holdings.nftCount);
      if (result.success && result.item) {
        setFoundItem(result.item);
      }
    } catch (error) {
      console.error('Failed to generate item drop:', error);
    }
  };

  const handleGameOver = async (stats: GameStats) => {
    setGameStats(stats);
    setShowGame(false);
    
    // If competitive match, submit result
    // The backend automatically handles SOL payouts using in-game wallets
    if (isCompetitive && currentMatch && address) {
      try {
        // Get opponent score from match
        const match = await apiClient.getMatch(currentMatch.id);
        const creatorScore = currentMatch.creatorAddress === address ? stats.score : match.creatorScore || 0;
        const opponentScore = currentMatch.opponentAddress === address ? stats.score : match.opponentScore || 0;
        
        // Submit result - backend will automatically process SOL payout
        // using the in-game wallets stored on the backend
        await apiClient.submitMatchResult(
          currentMatch.id,
          creatorScore,
          opponentScore
        );
        
        console.log('✅ Match result submitted - payout processed automatically by backend');
      } catch (error) {
        console.error('Failed to submit match result:', error);
      }
    }
    
    // Cleanup
    if (matchPollIntervalRef.current) {
      clearInterval(matchPollIntervalRef.current);
      matchPollIntervalRef.current = null;
    }
    if (voiceChat) {
      voiceChat.cleanup();
      setVoiceChat(null);
    }
    setIsCompetitive(false);
    setCurrentMatch(null);
  };

  const handleMatchStart = async (match: Match, voiceChatService: VoiceChatService | null) => {
    if (!address) return;
    
    setCurrentMatch(match);
    setIsCompetitive(true);
    setShowMatchmaking(false);
    
    if (voiceChatService) {
      setVoiceChat(voiceChatService);
    }
    
    // Start polling for opponent score updates
    if (match.status === 'active' && match.opponentAddress) {
      matchPollIntervalRef.current = window.setInterval(async () => {
        try {
          const updatedMatch = await apiClient.getMatch(match.id);
          // Update opponent score in game (will be handled by GameCanvas)
          if (updatedMatch.status === 'completed') {
            // Match completed, stop polling
            if (matchPollIntervalRef.current) {
              clearInterval(matchPollIntervalRef.current);
              matchPollIntervalRef.current = null;
            }
          }
        } catch (error) {
          console.error('Failed to poll match status:', error);
        }
      }, 2000); // Poll every 2 seconds
    }
    
    setShowGame(true);
  };

  const handleLobbyStart = (lobby: Lobby, socketClient: SocketClient) => {
    setCurrentLobby(lobby);
    setLobbySocketClient(socketClient);
    setIsLobbyGame(true);
    setIsCompetitive(true);
    setShowGame(true);
    // Navigate to game route
    navigate(`/game/${lobby.id}`);
    console.log('Lobby game starting:', lobby);
  };

  const [gameResults, setGameResults] = useState<{
    winningTeam: 'red' | 'blue' | null;
    redScore: number;
    blueScore: number;
    winners: any[];
    losers: any[];
    betAmountSol: number;
    totalPot: number;
    payoutPerPlayer: number;
    lobby: Lobby;
  } | null>(null);

  const handleSoccerGameEnd = async (results: GameResult[]) => {
    console.log('Soccer game ended with results:', results);
    
    // Submit results to backend
    if (currentLobby && results.length > 0) {
      try {
        const response = await apiClient.submitLobbyResults(currentLobby.id, results);
        console.log('Results submitted:', response);
        
        // Show results dialog if we have winner information
        if (response.winners !== undefined && response.losers !== undefined) {
          setGameResults({
            winningTeam: response.winningTeam as 'red' | 'blue' | null,
            redScore: response.redScore,
            blueScore: response.blueScore,
            winners: response.winners || [],
            losers: response.losers || [],
            betAmountSol: response.betAmountSol || 0,
            totalPot: response.totalPot || 0,
            payoutPerPlayer: response.payoutPerPlayer || 0,
            lobby: currentLobby,
          });
        }
      } catch (error) {
        console.error('Failed to submit results:', error);
        // Still reset game state even if submission failed
      }
    } else {
      // No lobby or results - just reset
      setIsLobbyGame(false);
      setCurrentLobby(null);
      setLobbySocketClient(null);
      setShowGame(false);
    }
  };

  const handleCloseModal = () => {
    setGameStats(null);
    // Navigate back to lobby after closing modal
    if (currentLobby) {
      navigate(`/lobby/${currentLobby.id}`);
    } else {
      navigate('/lobbies');
    }
  };

  // Load profile when wallet connects
  // This will trigger authentication automatically via ApiClient, which will:
  // 1. Prompt for signature (first time only)
  // 2. Capture and cache the JWT token from the response
  // 3. Use the cached token for subsequent requests (no more signatures needed)
  useEffect(() => {
    if (connected && address && !profileLoaded && !authenticating) {
      let cancelled = false;
      const checkProfile = async () => {
        try {
          // Verify wallet is connected to OpenKit client
          const clientAddress = await client.getAddress();
          if (!clientAddress || clientAddress !== address) {
            console.warn('OpenKit client not connected to wallet or address mismatch');
            console.log('Expected:', address, 'Got:', clientAddress);
            if (!cancelled) {
              setProfileLoaded(true);
            }
            return;
          }

          // Call getProfile - this will trigger authentication if needed
          // The ApiClient will capture the JWT token from the first auth response
          // and cache it for all subsequent requests
          console.log('🔐 Loading profile - this will prompt for signature if not authenticated...');
          const profile = await apiClient.getProfile();
          
          if (!cancelled) {
            setProfileLoaded(true);
            if (!profile.username) {
              setShowFirstTimeSetup(true);
            }
          }
        } catch (error: any) {
          if (cancelled) return;
          
          console.error('❌ Failed to load profile:', error);
          console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
          });
          // If authentication fails, don't block the user
          // They can still play, just won't see profile setup until they authenticate
          if (error.message?.includes('signature') || error.message?.includes('provider')) {
            console.warn('⚠️ User needs to approve wallet signature or reconnect wallet to access profile');
          }
          // Mark as loaded to prevent retry loop
          setProfileLoaded(true);
        }
      };
      
      // Small delay to ensure wallet connection is fully established
      const timeoutId = setTimeout(() => {
        if (!cancelled) {
          checkProfile();
        }
      }, 100);
      
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
    }
  }, [connected, address, profileLoaded, authenticating, apiClient, client]);

  const handleFirstTimeSetupComplete = () => {
    setShowFirstTimeSetup(false);
    setProfileLoaded(true);
    // Immediately redirect to lobby browser after first-time setup so they can start playing
    if (address) {
      hasRedirectedToProfileRef.current = true;
      navigate('/lobbies');
    }
  };

  // Check Google auth users and prompt for username setup
  useEffect(() => {
    const googleToken = localStorage.getItem('google_auth_token');
    const googleAddress = localStorage.getItem('google_auth_address');
    const isGoogleAuth = googleToken && googleAddress;
    
    if (isGoogleAuth && !profileLoaded && !authenticating && !showFirstTimeSetup) {
      let cancelled = false;
      const checkGoogleProfile = async () => {
        try {
          const profile = await apiClient.getProfile();
          if (!cancelled) {
            setProfileLoaded(true);
            if (!profile.username) {
              setShowFirstTimeSetup(true);
            }
          }
        } catch (error: any) {
          if (cancelled) return;
          console.error('Failed to load Google auth profile:', error);
          setProfileLoaded(true);
        }
      };
      
      const timeoutId = setTimeout(() => {
        if (!cancelled) {
          checkGoogleProfile();
        }
      }, 100);
      
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
    }
  }, [profileLoaded, authenticating, showFirstTimeSetup, apiClient]);

  // Redirect to lobby browser after wallet connects (for wallet logins, not Google)
  useEffect(() => {
    // Only redirect if:
    // 1. Wallet is connected
    // 2. Profile is loaded
    // 3. Not showing first-time setup
    // 4. Not a Google login (Google login handles its own redirect)
    // 5. Haven't already redirected for this connection
    // 6. Not already on lobbies page
    // 7. Not in a game or lobby route
    if (connected && address && profileLoaded && !showFirstTimeSetup && !hasRedirectedToProfileRef.current) {
      const googleToken = localStorage.getItem('google_auth_token');
      const isGameRoute = location.pathname.startsWith('/game/');
      const isLobbyRoute = location.pathname.startsWith('/lobby/') || location.pathname.startsWith('/spectate/');
      const isLobbiesRoute = location.pathname === '/lobbies';
      
      // Only redirect if this is a wallet login (not Google) and we're on a safe page
      // Allow redirecting from home page (/) or other pages, but not from game/lobby routes
      if (!googleToken && !isGameRoute && !isLobbyRoute && !isLobbiesRoute) {
        hasRedirectedToProfileRef.current = true;
        navigate('/lobbies');
      }
    }
  }, [connected, address, profileLoaded, showFirstTimeSetup, location.pathname, navigate]);

  // Reset redirect flag when wallet disconnects or address changes
  useEffect(() => {
    if (!connected || !address) {
      hasRedirectedToProfileRef.current = false;
    }
  }, [connected, address]);

  // Clear auth cache when wallet disconnects or address changes
  // This ensures that if a different wallet connects, it will need to authenticate again
  const prevAddressRef = useRef<string | null>(null);
  useEffect(() => {
    const prevAddress = prevAddressRef.current;
    prevAddressRef.current = address;
    
    // Clear cache if wallet disconnected or address changed
    if ((!connected && address === null) || (prevAddress !== null && prevAddress !== address && address !== null)) {
      apiClient.clearAuthCache();
      setProfileLoaded(false); // Reset profile loaded state so it reloads on reconnect
      console.log('🔌 Wallet disconnected or changed - cleared auth cache');
    }
  }, [connected, address, apiClient]);

  // Load and update total SOL bet counter
  useEffect(() => {
    if (!apiClient) return;
    
    // Check if method exists
    if (typeof apiClient.getTotalSolBet !== 'function') {
      console.error('apiClient.getTotalSolBet is not a function', apiClient);
      return;
    }
    
    const loadTotalSolBet = async () => {
      try {
        const result = await apiClient.getTotalSolBet();
        setTotalSolBet(result.totalSolBet);
      } catch (err) {
        console.error('Failed to load total SOL bet:', err);
      }
    };

    loadTotalSolBet();
    // Update every 10 seconds
    const interval = setInterval(loadTotalSolBet, 10000);
    return () => clearInterval(interval);
  }, [apiClient]);

  // Load wallet balance when authenticated (reduced frequency to avoid rate limits)
  useEffect(() => {
    if (authenticated || localStorage.getItem('google_auth_token')) {
      const loadWalletBalance = async () => {
        try {
          const result = await apiClient.getWalletBalance();
          setWalletBalance(result.balance);
        } catch (err: any) {
          // Don't log 429 errors as errors - they're rate limit warnings
          if (err.message?.includes('429') || err.message?.includes('rate limit')) {
            console.warn('Rate limited on wallet balance check, will retry later');
          } else {
            console.error('Failed to load wallet balance:', err);
          }
        }
      };
      loadWalletBalance();
      // Refresh every 30 seconds (reduced from 5s to avoid rate limits)
      const interval = setInterval(loadWalletBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [authenticated, apiClient]);

  if (!connected || !address) {
    return (
      <div className="app">
        <LandingPage />
      </div>
    );
  }

  // Show first-time setup modal if needed (for wallet users or Google auth users)
  const googleAddress = localStorage.getItem('google_auth_address');
  const showSetup = showFirstTimeSetup && (address || googleAddress);
  
  if (showSetup) {
    return (
      <div className="app">
        <FirstTimeSetup
          apiClient={apiClient}
          walletAddress={address || googleAddress || ''}
          onComplete={handleFirstTimeSetupComplete}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-header">
        <div className="app-header-content">
          <span className="emoji">🎮</span>
          <div>
            <h1>⚽ Kicking It</h1>
            <p>Multiplayer Soccer with $SOCCER</p>
          </div>
          <div className="total-sol-bet-counter">
            <span className="counter-label">Total SOL Bet:</span>
            <span className="counter-value">{totalSolBet.toFixed(2)} SOL</span>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <Link 
            to="/lobbies" 
            className="nav-link"
            style={{ fontWeight: location.pathname === '/lobbies' ? 'bold' : 'normal' }}
          >
            Lobby Browser
          </Link>
          <Link 
            to="/leaderboard" 
            className="nav-link"
            style={{ fontWeight: location.pathname === '/leaderboard' ? 'bold' : 'normal' }}
          >
            Leaderboard
          </Link>
          <Link 
            to="/users" 
            className="nav-link"
            style={{ fontWeight: location.pathname === '/users' ? 'bold' : 'normal' }}
          >
            Platform Users
          </Link>
          {(authenticated || localStorage.getItem('google_auth_token')) && (
            <button
              className="header-wallet-balance"
              onClick={() => setShowWalletDialog(true)}
              title="Click to manage wallet"
            >
              <span className="wallet-balance-icon">💰</span>
              <span className="wallet-balance-text">{walletBalance.toFixed(4)} SOL</span>
            </button>
          )}
          {address && (
            <UserDropdown
              apiClient={apiClient}
              onProfileClick={() => navigate('/profile')}
            />
          )}
        </div>
      </div>

      {(authenticated || localStorage.getItem('google_auth_token')) && (
        <WalletManager
          apiClient={apiClient}
          isOpen={showWalletDialog}
          showButton={false}
          onClose={() => {
            setShowWalletDialog(false);
            // Refresh balance when dialog closes
            apiClient.getWalletBalance().then(result => {
              setWalletBalance(result.balance);
            }).catch(() => {});
          }}
        />
      )}

      <div className="app-content">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="sidebar">
                <WalletConnect />
                {authenticated && <TokenGate apiClient={apiClient} />}
                {authenticated && address && <Inventory apiClient={apiClient} />}
                <RecentRounds apiClient={apiClient} />
              </div>
              <div className="main-content">
                <div className="game-menu">
                  {/* Token Holder Benefits Banner */}
                  <div className="token-benefits-banner">
                    <div className="token-benefits-content">
                      <div className="token-benefits-icon">⚽</div>
                      <div className="token-benefits-text">
                        <h2 className="token-benefits-title">🎯 OWN $SOCCER TOKEN = HIGHER REWARDS!</h2>
                        <p className="token-benefits-subtitle">
                          Token holders get <strong>2.5x better item drop rates</strong> and exclusive rewards!
                        </p>
                      </div>
                    </div>
                    <div className="token-contract-section">
                      <div className="contract-address">
                        <span className="contract-label">Contract:</span>
                        <code className="contract-code">6q75D5TCaEJXSvidqwEDeyog55MKhWV2k5NZQRpzpump</code>
                        <button 
                          className="contract-copy-btn"
                          onClick={(e) => {
                            navigator.clipboard.writeText('6q75D5TCaEJXSvidqwEDeyog55MKhWV2k5NZQRpzpump');
                            // Show feedback
                            const btn = e.currentTarget;
                            const originalText = btn.textContent;
                            btn.textContent = '✓ Copied!';
                            setTimeout(() => {
                              btn.textContent = originalText;
                            }, 2000);
                          }}
                          title="Copy contract address"
                        >
                          📋 Copy
                        </button>
                        <a
                          href={`https://birdeye.so/token/6q75D5TCaEJXSvidqwEDeyog55MKhWV2k5NZQRpzpump?chain=solana`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="contract-chart-btn"
                          title="View chart on Birdeye"
                        >
                          📈 View Chart
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Creator Rewards Info */}
                  <div className="creator-rewards-banner">
                    <div className="creator-rewards-icon">💰</div>
                    <div className="creator-rewards-text">
                      <strong>30% of creator rewards go to $SOCCER token holders!</strong>
                      <span> Holders receive regular rewards from platform revenue.</span>
                    </div>
                  </div>

                  <div className="game-menu-hero">
                    <div className="hero-icon">⚽</div>
                    <h1 className="hero-title">Kicking It</h1>
                    <p className="hero-subtitle">Compete in real-time multiplayer matches and earn $SOCCER!</p>
                  </div>
                  <div className="game-features">
                    <div className="feature-card">
                      <div className="feature-icon">⚽</div>
                      <h3>Multiplayer Soccer</h3>
                      <p>Join lobbies and compete in real-time matches</p>
                    </div>
                    <div className="feature-card">
                      <div className="feature-icon">💰</div>
                      <h3>Earn SOL</h3>
                      <p>Win paid matches and collect your rewards</p>
                    </div>
                    <div className="feature-card">
                      <div className="feature-icon">🏆</div>
                      <h3>Leaderboards</h3>
                      <p>Climb the ranks and show your skills</p>
                    </div>
                  </div>
                  <div className="game-actions">
                    <button onClick={() => navigate('/lobbies')} className="action-btn primary">
                      <span className="btn-icon">⚽</span>
                      <span className="btn-content">
                        <span className="btn-title">Join Lobby</span>
                        <span className="btn-subtitle">Play multiplayer soccer • Free or Bet SOL</span>
                      </span>
                      <span className="btn-arrow">→</span>
                    </button>
                  </div>
                  <div className="game-info">
                    <div className="info-badge">
                      <span className="badge-icon">✨</span>
                      <span>No tokens required to play • Connect with tokens/NFTs for better item drop rates</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          } />
          <Route path="/lobbies" element={
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="sidebar">
                <WalletConnect />
                {authenticated && <TokenGate apiClient={apiClient} />}
                {authenticated && address && <Inventory apiClient={apiClient} />}
                <RecentRounds apiClient={apiClient} />
              </div>
              <div className="main-content">
                <LobbyBrowser
                  apiClient={apiClient}
                  onLobbyStart={handleLobbyStart}
                />
              </div>
            </motion.div>
          } />
          <Route path="/lobby/:lobbyId" element={
            <div className="app-content" style={{ gridTemplateColumns: '1fr' }}>
              <LobbyWaitingRoomPage
                apiClient={apiClient}
                onLobbyStart={handleLobbyStart}
              />
            </div>
          } />
          <Route path="/spectate/:lobbyId" element={
            <div className="app-content" style={{ gridTemplateColumns: '1fr' }}>
              <SpectateLobbyPage
                apiClient={apiClient}
              />
            </div>
          } />
          <Route path="/leaderboard" element={
            <motion.div
              className="leaderboard-page"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="sidebar">
                <WalletConnect />
                {authenticated && <TokenGate apiClient={apiClient} />}
                {authenticated && address && <Inventory apiClient={apiClient} />}
                <RecentRounds apiClient={apiClient} />
              </div>
              <div className="main-content">
                <Leaderboard apiClient={apiClient} />
              </div>
            </motion.div>
          } />
          <Route path="/users" element={
            <motion.div
              className="users-page"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="sidebar">
                <WalletConnect />
                {authenticated && <TokenGate apiClient={apiClient} />}
                {authenticated && address && <Inventory apiClient={apiClient} />}
                <RecentRounds apiClient={apiClient} />
              </div>
              <div className="main-content">
                <Users apiClient={apiClient} />
              </div>
            </motion.div>
          } />
          <Route path="/profile/:walletAddress" element={
            <UserProfilePage apiClient={apiClient} />
          } />
          <Route path="/profile" element={
            address && profileLoaded ? (
              <div className="profile-page">
                <div style={{ padding: '1.5rem 2rem 0' }}>
                  <button
                    className="back-btn"
                    onClick={() => navigate(-1)}
                  >
                    ← Back
                  </button>
                </div>
                <PlayerProfile apiClient={apiClient} walletAddress={address} />
              </div>
            ) : null
          } />
          <Route path="/game/:lobbyId" element={
            isLobbyGame && currentLobby && lobbySocketClient ? (
              <SoccerGameCanvas
                lobby={currentLobby}
                socketClient={lobbySocketClient}
                onGameEnd={handleSoccerGameEnd}
                apiClient={apiClient}
              />
            ) : (
              <div>Loading game...</div>
            )
          } />
          </Routes>
        </AnimatePresence>
      </div>

      {gameStats && (
        <GameOverModal
          stats={gameStats}
          apiClient={apiClient}
          onClose={handleCloseModal}
        />
      )}

          {foundItem && (
            <ItemDropNotification
              item={foundItem}
              onClose={() => setFoundItem(null)}
            />
          )}

          {gameResults && (
            <GameResultsDialog
              winningTeam={gameResults.winningTeam}
              redScore={gameResults.redScore}
              blueScore={gameResults.blueScore}
              winners={gameResults.winners}
              losers={gameResults.losers}
              betAmountSol={gameResults.betAmountSol}
              totalPot={gameResults.totalPot}
              payoutPerPlayer={gameResults.payoutPerPlayer}
              lobby={gameResults.lobby}
              onClose={() => {
                setGameResults(null);
                // Reset game state after closing dialog
                setIsLobbyGame(false);
                setCurrentLobby(null);
                setLobbySocketClient(null);
                setShowGame(false);
              }}
            />
          )}
        </div>
      );
    }

    export default App;

