import { useState } from 'react';
import { useWallet, type WalletProvider } from '../hooks/useWallet.js';
import { GoogleSignIn } from './GoogleSignIn.js';
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
        <h2>Wallet Connected</h2>
        <div className="wallet-info">
          <div className="wallet-provider">
            {provider === 'phantom' && '👻'}
            {provider === 'backpack' && '🎒'}
            {provider === 'solflare' && '🔥'}
            {provider === 'google' && '🔐'}
            <span>{provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Wallet'}</span>
          </div>
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
        <GoogleSignIn />
        <div className="divider">
          <span>OR</span>
        </div>
        <button
          onClick={() => handleConnect('phantom')}
          disabled={authenticating}
          className="wallet-btn phantom"
        >
          <img 
            src="https://play-lh.googleusercontent.com/H21urDlm2BSmTPpXUvdCNvMffMijHP-Xm65ZhAY4TlX-1RQR9jM9lBmHxph_JdoE8A" 
            alt="Phantom"
            className="wallet-icon"
          />
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

