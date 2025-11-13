import { useState, useRef, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext.js';
import { ApiClient } from '../services/api.js';
import { WithdrawalDialog } from './WithdrawalDialog.js';
import './UserDropdown.css';

interface UserDropdownProps {
  apiClient: ApiClient;
  onProfileClick: () => void;
}

export function UserDropdown({ apiClient, onProfileClick }: UserDropdownProps) {
  const { address, disconnect } = useWallet();
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (address) {
      loadProfile();
      loadWalletBalance();
    }
  }, [address]);

  const loadWalletBalance = async () => {
    try {
      const result = await apiClient.getWalletBalance();
      setWalletBalance(result.balance || 0);
    } catch (error) {
      console.error('Failed to load wallet balance:', error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const loadProfile = async () => {
    try {
      const profile = await apiClient.getProfile();
      setUsername(profile.username || null);
      setAvatarUrl(profile.avatarUrl || null);
    } catch (error) {
      console.error('Failed to load profile for dropdown:', error);
    }
  };

  const displayName = username || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'User');

  return (
    <div className="user-dropdown" ref={dropdownRef}>
      <button
        className="user-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="user-avatar" />
        ) : (
          <div className="user-avatar user-avatar-placeholder">
            {displayName[0]?.toUpperCase() || '?'}
          </div>
        )}
        <span className="user-name">{displayName}</span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="user-dropdown-menu">
          <button
            className="dropdown-item"
            onClick={() => {
              onProfileClick();
              setIsOpen(false);
            }}
          >
            <span className="dropdown-icon">👤</span>
            Profile
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              setShowWithdrawal(true);
              setIsOpen(false);
            }}
          >
            <span className="dropdown-icon">💸</span>
            Withdraw SOL
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              disconnect();
              setIsOpen(false);
            }}
          >
            <span className="dropdown-icon">🚪</span>
            Disconnect
          </button>
        </div>
      )}

      {showWithdrawal && (
        <WithdrawalDialog
          apiClient={apiClient}
          currentBalance={walletBalance}
          onClose={() => {
            setShowWithdrawal(false);
            loadWalletBalance(); // Refresh balance after withdrawal
          }}
          onSuccess={() => {
            loadWalletBalance(); // Refresh balance on success
          }}
        />
      )}
    </div>
  );
}

