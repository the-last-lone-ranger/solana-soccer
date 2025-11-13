import { useState, useEffect, useRef } from 'react';
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
import { WalletManager } from './components/WalletManager.js';
import { Inventory } from './components/Inventory.js';
import { RecentRounds } from './components/RecentRounds.js';
import { UserDropdown } from './components/UserDropdown.js';
import { GameResultsDialog } from './components/GameResultsDialog.js';
import { VoiceChatService } from './services/voiceChat.js';
import type { GameStats } from './game/Game.js';
import type { GameItem, Match, Lobby } from '@solana-defender/shared';
import type { GameResult } from './game/SoccerGame.js';
import { SocketClient } from './services/socketClient.js';
import './App.css';

function App() {
  const { theme, toggleTheme } = useTheme();
  const { connected, address, authenticated, authenticate, authenticating, client } = useWallet();
  const [apiClient] = useState(() => new ApiClient(client));
  const [showGame, setShowGame] = useState(false);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [currentPage, setCurrentPage] = useState<'home' | 'lobbies' | 'leaderboard' | 'users' | 'profile'>('home');
  const [showProfile, setShowProfile] = useState(false);
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
    setCurrentPage('home');
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
        setIsLobbyGame(false);
        setCurrentLobby(null);
        setLobbySocketClient(null);
        setShowGame(false);
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
  };

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

  if (!connected || !address) {
    return (
      <div className="app">
        <LandingPage />
      </div>
    );
  }

  // Show first-time setup modal if needed
  if (showFirstTimeSetup && address) {
    return (
      <div className="app">
        <FirstTimeSetup
          apiClient={apiClient}
          walletAddress={address}
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
            <h1>⚽ Solana Soccer</h1>
            <p>Multiplayer Soccer with SOL Betting</p>
          </div>
        </div>
        <div className="header-actions">
          {authenticated && <WalletManager apiClient={apiClient} />}
          <button 
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <a 
            href="#lobbies" 
            className="nav-link"
            onClick={(e) => { 
              e.preventDefault(); 
              setShowProfile(false); // Close profile page if open
              setCurrentPage('lobbies'); 
            }}
            style={{ fontWeight: currentPage === 'lobbies' ? 'bold' : 'normal' }}
          >
            Lobby Browser
          </a>
          <a 
            href="#leaderboard" 
            className="nav-link"
            onClick={(e) => { 
              e.preventDefault(); 
              setShowProfile(false); // Close profile page if open
              setCurrentPage('leaderboard'); 
            }}
            style={{ fontWeight: currentPage === 'leaderboard' ? 'bold' : 'normal' }}
          >
            Leaderboard
          </a>
          <a 
            href="#users" 
            className="nav-link"
            onClick={(e) => { 
              e.preventDefault(); 
              setShowProfile(false); // Close profile page if open
              setCurrentPage('users'); 
            }}
            style={{ fontWeight: currentPage === 'users' ? 'bold' : 'normal' }}
          >
            Platform Users
          </a>
          {address && (
            <UserDropdown
              apiClient={apiClient}
              onProfileClick={() => setShowProfile(true)}
            />
          )}
        </div>
      </div>

      <div className="app-content">
        {showProfile && address && profileLoaded ? (
          <div className="profile-page">
            <div style={{ padding: '1.5rem 2rem 0' }}>
              <button
                className="back-btn"
                onClick={() => setShowProfile(false)}
              >
                ← Back to Game
              </button>
            </div>
            <PlayerProfile apiClient={apiClient} walletAddress={address} />
          </div>
        ) : (
          <>
            <div className="sidebar">
              <WalletConnect />
              {authenticated && <TokenGate apiClient={apiClient} />}
              {authenticated && address && <Inventory apiClient={apiClient} />}
              <RecentRounds apiClient={apiClient} />
            </div>

            <div className="main-content">
              {currentPage === 'lobbies' ? (
                <LobbyBrowser
                  apiClient={apiClient}
                  onLobbyStart={handleLobbyStart}
                />
              ) : currentPage === 'leaderboard' ? (
                <Leaderboard apiClient={apiClient} />
              ) : currentPage === 'users' ? (
                <Users apiClient={apiClient} />
              ) : showMatchmaking ? (
                <Matchmaking
                  apiClient={apiClient}
                  onMatchStart={handleMatchStart}
                />
              ) : !showGame ? (
                <div className="game-menu">
              <div className="game-menu-hero">
                <div className="hero-icon">⚽</div>
                <h1 className="hero-title">Solana Soccer</h1>
                <p className="hero-subtitle">Compete in real-time multiplayer matches and earn SOL!</p>
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
                <button onClick={() => setCurrentPage('lobbies')} className="action-btn primary">
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
          ) : isLobbyGame && currentLobby && lobbySocketClient ? (
            <SoccerGameCanvas
              lobby={currentLobby}
              socketClient={lobbySocketClient}
              onGameEnd={handleSoccerGameEnd}
            />
          ) : showGame ? (
            // Legacy game modes - redirect to lobby browser
            <div className="game-menu">
              <div className="game-menu-hero">
                <div className="hero-icon">⚽</div>
                <h1 className="hero-title">Solana Soccer</h1>
                <p className="hero-subtitle">Join a lobby to start playing!</p>
              </div>
              <div className="game-actions">
                <button onClick={() => { setShowGame(false); setCurrentPage('lobbies'); }} className="action-btn primary">
                  <span className="btn-icon">⚽</span>
                  <span className="btn-content">
                    <span className="btn-title">Join Lobby</span>
                    <span className="btn-subtitle">Play multiplayer soccer</span>
                  </span>
                  <span className="btn-arrow">→</span>
                </button>
              </div>
            </div>
          ) : null}
            </div>
          </>
        )}
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

