import { OpenKit403Client } from '@openkitx403/client';
import type {
  SubmitScoreRequest,
  SubmitScoreResponse,
  LeaderboardEntry,
  TokenCheckResponse,
  ItemDropRequest,
  ItemDropResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  CreateMatchRequest,
  CreateMatchResponse,
  JoinMatchRequest,
  JoinMatchResponse,
  SubmitMatchResultRequest,
  SubmitMatchResultResponse,
  Match,
  WalletBalanceResponse,
  DepositAddressResponse,
  Lobby,
  CreateLobbyRequest,
  CreateLobbyResponse,
  JoinLobbyRequest,
  JoinLobbyResponse,
} from '@solana-defender/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface CachedAuth {
  authHeader: string;
  expiresAt: number;
  resource: string;
  method: string;
}

export class ApiClient {
  private client: OpenKit403Client;
  private pendingAuthRequests = new Map<string, Promise<Response>>();
  // Cache successful authentications: key = "METHOD:URL", value = auth header + expiry
  private authCache = new Map<string, CachedAuth>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  // Global authentication promise - ensures only one authentication happens at a time
  private globalAuthPromise: Promise<string | null> | null = null;

  constructor(client: OpenKit403Client) {
    this.client = client;
    this.setupTokenInterceptor();
  }

  /**
   * OpenKit403Client uses challenge/signature format, not reusable JWT tokens
   * It caches authentication per exact resource URL internally
   * We just need to ensure we use authenticate() correctly and let it handle caching
   */
  private setupTokenInterceptor(): void {
    // No interceptor needed - OpenKit403Client handles authentication internally
    // The challenge field contains header+payload (2 parts), not a complete JWT (3 parts)
    // The signature is separate in the sig field
    // We can't extract a reusable token because OpenKit403Client doesn't use one
  }

  /**
   * Reset the reconnect flag - call this when wallet is manually disconnected/reconnected
   * to allow reconnection attempts again
   */
  resetReconnectFlag(): void {
    // No longer needed - OpenKit403Client handles reconnection internally
  }

  /**
   * Clear cached authentication tokens to force re-authentication
   * This will cause the next request to prompt for a signature
   */
  clearAuthCache(): void {
    this.authCache.clear();
    this.globalAuthPromise = null; // Clear any pending auth promise
    this.pendingAuthRequests.clear(); // Clear any pending requests
    console.log('[ApiClient] 🗑️ Cleared auth cache and pending requests');
  }

  private async authenticatedFetch(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    // Deduplicate simultaneous requests to the same endpoint
    // This prevents multiple signature prompts for the same request
    const requestKey = `${options.method || 'GET'}:${url}`;
    
    // Check if there's already a pending request for this endpoint
    if (this.pendingAuthRequests.has(requestKey)) {
      console.log(`[ApiClient] Reusing pending request for ${requestKey}`);
      const cachedResponse = await this.pendingAuthRequests.get(requestKey)!;
      // Clone the response so each caller gets their own copy (prevents "body stream already read" error)
      return cachedResponse.clone();
    }
    
    // Check for Google auth first - if present, skip wallet check
    const googleToken = localStorage.getItem('google_auth_token');
    if (!googleToken) {
      // Verify wallet is connected (only for Solana wallet auth)
      const walletAddress = await this.client.getAddress();
      if (!walletAddress) {
        throw new Error('Wallet not connected - please connect your wallet first');
      }
    }
    
    // Create the request promise and store it BEFORE executing
    // This ensures deduplication works even for rapid successive calls
    const requestPromise = this.executeAuthenticatedFetch(url, options)
      .finally(() => {
        // Clean up after request completes (success or failure)
        this.pendingAuthRequests.delete(requestKey);
      });
    
    this.pendingAuthRequests.set(requestKey, requestPromise);
    
    return requestPromise;
  }

  private async executeAuthenticatedFetch(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    // Check for Google auth token first
    const googleToken = localStorage.getItem('google_auth_token');
    if (googleToken) {
      // Use Google JWT token directly
      const headers: Record<string, string> = {};
      if (options.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((value, key) => {
            headers[key] = value;
          });
        } else if (Array.isArray(options.headers)) {
          options.headers.forEach(([key, value]) => {
            if (value) headers[key] = String(value);
          });
        } else {
          Object.entries(options.headers).forEach(([key, value]) => {
            if (value) headers[key] = String(value);
          });
        }
      }
      
      headers['Authorization'] = `Bearer ${googleToken}`;
      if (!headers['Content-Type'] && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
        headers['Content-Type'] = 'application/json';
      }
      
      console.log(`[ApiClient] Using Google JWT token for ${options.method || 'GET'} ${url}`);
      const response = await fetch(url, {
        ...options,
        headers,
      });
      
      return response;
    }
    
    // Verify wallet is connected (for Solana wallet auth)
    const walletAddress = await this.client.getAddress();
    if (!walletAddress) {
      throw new Error('Wallet not connected - please connect your wallet first');
    }

    const method = options.method || 'GET';
    const cacheKey = 'JWT_TOKEN';
    
    // CRITICAL: Check for global auth promise FIRST, before checking cache
    // This ensures that if multiple requests come in simultaneously, they all wait for the first auth
    if (this.globalAuthPromise) {
      console.log(`[ApiClient] ⏳ Waiting for ongoing authentication to complete (${method} ${url})...`);
      try {
        const jwtToken = await this.globalAuthPromise;
        
        if (jwtToken) {
          // Authentication completed, use the cached JWT token
          const cached = this.authCache.get(cacheKey);
          if (cached && Date.now() < cached.expiresAt) {
            console.log(`[ApiClient] ✅ Using JWT token from completed authentication for ${method} ${url}`);
            
            const headers: Record<string, string> = {};
            if (options.headers) {
              if (options.headers instanceof Headers) {
                options.headers.forEach((value, key) => {
                  headers[key] = value;
                });
              } else if (Array.isArray(options.headers)) {
                options.headers.forEach(([key, value]) => {
                  if (value) headers[key] = String(value);
                });
              } else {
                Object.entries(options.headers).forEach(([key, value]) => {
                  if (value) headers[key] = String(value);
                });
              }
            }
            
            headers['Authorization'] = cached.authHeader;
            if (!headers['Content-Type'] && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
              headers['Content-Type'] = 'application/json';
            }
            
            const response = await fetch(url, {
              ...options,
              headers,
            });
            
            if (response.ok || response.status !== 403) {
              return response;
            }
            // If we got 403, the token might be invalid - clear cache and re-authenticate
            console.log(`[ApiClient] ⚠️ JWT token invalid after waiting, clearing cache...`);
            this.authCache.delete(cacheKey);
          }
        }
      } catch (error) {
        // If the global auth promise failed, clear it and fall through to authenticate
        console.log(`[ApiClient] ⚠️ Global auth promise failed:`, error);
        this.globalAuthPromise = null;
      }
    }
    
    // Check if we have a cached JWT token
    const cached = this.authCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`[ApiClient] ✅ Using cached JWT token for ${method} ${url}`);
      
      // Try using cached JWT token first
      const headers: Record<string, string> = {};
      if (options.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((value, key) => {
            headers[key] = value;
          });
        } else if (Array.isArray(options.headers)) {
          options.headers.forEach(([key, value]) => {
            if (value) headers[key] = String(value);
          });
        } else {
          Object.entries(options.headers).forEach(([key, value]) => {
            if (value) headers[key] = String(value);
          });
        }
      }
      
      headers['Authorization'] = cached.authHeader; // This is "Bearer <token>"
      if (!headers['Content-Type'] && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        headers['Content-Type'] = 'application/json';
      }
      
      const response = await fetch(url, {
        ...options,
        headers,
      });
      
      // If cached JWT still works, return the response
      if (response.ok || response.status !== 403) {
        // Check if response has a new/updated JWT token
        const newToken = response.headers.get('X-Auth-Token');
        if (newToken && newToken !== cached.authHeader.replace(/^Bearer\s+/i, '').trim()) {
          this.authCache.set(cacheKey, {
            authHeader: `Bearer ${newToken}`,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
            resource: url,
            method,
          });
        }
        return response;
      }
      
      // If we got a 403, the cached JWT expired or is invalid - clear it and re-authenticate
      console.log(`[ApiClient] ⚠️ Cached JWT expired for ${cacheKey}, re-authenticating...`);
      this.authCache.delete(cacheKey);
    }
    
    // No valid cache - authenticate with OpenKit403Client
    // Create a global auth promise so other requests can wait for this one
    this.globalAuthPromise = this.performAuthentication(url, method, options);
    
    try {
      const jwtToken = await this.globalAuthPromise;
      
      // After authentication completes, use the cached JWT for this request
      const cached = this.authCache.get('JWT_TOKEN');
      if (cached && jwtToken) {
        const headers: Record<string, string> = {};
        if (options.headers) {
          if (options.headers instanceof Headers) {
            options.headers.forEach((value, key) => {
              headers[key] = value;
            });
          } else if (Array.isArray(options.headers)) {
            options.headers.forEach(([key, value]) => {
              if (value) headers[key] = String(value);
            });
          } else {
            Object.entries(options.headers).forEach(([key, value]) => {
              if (value) headers[key] = String(value);
            });
          }
        }
        
        headers['Authorization'] = cached.authHeader;
        if (!headers['Content-Type'] && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
          headers['Content-Type'] = 'application/json';
        }
        
        const response = await fetch(url, {
          ...options,
          headers,
        });
        
        return response;
      }
      
      // Fallback: if we don't have cached token, make the request normally
      // (This shouldn't happen, but just in case)
      const authOptions: any = {
        resource: url,
        method,
      };
      
      if (options.body && (method === 'PUT' || method === 'POST' || method === 'PATCH')) {
        try {
          const bodyObj = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
          authOptions.body = bodyObj;
        } catch {
          authOptions.body = options.body;
        }
        authOptions.headers = {
          'Content-Type': 'application/json',
          ...options.headers,
        };
      }
      
      const authResult = await this.client.authenticate(authOptions);
      
      if (authResult instanceof Response) {
        return authResult;
      } else if (authResult && typeof authResult === 'object' && 'ok' in authResult && 'response' in authResult) {
        return (authResult as { response?: Response }).response!;
      }
      
      throw new Error('Authentication failed');
    } finally {
      // Clear the global auth promise after a short delay to allow other requests to use the cached token
      setTimeout(() => {
        this.globalAuthPromise = null;
      }, 100);
    }
  }
  
  private async performAuthentication(
    url: string,
    method: string,
    options: RequestInit
  ): Promise<string | null> {
    const authOptions: any = {
      resource: url,
      method,
    };
    
    if (options.body && (method === 'PUT' || method === 'POST' || method === 'PATCH')) {
      try {
        const bodyObj = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        authOptions.body = bodyObj;
      } catch {
        authOptions.body = options.body;
      }
      authOptions.headers = {
        'Content-Type': 'application/json',
        ...options.headers,
      };
    }
    
    // Intercept OpenKit403Client's internal fetch to capture JWT token from response
    let capturedJWT: string | null = null;
    const originalFetch = window.fetch;
    
    window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const response = await originalFetch(...args);
      
      // Capture JWT token from response headers after successful authentication
      if (response.ok) {
        const jwtToken = response.headers.get('X-Auth-Token') || 
                        response.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
        
        if (jwtToken && jwtToken.length > 50) {
          // Validate it looks like a JWT (has 3 parts separated by dots)
          const parts = jwtToken.split('.');
          if (parts.length === 3) {
            capturedJWT = jwtToken;
            console.log(`[ApiClient] 🔑 Captured JWT token during authentication`);
          }
        }
      }
      
      return response;
    };
    
    try {
      const authResult = await this.client.authenticate(authOptions);
      
      // Restore original fetch
      window.fetch = originalFetch;
      
      // Check if authentication was successful
      let authSuccess = false;
      let response: Response | null = null;
      
      if (authResult instanceof Response) {
        authSuccess = authResult.ok;
        response = authResult;
      } else if (authResult && typeof authResult === 'object' && 'ok' in authResult) {
        authSuccess = (authResult as { ok: boolean }).ok;
        if (authSuccess && 'response' in authResult) {
          response = (authResult as { response?: Response }).response || null;
        }
      }
      
      if (!authSuccess || !response) {
        const errorMsg = authResult instanceof Response 
          ? `Authentication failed with status ${authResult.status}`
          : (authResult as any)?.error || 'Authentication failed';
        throw new Error(`${errorMsg}. Please approve the signature request in your wallet.`);
      }
      
      // Cache the JWT token if we captured it - use single cache key for all endpoints
      if (capturedJWT && response.ok) {
        this.authCache.set('JWT_TOKEN', {
          authHeader: `Bearer ${capturedJWT}`, // Store as Bearer token
          expiresAt: Date.now() + this.CACHE_TTL_MS,
          resource: url,
          method,
        });
        console.log(`[ApiClient] ✅ Cached JWT token (works for ALL endpoints, expires in 30 minutes)`);
        return capturedJWT;
      }
      
      return null;
    } catch (error) {
      // Always restore original fetch
      window.fetch = originalFetch;
      throw error;
    }
  }

  async submitScore(score: number, levelReached: number): Promise<SubmitScoreResponse> {
    const response = await this.authenticatedFetch('/api/scores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ score, levelReached } as SubmitScoreRequest),
    });

    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to submit score' }));
      throw new Error(error.error || 'Failed to submit score');
    }

    return response.json();
  }

  async getLeaderboard(limit: number = 10): Promise<{ leaderboard: LeaderboardEntry[] }> {
    const response = await fetch(`${API_BASE_URL}/api/leaderboard?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch leaderboard');
    }

    return response.json();
  }

  async getUsers(): Promise<{ users: any[] }> {
    const response = await fetch(`${API_BASE_URL}/api/users`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }

    return response.json();
  }

  async getTotalSolBet(): Promise<{ totalSolBet: number }> {
    const response = await fetch(`${API_BASE_URL}/api/stats/total-sol-bet`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch total SOL bet');
    }
    
    return await response.json();
  }

  async getPlayerEquippedItems(walletAddress: string): Promise<{
    walletAddress: string;
    username: string | null;
    avatarUrl: string | null;
    equipped: Array<{
      id: number;
      itemId: string;
      itemName: string;
      itemType: string;
      rarity: string;
    }>;
    hasCrown: boolean;
  }> {
    const response = await fetch(`${API_BASE_URL}/api/players/${walletAddress}/equipped-items`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch equipped items');
    }
    
    return await response.json();
  }

  async getProfile(): Promise<any> {
    const response = await this.authenticatedFetch('/api/profile');
    
    // Clone response before reading to avoid "body stream already read" errors
    const clonedResponse = response.clone();
    
    if (!response.ok) {
      const errorText = await clonedResponse.text();
      let errorMessage = 'Failed to fetch profile';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        errorMessage = response.status === 403 ? 'Authentication required' : errorMessage;
      }
      const error: any = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    return clonedResponse.json();
  }

  async checkToken(): Promise<TokenCheckResponse> {
    const response = await this.authenticatedFetch('/api/token-check');
    
    if (!response.ok) {
      throw new Error('Failed to check token');
    }

    return response.json();
  }

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    
    if (!response.ok) {
      throw new Error('Health check failed');
    }

    return response.json();
  }

  async generateItemDrop(tokenBalance: number, nftCount: number): Promise<ItemDropResponse> {
    const response = await this.authenticatedFetch('/api/item-drop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tokenBalance, nftCount } as ItemDropRequest),
    });

    if (!response.ok) {
      throw new Error('Failed to generate item drop');
    }

    return response.json();
  }

  async updateVoiceSettings(voiceEnabled: boolean, pushToTalkKey: string): Promise<{ success: boolean }> {
    const response = await this.authenticatedFetch('/api/profile/voice-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ voiceEnabled, pushToTalkKey }),
    });

    if (!response.ok) {
      throw new Error('Failed to update voice settings');
    }

    return await response.json();
  }

  async getPlayerItems(walletAddress?: string): Promise<{ items: any[]; equipped: any[] }> {
    // Build URL with optional walletAddress query parameter
    let url = `${API_BASE_URL}/api/items`;
    if (walletAddress) {
      url += `?walletAddress=${encodeURIComponent(walletAddress)}`;
    }
    
    // Use regular fetch (not authenticatedFetch) since this endpoint is public
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to fetch items');
    }

    return response.json();
  }

  async equipItem(itemId: string, itemType: string): Promise<void> {
    const response = await this.authenticatedFetch('/api/items/equip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ itemId, itemType }),
    });

    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to equip item' }));
      throw new Error(error.error || 'Failed to equip item');
    }
  }

  async unequipItem(itemId: string, itemType: string): Promise<void> {
    const response = await this.authenticatedFetch('/api/items/unequip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ itemId, itemType }),
    });

    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to unequip item' }));
      throw new Error(error.error || 'Failed to unequip item');
    }
  }

  async updateProfile(username?: string, avatarUrl?: string): Promise<UpdateProfileResponse> {
    const response = await this.authenticatedFetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, avatarUrl } as UpdateProfileRequest),
    });

    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to update profile' }));
      throw new Error(error.error || 'Failed to update profile');
    }

    return response.json();
  }

  // Matchmaking methods
  async createMatch(betAmountSol: number): Promise<CreateMatchResponse> {
    try {
      const response = await this.authenticatedFetch('/api/matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ betAmountSol } as CreateMatchRequest),
      });

      if (!response.ok) {
        const clonedResponse = response.clone();
        const errorText = await clonedResponse.text().catch(() => 'Unknown error');
        let errorMessage = 'Failed to create match';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = response.status === 401 || response.status === 403 
            ? 'Authentication required - please approve the signature request' 
            : errorMessage;
        }
        throw new Error(errorMessage);
      }

      return response.json();
    } catch (error: any) {
      // Re-throw with more context if it's an auth error
      if (error.message?.includes('signature') || error.message?.includes('Authentication')) {
        throw error;
      }
      throw new Error(`Failed to create match: ${error.message || 'Unknown error'}`);
    }
  }

  async getAvailableMatches(limit: number = 10): Promise<{ matches: Match[] }> {
    const response = await fetch(`${API_BASE_URL}/api/matches?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch available matches');
    }

    return response.json();
  }

  async getMatch(matchId: string): Promise<Match> {
    const response = await fetch(`${API_BASE_URL}/api/matches/${matchId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch match');
    }

    return response.json();
  }

  async joinMatch(matchId: string): Promise<JoinMatchResponse> {
    const response = await this.authenticatedFetch(`/api/matches/${matchId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({} as JoinMatchRequest),
    });

    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to join match' }));
      throw new Error(error.error || 'Failed to join match');
    }

    return response.json();
  }

  async submitMatchResult(
    matchId: string,
    creatorScore: number,
    opponentScore: number
  ): Promise<SubmitMatchResultResponse> {
    const response = await this.authenticatedFetch(`/api/matches/${matchId}/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creatorScore,
        opponentScore,
      } as SubmitMatchResultRequest),
    });

    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to submit match result' }));
      throw new Error(error.error || 'Failed to submit match result');
    }

    return response.json();
  }

  // Wallet methods
  async getDepositAddress(): Promise<DepositAddressResponse> {
    const response = await this.authenticatedFetch('/api/wallet/deposit-address');
    
    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to get deposit address' }));
      throw new Error(error.error || 'Failed to get deposit address');
    }

    return response.json();
  }

  async getWalletBalance(): Promise<WalletBalanceResponse> {
    const response = await this.authenticatedFetch('/api/wallet/balance');
    
    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to get wallet balance' }));
      throw new Error(error.error || 'Failed to get wallet balance');
    }

    return response.json();
  }

  // Lobby methods
  async getLobbies(betAmountSol?: number): Promise<{ lobbies: Lobby[] }> {
    const url = betAmountSol !== undefined 
      ? `/api/lobbies?betAmount=${betAmountSol}`
      : '/api/lobbies';
    const fullUrl = `${API_BASE_URL}${url}`;
    console.log('[ApiClient] Fetching lobbies from:', fullUrl);
    
    const response = await fetch(fullUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to fetch lobbies';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.details || errorMessage;
      } catch {
        errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
      }
      console.error('[ApiClient] Failed to fetch lobbies:', errorMessage);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('[ApiClient] Received lobbies:', data.lobbies?.length || 0);
    return data;
  }

  async getLobby(lobbyId: string): Promise<{ lobby: Lobby }> {
    const response = await fetch(`${API_BASE_URL}/api/lobbies/${lobbyId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch lobby');
    }

    return response.json();
  }

  async createLobby(betAmountSol: number): Promise<CreateLobbyResponse> {
    const response = await this.authenticatedFetch('/api/lobbies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ betAmountSol } as CreateLobbyRequest),
    });

    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to create lobby' }));
      throw new Error(error.error || 'Failed to create lobby');
    }

    return response.json();
  }

  async joinLobby(lobbyId: string): Promise<JoinLobbyResponse> {
    const response = await this.authenticatedFetch(`/api/lobbies/${lobbyId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({} as JoinLobbyRequest),
    });

    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to join lobby' }));
      throw new Error(error.error || 'Failed to join lobby');
    }

    return response.json();
  }

  async leaveLobby(lobbyId: string): Promise<{ success: boolean; message?: string }> {
    const response = await this.authenticatedFetch(`/api/lobbies/${lobbyId}/leave`, {
      method: 'POST',
    });

    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to leave lobby' }));
      throw new Error(error.error || 'Failed to leave lobby');
    }

    return response.json();
  }

  async submitLobbyResults(lobbyId: string, results: any[]): Promise<{ 
    success: boolean; 
    winningTeam: string | null; 
    redScore: number; 
    blueScore: number;
    winners?: Array<{
      walletAddress: string;
      username?: string | null;
      avatarUrl?: string | null;
      team: 'red' | 'blue';
      score: number;
      payoutAmount: number;
    }>;
    losers?: Array<{
      walletAddress: string;
      username?: string | null;
      avatarUrl?: string | null;
      team: 'red' | 'blue';
      score: number;
      payoutAmount: number;
    }>;
    betAmountSol?: number;
    totalPot?: number;
    payoutPerPlayer?: number;
  }> {
    const response = await this.authenticatedFetch(`/api/lobbies/${lobbyId}/results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ results }),
    });

    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to submit lobby results' }));
      throw new Error(error.error || 'Failed to submit lobby results');
    }

    return response.json();
  }

  async getRecentRounds(limit: number = 5): Promise<{ rounds: any[] }> {
    const response = await fetch(`${API_BASE_URL}/api/rounds?limit=${limit}`);

    if (!response.ok) {
      const clonedResponse = response.clone();
      const errorText = await clonedResponse.text();
      let errorMessage = 'Failed to fetch recent rounds';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.details || errorMessage;
      } catch {
        errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
      }
      console.error('[ApiClient] Failed to fetch recent rounds:', errorMessage);
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async withdrawSol(toAddress: string, amountSol: number): Promise<{ success: boolean; transactionSignature?: string; error?: string }> {
    const response = await this.authenticatedFetch('/api/wallet/withdraw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ toAddress, amountSol }),
    });

    if (!response.ok) {
      const clonedResponse = response.clone();
      const error = await clonedResponse.json().catch(() => ({ error: 'Failed to withdraw SOL' }));
      throw new Error(error.error || 'Failed to withdraw SOL');
    }

    return response.json();
  }

  /**
   * Get the current JWT token from cache (for Socket.IO authentication)
   * Checks both Solana wallet auth cache and Google auth localStorage
   */
  getJwtToken(): string | null {
    // First check for Google auth token
    const googleToken = localStorage.getItem('google_auth_token');
    if (googleToken) {
      return googleToken;
    }
    
    // Then check Solana wallet auth cache
    const cached = this.authCache.get('JWT_TOKEN');
    if (cached && Date.now() < cached.expiresAt) {
      // Extract token from "Bearer <token>" format
      return cached.authHeader.replace(/^Bearer\s+/i, '').trim();
    }
    return null;
  }
}

