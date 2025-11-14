import { useState, useEffect } from 'react';
import { ApiClient } from '../services/api.js';
import './WithdrawalDialog.css';

interface WithdrawalDialogProps {
  apiClient: ApiClient;
  currentBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function WithdrawalDialog({ apiClient, currentBalance, onClose, onSuccess }: WithdrawalDialogProps) {
  const [withdrawalAddress, setWithdrawalAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMaxClick = () => {
    setAmount(currentBalance.toFixed(9));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!withdrawalAddress.trim()) {
      setError('Please enter a withdrawal address');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    const amountNum = parseFloat(amount);
    if (amountNum > currentBalance) {
      setError(`Insufficient balance. Maximum: ${currentBalance.toFixed(9)} SOL`);
      return;
    }

    if (amountNum < 0.0001) {
      setError('Minimum withdrawal amount is 0.0001 SOL');
      return;
    }

    try {
      setLoading(true);
      const result = await apiClient.withdrawSol(withdrawalAddress, amountNum);
      
      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.error || 'Withdrawal failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to process withdrawal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="withdrawal-dialog-overlay" onClick={onClose}>
      <div className="withdrawal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="withdrawal-dialog-header">
          <h2>💸 Withdraw SOL</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="withdrawal-dialog-content">
          <div className="balance-info">
            <span className="balance-label">Available Balance:</span>
            <span className="balance-amount">{currentBalance.toFixed(9)} SOL</span>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit} className="withdrawal-form">
            <div className="form-group">
              <label htmlFor="withdrawal-address">Withdrawal Address</label>
              <input
                id="withdrawal-address"
                type="text"
                value={withdrawalAddress}
                onChange={(e) => setWithdrawalAddress(e.target.value)}
                placeholder="Enter Solana wallet address"
                disabled={loading}
                className="address-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="amount">
                Amount (SOL)
                <button
                  type="button"
                  onClick={handleMaxClick}
                  className="max-btn"
                  disabled={loading}
                >
                  MAX
                </button>
              </label>
              <input
                id="amount"
                type="number"
                step="0.000000001"
                min="0.0001"
                max={currentBalance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.000000000"
                disabled={loading}
                className="amount-input"
              />
              <div className="amount-hint">
                Minimum: 0.0001 SOL • Maximum: {currentBalance.toFixed(9)} SOL
              </div>
            </div>

            <div className="withdrawal-actions">
              <button
                type="button"
                onClick={onClose}
                className="cancel-btn"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="submit-btn"
                disabled={loading || !withdrawalAddress.trim() || !amount}
              >
                {loading ? 'Processing...' : 'Withdraw'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}



