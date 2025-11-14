import { useState, useEffect } from 'react';
import { ApiClient } from '../services/api.js';
import './FirstTimeSetup.css';

interface FirstTimeSetupProps {
  apiClient: ApiClient;
  walletAddress: string;
  onComplete: () => void;
}

// Generate avatar from initials
function generateAvatar(username: string): string {
  return username
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Popular emoji avatars
const EMOJI_AVATARS = ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'];

export function FirstTimeSetup({ apiClient, walletAddress, onComplete }: FirstTimeSetupProps) {
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [needsSignature, setNeedsSignature] = useState(false);
  const [signing, setSigning] = useState(false);

  // Debounced username check
  useEffect(() => {
    if (!username.trim()) {
      setUsernameError(null);
      setUsernameAvailable(null);
      return;
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      setUsernameAvailable(false);
      return;
    }

    if (trimmedUsername.length > 30) {
      setUsernameError('Username must be 30 characters or less');
      setUsernameAvailable(false);
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
      setUsernameError('Only letters, numbers, underscores, and hyphens allowed');
      setUsernameAvailable(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/username-check?username=${encodeURIComponent(trimmedUsername)}`);
        const data = await response.json();
        setUsernameAvailable(data.available);
        setUsernameError(data.available ? null : data.message);
      } catch (error) {
        setUsernameError('Failed to check username');
        setUsernameAvailable(false);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [username]);

  const handlePreAuth = async () => {
    // Pre-authenticate by making a GET request to /profile
    // The API client's authenticatedFetch will handle the challenge-response flow
    // IMPORTANT: OpenKit will make an initial request (which gets 403 challenge),
    // then prompt for signature, then retry automatically
    setSigning(true);
    setUsernameError(null);
    
    // Show a message that signature is needed
    console.log('💡 Making authenticated request - wallet will prompt for signature...');
    
    try {
      // Use the API client's getProfile method which will handle authentication
      // This will:
      // 1. Make request → get 403 challenge
      // 2. Extract challenge
      // 3. Prompt for signature (wallet popup should appear here)
      // 4. Sign challenge
      // 5. Retry request → get 200
      await apiClient.getProfile();
      
      // Authentication successful, now proceed with profile update
      console.log('✅ Pre-authentication successful, proceeding with profile update...');
      setNeedsSignature(false);
      setSigning(false);
      // Now proceed with the actual profile update
      handleProfileUpdate();
    } catch (err: any) {
      console.error('❌ Pre-authentication failed:', err);
      setSigning(false);
      setNeedsSignature(true);
      if (err.message?.includes('signature') || err.message?.includes('approve')) {
        setUsernameError('Please approve the signature request in your wallet.');
      } else {
        setUsernameError('Failed to authenticate. Please try again.');
      }
    }
  };

  const handleProfileUpdate = async () => {
    setLoading(true);
    setUsernameError(null);

    try {
      const finalAvatarUrl = selectedEmoji || avatarUrl || undefined;
      console.log('💾 Updating profile...');
      await apiClient.updateProfile(username.trim(), finalAvatarUrl);
      console.log('✅ Profile updated successfully');
      onComplete();
    } catch (err: any) {
      console.error('❌ Failed to update profile:', err);
      setUsernameError(err.message || 'Failed to create profile');
      // If it's an auth error, we might need to sign again
      if (err.message?.includes('signature') || err.message?.includes('403')) {
        setNeedsSignature(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      setUsernameError('Username is required');
      return;
    }

    if (!usernameAvailable) {
      setUsernameError('Please choose an available username');
      return;
    }

    // First, prompt for signature
    setNeedsSignature(true);
    await handlePreAuth();
  };

  const displayAvatar = selectedEmoji || avatarUrl || (username ? generateAvatar(username) : walletAddress.slice(2, 4).toUpperCase());

  return (
    <div className="first-time-setup-overlay">
      <div className="first-time-setup-modal">
        <div className="setup-header">
          <h2>🎮 Welcome to Kicking It!</h2>
          <p>Let's set up your profile to get started</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="avatar-preview-large">
            <div className="avatar-display-large">
              {selectedEmoji ? (
                <span className="avatar-emoji-large">{selectedEmoji}</span>
              ) : avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="avatar-image-large" onError={() => setAvatarUrl('')} />
              ) : (
                <div className="avatar-initials-large">{displayAvatar}</div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="username">
              Username <span className="required">*</span>
            </label>
            <div className="username-input-wrapper">
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a unique username"
                maxLength={30}
                pattern="[a-zA-Z0-9_-]+"
                required
                className={usernameError ? 'error' : usernameAvailable ? 'success' : ''}
                disabled={loading}
              />
              {checkingUsername && <span className="checking-indicator">⏳</span>}
              {!checkingUsername && usernameAvailable && <span className="success-indicator">✓</span>}
              {!checkingUsername && usernameError && username.trim() && <span className="error-indicator">✗</span>}
            </div>
            {usernameError && <div className="error-message-small">{usernameError}</div>}
            {!usernameError && usernameAvailable && <div className="success-message-small">Username is available!</div>}
            <small>This will appear on the leaderboard (3-30 characters)</small>
          </div>

          <div className="form-group">
            <label>Choose an Emoji Avatar (Optional)</label>
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
                  disabled={loading}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="avatarUrl">Or Avatar URL (Optional)</label>
            <input
              id="avatarUrl"
              type="text"
              value={avatarUrl}
              onChange={(e) => {
                setAvatarUrl(e.target.value);
                setSelectedEmoji('');
              }}
              placeholder="https://example.com/avatar.png"
              disabled={loading}
            />
            <small>Leave empty to use initials</small>
          </div>

          {!needsSignature ? (
            <button 
              type="submit" 
              className="create-profile-btn" 
              disabled={loading || !username.trim() || !usernameAvailable}
            >
              {loading ? 'Creating Profile...' : 'Create Profile & Start Playing'}
            </button>
          ) : (
            <button 
              type="button"
              onClick={handlePreAuth}
              className="create-profile-btn" 
              disabled={signing || !username.trim() || !usernameAvailable}
            >
              {signing ? 'Waiting for Signature...' : 'Sign to Create Profile'}
            </button>
          )}
          {signing && (
            <p className="signature-note" style={{ marginTop: '10px', fontSize: '0.9em', color: '#888' }}>
              💡 Please approve the signature request in your wallet to continue.
            </p>
          )}
          {loading && !signing && (
            <p className="signature-note" style={{ marginTop: '10px', fontSize: '0.9em', color: '#888' }}>
              💾 Saving your profile...
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

