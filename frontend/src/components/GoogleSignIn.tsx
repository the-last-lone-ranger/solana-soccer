import { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext.js';
import './GoogleSignIn.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function GoogleSignIn() {
  const { address, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get Google OAuth URL from backend
      const response = await fetch(`${API_BASE_URL}/api/auth/google/url`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.details || errorData.error || 'Failed to get Google OAuth URL');
      }

      const data = await response.json();
      
      if (!data.authUrl) {
        throw new Error('No auth URL returned from server');
      }
      
      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      setError(err.message || 'Failed to initiate Google Sign-In');
      setLoading(false);
    }
  };

  // Handle callback from Google OAuth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const type = urlParams.get('type');
    const error = urlParams.get('error');

    if (error) {
      setError(decodeURIComponent(error));
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (token && type === 'google') {
      // Store token in localStorage
      localStorage.setItem('google_auth_token', token);
      
      // Extract address from token (simple base64 decode, in production use proper JWT library)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const googleAddress = payload.address;
        
        // Update wallet context to reflect Google auth
        // We'll need to update the WalletContext to support this
        // For now, just store the token and reload
        window.location.href = '/';
      } catch (err) {
        console.error('Failed to parse token:', err);
      }
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  if (connected && address) {
    return null; // Don't show if already connected
  }

  return (
    <div className="google-sign-in">
      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="google-sign-in-btn"
      >
        {loading ? (
          <>⏳ Signing in...</>
        ) : (
          <>
            <svg className="google-icon" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </>
        )}
      </button>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
}

