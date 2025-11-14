import { useState, useEffect } from 'react';
import { ApiClient } from '../services/api.js';
import { useWallet } from '../contexts/WalletContext.js';
import './WalletDialog.css';

interface WalletManagerProps {
  apiClient: ApiClient;
  isOpen?: boolean;
  onClose?: () => void;
  showButton?: boolean;
}

export function WalletManager({ apiClient, isOpen, onClose, showButton = true }: WalletManagerProps) {
  const { address } = useWallet();
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [internalShowModal, setInternalShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdrawal'>('deposit');
  
  // Use external control if provided, otherwise use internal state
  const showModal = isOpen !== undefined ? isOpen : internalShowModal;
  const setShowModal = (value: boolean) => {
    if (isOpen === undefined) {
      setInternalShowModal(value);
    } else if (onClose && !value) {
      onClose();
    }
  };

  useEffect(() => {
    // Check for Google auth or Solana wallet
    const googleToken = localStorage.getItem('google_auth_token');
    const googleAddress = localStorage.getItem('google_auth_address');
    const isGoogleAuth = googleToken && googleAddress;
    
    if ((address || isGoogleAuth) && showModal) {
      loadWalletInfo();
    }
  }, [address, showModal, isOpen]);

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
      {showButton && (
        <button 
          className="wallet-manager-btn"
          onClick={() => setShowModal(true)}
          title="View wallet & manage funds"
        >
          💰 Wallet
        </button>
      )}

      {showModal && (
        <div className="wallet-dialog-overlay" onClick={() => setShowModal(false)}>
          <div className="wallet-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="wallet-dialog-header">
              <h2>In-Game Wallet</h2>
              <button 
                className="wallet-dialog-close"
                onClick={() => {
                  setShowModal(false);
                  // Refresh balance when dialog closes if we have a balance state
                  if (balance !== null) {
                    loadWalletInfo();
                  }
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Balance Display - Always visible */}
            {!loading && balance !== null && (
              <div className="wallet-balance-display">
                <div className="balance-label">Balance</div>
                <div className="balance-value">{balance.toFixed(4)} SOL</div>
              </div>
            )}

            {/* Tabs */}
            <div className="wallet-dialog-tabs">
              <button
                className={`wallet-tab ${activeTab === 'deposit' ? 'active' : ''}`}
                onClick={() => setActiveTab('deposit')}
              >
                Deposit
              </button>
              <button
                className={`wallet-tab ${activeTab === 'withdrawal' ? 'active' : ''}`}
                onClick={() => setActiveTab('withdrawal')}
              >
                Withdrawal
              </button>
            </div>

            <div className="wallet-dialog-content">
              {loading ? (
                <div className="wallet-loading">Loading wallet information...</div>
              ) : error && !depositAddress ? (
                <div className="wallet-error">{error}</div>
              ) : (
                <div className="wallet-tab-content">
                  {activeTab === 'deposit' && (
                    <div className="deposit-section">
                      <div className="section-label">Deposit Address</div>
                      <div className="address-display">
                        <code className="address-code">{depositAddress || 'Loading...'}</code>
                        {depositAddress && (
                          <button
                            className="copy-button"
                            onClick={() => copyToClipboard(depositAddress)}
                            title="Copy address"
                          >
                            📋 Copy
                          </button>
                        )}
                      </div>
                      <p className="deposit-hint">
                        Send SOL to this address to fund your in-game wallet for betting
                      </p>
                    </div>
                  )}

                  {activeTab === 'withdrawal' && (
                    <div className="withdrawal-section">
                      <div className="form-group">
                        <label>Amount (SOL)</label>
                        <div className="amount-input-group">
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
                              className="max-button"
                              onClick={() => setWithdrawAmount(balance.toFixed(4))}
                              disabled={withdrawing}
                            >
                              Max
                            </button>
                          )}
                        </div>
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
                        className="withdraw-submit-button"
                        onClick={handleWithdraw}
                        disabled={withdrawing || !withdrawAmount || !withdrawAddress || balance === 0}
                      >
                        {withdrawing ? 'Processing...' : 'Withdraw'}
                      </button>
                      {balance === 0 && (
                        <p className="withdrawal-hint">No balance available for withdrawal</p>
                      )}
                    </div>
                  )}

                  {/* Status Messages */}
                  {error && (
                    <div className="wallet-error">{error}</div>
                  )}
                  {success && (
                    <div className="wallet-success">{success}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

