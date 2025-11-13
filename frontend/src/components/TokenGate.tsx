import { useEffect, useState } from 'react';
import { useWallet } from '../hooks/useWallet.js';
import { ApiClient } from '../services/api.js';
import './TokenGate.css';

interface TokenGateProps {
  apiClient: ApiClient;
}

export function TokenGate({ apiClient }: TokenGateProps) {
  const { connected, address } = useWallet();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check access when wallet is connected
    // ApiClient will handle authentication automatically and use cached JWT token
    if (connected && address) {
      checkAccess();
    } else {
      setLoading(false);
      setHasAccess(false);
    }
  }, [connected, address]);

  const checkAccess = async () => {
    if (!connected || !address) {
      setLoading(false);
      setHasAccess(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      // Small delay to ensure the profile authentication token is cached
      // This helps avoid multiple signature prompts if profile was just loaded
      await new Promise(resolve => setTimeout(resolve, 300));
      // checkToken will use cached JWT token if available (from getProfile call)
      // If not cached, it will authenticate and cache the token
      const result = await apiClient.checkToken();
      setHasAccess(result.hasAccess);
    } catch (err: any) {
      setError(err.message || 'Failed to check token access');
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="token-gate">
        <div className="loading">Checking token access...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="token-gate error">
        <p>{error}</p>
        <button onClick={checkAccess}>Retry</button>
      </div>
    );
  }

  if (hasAccess) {
    return (
      <div className="token-gate premium">
        <span className="badge">⭐ PREMIUM</span>
        <p>You have access to premium features!</p>
      </div>
    );
  }

  return (
    <div className="token-gate free">
      <p>Playing in free mode</p>
      <p className="hint">Connect with a token/NFT to unlock premium features</p>
    </div>
  );
}

