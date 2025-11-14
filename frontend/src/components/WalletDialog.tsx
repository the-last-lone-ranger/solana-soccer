import { useState, useEffect } from 'react';
import { ApiClient } from '../services/api.js';
import { useWallet } from '../contexts/WalletContext.js';
import './WalletDialog.css';

interface WalletDialogProps {
  apiClient: ApiClient;
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'deposit' | 'withdrawal';

export function WalletDialog({ apiClient, isOpen, onClose }: WalletDialogProps) {
  const { address } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>('deposit');
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadWalletInfo();
    } else {
      // Reset state when dialog closes
      setError(null);
      setSuccess(null);
      setWithdrawAmount('');
      setWithdrawAddress('');
    }
  }, [isOpen]);

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

    if (amount > balance) {
      setError('Insufficient balance');
      return;
    }

    if (amount < 0.0001) {
      setError('Minimum withdrawal amount is 0.0001 SOL');
      return;
    }

    try {
      setWithdrawing(true);
      setError(null);
      setSuccess(null);

      const result = await apiClient.withdrawSol(withdrawAddress, amount);
      
      if (result.success) {
        setSuccess(`Withdrawal successful! ${amount} SOL sent to ${withdrawAddress.slice(0, 8)}...`);
        setWithdrawAmount('');
        setWithdrawAddress('');
        
        // Reload balance
        setTimeout(() => {
          loadWalletInfo();
        }, 1000);
      } else {
        setError(result.error || 'Failed to process withdrawal');
      }
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

  const handleMaxAmount = () => {
    setWithdrawAmount(balance.toFixed(9));
  };

  if (!isOpen) return null;

  return (
    <div className="wallet-dialog-overlay" onClick={onClose}>
      <div className="wallet-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="wallet-dialog-header">
          <h2>💰 Wallet Manager</h2>
          <button 
            className="wallet-dialog-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

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
            <>
              {activeTab === 'deposit' && (
                <div className="wallet-tab-content">
                  <div className="wallet-balance-display">
                    <div className="balance-label">Current Balance</div>
                    <div className="balance-value">{balance.toFixed(4)} SOL</div>
                  </div>

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
                </div>
              )}

              {activeTab === 'withdrawal' && (
                <div className="wallet-tab-content">
                  <div className="wallet-balance-display">
                    <div className="balance-label">Available Balance</div>
                    <div className="balance-value">{balance.toFixed(4)} SOL</div>
                  </div>

                  <div className="withdrawal-section">
                    <div className="form-group">
                      <label htmlFor="withdraw-amount">Amount (SOL)</label>
                      <div className="amount-input-group">
                        <input
                          id="withdraw-amount"
                          type="number"
                          step="0.0001"
                          min="0"
                          max={balance}
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder="0.0000"
                          disabled={withdrawing || balance === 0}
                        />
                        {balance > 0 && (
                          <button
                            className="max-button"
                            onClick={handleMaxAmount}
                            type="button"
                          >
                            Max
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="withdraw-address">Destination Address</label>
                      <input
                        id="withdraw-address"
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
                      disabled={withdrawing || !withdrawAmount || !withdrawAddress || balance === 0 || parseFloat(withdrawAmount) > balance}
                    >
                      {withdrawing ? 'Processing...' : 'Withdraw'}
                    </button>

                    {balance === 0 && (
                      <p className="withdrawal-hint">No balance available for withdrawal</p>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="wallet-error">{error}</div>
              )}
              {success && (
                <div className="wallet-success">{success}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

