import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext.js';
import { ApiClient } from '../services/api.js';
import { SocketClient } from '../services/socketClient.js';
import { LobbyWaitingRoom } from '../components/LobbyWaitingRoom.js';
import type { Lobby } from '@solana-defender/shared';

interface LobbyWaitingRoomPageProps {
  apiClient: ApiClient;
  onLobbyStart: (lobby: Lobby, socketClient: SocketClient) => void;
}

export function LobbyWaitingRoomPage({ apiClient, onLobbyStart }: LobbyWaitingRoomPageProps) {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const { address } = useWallet();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [socketClient] = useState(() => new SocketClient());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lobbyId || !address) {
      navigate('/lobbies');
      return;
    }

    let isMounted = true;

    // Connect socket and wait for connection
    const connectAndJoin = async () => {
      try {
        // Get auth token using the proper method
        const token = apiClient.getJwtToken();
        
        if (!token) {
          console.error('No auth token available - user may need to authenticate');
          // Don't navigate away immediately - let the user see an error or try to authenticate
          // The lobby browser will handle showing auth prompts
          setLoading(false);
          return;
        }

        // Connect socket and wait for connection
        await new Promise<void>((resolve, reject) => {
          // If already connected, resolve immediately
          if (socketClient.isConnected()) {
            resolve();
            return;
          }

          socketClient.connect(token);

          // Wait for socket to connect using a timeout
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved && !socketClient.isConnected()) {
              resolved = true;
              reject(new Error('Socket connection timeout'));
            }
          }, 5000);

          // Poll for connection (socket.io connection is async)
          const checkConnection = setInterval(() => {
            if (socketClient.isConnected()) {
              if (!resolved) {
                resolved = true;
                clearInterval(checkConnection);
                clearTimeout(timeout);
                resolve();
              }
            }
          }, 50);
        });

        if (!isMounted) return;

        // Load lobby - try a few times in case it's not immediately available
        // Also ensure we get the full lobby with players
        let foundLobby = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            // Try to get the specific lobby directly (if API supports it)
            // Otherwise get all lobbies and find the one we want
            const result = await apiClient.getLobbies();
            foundLobby = result.lobbies.find(l => l.id === lobbyId);
            
            // Verify the lobby has players data
            if (foundLobby && foundLobby.players && Array.isArray(foundLobby.players)) {
              console.log(`[LobbyWaitingRoomPage] Loaded lobby ${lobbyId} with ${foundLobby.players.length} players:`, foundLobby.players.map(p => p.walletAddress));
              break;
            } else if (foundLobby) {
              console.warn(`[LobbyWaitingRoomPage] Lobby ${lobbyId} found but players array is missing or invalid`);
              // Still use it, but log the issue
              break;
            }
          } catch (err) {
            console.error(`[LobbyWaitingRoomPage] Error loading lobby (attempt ${attempt + 1}):`, err);
          }
          
          // Wait a bit before retrying
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        if (!foundLobby) {
          console.error(`Lobby ${lobbyId} not found after retries`);
          if (isMounted) {
            navigate('/lobbies');
          }
          return;
        }

        if (!isMounted) return;

        // Ensure players array exists
        if (!foundLobby.players || !Array.isArray(foundLobby.players)) {
          foundLobby.players = [];
        }
        
        // ACTUALLY JOIN THE LOBBY VIA API (this adds player to database)
        try {
          console.log(`[LobbyWaitingRoomPage] Joining lobby ${lobbyId} via API...`);
          const joinResult = await apiClient.joinLobby(lobbyId);
          console.log(`[LobbyWaitingRoomPage] Successfully joined lobby ${lobbyId}, players:`, joinResult.lobby.players?.length || 0);
          // Use the lobby from the join response (it has updated player list)
          foundLobby = joinResult.lobby;
        } catch (err: any) {
          // If already in lobby, that's fine - continue
          if (err.message && err.message.includes('already')) {
            console.log(`[LobbyWaitingRoomPage] Already in lobby ${lobbyId}, continuing...`);
          } else {
            console.error(`[LobbyWaitingRoomPage] Failed to join lobby via API:`, err);
            // Still continue - maybe they're already in it
          }
        }
        
        if (!isMounted) return;
        
        console.log(`[LobbyWaitingRoomPage] Setting initial lobby state with ${foundLobby.players.length} players`);
        setLobby(foundLobby);
        
        // Join lobby socket room now that socket is connected (for real-time updates)
        if (socketClient.isConnected()) {
          socketClient.joinLobby(lobbyId);
          setTimeout(() => {
            if (socketClient.isConnected()) {
              socketClient.requestLobbyState(lobbyId);
            }
          }, 200);
        }
      } catch (err) {
        console.error('Failed to load lobby:', err);
        if (isMounted) {
          navigate('/lobbies');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    connectAndJoin();

    return () => {
      isMounted = false;
      if (lobbyId && socketClient.isConnected()) {
        try {
          socketClient.leaveLobby(lobbyId);
        } catch (err) {
          // Ignore errors during cleanup
        }
      }
      apiClient.leaveLobby(lobbyId).catch(() => {});
    };
  }, [lobbyId, address, apiClient, socketClient, navigate]);

  // Show loading state
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading lobby...</div>
      </div>
    );
  }

  // If no lobby found, show error (don't render LobbyWaitingRoom)
  if (!lobby) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Lobby not found</div>
        <button onClick={() => navigate('/lobbies')}>Back to Lobbies</button>
      </div>
    );
  }

  return (
    <LobbyWaitingRoom
      lobby={lobby}
      socketClient={socketClient}
      onGameStart={() => {
        onLobbyStart(lobby, socketClient);
      }}
      onLeaveLobby={() => {
        navigate('/lobbies');
      }}
      apiClient={apiClient}
    />
  );
}

