import { useState } from 'react';
import { useWallet, type WalletProvider } from '../hooks/useWallet.js';
import './WalletConnect.css';

export function WalletConnect() {
  const { connected, address, provider, connect, disconnect, authenticating } = useWallet();
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (wallet: WalletProvider) => {
    try {
      setError(null);
      await connect(wallet);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setError(null);
  };

  if (connected && address) {
    return (
      <div className="wallet-connect">
        <div className="wallet-info">
          <span className="wallet-provider">{provider}</span>
          <span className="wallet-address">
            {address.slice(0, 4)}...{address.slice(-4)}
          </span>
        </div>
        <button onClick={handleDisconnect} className="btn-disconnect">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-connect">
      <h2>Connect Your Solana Wallet</h2>
      <p>Choose a wallet to connect and start playing</p>
      
      {error && <div className="error-message">{error}</div>}
      
      <div className="wallet-buttons">
        <button
          onClick={() => handleConnect('phantom')}
          disabled={authenticating}
          className="wallet-btn phantom"
        >
          <span>🦄</span>
          Phantom
        </button>
        <button
          onClick={() => handleConnect('backpack')}
          disabled={authenticating}
          className="wallet-btn backpack"
        >
          <span>🎒</span>
          Backpack
        </button>
        <button
          onClick={() => handleConnect('solflare')}
          disabled={authenticating}
          className="wallet-btn solflare"
        >
          <span>🔥</span>
          Solflare
        </button>
      </div>
      
      {authenticating && <div className="loading">Connecting...</div>}
    </div>
  );
}

