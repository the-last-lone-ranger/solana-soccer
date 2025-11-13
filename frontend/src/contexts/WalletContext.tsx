import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { OpenKit403Client } from '@openkitx403/client';

export type WalletProvider = 'phantom' | 'backpack' | 'solflare';

export interface WalletState {
  connected: boolean;
  address: string | null;
  provider: WalletProvider | null;
  authenticating: boolean;
  authenticated: boolean;
}

interface WalletContextType extends WalletState {
  connect: (provider: WalletProvider) => Promise<void>;
  disconnect: () => void;
  authenticate: (resource: string, method?: string) => Promise<any>;
  client: OpenKit403Client;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  // Create a single client instance that persists across renders
  // This ensures token caching works properly
  const [client] = useState(() => {
    const clientInstance = new OpenKit403Client({
      // Ensure tokens are cached properly
      // The client should automatically cache tokens per resource
      // Cache is in-memory and persists for the lifetime of the client instance
    });
    console.log('✅ Created new OpenKit403Client instance');
    return clientInstance;
  });
  const [state, setState] = useState<WalletState>({
    connected: false,
    address: null,
    provider: null,
    authenticating: false,
    authenticated: false,
  });

  // Check if wallet is already connected on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const address = await client.getAddress();
        if (address) {
          // Try to determine provider from localStorage or window
          const provider = (window as any).phantom ? 'phantom' : 
                         (window as any).backpack ? 'backpack' :
                         (window as any).solflare ? 'solflare' : null;
          
          setState({
            connected: true,
            address,
            provider,
            authenticating: false,
            authenticated: false,
          });
        }
      } catch (error) {
        // Not connected, that's fine
      }
    };
    
    checkConnection();
  }, [client]);

  const connect = useCallback(async (provider: WalletProvider) => {
    try {
      setState((prev) => ({ ...prev, authenticating: true }));
      
      await client.connect(provider);
      
      // Get wallet address
      const address = await client.getAddress();
      
      setState({
        connected: true,
        address: address || null,
        provider,
        authenticating: false,
        authenticated: false,
      });
    } catch (error) {
      console.error('Error connecting wallet:', error);
      setState((prev) => ({
        ...prev,
        authenticating: false,
        connected: false,
      }));
      throw error;
    }
  }, [client]);

  const disconnect = useCallback(() => {
    client.disconnect();
    // OpenKit403Client handles token cleanup internally on disconnect
    setState({
      connected: false,
      address: null,
      provider: null,
      authenticating: false,
      authenticated: false,
    });
  }, [client]);

  const authenticate = useCallback(async (resource: string, method: string = 'GET') => {
    try {
      setState((prev) => ({ ...prev, authenticating: true }));
      
      const result = await client.authenticate({
        resource,
        method,
      });

      if (result.ok) {
        // Get address from client after successful auth
        const address = await client.getAddress();
        setState((prev) => ({
          ...prev,
          authenticated: true,
          authenticating: false,
          address: address || prev.address,
        }));
        return result;
      } else {
        setState((prev) => ({ ...prev, authenticating: false }));
        const errorMsg = (result as any).error || 'Authentication failed';
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Error authenticating:', error);
      setState((prev) => ({ ...prev, authenticating: false }));
      throw error;
    }
  }, [client]);

  return (
    <WalletContext.Provider
      value={{
        ...state,
        connect,
        disconnect,
        authenticate,
        client,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

