import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext.js';
import { ApiClient } from '../services/api.js';
import { SocketClient } from '../services/socketClient.js';
import { LobbyWaitingRoom } from '../components/LobbyWaitingRoom.js';
import type { Lobby } from '@solana-defender/shared';

interface SpectateLobbyPageProps {
  apiClient: ApiClient;
}

export function SpectateLobbyPage({ apiClient }: SpectateLobbyPageProps) {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const { address } = useWallet();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [socketClient] = useState(() => new SocketClient());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lobbyId) {
      navigate('/lobbies');
      return;
    }

    let isMounted = true;

    // Connect socket and load lobby for spectating
    const connectAndSpectate = async () => {
      try {
        // Get auth token (spectators can still use auth for socket connection)
        const token = apiClient.getJwtToken();
        
        if (!token) {
          // Even without auth, try to connect socket (might work for public spectating)
          console.log('[Spectate] No auth token, attempting to connect anyway...');
        }

        // Connect socket if we have a token
        if (token) {
          await new Promise<void>((resolve, reject) => {
            if (socketClient.isConnected()) {
              resolve();
              return;
            }

            socketClient.connect(token);

            let resolved = false;
            const timeout = setTimeout(() => {
              if (!resolved && !socketClient.isConnected()) {
                resolved = true;
                reject(new Error('Socket connection timeout'));
              }
            }, 5000);

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
        }

        if (!isMounted) return;

        // Load lobby data
        let foundLobby = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const result = await apiClient.getLobbies();
          foundLobby = result.lobbies.find(l => l.id === lobbyId);
          
          if (foundLobby) {
            break;
          }
          
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

        setLobby(foundLobby);
        
        // Join socket room for spectating (if connected)
        // Note: We don't call joinLobby API, just socket join for updates
        if (socketClient.isConnected()) {
          socketClient.joinLobby(lobbyId);
          setTimeout(() => {
            if (socketClient.isConnected()) {
              socketClient.requestLobbyState(lobbyId);
            }
          }, 200);
        }

        // Listen for lobby state updates
        socketClient.onLobbyState((data) => {
          if (data.lobby.id === lobbyId && isMounted) {
            setLobby(data.lobby);
          }
        });
      } catch (err) {
        console.error('Failed to load lobby for spectating:', err);
        if (isMounted) {
          navigate('/lobbies');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    connectAndSpectate();

    return () => {
      isMounted = false;
      if (lobbyId && socketClient.isConnected()) {
        try {
          socketClient.leaveLobby(lobbyId);
        } catch (err) {
          // Ignore errors during cleanup
        }
      }
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

  // If no lobby found, show error
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
        // Spectators can't start games, but we can navigate them to watch
        navigate(`/game/${lobby.id}`);
      }}
      onLeaveLobby={() => {
        navigate('/lobbies');
      }}
      apiClient={apiClient}
      isSpectator={true}
    />
  );
}

