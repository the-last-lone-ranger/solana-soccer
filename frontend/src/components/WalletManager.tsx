import { useState, useEffect } from 'react';
import { ApiClient } from '../services/api.js';
import { useWallet } from '../contexts/WalletContext.js';
import './WalletManager.css';

interface WalletManagerProps {
  apiClient: ApiClient;
}

export function WalletManager({ apiClient }: WalletManagerProps) {
  const { address } = useWallet();
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Check for Google auth or Solana wallet
    const googleToken = localStorage.getItem('google_auth_token');
    const googleAddress = localStorage.getItem('google_auth_address');
    const isGoogleAuth = googleToken && googleAddress;
    
    if ((address || isGoogleAuth) && showModal) {
      loadWalletInfo();
    }
  }, [address, showModal]);

  const loadWalletInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [depositResponse, balanceResponse] = await Promise.all([
        apiClient.getDepositAddress(),
        apiClient.getWalletBalance(),
      ]);
      
      setDepositAddress(depositResponse.depositAddress);
      setBalance(balanceResponse.balance);
    } catch (err: any) {
      console.error('Failed to load wallet info:', err);
      setError(err.message || 'Failed to load wallet information');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || !withdrawAddress) {
      setError('Please enter both amount and destination address');
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (balance === null || amount > balance) {
      setError('Insufficient balance');
      return;
    }

    try {
      setWithdrawing(true);
      setError(null);
      setSuccess(null);

      // TODO: Implement withdrawal API endpoint
      // const response = await apiClient.withdrawSol(withdrawAddress, amount);
      
      setSuccess(`Withdrawal initiated: ${amount} SOL to ${withdrawAddress.slice(0, 8)}...`);
      setWithdrawAmount('');
      setWithdrawAddress('');
      
      // Reload balance
      setTimeout(() => {
        loadWalletInfo();
      }, 2000);
    } catch (err: any) {
      console.error('Withdrawal failed:', err);
      setError(err.message || 'Failed to process withdrawal');
    } finally {
      setWithdrawing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
    setTimeout(() => setSuccess(null), 2000);
  };

  const formatAddress = (addr: string | null) => {
    if (!addr) return 'Loading...';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Check if user is authenticated (Google or Solana wallet)
  const googleToken = localStorage.getItem('google_auth_token');
  const googleAddress = localStorage.getItem('google_auth_address');
  const isGoogleAuth = googleToken && googleAddress;
  const isAuthenticated = address || isGoogleAuth;

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <button 
        className="wallet-manager-btn"
        onClick={() => setShowModal(true)}
        title="View wallet & manage funds"
      >
        💰 Wallet
      </button>

      {showModal && (
        <div className="wallet-manager-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="wallet-manager-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wallet-manager-header">
              <h2>💰 In-Game Wallet</h2>
              <button 
                className="close-btn"
                onClick={() => setShowModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="wallet-manager-content">
              {loading ? (
                <div className="loading">Loading wallet information...</div>
              ) : error && !depositAddress ? (
                <div className="error-message">{error}</div>
              ) : (
                <>
                  {/* Balance Display */}
                  <div className="wallet-section">
                    <div className="wallet-label">Balance</div>
                    <div className="wallet-value">
                      {balance !== null ? `${balance.toFixed(4)} SOL` : 'Loading...'}
                    </div>
                  </div>

                  {/* Deposit Address */}
                  <div className="wallet-section">
                    <div className="wallet-label">Deposit Address</div>
                    <div className="wallet-address-display">
                      <code className="address-text">{depositAddress || 'Loading...'}</code>
                      {depositAddress && (
                        <button
                          className="copy-btn"
                          onClick={() => copyToClipboard(depositAddress)}
                          title="Copy address"
                        >
                          📋 Copy
                        </button>
                      )}
                    </div>
                    <p className="wallet-hint">
                      Send SOL to this address to fund your in-game wallet for betting
                    </p>
                  </div>

                  {/* Connected Wallet */}
                  <div className="wallet-section">
                    <div className="wallet-label">Connected Wallet</div>
                    <div className="wallet-address-display">
                      <code className="address-text">{formatAddress(address)}</code>
                      {address && (
                        <button
                          className="copy-btn"
                          onClick={() => copyToClipboard(address)}
                          title="Copy address"
                        >
                          📋 Copy
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Withdrawal Section */}
                  <div className="wallet-section">
                    <div className="wallet-label">Withdraw SOL</div>
                    <div className="withdraw-form">
                      <div className="form-group">
                        <label>Amount (SOL)</label>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          max={balance || 0}
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder="0.00"
                          disabled={withdrawing || balance === 0}
                        />
                        {balance !== null && balance > 0 && (
                          <button
                            className="max-btn"
                            onClick={() => setWithdrawAmount(balance.toFixed(4))}
                          >
                            Max
                          </button>
                        )}
                      </div>
                      <div className="form-group">
                        <label>Destination Address</label>
                        <input
                          type="text"
                          value={withdrawAddress}
                          onChange={(e) => setWithdrawAddress(e.target.value)}
                          placeholder="Enter Solana address"
                          disabled={withdrawing}
                        />
                      </div>
                      <button
                        className="withdraw-btn"
                        onClick={handleWithdraw}
                        disabled={withdrawing || !withdrawAmount || !withdrawAddress || balance === 0}
                      >
                        {withdrawing ? 'Processing...' : 'Withdraw'}
                      </button>
                    </div>
                    {balance === 0 && (
                      <p className="wallet-hint">No balance available for withdrawal</p>
                    )}
                  </div>

                  {/* Status Messages */}
                  {error && (
                    <div className="error-message">{error}</div>
                  )}
                  {success && (
                    <div className="success-message">{success}</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

