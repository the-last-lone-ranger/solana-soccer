import { useState, useEffect } from 'react';
import { ApiClient } from '../services/api.js';
import './ProfileSetup.css';

interface ProfileSetupProps {
  apiClient: ApiClient;
  onComplete?: () => void;
}

// Generate avatar from initials or use emoji
function generateAvatar(username: string | null, walletAddress: string): string {
  if (username) {
    const initials = username
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    return initials;
  }
  // Use first 2 chars of wallet address
  return walletAddress.slice(2, 4).toUpperCase();
}

// Popular emoji avatars
const EMOJI_AVATARS = ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'];

export function ProfileSetup({ apiClient, onComplete }: ProfileSetupProps) {
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const profile = await apiClient.getProfile();
      setUsername(profile.username || '');
      setAvatarUrl(profile.avatarUrl || '');
      setWalletAddress(profile.walletAddress || '');
      if (profile.avatarUrl && EMOJI_AVATARS.includes(profile.avatarUrl)) {
        setSelectedEmoji(profile.avatarUrl);
      }
    } catch (err: any) {
      console.error('Failed to load profile:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const finalAvatarUrl = selectedEmoji || avatarUrl || undefined;
      await apiClient.updateProfile(username.trim() || undefined, finalAvatarUrl);
      if (onComplete) {
        onComplete();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const displayAvatar = selectedEmoji || avatarUrl || generateAvatar(username, walletAddress);

  return (
    <div className="profile-setup">
      <h3>🎨 Customize Your Profile</h3>
      <form onSubmit={handleSubmit}>
        <div className="avatar-preview">
          <div className="avatar-display">
            {selectedEmoji ? (
              <span className="avatar-emoji">{selectedEmoji}</span>
            ) : avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="avatar-image" onError={() => setAvatarUrl('')} />
            ) : (
              <div className="avatar-initials">{displayAvatar}</div>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Choose a username"
            maxLength={30}
            pattern="[a-zA-Z0-9_-]+"
            title="Letters, numbers, underscores, and hyphens only"
          />
          <small>This will appear on the leaderboard</small>
        </div>

        <div className="form-group">
          <label>Choose an Emoji Avatar</label>
          <div className="emoji-grid">
            {EMOJI_AVATARS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`emoji-btn ${selectedEmoji === emoji ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedEmoji(emoji);
                  setAvatarUrl('');
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="avatarUrl">Or Avatar URL</label>
          <input
            id="avatarUrl"
            type="text"
            value={avatarUrl}
            onChange={(e) => {
              setAvatarUrl(e.target.value);
              setSelectedEmoji('');
            }}
            placeholder="https://example.com/avatar.png"
          />
          <small>Leave empty to use initials</small>
        </div>

        {error && <div className="error-message">{error}</div>}

        <button type="submit" className="save-btn" disabled={loading}>
          {loading ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}

